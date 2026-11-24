// memorial/alarme_incendio.js — texto do memorial descritivo do Sistema de
// Alarme de Incêndio. Norma e valores vêm de getDeteccaoAlarme(uf) (base
// central) e o dimensionamento por pavimento do calc
// puro (deteccao_alarme_calc.js) — o mesmo da tela.

import { getDeteccaoAlarme } from '../normas/index'
import {
  alarmeDaEstrutura, resumoAlarmePavimento, notasAplicaveis, comAreaEfetiva, avisadoresAtivos,
} from '../deteccao_alarme_calc'
import {
  fmt, cita, listaDivisoes, estruturasDaMedida,
} from './deteccao_alarme_comum'
import { blocoObservacao } from '../../utils/observacoes'

function blocosConcepcao(norma) {
  const c = norma.CENTRAL, ac = norma.ACIONADOR, f = norma.FIACAO
  const paragrafos = []

  paragrafos.push({
    tipo: 'paragrafo',
    texto: `O projeto contém os elementos necessários ao funcionamento do sistema e ao seu completo entendimento, com os procedimentos de elaboração do Projeto Técnico da NT 01 (${cita(norma, 'projeto')}).`,
  })
  paragrafos.push({
    tipo: 'paragrafo',
    texto: `A central de alarme possui dispositivo de teste dos indicadores luminosos e dos sinalizadores acústicos (${cita(norma, 'teste_indicadores')}) e é instalada em local com constante vigilância humana e de fácil visualização (${cita(norma, 'vigilancia')}). Aciona o alarme geral da edificação, que é audível em toda a edificação${c.alarme_sem_interferir_comunicacao_verbal ? ', sem interferir na comunicação verbal' : ''} (${cita(norma, 'alarme_geral')}), e contém painel ou esquema ilustrativo indicando a localização dos acionadores manuais e detectores (${cita(norma, 'painel_esquema')}).`,
  })
  paragrafos.push({
    tipo: 'paragrafo',
    texto: `Os acionadores manuais são instalados a uma altura de ${fmt(ac.altura_min_m)} m a ${fmt(ac.altura_max_m)} m do piso acabado até a base inferior do componente${ac.cor ? `, na cor ${ac.cor}` : ''} (${cita(norma, 'acionador_altura')}), de modo que a distância máxima a ser percorrida por uma pessoa, em qualquer ponto da área protegida, até o acionador mais próximo não seja superior a ${ac.distancia_max_m} m (${cita(norma, 'acionador_distancia')}), preferencialmente junto aos hidrantes.`,
  })
  if (ac.excecoes?.length) {
    paragrafos.push({ tipo: 'paragrafo', texto: `Exceção prevista: ${ac.excecoes.map(e => `${e.divisoes.join(', ')} — ${e.texto}`).join('; ')}.` })
  }
  paragrafos.push({
    tipo: 'paragrafo',
    texto: `Os eletrodutos e a fiação atendem à ${f.norma} (${cita(norma, 'fiacao')})${f.protecao_calor ? ` e os elementos de proteção contra calor que contêm a fiação atendem a ${f.protecao_calor} (${cita(norma, 'protecao_calor')})` : ''}.`,
  })
  return [{ tipo: 'titulo2', texto: 'Concepção do sistema' }, ...paragrafos]
}

function blocosEstrutura(norma, { est, pavs: pavsBrutos }) {
  const pavs = comAreaEfetiva(pavsBrutos, est)
  const cfg = alarmeDaEstrutura(est)
  const c = norma.CENTRAL, a = norma.ALIMENTACAO, ac = norma.ACIONADOR, av = norma.AVISADOR
  const nrm = norma.NORMA
  const blocos = [{ tipo: 'titulo2', texto: est.nome || 'Edificação' }]

  if (cfg.possuiCentral === 'nao') {
    blocos.push({ tipo: 'paragrafo', texto: 'A edificação não possui central de alarme de incêndio.' })
  } else {
    const tipo = c.tipos.find(t => t.key === cfg.central)?.label
    const local = cfg.centralLocal
    const partes = []
    partes.push(tipo && local
      ? `A central de alarme é do tipo ${tipo.toLowerCase()} e fica instalada em ${local} — área de fácil acesso, com vigilância humana constante e fácil visualização`
      : 'A central de alarme ainda não teve tipo e local definidos, e ficará, em conformidade com a norma, em área de fácil acesso, com vigilância humana constante e fácil visualização')
    if (cfg.centralLocal && !cfg.monitoramentoRemoto) partes.push(`fora do período de vigilância, recomenda-se o monitoramento local ou remoto da central (${cita(norma, 'central_local')})`)
    let txt = partes.join(', ') + '.'
    if (cfg.central === 'enderecavel' && cfg.circuito) {
      txt += ` O sistema utiliza circuito Classe ${cfg.circuito} conforme a NBR 17240.`
    }
    const extras = []
    if (cfg.painelRepetidor) extras.push('painel repetidor')
    if (cfg.painelSinoptico) extras.push('painel sinóptico com o esquema ilustrativo de localização dos acionadores')
    if (extras.length) txt += ` Dispõe de ${extras.join(' e ')}.`
    if (cfg.preAlarme) {
      txt += ` Por tratar-se de local de grande concentração de pessoas, o alarme geral é precedido de pré-alarme na sala de segurança, junto à central, com temporizador de no máximo ${c.pre_alarme_retardo_max_min} ${Number(c.pre_alarme_retardo_max_min) === 1 ? 'minuto' : 'minutos'} para o acionamento posterior do alarme geral, na existência de brigada de incêndio na edificação; o alarme geral permanece obrigatório para toda a edificação (${cita(norma, 'pre_alarme')}).`
    }
    if (cfg.subcentral && c.subcentral_retardo_max_min != null) {
      const qtd = cfg.subcentralQtd || '1'
      txt += ` Há ${qtd} ${Number(qtd) === 1 ? 'subcentral interligada' : 'subcentrais interligadas'} à central supervisionadora, com emissão simultânea de sinal de alarme; o alarme geral para toda a edificação soa caso, em ${c.subcentral_retardo_max_min} minutos, não sejam tomadas medidas junto à central supervisionadora (${cita(norma, 'subcentral')}).`
    }
    blocos.push({ tipo: 'paragrafo', texto: txt })

    // Indicação de funcionamento/alarme nos acionadores — só o que se aplica ao
    // tipo de central efetivamente adotado nesta estrutura, não os dois modos.
    if (cfg.central === 'enderecavel') {
      blocos.push({
        tipo: 'paragrafo',
        texto: `Pela central ser do tipo endereçável, a indicação de funcionamento e de alarme nos acionadores manuais é dispensada, uma vez que a central supervisiona de forma constante e periódica os equipamentos periféricos${cfg.preAlarme ? '; havendo pré-alarme, o LED de alarme nos acionadores é obrigatório' : ''} (${cita(norma, 'leds_acionadores')}).`,
      })
    } else if (cfg.central === 'convencional') {
      blocos.push({
        tipo: 'paragrafo',
        texto: `Os acionadores manuais contêm a indicação de funcionamento (cor verde) e de alarme (cor vermelha)${cfg.preAlarme ? ', e, havendo pré-alarme, o LED de alarme é obrigatório' : ''} (${cita(norma, 'leds_acionadores')}).`,
      })
    }

    // Alimentação: autonomia sempre narrada pelo mínimo normativo (não é campo do formulário)
    const fonte = cfg.fonteAuxiliar
    blocos.push({
      tipo: 'paragrafo',
      texto: `A alimentação é feita pela ${a.principal} (fonte principal) e por ${fonte ? fonte : 'fonte auxiliar (a definir)'} (fonte auxiliar)${cfg.fonteAuxiliarLocal?.trim() ? `, localizada em ${cfg.fonteAuxiliarLocal.trim()}` : ''}, com autonomia mínima de ${a.autonomia_supervisao_h} horas em regime de supervisão e de ${a.autonomia_alarme_min} minutos em regime de alarme, conforme a ${nrm.sigla} (${cita(norma, 'alimentacao')}).`,
    })

  }

  // Tabela por pavimento
  // Colunas de avisador só para os tipos usados na estrutura.
  const tiposAvis = avisadoresAtivos(cfg)
  const linhas = pavs.map(pav => ({ pav, r: resumoAlarmePavimento(pav, ac, av, cfg) }))
  const totAcion = linhas.reduce((s, { r }) => s + r.acionadores, 0)
  const totAvis = key => linhas.reduce((s, { r }) => s + (r.avisadores.find(x => x.key === key)?.qtd || 0), 0)
  const nCol = 2 + tiposAvis.length
  blocos.push({
    tipo: 'tabela',
    centralizado: true,
    linhasCabecalho: [
      [{ texto: 'ACIONADORES MANUAIS E AVISADORES', colSpan: nCol }],
      [{ texto: 'PAVIMENTO' }, { texto: 'ACIONADORES MANUAIS' },
        ...tiposAvis.map(t => ({ texto: t.label.toUpperCase() }))],
    ],
    linhas: [
      ...linhas.map(({ pav, r }) => [
        pav.label, fmt(r.acionadores, 0), ...r.avisadores.map(a => fmt(a.qtd, 0)),
      ]),
      ['TOTAL', fmt(totAcion, 0), ...tiposAvis.map(t => fmt(totAvis(t.key), 0))],
    ],
  })

  const obs = []
  obs.push(`Os acionadores manuais foram distribuídos de modo a não exceder ${ac.distancia_max_m} m de percurso até o mais próximo, com no mínimo um por pavimento, instalados de ${fmt(ac.altura_min_m)} m a ${fmt(ac.altura_max_m)} m do piso acabado.`)
  // Tipo de avisador adotado — só a instalação e as especificações do equipamento
  // (altura, audibilidade, visibilidade), não a justificativa de projeto que levou à escolha.
  const LABEL_AVISADOR = { sonoro: 'sonoros', visual: 'visuais', audiovisual: 'audiovisuais (sonoros e visuais)' }
  if (tiposAvis.length > 0) {
    const nomes = tiposAvis.map(t => LABEL_AVISADOR[t.key])
    const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
    const alturaTxt = av.altura_min_m != null ? ` instalados a ${fmt(av.altura_min_m, 1)} m a ${fmt(av.altura_max_m, 1)} m do piso acabado,` : ''
    obs.push(`São adotados avisadores ${lista},${alturaTxt} com atuação em até ${av.tempo_atuacao_max_s} s e visibilidade verificada a partir de ${av.visibilidade_m} m de distância frontal (${cita(norma, 'avisador_visual')}).`)
  }
  if (cfg.semFio) {
    const anexos = norma.SEM_FIO?.anexos || []
    obs.push(anexos.length
      ? `O sistema utiliza tecnologia sem fio (wireless), atendendo aos objetivos e ao desempenho da norma e apresentando os atestados dos Anexos ${anexos.join(' e ')} da ${nrm.sigla} (${cita(norma, 'sem_fio')}).`
      : `O sistema utiliza tecnologia sem fio (wireless), com certificação em laboratório reconhecido e laudo de ensaio (${cita(norma, 'sem_fio')}).`)
  }
  obs.forEach(texto => blocos.push({ tipo: 'paragrafo', texto }))

  const { especificas } = notasAplicaveis(norma, pavs.map(p => p.divisao))
  especificas.forEach(n => blocos.push({ tipo: 'paragrafo', texto: `Ocupação ${listaDivisoes(pavs)} — item ${n.item} da ${nrm.sigla}: ${n.texto}` }))
  return blocos
}

export function textoMemorialAlarmeIncendio(state, sistemas, porEstrutura) {
  const norma = getDeteccaoAlarme(state.uf)
  const lista = estruturasDaMedida(state, porEstrutura, 'alarme')

  const blocos = [
    ...blocosConcepcao(norma),
    ...(lista.length > 0
      ? [{ tipo: 'titulo2', texto: 'Dimensionamento por edificação' }, ...lista.flatMap(item => [...blocosEstrutura(norma, item), ...blocoObservacao(item.est, 'alarme')])]
      : [{ tipo: 'paragrafo', texto: 'Nenhuma edificação com o sistema de alarme exigido ou adotado até o momento.' }]),
  ]
  return { titulo: 'Alarme de Incêndio', blocos }
}
