import { createContext, useContext } from 'react'

// Módulos licenciáveis — os mesmos da página de preços. A ordem é a de
// exibição. O PRO inclui os outros três e o FireUtils BIM.
export const MODULOS = [
  {
    key: 'pro',
    nome: 'FireUtils PRO',
    icon: 'flame',
    descricao: 'Plano completo: Memorial, Hidrantes e Saídas em uma única licença, mais o FireUtils BIM exclusivo.',
  },
  {
    key: 'memorial',
    nome: 'Memorial',
    icon: 'documentosMedida',
    descricao: 'Cadastro e classificação da edificação, medidas de segurança e geração do Memorial Descritivo na plataforma Web, sem depender do Revit.',
  },
  {
    key: 'hidrantes',
    nome: 'Hidrantes',
    icon: 'hidranteMedida',
    descricao: 'Dimensionamento hidráulico da rede no Revit: percurso por conectores MEP, perdas de carga, pressão e vazão do hidrante crítico.',
  },
  {
    key: 'saidas',
    nome: 'Saídas',
    icon: 'saidaEmergenciaMedida',
    descricao: 'Dimensionamento das saídas de emergência no Revit: população por pavimento e ambiente, larguras e distâncias de percurso.',
  },
  {
    key: 'assinaturas',
    nome: 'Assinaturas',
    icon: 'signature',
    descricao: 'Assinatura de PDFs em lote na plataforma Web: defina o campo de assinatura uma vez por grupo de arquivos e assine pranchas e documentos de uma só vez.',
  },
]

// Faltando este tanto (ou menos) pra vencer, a licença ativa já avisa.
const DIAS_AVISO = 15

// 'AAAA-MM-DD' (coluna date) -> Date à meia-noite LOCAL. `new Date(texto)`
// leria como UTC e, no Brasil, cairia no dia anterior.
function dataLocal(texto) {
  if (!texto) return null
  const [a, m, d] = texto.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function formatarData(texto) {
  const d = dataLocal(texto)
  return d ? d.toLocaleDateString('pt-BR') : ''
}

/**
 * Situação exibida de uma licença (linha da tabela `licencas`, ou undefined
 * quando a conta não tem o módulo).
 * @returns {{ status, rotulo, tom, valida, detalhe }}
 *   tom: 'green' | 'blue' | 'amber' | 'red' | 'neutro'
 */
export function situacaoLicenca(licenca, hoje = new Date()) {
  if (!licenca) {
    return { status: 'sem_licenca', rotulo: 'Sem licença', tom: 'neutro', valida: false, detalhe: 'Esta conta não tem licença deste módulo.' }
  }
  if (licenca.situacao === 'suspensa') {
    return { status: 'suspensa', rotulo: 'Suspensa', tom: 'red', valida: false, detalhe: 'O acesso está suspenso.' }
  }
  if (licenca.situacao === 'cancelada') {
    return { status: 'cancelada', rotulo: 'Cancelada', tom: 'neutro', valida: false, detalhe: 'A licença foi cancelada.' }
  }

  // Falha fechada: valores novos, incompletos ou corrompidos não podem
  // liberar a plataforma sem uma regra explícita para eles.
  if (!['ativa', 'teste'].includes(licenca.situacao)) {
    return { status: 'invalida', rotulo: 'Inválida', tom: 'red', valida: false, detalhe: 'A situação desta licença não permite acesso.' }
  }

  const inicio = dataLocal(licenca.inicio_em)
  const expira = dataLocal(licenca.expira_em)
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())

  if (inicio && inicio > inicioDoDia) {
    return {
      status: 'agendada',
      rotulo: 'Ainda não iniciada',
      tom: 'blue',
      valida: false,
      detalhe: `Disponível a partir de ${formatarData(licenca.inicio_em)}.`,
    }
  }

  const dias = expira ? Math.round((expira - inicioDoDia) / 86400000) : null

  if (dias != null && dias < 0) {
    return { status: 'expirada', rotulo: 'Expirada', tom: 'red', valida: false, detalhe: `Venceu em ${formatarData(licenca.expira_em)}.` }
  }

  const teste = licenca.situacao === 'teste'
  const prazo = dias == null ? 'Sem data de término.'
    : dias === 0 ? 'Vence hoje.'
    : dias === 1 ? 'Vence amanhã.'
    : `Válida até ${formatarData(licenca.expira_em)} (${dias} dias).`
  const vencendo = dias != null && dias <= DIAS_AVISO

  return {
    status: teste ? 'teste' : 'ativa',
    rotulo: vencendo ? 'Vencendo' : teste ? 'Em teste' : 'Ativa',
    tom: vencendo ? 'amber' : teste ? 'blue' : 'green',
    valida: true,
    detalhe: prazo,
  }
}

/**
 * A conta tem acesso ao módulo? Vale a licença do próprio módulo ou a do PRO.
 * Sem `modulo`, responde "tem alguma licença válida?".
 * @param {object} licencas  — { [modulo]: linha } (ver LicencaProvider)
 */
export function temAcesso(licencas, modulo, hoje = new Date()) {
  const valida = key => situacaoLicenca(licencas?.[key], hoje).valida
  if (!modulo) return MODULOS.some(m => valida(m.key))
  return valida(modulo) || valida('pro')
}

// Estado das licenças da conta logada, carregado uma vez pelo LicencaProvider
// (src/context/LicencaContext.jsx): { licencas, erro }. `licencas` é null
// enquanto carrega.
export const LicencaContext = createContext({ licencas: {}, erro: null })

export function useLicencas() {
  return useContext(LicencaContext)
}

/**
 * Acesso da conta. Enquanto as licenças ainda não foram consultadas, a rota
 * aguarda; depois, somente uma licença válida libera o módulo solicitado.
 */
export function useAcesso(modulo) {
  const { licencas } = useLicencas()
  if (!licencas) return { carregando: true, liberado: false }
  return { carregando: false, liberado: temAcesso(licencas, modulo) }
}
