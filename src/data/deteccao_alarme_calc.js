// ─────────────────────────────────────────────────────────────────────────────
// deteccao_alarme_calc.js — funções puras de dimensionamento dos Sistemas de
// Detecção (medida 'deteccao') e Alarme (medida 'alarme') de Incêndio, que
// compartilham a mesma norma (NT 19; ver normas/<UF>/deteccao_alarme.js e a
// linha 'deteccao_alarme' de normas_dados). Recebem a norma como parâmetro
// (`getDeteccaoAlarme(uf)`) — nunca importam um estado diretamente. O texto do
// memorial e as telas usam SEMPRE estas funções, sem repetir a regra.
//
// Detecção: tipos e quantidades de detectores vêm do projeto (distribuição em
// planta); o app só registra e totaliza. Alarme: os mínimos de acionadores e
// avisadores saem daqui e podem ser substituídos.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtNum } from '../utils/numero'

const num = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const vazio = v => v === '' || v === null || v === undefined

export const TIPOS_DETECTOR = [
  { key: 'fumaca_pontual',      label: 'Fumaça pontual' },
  { key: 'temperatura_pontual', label: 'Temperatura pontual' },
  { key: 'fumaca_linear',       label: 'Fumaça linear' },
  { key: 'temperatura_linear',  label: 'Temperatura linear' },
  { key: 'chama',               label: 'Chama' },
]

// ── Valores do projeto guardados na estrutura/pavimento (com defaults) ────
export function alarmeDaEstrutura(est) {
  return {
    central: '', centralLocal: '', circuito: '', monitoramentoRemoto: false,
    preAlarme: false, subcentral: false, subcentralQtd: '',
    painelRepetidor: false, painelSinoptico: false,
    fonteAuxiliar: '',
    fonteAuxiliarLocal: '',
    tipoAvisador: '', avisadores: undefined, semFio: false,
    ...(est?.alarme || {}),
  }
}
export function deteccaoDaEstrutura(est) {
  return { tiposDetector: undefined, ...(est?.deteccao || {}) }
}
export function alarmePav(pav) {
  return { acionadores: '', avisadoresSonoros: '', avisadoresVisuais: '', avisadoresAudiovisuais: '', ...(pav?.alarme || {}) }
}
/** Detecção de um pavimento: `tipos` = { [tipo de detector ativo]: quantidade }.
 *  Um pavimento pode ter vários tipos ao mesmo tempo; tipo ausente = inativo.
 *  Migra o formato antigo (um único `tipo` + `qtd`, com pé-direito/viga/área
 *  por detector) — só vira tipo ativo se a quantidade tinha sido informada. */
export function deteccaoPav(pav) {
  const d = pav?.deteccao || {}
  if (d.tipos) return { tipos: d.tipos, obs: d.obs || '' }
  const tipos = d.tipo && !vazio(d.qtd) ? { [d.tipo]: String(d.qtd) } : {}
  return { tipos, obs: d.obs || '' }
}

/** Pavimentos com a área efetiva: a área informada na classificação (Etapa 4) ou,
 *  se ainda em branco, a área da estrutura dividida igualmente pelos pavimentos
 *  (marcada em `_areaEstimada`). Assim o dimensionamento já sai automático. */
export function comAreaEfetiva(pavimentos, est) {
  const total = num(est?.areaTotal)
  const n = pavimentos.length || 1
  return pavimentos.map(p => {
    if (num(p.area) > 0) return p
    return total > 0 ? { ...p, area: String(Math.round((total / n) * 100) / 100), _areaEstimada: true } : p
  })
}

// ── Detectores ─────────────────────────────────────────────────────────────

/** Tipos de detector usados na estrutura (escolhidos uma vez, valem pra todos
 *  os pavimentos — mesmo padrão dos avisadores do Alarme). Sem escolha salva,
 *  deduz dos tipos já preenchidos nos pavimentos (formato anterior). */
export function detectoresAtivos(est, pavimentos = []) {
  const salvos = est?.deteccao?.tiposDetector
  const keys = Array.isArray(salvos)
    ? salvos
    : [...new Set(pavimentos.flatMap(p => Object.keys(deteccaoPav(p).tipos)))]
  return TIPOS_DETECTOR.filter(t => keys.includes(t.key))
}

/**
 * Resumo da detecção de um pavimento: uma linha por tipo ativo na estrutura
 * (`ativos`, de detectoresAtivos) com a quantidade informada — em branco = o
 * pavimento não tem esse tipo (0). A quantidade vem do projeto (distribuição
 * em planta); o app não estima quantidade por área.
 */
export function resumoDeteccaoPavimento(pav, ativos = TIPOS_DETECTOR) {
  const d = deteccaoPav(pav)
  const itens = ativos.map(t => ({
    tipo: t.key, label: t.label,
    qtd: vazio(d.tipos[t.key]) ? 0 : Math.round(num(d.tipos[t.key])),
  }))
  const total = itens.reduce((s, i) => s + i.qtd, 0)
  return { itens, itensComQtd: itens.filter(i => i.qtd > 0), total, completo: total > 0, obs: d.obs }
}

// ── Alarme ─────────────────────────────────────────────────────────────────

/** Acionadores manuais mínimos de um pavimento: ao menos 1 por pavimento e o
 *  suficiente para que nenhum ponto exceda a distância máxima de percurso. */
export function acionadoresMinimos(area, acionador) {
  const a = num(area)
  const cob = num(acionador?.area_cobertura_estimada_m2)
  if (a <= 0 || cob <= 0) return 1
  return Math.max(1, Math.ceil(a / cob))
}

/** Tipos de avisador; `campo` é onde a quantidade fica no pavimento (alarmePav). */
export const TIPOS_AVISADOR = [
  { key: 'sonoro',      label: 'Avisadores sonoros',      campo: 'avisadoresSonoros' },
  { key: 'visual',      label: 'Avisadores visuais',      campo: 'avisadoresVisuais' },
  { key: 'audiovisual', label: 'Avisadores audiovisuais', campo: 'avisadoresAudiovisuais' },
]

/** Tipos de avisador usados na estrutura (vários ao mesmo tempo). Migra o
 *  formato antigo, que guardava um único `tipoAvisador`. */
export function avisadoresAtivos(cfgEst) {
  if (Array.isArray(cfgEst?.avisadores)) return TIPOS_AVISADOR.filter(t => cfgEst.avisadores.includes(t.key))
  return TIPOS_AVISADOR.filter(t => t.key === cfgEst?.tipoAvisador)
}

export function resumoAlarmePavimento(pav, acionador, avisador, cfgEst) {
  const p = alarmePav(pav)
  const minAcion = acionadoresMinimos(pav?.area, acionador)
  const acionadores = !vazio(p.acionadores) ? Math.round(num(p.acionadores)) : minAcion
  // Cada tipo de avisador ativo na estrutura tem sua quantidade no pavimento;
  // em branco vale o mínimo por pavimento da norma.
  const minAvis = avisador?.minimo_por_pavimento ?? 1
  const avisadores = avisadoresAtivos(cfgEst).map(t => ({
    ...t, minimo: minAvis,
    qtd: !vazio(p[t.campo]) ? Math.round(num(p[t.campo])) : minAvis,
  }))
  return {
    minAcionadores: minAcion, acionadores, abaixoDoMinimo: acionadores < minAcion,
    avisadores,
  }
}

/** Autonomia informada (ou o mínimo da norma, se em branco) e se cumpre o mínimo. */
export function autonomiaEfetiva(valor, minimo) {
  const informado = !vazio(valor)
  const v = informado ? num(valor) : minimo
  return { valor: v, informado, atende: v >= minimo }
}

/** Notas da norma aplicáveis às divisões presentes (por divisão exata ou por grupo)
 *  + as notas gerais. Só exibidas — nunca viram configuração. */
export function notasAplicaveis(norma, divisoes) {
  const porDiv = norma?.notas_por_divisao || norma?.NOTAS_POR_DIVISAO || {}
  const gerais = norma?.notas_gerais || norma?.NOTAS_GERAIS || []
  const divs = [...new Set((divisoes || []).filter(Boolean))]
  const especificas = []
  divs.forEach(d => {
    const grupo = d[0]
    ;[d, grupo].forEach(chave => {
      (porDiv[chave] || []).forEach(n => {
        if (!especificas.some(e => e.item === n.item && e.texto === n.texto)) especificas.push({ ...n, ocupacao: chave })
      })
    })
  })
  return { especificas, gerais }
}

// Formato numérico oficial do projeto — ver utils/numero.js.
export { fmtNum }
