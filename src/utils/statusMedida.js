// Situação de cada medida de segurança no menu lateral: 'concluida' (verde),
// 'andamento' (amarelo) ou null (medida sem tela/formulário para concluir).
//
// Duas fontes, as mesmas das próprias páginas das medidas:
//  - pendências obrigatórias da auditoria (rota `medida/<key>`);
//  - o "Marcar como concluída" por estrutura (estrutura.concluidas[medida]),
//    nas medidas em que a página oferece esse botão.

// Medidas com tela própria — as demais (SPDA, central de gás etc.) não têm o
// que concluir e ficam sem indicador.
const COM_TELA = new Set([
  'acesso_viatura', 'seg_estrutural', 'compart_horizontal', 'compart_vertical', 'controle_acabamento',
  'saida_emergencia', 'gerenciamento_risco', 'brigada', 'iluminacao', 'sinalizacao', 'extintores',
  'hidrantes', 'alarme', 'deteccao',
])

// Medidas cuja página tem o botão de concluir (chave usada em estrutura.concluidas).
const CHAVE_CONCLUSAO = {
  seg_estrutural: 'seguranca_estrutural', compart_horizontal: 'compart_horizontal', compart_vertical: 'compart_vertical',
  controle_acabamento: 'controle_acabamento', saida_emergencia: 'saida_emergencia', gerenciamento_risco: 'gerenciamento_risco',
  brigada: 'brigada', iluminacao: 'iluminacao', sinalizacao: 'sinalizacao', extintores: 'extintores',
  alarme: 'alarme', deteccao: 'deteccao',
}

// Concluída sem ação do usuário (dados sincronizados do Revit), como nas páginas.
function concluidaAuto(key, est, state, semPendencias) {
  if (key === 'saida_emergencia') return !!est.origemRevit?.saida_emergencia
  if (key === 'extintores') return !!est.origemRevit?.extintores && semPendencias
  if (key === 'sinalizacao') return !!est.origemRevit?.sinalizacao && (state.sinalizacao || []).some(i => i.estruturaId === est.id)
  return false
}

export function statusMedida(key, { state, porEstrutura, pendencias }) {
  if (!COM_TELA.has(key)) return null
  const doSistema = (porEstrutura || []).filter(pe => pe.sistemas?.[key]?.ativo)
  if (doSistema.length === 0) return (porEstrutura || []).some(pe => pe.sistemas?.[key]?.isento) ? 'concluida' : null

  const pendenciasMedida = (pendencias || []).filter(p => p.rota === `medida/${key}`)
  const chave = CHAVE_CONCLUSAO[key]
  const todas = doSistema.every(pe => {
    const est = pe.estrutura
    const daEstrutura = pendenciasMedida.filter(p => !p.estruturaId || p.estruturaId === est.id)
    const semPendencias = daEstrutura.length === 0
    if (!semPendencias) return false
    // Só a medida exigida pela norma tem botão de concluir na página.
    if (chave && pe.sistemas[key].obrigatorio) {
      const escolha = est.concluidas?.[chave]
      return escolha === undefined ? concluidaAuto(key, est, state, semPendencias) : escolha === true
    }
    if (key === 'hidrantes') return !!state.hidrantes?.dimensionamento
    return true
  })
  return todas ? 'concluida' : 'andamento'
}
