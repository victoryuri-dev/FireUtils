// memorial/deteccao_incendio.js — texto do memorial descritivo do Sistema de
// Detecção de Incêndio. Norma e valores vêm de getDeteccaoAlarme(uf) e os
// tipos/quantidades por pavimento do calc puro (deteccao_alarme_calc.js) — o
// mesmo da tela; o texto só narra o resultado.
//
// Tom: o memorial afirma o que o projeto tem, sem hipóteses ("quando houver",
// "se aplicável", "salvo quando…") — só entram as condições de instalação dos
// tipos de detector efetivamente usados e as premissas marcadas na tela.

import { getDeteccaoAlarme } from '../normas/index'
import {
  deteccaoDaEstrutura, detectoresAtivos, resumoDeteccaoPavimento, notasAplicaveis,
} from '../deteccao_alarme_calc'
import {
  fmt, cita, listaDivisoes, estruturasDaMedida,
} from './deteccao_alarme_comum'
import { blocoObservacao } from '../../utils/observacoes'

// Base técnica dos parâmetros dos detectores, sem o comentário entre
// parênteses que a base normativa guarda pra tela.
function baseTecnica(d) {
  return (d.fonte || '').replace(/\s*\(.*\)\s*$/, '')
}

// Condições de instalação de cada tipo de detector usado no projeto — só o
// que é instalado e como, em afirmações diretas.
function blocosInstalacaoDoTipo(norma, tipo) {
  const t = norma.DETECTORES.tipos[tipo]
  if (!t) return []
  if (tipo === 'fumaca_pontual') {
    return [{
      tipo: 'paragrafo',
      texto: `Os detectores pontuais de fumaça são instalados no teto, a no mínimo ${fmt(t.afastamento_parede_min_m)} m de paredes e vigas, com área máxima de cobertura de ${fmt(t.area_max_m2)} m² por detector (quadrado de ${fmt(t.lado_m)} m de lado inscrito em círculo de raio ${fmt(t.raio_m, 1)} m), de modo que nenhum ponto do teto fique a mais de ${fmt(t.raio_m, 1)} m de um detector.`,
    }]
  }
  if (tipo === 'temperatura_pontual') {
    return [{
      tipo: 'paragrafo',
      texto: `Os detectores pontuais de temperatura são instalados no teto, com área máxima de cobertura de ${fmt(t.area_max_m2)} m² por detector (quadrado de ${fmt(t.lado_m)} m de lado inscrito em círculo de raio ${fmt(t.raio_m, 1)} m), e têm temperatura de atuação compatível com a temperatura máxima do teto do ambiente protegido.`,
    }]
  }
  if (tipo === 'fumaca_linear') {
    return [{
      tipo: 'paragrafo',
      texto: `Os detectores lineares de fumaça projetam feixes paralelos ao teto, com distância entre emissor e receptor/refletor de no máximo ${fmt(t.dist_emissor_receptor_max_m)} m, distância entre feixes adjacentes de no máximo ${fmt(t.dist_entre_feixes_max_m)} m e afastamento de no máximo ${fmt(t.dist_parede_max_m, 1)} m das paredes; a distância dos feixes ao teto segue a especificação do fabricante.`,
    }]
  }
  if (tipo === 'temperatura_linear') {
    return [{
      tipo: 'paragrafo',
      texto: 'Os detectores lineares de temperatura são instalados junto ao material protegido, com comprimento e raio de cobertura conforme a especificação do fabricante.',
    }]
  }
  if (tipo === 'chama') {
    return [{
      tipo: 'paragrafo',
      texto: `Os detectores de chama são posicionados de forma que o campo de visão cubra toda a área protegida, sem pontos encobertos, considerando-se redução de ${fmt(t.reducao_extremos_campo_visao_pct)}% da sensibilidade nos extremos do campo de visão.`,
    }]
  }
  return []
}

function blocosEstrutura(norma, { est, pavs }) {
  const cfg = deteccaoDaEstrutura(est)
  const nrm = norma.NORMA
  const blocos = [{ tipo: 'titulo2', texto: est.nome || 'Edificação' }]

  // Uma coluna por tipo de detector usado na estrutura.
  const ativos = detectoresAtivos(est, pavs)
  const linhas = pavs.map(pav => ({ pav, r: resumoDeteccaoPavimento(pav, ativos) }))
  const total = linhas.reduce((s, { r }) => s + r.total, 0)
  const qtdTxt = q => fmt(q, 0)
  const totalTipo = key => linhas.reduce((s, { r }) => s + (r.itens.find(i => i.tipo === key)?.qtd || 0), 0)
  blocos.push({
    tipo: 'tabela',
    centralizado: true,
    linhasCabecalho: [
      [{ texto: 'DETECTORES POR PAVIMENTO', colSpan: ativos.length + 2 }],
      [{ texto: 'PAVIMENTO' }, ...ativos.map(t => ({ texto: t.label.toUpperCase() })), { texto: 'TOTAL' }],
    ],
    linhas: [
      ...linhas.map(({ pav, r }) => [pav.label, ...r.itens.map(i => qtdTxt(i.qtd)), qtdTxt(r.total)]),
      ['TOTAL', ...ativos.map(t => qtdTxt(totalTipo(t.key))), qtdTxt(total)],
    ],
  })

  linhas.forEach(({ pav, r }) => { if (r.obs) blocos.push({ tipo: 'paragrafo', texto: `${pav.label}: ${r.obs}` }) })

  const { especificas } = notasAplicaveis(norma, pavs.map(p => p.divisao))
  especificas.forEach(n => blocos.push({ tipo: 'paragrafo', texto: `Ocupação ${listaDivisoes(pavs)} — item ${n.item} da ${nrm.sigla}: ${n.texto}` }))
  return blocos
}

export function textoMemorialDeteccaoIncendio(state, sistemas, porEstrutura) {
  const norma = getDeteccaoAlarme(state.uf)
  const lista = estruturasDaMedida(state, porEstrutura, 'deteccao')
  const d = norma.DETECTORES

  // Tipos de detector com quantidade em algum pavimento do projeto.
  const tipos = [...new Set(lista.flatMap(({ est, pavs }) => {
    const ativos = detectoresAtivos(est, pavs)
    return pavs.flatMap(p => resumoDeteccaoPavimento(p, ativos).itensComQtd.map(i => i.tipo))
  }))]

  const base = baseTecnica(d)
  const concepcao = [
    { tipo: 'titulo2', texto: 'Concepção do sistema' },
    {
      tipo: 'paragrafo',
      texto: `O sistema de detecção é composto por central de alarme, detectores automáticos de incêndio distribuídos pelos pavimentos e acionadores manuais, interligados ao sistema de alarme de incêndio (${cita(norma, 'projeto')}).${base ? ` O posicionamento e a cobertura dos detectores seguem a ${base}.` : ''}`,
    },
    {
      tipo: 'paragrafo',
      texto: `Cada ambiente protegido é coberto em toda a sua extensão pelo mesmo tipo de detector, e os acionadores manuais complementam a detecção automática em todos os pavimentos (${cita(norma, 'acionador_com_deteccao')}).`,
    },
    ...(tipos.length > 0
      ? [{ tipo: 'titulo2', texto: 'Instalação dos detectores' }, ...tipos.flatMap(t => blocosInstalacaoDoTipo(norma, t))]
      : []),
  ]

  const blocos = [
    ...concepcao,
    ...(lista.length > 0
      ? [{ tipo: 'titulo2', texto: 'Dimensionamento por edificação' }, ...lista.flatMap(item => [...blocosEstrutura(norma, item), ...blocoObservacao(item.est, 'deteccao')])]
      : []),
  ]
  return { titulo: 'Detecção de Incêndio', blocos }
}
