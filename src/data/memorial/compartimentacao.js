// memorial/compartimentacao.js — texto do memorial descritivo para
// Compartimentação Horizontal e Compartimentação Vertical (NT 09 CBMMA).
// Usa os MESMOS calcs puros (compart_calc.js) que alimentam a tela de
// dimensionamento — o texto nunca duplica a lógica de classificação/área
// máxima, só narra o resultado. Mantido enxuto de propósito: só o que o
// Corpo de Bombeiros precisa para analisar o projeto.
//
// Regra geral: só entram tabela, TRRF, elementos de proteção e condições
// especiais quando a compartimentação é EXIGIDA e NÃO ISENTA (nem por
// substituição por sistema alternativo, nem — só a horizontal — por a
// edificação já se enquadrar num único compartimento). Sendo isenta por uma
// dessas condições/notas específicas, a seção vira só a frase explicando o
// motivo. Já quando a dispensa é simplesmente a norma não exigir a medida
// pra esta estrutura (Tabela 6 não exige pra esta ocupação/altura, ou
// processo simplificado — Tabela 5, que nunca exige) a estrutura nem é
// citada nesta seção do memorial.

import { calcularAreaMaximaCompartimentacao, caracteristicaElementoCompart } from '../compart_calc'
import { trrfDaEstrutura } from '../../utils/trrfCompart'
import { getCompartimentacao } from '../normas/index'
import { fmtUn } from '../../utils/numero'

// Elementos marcados com a característica de cada um (a informada ou o
// TRRF automático — caracteristicaElementoCompart), depois do nome.
function labelsMarcados(catalogo, chaves, ctx) {
  return catalogo.filter(o => (chaves || []).includes(o.key)).map(o => {
    const nome = o.label || o.texto
    const c = ctx ? caracteristicaElementoCompart(ctx.est, ctx.prefixo, o.key, ctx.trrf, ctx.norma) : ''
    return c ? `${nome} — ${c}` : nome
  })
}

function fmtArea(valor) {
  if (valor === 'CTD') return 'a definir pela Comissão Técnica (CTD)'
  return typeof valor === 'number' ? fmtUn(valor, 'm²') : 'sem limite definido'
}
const m2 = v => fmtUn(v, 'm²', 2, `${v} m²`)

// Caso a norma exija a medida mas o responsável técnico tenha desativado o
// toggle manualmente em Configuração (useMedidasObrigatorias: `ativo` segue
// o override quando ele existe) — nunca narrar isso como "dispensada pela
// norma", que seria factualmente errado: a norma exige, a desativação foi
// uma decisão do RT, sob sua responsabilidade. A seção mostra só a
// justificativa (o motivo digitado em Configuração — ver MotivosIsencao em
// Step6.jsx), não o dimensionamento normal, que deixou de valer.
function textoDesativadaManualmente(medida, motivo) {
  return `${medida} dispensada mediante justificativa do responsável técnico: ${motivo || 'motivo da isenção não informado pelo responsável técnico.'}`
}

// Único parágrafo mostrado quando a edificação se enquadra inteira num
// único compartimento (nenhum pavimento excede a área máxima do Anexo B, e
// todos já têm área informada — `r.dentroDoLimite`) — cita a área
// considerada e a área máxima de cada pavimento, sem repetir a tabela.
function blocosDentroDoLimite(r) {
  if (r.linhas.length === 1) {
    const l = r.linhas[0]
    return [{ tipo: 'paragrafo', texto: `Compartimentação horizontal dispensada: a área de compartimentação considerada (${m2(l.area)}) está dentro da área máxima de compartimentação permitida (${fmtArea(l.valor)}) para a divisão ${l.pavimento.divisao} no Tipo ${r.tipo} — ${r.tipoNome} (Anexo B, NT 09 CBMMA), de modo que a edificação se enquadra em um único compartimento.` }]
  }
  // Uma linha por pavimento, em tabela — num texto corrido ficava ilegível.
  return [
    { tipo: 'paragrafo', texto: `Compartimentação horizontal dispensada: a área de compartimentação considerada de todos os pavimentos está dentro da área máxima de compartimentação permitida no Tipo ${r.tipo} — ${r.tipoNome} (Anexo B, NT 09 CBMMA), de modo que a edificação se enquadra em um único compartimento. Área considerada e área máxima por pavimento:` },
    {
      tipo: 'tabela',
      colunas: ['Pavimento', 'Área de compartimentação', 'Área máxima permitida'],
      linhas: r.linhas.map(l => [l.pavimento.label, m2(l.area), fmtArea(l.valor)]),
    },
  ]
}

export function textoMemorialCompartHorizontal(state, sistemas, porEstrutura) {
  const blocos = []
  const { TABELA_AREA_MAXIMA, CLASSES_TIPO_EDIFICACAO, ELEMENTOS_COMPART_HORIZONTAL, SUBSTITUICOES_COMPARTIMENTACAO, TRRF_MINIMO_PAREDE_COMPARTIMENTACAO } = getCompartimentacao(state.uf)

  ;(state.estruturas || []).forEach(est => {
    // `ativo` já respeita o toggle manual de Configuração E as isenções de
    // Compartimentação (substituição, compartimento único — useMedidasObrigatorias);
    // `obrigatorioPelaNorma` é o que a Tabela 5/6 exige por si só, sem nada
    // disso. `manual` isola só o toggle explícito de Configuração — único
    // caso em que a desativação foi uma decisão do RT sem motivo técnico
    // específico (as isenções por substituição/compartimento único têm,
    // cada uma, seu próprio texto mais abaixo).
    const pe = porEstrutura?.find(p => p.estrutura.id === est.id)
    const sistemaPE = pe?.sistemas?.compart_horizontal
    const ativo = sistemaPE ? !!sistemaPE.ativo : !!sistemas?.compart_horizontal?.ativo
    const obrigatorioPelaNorma = sistemaPE ? !!sistemaPE.obrigatorio : !!sistemas?.compart_horizontal?.obrigatorio
    const manual = state.sistemasPorEstrutura?.[est.id]?.compart_horizontal
    // Desativada manualmente e sem justificativa (opção do RT): nada a narrar.
    if (manual === false && state.semMotivoIsencaoPorEstrutura?.[est.id]?.compart_horizontal) return

    // A norma simplesmente não exige esta medida pra esta estrutura — nem
    // pela Tabela 6 (ocupação/altura não pedem) nem pelo processo
    // simplificado (Tabela 5, que nunca exige compartimentação). Não é uma
    // isenção por nota/condição específica, então nem cita a estrutura
    // nesta seção do memorial.
    if (!ativo && !obrigatorioPelaNorma) return

    blocos.push({ tipo: 'titulo2', texto: est.nome || 'Estrutura' })

    if (manual === false) {
      // A norma exige, mas o RT desativou manualmente em Configuração — isso
      // precisa constar e ser justificado, nunca narrado como "dispensada
      // pela norma" nem confundido com as isenções por nota abaixo.
      blocos.push({
        tipo: 'paragrafo',
        texto: textoDesativadaManualmente('Compartimentação horizontal', state.motivosIsencaoPorEstrutura?.[est.id]?.compart_horizontal?.trim()),
      })
      return
    }

    const substituicao = SUBSTITUICOES_COMPARTIMENTACAO.find(o => o.key === est.isencaoCompartHorizontal)
    if (substituicao) {
      blocos.push({
        tipo: 'paragrafo',
        texto: `Compartimentação horizontal isenta mediante adoção de ${substituicao.texto}, conforme nota de rodapé da Tabela 6 aplicável ao grupo/altura desta estrutura (NT 01 CBMMA).`,
      })
      return
    }

    const pavimentos = (state.pavimentos || []).filter(p => p.estruturaId === est.id)
    const r = calcularAreaMaximaCompartimentacao(pavimentos, est, TABELA_AREA_MAXIMA, CLASSES_TIPO_EDIFICACAO, state.areaCompartimentacaoHorizontal)

    if (!r.tipo) {
      blocos.push({ tipo: 'paragrafo', texto: `Altura de ${est.nome} ainda não informada — tipo de edificação (Anexo B, NT 09 CBMMA) e área máxima de compartimentação pendentes de definição.` })
      return
    }

    if (r.dentroDoLimite) {
      blocos.push(...blocosDentroDoLimite(r))
      return
    }

    // A partir daqui a compartimentação horizontal é exigida de fato (não
    // isenta por nenhum meio) — mostra tipo, tabela, TRRF, elementos e
    // condições por completo.
    blocos.push({ tipo: 'campo', label: 'Tipo de edificação (Anexo B, NT 09 CBMMA)', valor: `Tipo ${r.tipo} — ${r.tipoNome}` })

    if (r.linhas.length > 0) {
      blocos.push({
        tipo: 'tabela',
        colunas: ['Pavimento', 'Divisão', 'Área de compartimentação', 'Área máxima permitida', 'Situação'],
        linhas: r.linhas.map(l => [
          l.pavimento.label,
          l.pavimento.divisao || '—',
          l.area ? m2(l.area) : '—',
          !l.encontrado ? '—' : fmtArea(l.valor),
          l.excede ? 'Excede o limite' : (l.area > 0 && typeof l.valor === 'number' ? 'Dentro do limite' : 'A definir'),
        ]),
      })
    }

    for (const l of r.pavimentosExcedentes) {
      blocos.push({
        tipo: 'paragrafo',
        texto: `A área de compartimentação considerada para o pavimento ${l.pavimento.label} é de ${m2(l.area)}, superior à área máxima de compartimentação de ${fmtArea(l.valor)} permitida pela norma para a divisão ${l.pavimento.divisao}, em edificação do Tipo ${r.tipo}. O dimensionamento exige sua subdivisão em compartimentos com área máxima de ${fmtArea(l.valor)}, conforme o Anexo B da NT 09 CBMMA.`,
      })
    }

    blocos.push({ tipo: 'campo', recuo:true, label: 'TRRF mínimo da parede de compartimentação', valor: `EI-${TRRF_MINIMO_PAREDE_COMPARTIMENTACAO}` })

    const elementos = labelsMarcados(ELEMENTOS_COMPART_HORIZONTAL, est.elementosCompartHorizontal, { est, prefixo: 'h', trrf: trrfDaEstrutura(state, est), norma: getCompartimentacao(state.uf) })
    if (elementos.length > 0) {
      blocos.push({ tipo: 'paragrafo', texto: 'A compartimentação horizontal é composta pelos seguintes elementos de proteção:' })
      blocos.push({ tipo: 'lista', recuo:true, itens: elementos })
    } else {
      blocos.push({ tipo: 'paragrafo', texto: 'Elementos de proteção adotados ainda não informados pelo responsável técnico.' })
    }


    if (est.obsCompartimentacao?.trim()) {
      blocos.push({ tipo: 'campo', label: 'Observações complementares', valor: est.obsCompartimentacao.trim() })
    }
  })

  if (blocos.length === 0) {
    blocos.push({
      tipo: 'paragrafo',
      texto: (state.estruturas || []).length > 0
        ? 'Compartimentação horizontal não exigida pela NT 01 CBMMA (Tabela 5 ou 6, conforme o processo aplicável a cada estrutura) para nenhuma estrutura deste projeto.'
        : 'Não há estruturas cadastradas no projeto.',
    })
  }

  return { titulo: 'Compartimentação Horizontal', blocos }
}

export function textoMemorialCompartVertical(state, sistemas, porEstrutura) {
  const blocos = []
  const { ELEMENTOS_COMPART_VERTICAL, SUBSTITUICOES_COMPARTIMENTACAO, TRRF_MINIMO_PAREDE_COMPARTIMENTACAO, TRRF_MINIMO_ENCLAUSURAMENTO_ESCADA_ELEVADOR } = getCompartimentacao(state.uf)

  ;(state.estruturas || []).forEach(est => {
    const pe = porEstrutura?.find(p => p.estrutura.id === est.id)
    const sistemaPE = pe?.sistemas?.compart_vertical
    const ativo = sistemaPE ? !!sistemaPE.ativo : !!sistemas?.compart_vertical?.ativo
    const obrigatorioPelaNorma = sistemaPE ? !!sistemaPE.obrigatorio : !!sistemas?.compart_vertical?.obrigatorio
    const manual = state.sistemasPorEstrutura?.[est.id]?.compart_vertical
    // Desativada manualmente e sem justificativa (opção do RT): nada a narrar.
    if (manual === false && state.semMotivoIsencaoPorEstrutura?.[est.id]?.compart_vertical) return

    // Mesma regra da horizontal: dispensa pura pela norma (Tabela 5 ou 6)
    // não cita a estrutura nesta seção.
    if (!ativo && !obrigatorioPelaNorma) return

    blocos.push({ tipo: 'titulo2', texto: est.nome || 'Estrutura' })

    if (manual === false) {
      // Só a justificativa — o dimensionamento normal (elementos, TRRF etc.)
      // deixou de valer com a medida desativada.
      blocos.push({
        tipo: 'paragrafo',
        texto: textoDesativadaManualmente('Compartimentação vertical', state.motivosIsencaoPorEstrutura?.[est.id]?.compart_vertical?.trim()),
      })
      return
    }

    const substituicaoV = SUBSTITUICOES_COMPARTIMENTACAO.find(o => o.key === est.isencaoCompartVertical)
    if (substituicaoV) {
      blocos.push({
        tipo: 'paragrafo',
        texto: `Compartimentação vertical isenta mediante adoção de ${substituicaoV.texto}, conforme nota de rodapé da Tabela 6 aplicável ao grupo/altura desta estrutura (NT 01 CBMMA). A compartimentação das fachadas e a selagem dos shafts e dutos de instalações continuam exigidas, independentemente da substituição.`,
      })
      return
    }

    // A partir daqui a compartimentação vertical é exigida de fato (não
    // isenta por substituição) — mostra elementos, condições e TRRF.
    const elementos = labelsMarcados(ELEMENTOS_COMPART_VERTICAL, est.elementosCompartVertical, { est, prefixo: 'v', trrf: trrfDaEstrutura(state, est), norma: getCompartimentacao(state.uf) })
    if (elementos.length > 0) {
      blocos.push({ tipo: 'paragrafo', texto: 'A compartimentação vertical é composta pelos seguintes elementos de proteção:' })
      blocos.push({ tipo: 'lista', recuo:true, itens: elementos })
    } else {
      blocos.push({ tipo: 'paragrafo', texto: 'Elementos de proteção adotados ainda não informados pelo responsável técnico.' })
    }


    blocos.push({ tipo: 'campo', label: 'TRRF mínimo dos entrepisos', valor: `EI-${TRRF_MINIMO_PAREDE_COMPARTIMENTACAO}` })
    blocos.push({ tipo: 'campo', label: 'TRRF mínimo do enclausuramento de escadas e elevadores de segurança', valor: `EI-${TRRF_MINIMO_ENCLAUSURAMENTO_ESCADA_ELEVADOR}` })
  })

  if (blocos.length === 0) {
    blocos.push({
      tipo: 'paragrafo',
      texto: (state.estruturas || []).length > 0
        ? 'Compartimentação vertical não exigida pela NT 01 CBMMA (Tabela 5 ou 6, conforme o processo aplicável a cada estrutura) para nenhuma estrutura deste projeto.'
        : 'Não há estruturas cadastradas no projeto.',
    })
  }

  return { titulo: 'Compartimentação Vertical', blocos }
}
