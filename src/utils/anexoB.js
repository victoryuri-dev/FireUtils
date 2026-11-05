// Monta os dados do Anexo B (NT 01 — CBMMA) a partir do estado do projeto,
// para exibicao na pagina de documentos do site. Campos sem fonte de dados
// no app ficam em branco — nunca inventamos valor.

import { fmtUn } from './numero'
import { classificarRisco } from '../data/extintores_calc'
import { alturaEdificacaoBase } from '../data/trrf_calc'
import { getExtintores, getOcupacoes, getMemorialFormulario } from '../data/normas/index'

// Mesma lista/ordem do formulario oficial. `key` aponta para state.sistemas —
// quando null, a medida nao e rastreada pelo app e nunca recebe X (ex.:
// Isolamento de risco, Elevador de emergencia).
export const MEDIDAS_ANEXO_B_COL1 = [
  { key: 'acesso_viatura',      label: 'Acesso de viatura às edificações e áreas de risco' },
  { key: null,                  label: 'Isolamento de risco' },
  { key: 'seg_estrutural',      label: 'Segurança estrutural contra incêndio' },
  { key: 'compart_horizontal',  label: 'Compartimentação horizontal' },
  { key: 'compart_vertical',    label: 'Compartimentação vertical' },
  { key: 'controle_acabamento', label: 'Controle de Material de Acabamento e Revestimento' },
  { key: 'saida_emergencia',    label: 'Saídas de emergência' },
  { key: null,                  label: 'Elevador de emergência' },
  { key: 'controle_fumaca',     label: 'Controle de fumaça' },
  { key: 'gerenciamento_risco', label: 'Gerenciamento de Risco' },
  { key: 'brigada',             label: 'Brigada de incêndio' },
]

export const MEDIDAS_ANEXO_B_COL2 = [
  { key: 'iluminacao',  label: 'Iluminação de emergência' },
  { key: 'deteccao',    label: 'Detecção de incêndio' },
  { key: 'alarme',      label: 'Alarme de incêndio' },
  { key: 'sinalizacao', label: 'Sinalização de emergência' },
  { key: 'extintores',  label: 'Extintores' },
  { key: 'hidrantes',   label: 'Hidrantes e mangotinhos' },
  { key: 'sprinklers',  label: 'Chuveiros automáticos' },
  { key: 'resfriamento',   label: 'Sistema de resfriamento' },
  { key: 'espuma',         label: 'Sistema de espuma' },
  { key: 'gases_fixos',    label: 'Sistema de gases fixos' },
  { key: 'fontes_ignicao', label: 'Controle de fontes de ignição' },
]

// `key` aponta para state.riscosEspeciaisPorEstrutura[estruturaId]
export const RISCOS_ESPECIAIS = [
  { key: 'liquidos_inflamaveis', label: 'Armazenamento de líquidos inflamáveis' },
  { key: 'fogos_artificio',      label: 'Armazenamento ou revenda de fogos de artifícios' },
  { key: 'glp',                  label: 'Uso de Gás Liquefeito de Petróleo' },
  { key: 'vasos_pressao',        label: 'Vasos sob pressão (caldeiras)' },
  { key: 'produtos_perigosos',   label: 'Armazenamento de produtos perigosos' },
  { key: 'outros',               label: 'Outros (especificar):' },
]

// Lista de riscos especiais que a Configuração oferece pra marcar, por
// estado: a PB tem a própria lista no formulário do memorial (item 5 —
// normas/PB/memorial_formulario.js), com as mesmas chaves do MA quando o
// risco é o mesmo e quatro riscos a mais; os demais estados usam a do
// Anexo B (NT 01 CBMMA), acima.
export function riscosEspeciaisDoEstado(uf) {
  return getMemorialFormulario(uf)?.RISCOS_ESPECIAIS ?? RISCOS_ESPECIAIS
}

// 'x' = medida adotada (ativo); 'isenta' = a norma exige mas a medida foi
// dispensada por algum motivo específico (substituição por sistema
// alternativo, compartimento único, desativação manual pelo RT — ver a
// seção dedicada no memorial); 'none' = a norma nem exige essa medida.
// Mesma função usada pelo Anexo B e pelo resumo "Medidas de Segurança
// Aplicadas" do memorial (MemorialDescritivoPage.jsx) — nunca duas fontes
// de verdade para as medidas adotadas/isentas. O Anexo B só marca as
// adotadas com X; as demais ficam em branco.
export function estadoMedidaSistema(sistemas, key) {
  if (!key) return 'none'
  if (sistemas?.[key]?.ativo) return 'x'
  if (sistemas?.[key]?.obrigatorio) return 'isenta'
  return 'none'
}

export function buildAnexoBData(state, sistemas) {
  const divisoesSet = new Set()
  ;(state.pavimentos || []).forEach(p => {
    if (p.divisao || p.grupo) divisoesSet.add(p.divisao || p.grupo)
    p.acess?.forEach(a => { if (a.divisao || a.grupo) divisoesSet.add(a.divisao || a.grupo) })
  })
  const ocupacoes = getOcupacoes(state.uf)
  const classificacaoOcupacao = [...divisoesSet].sort().map(divisao => {
    const descricao = ocupacoes[divisao.charAt(0)]?.descricao
    return descricao ? `${divisao} - ${descricao}` : divisao
  }).join('; ')

  const estruturas     = state.estruturas || []
  // Exibe somente a área total gravada no campo correspondente. A soma
  // das estruturas é feita na configuração, quando escolhida pelo usuário.
  const areaConstruida = parseFloat(state.areaConstruidaTotal)
  // Altura piso a piso (piso de descarga ao último pavimento, Etapa 2) — a
  // mesma usada nas medidas de segurança; nao a "altura total" ate o ponto
  // mais alto da edificacao.
  const alturaNum      = estruturas.reduce((mx, e) => Math.max(mx, alturaEdificacaoBase(e)), 0)
  // Edificação térrea sem subsolo tem altura 0 e isso é um valor válido
  // ("0m - Edificação Térrea"); só fica em branco quando há estrutura de mais de um pavimento
  // cuja altura piso a piso ainda não foi informada (ou não há estrutura).
  const alturaConhecida = estruturas.length > 0 && estruturas.every(e =>
    (parseInt(e.nPavimentos) || 1) <= 1 || (e.alturaEdificacao !== '' && e.alturaEdificacao != null))
  const subsolosSum    = estruturas.reduce((s, e) => s + (parseInt(e.nSubsolos) || 0), 0)

  const maxQ = Object.values(state.cargaState || {}).flatMap(porEst => Object.values(porEst || {})).reduce((acc, c) => {
    const q = c?.metodo === 'levantamento' ? parseFloat(c?.valorManual) || 0 : c?.cargaIncendio || 0
    return Math.max(acc, q)
  }, 0)

  return {
    endereco: state.endereco || '',
    numero: state.numero || '',
    cep: state.cep || '',
    bairro: state.bairro || '',
    municipio: state.cidade || '',
    complemento: state.complemento || '',
    uf: state.uf || '',
    proprietario: state.propNome || '',
    proprietarioDocumento: state.propDocumento || '',
    responsavelUso: state.respRazaoSocial || '',
    responsavelDocumento: state.respCNPJ || '',
    responsavelEmail: state.respEmail || '',
    responsavelFone: state.respTelefone || '',
    razaoSocial: state.respRazaoSocial || '',
    cnpj: state.respCNPJ || '',
    nomeFantasia: state.respFantasia || '',
    cnaePrincipal: [state.cnaePrincipal, state.cnaePrincipalDesc].filter(Boolean).join(' — '),
    classificacaoOcupacao,
    areaTotalConstruida: areaConstruida ? fmtUn(areaConstruida, 'm²') : '',
    pavimentosSubsolo: subsolosSum ? String(subsolosSum) : '',
    areaTerreno: state.areaTerreno ? fmtUn(state.areaTerreno, 'm²', 2, `${state.areaTerreno} m²`) : '',
    areaComplementar: state.areaComplementar ? fmtUn(state.areaComplementar, 'm²', 2, `${state.areaComplementar} m²`) : '',
    altura: alturaConhecida ? (alturaNum ? fmtUn(alturaNum, 'm') : '0m - Edificação Térrea') : '',
    cargaIncendio: maxQ ? fmtUn(maxQ, 'MJ/m²') : '',
    riscoCargaIncendio: maxQ && getExtintores(state.uf) ? ({ baixo:'Baixo', medio:'Médio', alto:'Alto' })[classificarRisco(maxQ, getExtintores(state.uf).LIMIARES_RISCO)] : '',
    // O FireUtils gera o processo técnico principal (o projeto em si), então a
    // forma de apresentação "Processo técnico" sempre sai marcada; o
    // "complementar" depende de um CAP principal e continua em branco.
    processoTecnico: true,
    responsavelTecnico: state.rtNome || '',
    rtCpf: state.rtCpf || '',
    rtConselho: state.rtConselho || '',
    rtEmail: state.rtEmail || '',
    rtFone: state.rtTelefone || '',
    estrutura: state.caracteristicasEstrutura || '',
    cobertura: state.cobertura || '',
    vedacao: state.fachada || '',
    // `ativo` continua estritamente a medida realmente instalada (usado por
    // planoEmergencia.js pra listar sistemasAtivos) — uma medida isenta não
    // entra ali, mesmo exigida pela norma. `estado` é só pra exibição no
    // Anexo B (X para ativo; em branco nos demais casos).
    medidasCol1: MEDIDAS_ANEXO_B_COL1.map(m => ({ label: m.label, estado: estadoMedidaSistema(sistemas, m.key), ativo: !!sistemas?.[m.key]?.ativo })),
    medidasCol2: MEDIDAS_ANEXO_B_COL2.map(m => ({ label: m.label, estado: estadoMedidaSistema(sistemas, m.key), ativo: !!sistemas?.[m.key]?.ativo })),
    // Anexo B e um formulario unico pra edificacao/area de risco toda —
    // agrega (OR) os riscos especiais marcados em qualquer estrutura, e
    // junta as descricoes de "outros" de todas as que marcaram.
    riscosEspeciais: RISCOS_ESPECIAIS.map(r => {
      const porEstrutura = Object.values(state.riscosEspeciaisPorEstrutura || {})
      const ativo = porEstrutura.some(m => !!m?.[r.key])
      const outrosDesc = r.key === 'outros'
        ? Object.values(state.riscosOutrosDescPorEstrutura || {}).filter(Boolean).join('; ')
        : ''
      // Riscos especiais nao tem conceito de isencao (sao so marcados ou
      // nao) — estado e sempre 'x' ou 'none', nunca 'isenta'.
      return { label: outrosDesc ? `${r.label}${r.label.endsWith(':') ? '' : ':'} ${outrosDesc}` : r.label, ativo, estado: ativo ? 'x' : 'none' }
    }),
  }
}
