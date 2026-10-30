// useClassificacaoHidrantes.js — classificação do Sistema de Hidrantes/
// Mangotinhos (Tipo/RTI, área, divisão de maior carga, risco, bomba reserva
// obrigatória, nº de entradas do recalque). Extraído de FormularioSistema.jsx
// pra ser reaproveitado também pela Etapa 3 (Bomba de Incêndio), que só LÊ
// risco/temSprinklers/recalqueDuplo pras suas notas e verificações — um hook
// só, pra nunca duplicar a lógica de escopo de chuveiros automáticos
// (temSprinklers) nem o resto da classificação entre as duas etapas.
import { useEffect, useMemo } from 'react'
import { useProjeto } from '../context/ProjetoContext'
import { useNorma } from './useNorma'
import { useMedidasObrigatorias } from './useMedidasObrigatorias'
import { cargaDaDivisao, classificarRisco } from '../data/extintores_calc'
import { sugerirClassificacao, dadosDoTipo, exigeRecalqueDuplo, bombaReservaObrigatoria } from '../data/hidrantes_calc'

// Núcleo puro (sem hooks) do cálculo de classificação — extraído pra poder
// ser chamado também fora de componentes React, como na geração do memorial
// descritivo (ver memorial/hidrantes.js: "Tipo do Sistema e Volume de
// Reserva de Incêndio Mínima" narra justamente infoPorEstrutura/
// estruturasSelecionadas/sugestao/risco daqui), sem duplicar a lógica.
// `porEstrutura` é o retorno de medidasObrigatorias() (useMedidasObrigatorias.js).
export function classificacaoHidrantesData(state, norma, extNorma, porEstrutura) {
  const h = state.hidrantes

  // Carga de incêndio máxima de uma estrutura (maior entre suas divisões,
  // principal + subsidiárias de todo pavimento) — usada tanto no card de
  // cada estrutura quanto na agregação abaixo.
  const cargaMaximaDaEstrutura = (estruturaId) => {
    const cargaState = state.cargaState[estruturaId] || {}
    let maior = null
    state.pavimentos.filter(p => p.estruturaId === estruturaId).forEach(p => {
      const divs = [p.divisao, ...(p.acess || []).map(a => a.divisao)].filter(Boolean)
      divs.forEach(divisao => {
        const carga = cargaDaDivisao(divisao, cargaState)
        if (carga != null && (maior == null || carga > maior)) maior = carga
      })
    })
    return maior
  }

  // Uma linha por estrutura do projeto — área, ocupação (principal ou
  // "mista"), carga de incêndio máxima e risco. Alimenta o box "Áreas para
  // Classificação do Sistema" e a agregação (área total + divisões) usada
  // na sugestão de Tipo/RTI, ambas restritas às estruturas selecionadas.
  const infoPorEstrutura = state.estruturas.map(est => {
    const pe = porEstrutura.find(p => p.estrutura.id === est.id)
    const { principaisDivs = [], edificacaoMista = false } = pe?.classificacao || {}
    const divisaoLabel = principaisDivs.length === 0 ? null
      : principaisDivs.length === 1 ? principaisDivs[0]
      : `Mista (${principaisDivs.join(', ')})`
    const carga = cargaMaximaDaEstrutura(est.id)
    const risco = carga != null ? classificarRisco(carga, extNorma.LIMIARES_RISCO) : null
    return {
      id: est.id, nome: est.nome, area: parseFloat(est.areaTotal) || 0,
      divisaoLabel, edificacaoMista, carga, risco,
      hidrantesAtivo: !!pe?.sistemas?.hidrantes?.ativo,
      hidrantesObrigatorio: !!pe?.sistemas?.hidrantes?.obrigatorio,
    }
  })

  // Default: estruturas onde hidrantes é exigido/ativo. O RT pode ajustar
  // manualmente clicando nos cards — a partir daí, h.estruturasSelecionadas
  // (persistido) manda, não mais o default automático.
  const defaultSelecionadas = infoPorEstrutura.filter(e => e.hidrantesAtivo).map(e => e.id)
  const estruturasSelecionadas = h.estruturasSelecionadas?.length ? h.estruturasSelecionadas : defaultSelecionadas

  // Chuveiros automáticos SÓ nas estruturas selecionadas pra esta
  // classificação — não no projeto inteiro. useMedidasObrigatorias().
  // sistemas agrega TODAS as estruturas do projeto; usar aquele aqui
  // rebaixava (Nota 1/2 da Tabela 3) a classificação de um grupo de
  // edificações sem sprinklers só porque outra estrutura qualquer do
  // mesmo projeto tinha.
  //
  // Dois sinais separados, não um só: a Nota 1 da Tabela 3 só vale quando
  // os chuveiros são EXIGIDOS, a Nota 2 só quando NÃO são exigidos mas
  // foram instalados por conta própria (ver opcoesClassificacao em
  // hidrantes_calc.js pro porquê). `temSprinklers` (OR dos dois) continua
  // existindo pros demais consumidores do hook (BombaESuccaoForm etc.),
  // que só precisam saber "existe sprinklers", não o motivo.
  const sprinklersObrigatorio = estruturasSelecionadas.some(id => {
    const pe = porEstrutura.find(p => p.estrutura.id === id)
    return !!pe?.sistemas?.sprinklers?.obrigatorio
  })
  const sprinklersAtivo = estruturasSelecionadas.some(id => {
    const pe = porEstrutura.find(p => p.estrutura.id === id)
    return !!pe?.sistemas?.sprinklers?.ativo
  })
  const temSprinklers = sprinklersObrigatorio || sprinklersAtivo

  const areaTotal = infoPorEstrutura.filter(e => estruturasSelecionadas.includes(e.id)).reduce((s, e) => s + e.area, 0)

  // Divisões das estruturas selecionadas (principal + subsidiárias de todo
  // pavimento), cada uma com a maior carga de incêndio já classificada —
  // insumo da sugestão automática de Tipo/RTI (usa a de maior carga).
  const porDivisao = new Map()
  state.pavimentos.filter(p => estruturasSelecionadas.includes(p.estruturaId)).forEach(p => {
    const cargaState = state.cargaState[p.estruturaId] || {}
    const divs = [p.divisao, ...(p.acess || []).map(a => a.divisao)].filter(Boolean)
    divs.forEach(divisao => {
      const carga = cargaDaDivisao(divisao, cargaState)
      if (carga == null) return
      const atual = porDivisao.get(divisao)
      if (!atual || carga > atual) porDivisao.set(divisao, carga)
    })
  })
  const divisoesComCarga = [...porDivisao.entries()].map(([divisao, cargaMJm2]) => ({ divisao, cargaMJm2 }))

  const sugestao = sugerirClassificacao(areaTotal, divisoesComCarga, sprinklersObrigatorio, sprinklersAtivo, norma)

  const maiorCarga = divisoesComCarga.length ? Math.max(...divisoesComCarga.map(d => d.cargaMJm2)) : 0
  const risco = classificarRisco(maiorCarga, extNorma.LIMIARES_RISCO)
  const reservaSugerida = bombaReservaObrigatoria(risco, norma)

  const tipoAtual = h.tipo || (sugestao.opcoes[0]?.tipo ?? '')
  const dadosTipo = tipoAtual ? dadosDoTipo(tipoAtual, h.tipoVariante || 0, norma) : null
  // dadosTipo.vazaoMin é a vazão de UM hidrante (Tabela 2) — a "vazão do
  // sistema" do item 5.3.3 (critério de recalque simples/duplo) é essa
  // vazão com os hidrantes mais desfavoráveis em funcionamento simultâneo
  // (HIDRANTES_SIMULTANEOS, normalmente 2), não a de um hidrante só. Sem
  // essa multiplicação, um Tipo 5 (600 L/min por hidrante = 1.200 L/min no
  // sistema) ficava classificado como recalque simples por engano.
  const vazaoSistema = dadosTipo ? dadosTipo.vazaoMin * norma.HIDRANTES_SIMULTANEOS : 0
  const recalqueDuplo = dadosTipo ? exigeRecalqueDuplo(vazaoSistema, norma) : false

  return {
    infoPorEstrutura, estruturasSelecionadas, temSprinklers,
    areaTotal, divisoesComCarga, sugestao,
    risco, reservaSugerida, tipoAtual, dadosTipo, recalqueDuplo, vazaoSistema,
  }
}

export function useClassificacaoHidrantes() {
  const { state, dispatch } = useProjeto()
  const { hidrantes: norma, extintores: extNorma } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()
  const h = state.hidrantes
  const set = changes => dispatch({ type: 'SET_HIDRANTES', changes })

  const {
    infoPorEstrutura, estruturasSelecionadas, temSprinklers,
    areaTotal, divisoesComCarga, sugestao,
    risco, reservaSugerida, tipoAtual, dadosTipo, recalqueDuplo, vazaoSistema,
  } = useMemo(
    () => classificacaoHidrantesData(state, norma, extNorma, porEstrutura),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.estruturas, state.pavimentos, state.cargaState, state.hidrantes, porEstrutura, norma, extNorma],
  )

  const toggleEstrutura = id => {
    const atual = new Set(estruturasSelecionadas)
    atual.has(id) ? atual.delete(id) : atual.add(id)
    set({ estruturasSelecionadas: [...atual] })
  }

  const escolherOpcao = opcao => set({ tipo: opcao.tipo, rti: opcao.rti, tipoVariante: 0 })

  // RTI é sempre automática (Tabela 3) — enquanto a classificação for uma
  // sugestão sem ambiguidade (uma única opção de Tipo), fica sempre em
  // sincronia com o projeto, sem esperar o RT clicar em nada — inclusive
  // quando a sugestão MUDA depois de já ter um valor salvo (RT troca a
  // estrutura selecionada, ajusta área/carga, etc.): antes só sincronizava
  // na primeira vez (guard `!h.tipo`), então uma mudança posterior deixava
  // a classificação salva desatualizada, divergindo da Tabela 3 em
  // silêncio. Quando há 2 opções (coluna 1, ou Nota 1/2), o RT decide qual
  // das duas adotar (ver escolherOpcao) — preserva essa escolha entre as
  // duas, só atualizando a RTI se a faixa de área mudou. Sem uma escolha
  // válida ainda (projeto novo, h.tipo vazio) ou com a escolha salva fora
  // das opções atuais (ex.: saiu da coluna 1), NUNCA escolhe uma das duas
  // por conta própria — limpa tipo/rti pra nenhuma pill aparecer
  // selecionada até o RT de fato clicar. Escolher sozinho aqui equivalia a
  // uma decisão de projeto (RTI 8 m³ x 12 m³, por exemplo) tomada sem o RT
  // perceber, e mascarava o sistema como já classificado em telas que
  // dependem disso (ex.: dockpane só libera "Mapear Trechos" depois que o
  // Tipo é de fato aplicado no Revit).
  useEffect(() => {
    const opcoes = sugestao.opcoes
    if (opcoes.length === 0) return

    if (opcoes.length === 1) {
      const unica = opcoes[0]
      if (h.tipo !== unica.tipo || Number(h.rti) !== Number(unica.rti)) {
        set({ tipo: unica.tipo, rti: unica.rti, tipoVariante: h.tipo === unica.tipo ? h.tipoVariante : 0 })
      }
      return
    }

    const escolhaAtual = opcoes.find(o => o.tipo === h.tipo)
    if (!escolhaAtual) {
      if (h.tipo || h.rti) set({ tipo: '', rti: '', tipoVariante: 0 })
    } else if (Number(h.rti) !== Number(escolhaAtual.rti)) {
      set({ rti: escolhaAtual.rti })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao.opcoes, h.tipo, h.rti, h.tipoVariante])

  // Método de cálculo não é escolha do RT: é fixo pela norma do estado do
  // projeto (onde a Tabela 2 exige verificar Q/Pmin — válvula ou esguicho).
  // Mantido em state.hidrantes (em vez de derivado só na hora de enviar)
  // pra viajar junto no dado sincronizado com o plugin.
  useEffect(() => {
    if (h.metodoCalculo !== norma.REFERENCIA_PRESSAO_VAZAO) {
      set({ metodoCalculo: norma.REFERENCIA_PRESSAO_VAZAO })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [norma.REFERENCIA_PRESSAO_VAZAO])

  // Nº de entradas do dispositivo de recalque não é escolha do RT: é
  // derivado da vazão do sistema (item 5.3.3, NT 22 — acima de 1.000 L/min
  // exige 2 entradas). Mantido em sincronia aqui (mesmo padrão do
  // metodoCalculo acima) pra o memorial descritivo (memorial/hidrantes.js)
  // narrar o valor de fato vigente, em vez de ficar preso no default (1)
  // por nunca ser escrito por nenhum campo do formulário.
  useEffect(() => {
    if (!dadosTipo) return
    const entradas = recalqueDuplo ? 2 : 1
    if (h.recalqueEntradas !== entradas) set({ recalqueEntradas: entradas })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dadosTipo, recalqueDuplo])

  return {
    h, set, norma, extNorma,
    infoPorEstrutura, estruturasSelecionadas, toggleEstrutura,
    areaTotal, divisoesComCarga, sugestao, escolherOpcao,
    risco, reservaSugerida, tipoAtual, dadosTipo, recalqueDuplo, vazaoSistema, temSprinklers,
  }
}
