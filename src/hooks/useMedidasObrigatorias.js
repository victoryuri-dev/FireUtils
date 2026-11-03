import { useMemo } from 'react'
import { useProjeto } from '../context/ProjetoContext'
import { getMedidasObrigatorias, getGruposSemDados, getCompartimentacao } from '../data/normas/index'
import { classificarPavimentos, divisoesDaEstrutura } from '../utils/classificacao'
import { alturaEdificacaoBase } from '../data/trrf_calc'
import { calcularAreaMaximaCompartimentacao } from '../data/compart_calc'

// Inverso do abaixo: mesmo que a tabela da norma marque como obrigatoria pra
// a ocupacao/altura, o usuario decide se instala (fica sempre habilitavel/
// desabilitavel manualmente em Configuracao, nunca travada como "Obrigatorio").
const SEMPRE_OPCIONAL = ['central_gas']

// Conjunto minimo de referencia aplicado quando a norma ainda nao tem dados
// cadastrados (Tabela 5 simplificada ou Tabela 6 normal) para algum grupo de
// ocupacao presente na estrutura — evita que o motor "esconda" exigencias por
// falta de dado. Deve ser confirmado manualmente com o CBMMA nesses casos.
// acesso_viatura/seg_estrutural entram aqui so como fallback: quando ha dado
// cadastrado (Tabela 5 ou 6), a propria tabela decide (ex: Tabela 5 nao exige
// nenhuma das duas; Tabela 6 do F-7 nao exige seg_estrutural).
const BASELINE_QUANDO_FALTA_DADO = [
  'acesso_viatura', 'seg_estrutural', 'saida_emergencia', 'brigada', 'iluminacao', 'sinalizacao', 'extintores',
]

// Projeto "apenas dimensionamento" (state.tipoProjeto — ver ProjetoContext.jsx/
// Step6.jsx) só dimensiona esses sistemas — os demais nunca aparecem como
// obrigatórios/ativos aqui, mesmo que a NT 42/2019 os exigiria pra essa
// ocupação/altura/área. Esse é o ÚNICO lugar que decide isso: ProjectAside.jsx
// (menu lateral), memorial/registry.js (buildMemorial) e Step6.jsx (grid de
// medidas) todos leem `sistemas`/`porEstrutura` daqui — sem esse filtro
// central, um sistema sem builder de memorial nem página própria (ex.:
// SPDA) ainda apareceria "obrigatório" no menu e geraria pendência sem
// nenhuma tela pra resolver, num modo pensado pra não pedir esse dado.
const SISTEMAS_DIMENSIONAMENTO = new Set(['saida_emergencia', 'hidrantes', 'sprinklers'])

/**
 * Núcleo puro (sem hooks) de useMedidasObrigatorias, abaixo — extraído pra
 * poder ser chamado também fora de componentes React, como na geração do
 * memorial descritivo (ver memorial/hidrantes.js), sem duplicar esta
 * lógica.
 */
export function medidasObrigatorias(state) {
  const dimensionamento = state.tipoProjeto === 'dimensionamento'
  const porEstrutura = state.estruturas.map(est => {
    const pavsEst = state.pavimentos.filter(p => p.estruturaId === est.id)
    const areaEstrutura   = parseFloat(est.areaTotal)      || 0
    const alturaEstrutura = alturaEdificacaoBase(est)
    const divisoes = divisoesDaEstrutura(pavsEst)
    const classificacao = classificarPavimentos(pavsEst, areaEstrutura)

    let resultado = null
    let gruposFaltantes = []
    if (divisoes.length > 0) {
      resultado = getMedidasObrigatorias(state.uf, divisoes, alturaEstrutura, areaEstrutura)
      gruposFaltantes = getGruposSemDados(state.uf, divisoes, alturaEstrutura, areaEstrutura)
    }

    const medidas = {}
    Object.entries(resultado?.medidas || {}).forEach(([k, v]) => { medidas[k] = !!v.obrigatorio })
    if (gruposFaltantes.length > 0) {
      BASELINE_QUANDO_FALTA_DADO.forEach(k => { medidas[k] = true })
    }
    // Vence por ultimo: nunca trava como obrigatoria, mesmo que a tabela
    // da norma ou o baseline de grupo-sem-dados tenham marcado true acima.
    SEMPRE_OPCIONAL.forEach(k => { medidas[k] = false })

    // Compartimentação horizontal/vertical tem dois jeitos de ficar isenta
    // mesmo sendo obrigatória pela norma, decididos na própria tela de
    // Compartimentação (CompartimentacaoPage.jsx), sem passar pelo toggle
    // manual de Configuração: substituição por sistema alternativo
    // (est.isencaoCompart{Horizontal,Vertical} — nota de rodapé da Tabela 6)
    // e, só a horizontal, a edificação já se enquadrar num único
    // compartimento (mesmo calc puro de compart_calc.js que alimenta a tela
    // e o memorial — nunca duas fontes de verdade). Sem isso, essas duas
    // isenções não baixavam `ativo`, e a medida continuava marcada como
    // aplicada (X) no Anexo B e no resumo do memorial.
    const isentoCompartHorizontal = !!est.isencaoCompartHorizontal || (() => {
      const compart = getCompartimentacao(state.uf)
      if (!compart) return false // norma não cadastrada para o estado: sem isenção por área
      const { TABELA_AREA_MAXIMA, CLASSES_TIPO_EDIFICACAO } = compart
      return calcularAreaMaximaCompartimentacao(pavsEst, est, TABELA_AREA_MAXIMA, CLASSES_TIPO_EDIFICACAO, state.areaCompartimentacaoHorizontal).dentroDoLimite
    })()
    const isentoCompartVertical = !!est.isencaoCompartVertical

    // Sistemas desta estrutura: obrigatorio vem da norma (medidas acima).
    // ativo segue o toggle manual quando ele existe (guardado por estrutura
    // em state.sistemasPorEstrutura — cada torre/bloco decide os proprios
    // sistemas, independente das demais); sem toggle manual, segue a norma,
    // exceto compart_horizontal/vertical isentos como acima. Isso permite
    // desativar manualmente um sistema obrigatorio (o usuario decide não
    // instalar, por conta e risco próprios) sem perder o proprio
    // `obrigatorio` — quem le os dois campos pode continuar sinalizando
    // (borda vermelha) que a norma exige mesmo estando desativado.
    const sistemas = {}
    Object.keys(state.sistemas || {}).forEach(k => {
      if (dimensionamento && !SISTEMAS_DIMENSIONAMENTO.has(k)) {
        sistemas[k] = { obrigatorio: false, ativo: false }
        return
      }
      const obrigatorio = !!medidas[k]
      const manual = state.sistemasPorEstrutura[est.id]?.[k]
      // Isenção por área (compartimento único, Anexo B) ou substituição por
      // sistema alternativo SEMPRE vence, mesmo com toggle manual ligado —
      // são fatos calculados (compart_calc.js), não uma opinião do RT, e o
      // texto do memorial (compartimentacao.js) já narra a dispensa de
      // forma incondicional nesse caso. Deixar o manual vencer aqui criava
      // uma contradição: o memorial dizia "dispensada" mas a tabela de
      // medidas aplicadas e o Anexo B mostravam "X" (ativo).
      let ativo
      if (k === 'compart_horizontal' && isentoCompartHorizontal) ativo = false
      else if (k === 'compart_vertical' && isentoCompartVertical) ativo = false
      else ativo = manual !== undefined ? manual : obrigatorio
      // `isento`: a norma exige, mas a medida ficou dispensada pelos próprios
      // dados do projeto (área, compartimento único, sistema alternativo) — e
      // não por desligamento manual. Continua aparecendo no site, com a
      // justificativa calculada.
      sistemas[k] = { obrigatorio, ativo, isento: obrigatorio && !ativo && manual !== false }
    })

    return {
      estrutura: est,
      areaEstrutura,
      alturaEstrutura,
      divisoes,
      classificacao,
      simplificado: resultado?.simplificado ?? null,
      gruposFaltantes,
      medidas,
      sistemas,
    }
  })

  // Agregado do projeto: `obrigatorio` e verdadeiro se a norma exigir em
  // QUALQUER estrutura; `ativo` respeita o toggle manual de cada uma (nao
  // forca mais true so por obrigatorio — uma estrutura pode ter desativado
  // manualmente) — usado por telas que ainda tratam o projeto como um todo
  // (nav lateral, paginas de dimensionamento, Anexo B).
  const sistemas = {}
  Object.keys(state.sistemas || {}).forEach(k => {
    if (dimensionamento && !SISTEMAS_DIMENSIONAMENTO.has(k)) {
      sistemas[k] = { obrigatorio: false, ativo: false }
      return
    }
    const obrigatorio = porEstrutura.some(pe => pe.sistemas[k]?.obrigatorio)
    const ativo = porEstrutura.some(pe => pe.sistemas[k]?.ativo)
    const isento = !ativo && porEstrutura.some(pe => pe.sistemas[k]?.isento)
    sistemas[k] = { obrigatorio, ativo, isento }
  })

  return { porEstrutura, sistemas }
}

/**
 * Deriva, a partir das estruturas/pavimentos do projeto, quais medidas de
 * seguranca sao obrigatorias (por estrutura e agregado no projeto), com
 * base na area construida, altura (piso a piso) e ocupacoes de cada
 * estrutura — conforme NT 42/2019 CBMMA. Wrapper fino de medidasObrigatorias
 * acima, só memoizando pro React.
 */
export function useMedidasObrigatorias() {
  const { state, normasVersion } = useProjeto()
  // `normasVersion` não é lido dentro de medidasObrigatorias diretamente —
  // getMedidasObrigatorias/getGruposSemDados (normas/index.js) leem a
  // Tabela 5/6 (`medidas_seguranca`) do cache de normasRemote.js, por fora
  // do React — mas precisa disparar o recálculo quando o fetch da base
  // central terminar, senão o resultado fica preso ao estado vazio do
  // primeiro render, antes do Supabase responder.
  return useMemo(
    () => medidasObrigatorias(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.estruturas, state.pavimentos, state.uf, state.sistemas, state.sistemasPorEstrutura, state.tipoProjeto, state.areaCompartimentacaoHorizontal, normasVersion]
  )
}
