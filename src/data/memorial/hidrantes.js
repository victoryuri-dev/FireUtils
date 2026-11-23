// memorial/hidrantes.js — texto do memorial descritivo para o Sistema de
// Proteção por Hidrantes e Mangotinhos (NT 22 CBMMA). Narra a classificação
// decidida em state.hidrantes (ver FormularioSistema.jsx) — não recalcula
// nada, só formata o que já foi definido. O dimensionamento hidráulico
// (memorial de cálculo) é responsabilidade do plugin Revit e entra depois.

import { getHidrantes, getExtintores } from '../normas/index'
import { dadosDoSistemaDoProjeto, posicoesReservatorio } from '../hidrantes_calc'
import { classificacaoHidrantesData } from '../../hooks/useClassificacaoHidrantes'
import { fmtNum } from '../../utils/numero'
import { rotuloLancesInternos, rotuloLancesExternos, rotuloTipoMangueira, tipoMangueiraValido } from '../hidrantesMangueiras'

const f2 = (n) => fmtNum(n, 2)
const fmtM = f2
const LABEL_ACIONAMENTO = { eletrico: 'motor elétrico', combustao: 'motor de combustão interna' }
const LABEL_RECALQUE = {
  coluna_fachada: 'tipo coluna, instalado na fachada',
  embutido_muro: 'embutido em abrigo no muro',
  passeio: 'instalado no passeio público',
}
const LABEL_VALVULA_BLOQUEIO = { gaveta: 'gaveta', gaveta_os_y: 'gaveta de haste ascendente (OS&Y)' }
const RISCO_LABEL = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

// `porEstrutura` vem de useMedidasObrigatorias() (ver buildMemorial em
// registry.js, que já o calcula uma vez pra todas as seções) — repassado
// aqui pra classificacaoHidrantesData() sem recalcular.
export function textoMemorialHidrantes(state, _sistemas, porEstrutura) {
  const norma = getHidrantes(state.uf)
  const h = state.hidrantes || {}
  const blocos = []

  if (!h.tipo) {
    return {
      titulo: 'Sistema de Proteção por Hidrantes e Mangotinhos',
      blocos: [{ tipo: 'paragrafo', texto: 'Classificação do sistema ainda não definida — pendente de preenchimento pelo responsável técnico.' }],
    }
  }

  const dadosTipo = dadosDoSistemaDoProjeto(h, norma)
  if (!dadosTipo) {
    return {
      titulo: 'Sistema de Proteção por Hidrantes e Mangotinhos',
      blocos: [{ tipo: 'paragrafo', texto: 'Parâmetros do sistema personalizado ainda não informados — pendente de preenchimento pelo responsável técnico.' }],
    }
  }
  const material = norma.MATERIAIS_TUBULACAO.find(m => m.key === h.redeMaterial)

  // Classificação (Tipo/RTI, Tabela 3) recalculada aqui — MESMA lógica de
  // useClassificacaoHidrantes.js (Etapa 1/3 do dashboard: área total das
  // estruturas selecionadas + divisão de maior carga de incêndio + presença
  // de sprinklers nessas estruturas), só sem hooks (classificacaoHidrantesData
  // é o núcleo puro do hook, reaproveitado aqui pra nunca duplicar a lógica —
  // ver o próprio hook). NUNCA recalcula a RTI adotada por h.rti (mostrada à
  // parte, no bloco "Reservatório") — só narra de onde ela deveria vir
  // (edificações consideradas, área, ocupação de maior risco, RTI mínima
  // tabelada).
  const extNorma = getExtintores(state.uf)
  const classificacao = classificacaoHidrantesData(state, norma, extNorma, porEstrutura)
  const opcaoDoTipo = classificacao.sugestao.opcoes.find(o => String(o.tipo) === String(h.tipo))
  const rtiMinima = opcaoDoTipo?.rti ?? null
  // Só as estruturas de fato aplicáveis (consideradas na área/ocupação da
  // classificação) — as demais (sem exigência de hidrantes, ou excluídas
  // manualmente pelo RT) não aparecem aqui.
  const estruturasAplicaveis = classificacao.infoPorEstrutura.filter(e => classificacao.estruturasSelecionadas.includes(e.id))

  blocos.push({ tipo: 'titulo2', texto: 'Tipo do Sistema e Volume de Reserva de Incêndio Mínima' })
  blocos.push({
    tipo: 'paragrafo',
    texto: 'Edificações/estruturas do projeto consideradas para o dimensionamento do Sistema de Hidrantes — a área construída somada e a ocupação de maior risco entre elas definem a coluna da Tabela 3 e, por ela, o Tipo de sistema exigido.',
  })
  blocos.push({
    tipo: 'tabela',
    colunas: ['Estrutura', 'Área Construída', 'Ocupação', 'Risco'],
    linhas: estruturasAplicaveis.map(e => [
      e.nome,
      `${fmtNum(e.area, 2, e.area)} m²`,
      e.divisaoLabel || '—',
      e.risco ? RISCO_LABEL[e.risco] : '—',
    ]),
  })
  blocos.push({
    tipo: 'tabela',
    colunas: ['Critério de Classificação (Tabela 3)', 'Valor Adotado'],
    linhas: [
      ['Área construída total considerada', `${fmtNum(classificacao.areaTotal, 2, classificacao.areaTotal)} m²`],
      ['Ocupação de maior risco considerada', classificacao.sugestao.divisao || '—'],
      ['Risco', classificacao.risco ? RISCO_LABEL[classificacao.risco] : '—'],
      ['Chuveiros automáticos (sprinklers) nas estruturas consideradas', classificacao.temSprinklers ? 'Sim' : 'Não'],
      ['Tipo de sistema escolhido', dadosTipo.label],
      ['Vazão mínima exigida', `${dadosTipo.vazaoMin} L/min`],
      ['Pressão mínima exigida', `${dadosTipo.pressaoMin} mca`],
      ['RTI mínima', rtiMinima != null ? `${fmtNum(rtiMinima, 2, rtiMinima)} m³` : '—'],
    ],
  })

  blocos.push({ tipo: 'titulo2', texto: 'Reservatório' })
  const materialReservatorio = norma.MATERIAIS_RESERVATORIO.find(m => m.key === h.reservatorioMaterial)
  const posicaoReservatorio = posicoesReservatorio(state.uf).find(p => p.key === h.reservatorioPosicao)
  blocos.push({ tipo: 'campo', label: 'Material do reservatório', valor: materialReservatorio?.label || '—' })
  if (posicaoReservatorio) {
    blocos.push({ tipo: 'campo', label: 'Posição do reservatório', valor: posicaoReservatorio.label })
  }
  blocos.push({ tipo: 'campo', label: 'RTI adotada', valor: h.rti ? `${fmtNum(h.rti, 2, h.rti)} m³` : '—' })
  blocos.push({
    tipo: 'paragrafo',
    texto: h.reservatorioExclusivo
      ? 'O reservatório é de uso exclusivo para combate a incêndio.'
      : `O reservatório é compartilhado com o consumo normal da edificação, garantida a reserva efetiva de incêndio permanentemente (${norma.NORMA.nome}).`,
  })
  if (!h.reservatorioExclusivo) {
    blocos.push({
      tipo: 'campo', label: 'Volume total do reservatório',
      valor: h.reservatorioVolumeTotal ? `${fmtNum(h.reservatorioVolumeTotal, 2, h.reservatorioVolumeTotal)} m³` : '—',
    })
  }

  blocos.push({ tipo: 'titulo2', texto: 'Bomba de Incêndio' })
  if (!h.bombaExiste) {
    blocos.push({ tipo: 'paragrafo', texto: 'O sistema opera sem bomba de incêndio — abastecimento por ação exclusiva da gravidade.' })
  } else {
    const extras = []
    if (h.bombaJockey) extras.push('bomba de pressurização (jockey)')
    if (h.bombaReserva) {
      extras.push(`bomba reserva${h.bombaReservaAcionamento ? ` acionada por ${LABEL_ACIONAMENTO[h.bombaReservaAcionamento]}` : ''}`)
    }
    blocos.push({
      tipo: 'paragrafo',
      texto: `O sistema possui bomba de incêndio principal${h.bombaAcionamento ? ` acionada por ${LABEL_ACIONAMENTO[h.bombaAcionamento]}` : ''}${extras.length ? `, complementada por ${extras.join(' e ')}` : ''}.`,
    })
    // Declarativo, não genérico: só afirma o gerador quando o RT de fato
    // marcou que o projeto o tem (h.bombaGeradorBackup, BombaESuccaoForm.jsx)
    // — antes dizia "podem ser alimentadas", uma possibilidade normativa
    // genérica que não afirmava se ESTE projeto realmente tem o gerador.
    // Sem o toggle marcado, a frase fica de fora — mesmo padrão de
    // h.bombaAlimentaSprinklers abaixo: nunca afirma um equipamento que não
    // foi de fato decidido.
    if (h.bombaGeradorBackup && (h.bombaAcionamento === 'eletrico' || (h.bombaReserva && h.bombaReservaAcionamento === 'eletrico'))) {
      blocos.push({
        tipo: 'paragrafo',
        texto: `Na falta de energia da concessionária, as bombas de incêndio acionadas por motor elétrico são alimentadas por um gerador diesel, atendendo ao requisito do item C.2.9 da ${norma.NORMA.nome}.`,
      })
    }
    if (h.bombaAlimentaSprinklers) {
      blocos.push({
        tipo: 'paragrafo',
        texto: `O sistema de bombeamento de incêndio também alimenta o sistema de chuveiros automáticos (sprinklers), mediante interligação das tubulações dos reservatórios, conforme item 5.9.2 da ${norma.NORMA.nome}, atendendo aos parâmetros da norma de Sistema de Chuveiros Automáticos.`,
      })
    }

    // NPSH só se aplica quando a condição de sucção deu NEGATIVA (a
    // condição em si vem só da geometria — cotas da RTI e da bomba — e a
    // altitude/temperatura aqui só importam pro cálculo do NPSH
    // disponível, Anexo C, que só roda nesse caso; ver succao.py do
    // plugin). Antes do primeiro "Dimensionar Hidrantes" a condição ainda
    // não é conhecida, então o parágrafo fica de fora até então também.
    const resDimensionamento = state.hidrantes?.dimensionamento?.res
    if (state.hidrantes?.dimensionamento?.succao === 'negativa') {
      blocos.push({
        tipo: 'paragrafo',
        texto: `A condição de sucção resultou negativa — para a verificação e o cálculo do NPSH disponível (Anexo C, ${norma.NORMA.nome}), adotou-se altitude local de ${fmtNum(h.succaoAltitude ?? 0)} m e temperatura da água de ${fmtNum(h.succaoTemperatura ?? 30)} °C.`,
      })
    }

    // Especificações da bomba — pressão/vazão vêm do dimensionamento
    // hidráulico (plugin Revit); potência é a adotada pelo RT na Etapa 3
    // do dashboard (ver BombaESuccaoForm.jsx). Bomba jockey não passa pelo
    // dimensionamento hidráulico principal — potência/vazão são as
    // informadas diretamente pelo RT. h.bombaReserva entra na condição pra
    // a linha "Bomba reserva" aparecer mesmo antes do primeiro
    // "Dimensionar Hidrantes" (pressão/vazão ficam "—" até lá).
    if (resDimensionamento || h.bombaReserva || (h.bombaJockey && (h.bombaJockeyPotencia || h.bombaJockeyVazao))) {
      const linhasBomba = []
      if (resDimensionamento) {
        linhasBomba.push([
          'Bomba principal',
          `${f2(resDimensionamento.P_RTI)} mca`,
          `${f2(resDimensionamento.Qt)} L/min`,
          h.bombaPotenciaAdotada ? `${fmtNum(h.bombaPotenciaAdotada, 2, h.bombaPotenciaAdotada)} cv` : '—',
        ])
      }
      if (h.bombaReserva) {
        // Bomba reserva assume a mesma vazão/pressão da principal — é um
        // backup de mesma capacidade (Anexo C.3.12), não um equipamento
        // dimensionado à parte; só o acionamento pode divergir (ver
        // parágrafo acima). Sem linha própria, a tabela "Especificações da
        // Bomba" ficava sem identificar a reserva, mesmo quando o RT a
        // declarava no sistema (h.bombaReserva, BombaESuccaoForm.jsx).
        linhasBomba.push([
          `Bomba reserva${h.bombaReservaAcionamento ? ` (${LABEL_ACIONAMENTO[h.bombaReservaAcionamento]})` : ''}`,
          resDimensionamento ? `${f2(resDimensionamento.P_RTI)} mca` : '—',
          resDimensionamento ? `${f2(resDimensionamento.Qt)} L/min` : '—',
          h.bombaPotenciaAdotada ? `${fmtNum(h.bombaPotenciaAdotada, 2, h.bombaPotenciaAdotada)} cv` : '—',
        ])
      }
      if (h.bombaJockey) {
        linhasBomba.push([
          'Bomba jockey',
          '—',
          h.bombaJockeyVazao ? `${fmtNum(h.bombaJockeyVazao, 2, h.bombaJockeyVazao)} L/min` : '—',
          h.bombaJockeyPotencia ? `${fmtNum(h.bombaJockeyPotencia, 2, h.bombaJockeyPotencia)} cv` : '—',
        ])
      }
      blocos.push({
        tipo: 'tabela',
        colunas: ['Bomba', 'Pressão', 'Vazão', 'Potência'],
        linhas: linhasBomba,
      })
    }
  }

  blocos.push({ tipo: 'titulo2', texto: 'Rede de Tubulação' })
  blocos.push({
    tipo: 'paragrafo',
    texto: `A rede será executada em ${material?.label.toLowerCase() || '(material não definido)'}${material ? ` (fator C = ${material.fatorC}, Hazen-Williams)` : ''}, diâmetro nominal mínimo DN65.`,
  })

  blocos.push({ tipo: 'titulo2', texto: 'Dispositivo de Recalque' })
  if (h.recalqueTipo) {
    blocos.push({
      tipo: 'paragrafo',
      texto: `O dispositivo de recalque para uso do Corpo de Bombeiros Militar será ${LABEL_RECALQUE[h.recalqueTipo]}, com ${h.recalqueEntradas === 2 ? `2 entradas (vazão do sistema acima de 1.000 L/min, ${norma.HIDRANTES_SIMULTANEOS_REF})` : '1 entrada'}.`,
    })
    if (h.recalqueTipo === 'passeio' && h.recalqueJustificativaPasseio) {
      blocos.push({ tipo: 'paragrafo', texto: `Justificativa técnica: ${h.recalqueJustificativaPasseio}` })
    }
  }

  blocos.push({ tipo: 'titulo2', texto: 'Abrigos, Mangueiras e Esguichos' })
  blocos.push({
    tipo: 'tabela',
    colunas: ['Componente', 'Especificação'],
    linhas: [
      ['Abrigo', dadosTipo.componentes.abrigo === 'obrigatorio' ? 'Obrigatório' : 'Opcional'],
      ['Mangueira de incêndio', norma.LABEL_MANGUEIRA_INCENDIO[dadosTipo.componentes.mangueiraIncendio] || '—'],
      ['Diâmetro / comprimento', `DN${dadosTipo.mangueiraDn} — ${dadosTipo.mangueiraComprimento} m`],
      ['Esguicho regulável', `DN${dadosTipo.esguicho}`],
      ['Chave para hidrante / engate', dadosTipo.componentes.chaveEngate ? 'Sim' : 'Não'],
      ...(h.lancesInternos ? [['Lances de mangueira — hidrantes internos', rotuloLancesInternos(h.lancesInternos)]] : []),
      ...(h.lancesExternos ? [['Lances de mangueira — hidrantes externos', rotuloLancesExternos(h.lancesExternos)]] : []),
      ...(tipoMangueiraValido(h.mangueiraTipo, dadosTipo.componentes.mangueiraIncendio) ? [['Tipo de mangueira', rotuloTipoMangueira(h.mangueiraTipo)]] : []),
      ['Válvula do hidrante', `Globo angular DN${h.valvulaHidranteDn}`],
      ['Válvulas de bloqueio', LABEL_VALVULA_BLOQUEIO[h.valvulaBloqueioTipo] || '—'],
    ],
  })

  if (norma.INSTALACAO) {
    const inst = norma.INSTALACAO
    blocos.push({ tipo: 'titulo2', texto: 'Instalação' })
    blocos.push({
      tipo: 'paragrafo',
      texto: `As válvulas dos hidrantes são do tipo ${inst.valvula.tipo}, de diâmetro ${inst.valvula.dn}, com saída voltada para baixo em ângulo de ${inst.valvula.angulo_graus}° e instaladas a uma altura entre ${fmtM(inst.valvula.altura_min_m)} m e ${fmtM(inst.valvula.altura_max_m)} m em relação ao piso (${inst.valvula.ref}).`,
    })
    blocos.push({
      tipo: 'paragrafo',
      texto: `Os pontos de tomada de água ficam posicionados nas proximidades das portas externas, escadas e/ou acesso principal a ser protegido, a não mais de ${inst.posicionamento.distancia_porta_max_m} m, em posições centrais das áreas protegidas, fora de escadas ou antecâmaras de fumaça, a uma altura entre ${fmtM(inst.posicionamento.altura_min_m)} m e ${fmtM(inst.posicionamento.altura_max_m)} m do piso (${inst.posicionamento.ref}).`,
    })
    if (dadosTipo.componentes.abrigo === 'obrigatorio') {
      blocos.push({
        tipo: 'paragrafo',
        texto: `O abrigo de mangueiras não fica instalado a mais de ${inst.abrigo.distancia_porta_max_m} m da porta de acesso da área protegida, com a porta situada na face mais larga, disposto de modo a não ficar bloqueado em caso de incêndio, e não instalado em frente a acessos de entrada e saída de pedestres, garagens, estacionamentos, rampas, escadas e seus patamares (${inst.abrigo.ref}).`,
      })
    }
  }

  if (h.observacoes) {
    blocos.push({ tipo: 'titulo2', texto: 'Observações Complementares' })
    blocos.push({ tipo: 'paragrafo', texto: h.observacoes })
  }

  return { titulo: 'Sistema de Proteção por Hidrantes e Mangotinhos', blocos }
}
