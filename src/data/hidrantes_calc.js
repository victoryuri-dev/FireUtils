// ─────────────────────────────────────────────────────────────────────────────
// hidrantes_calc.js — Classificação do Sistema de Hidrantes/Mangotinhos
// (Tabela 3 da norma). Funções puras: recebem os dados normativos (norma
// de normas/<UF>/hidrantes.js) como parâmetro, nunca importam um estado
// direto — mesma convenção de extintores_calc.js/iluminacao_calc.js.
//
// O que este módulo NÃO faz: dimensionamento hidráulico (perda de carga,
// altura manométrica, potência de bomba) — isso é calculado pelo plugin
// Revit a partir da classificação que sai daqui.
// ─────────────────────────────────────────────────────────────────────────────

const num = v => parseFloat(v) || 0

/** Posição do reservatório em relação ao nível do solo — vocabulário fixo
 *  (não varia por UF/norma, ao contrário de MATERIAIS_RESERVATORIO etc.,
 *  por isso mora aqui, não em normas/<UF>/hidrantes.js). Usado pelo
 *  formulário (FormularioSistema.jsx) e narrado no memorial descritivo
 *  (memorial/hidrantes.js). */
export const POSICOES_RESERVATORIO = [
  { key: 'elevado',       label: 'Elevado' },
  { key: 'nivel_solo',    label: 'Nível do solo' },
  { key: 'semienterrado', label: 'Semienterrado' },
  { key: 'subterraneo',   label: 'Subterrâneo' },
]

// Opções de posição do reservatório que diferem por estado — PB: as do item
// 17.1 do formulário do CBMPB (enterrado = 'subterraneo', que pede a NSTH;
// manancial como uma das posições). Sem entrada, as do MA.
const POSICOES_RESERVATORIO_UF = {
  PB: [
    { key: 'elevado',       label: 'Reservatório elevado' },
    { key: 'subterraneo',   label: 'Reservatório enterrado' },
    { key: 'manancial',     label: 'Manancial' },
    { key: 'semienterrado', label: 'Reservatório semi-enterrado' },
  ],
}
/** Posições do reservatório do estado. */
export const posicoesReservatorio = uf => POSICOES_RESERVATORIO_UF[uf] || POSICOES_RESERVATORIO

/** Coluna da Tabela 3 (1-4) para uma divisão, dada a carga de incêndio
 *  (MJ/m²) do pavimento — usa a faixa quando a divisão depende de carga,
 *  senão a coluna fixa. Retorna null se a divisão não consta na tabela. */
export function colunaDaDivisao(divisao, cargaMJm2, norma) {
  const porCarga = norma.DIVISOES_POR_CARGA[divisao]
  if (porCarga) {
    const carga = num(cargaMJm2)
    const faixa = porCarga.find(f => (f.min == null || carga >= f.min) && (f.max == null || carga < f.max))
    return faixa ? faixa.coluna : null
  }
  return norma.DIVISOES_COLUNA[divisao] ?? null
}

/** Índice da faixa de área (0-based, Tabela 3) para uma área construída
 *  total em m². Retorna -1 se a área for inválida/zero. */
export function faixaAreaIndex(areaTotal, norma) {
  const a = num(areaTotal)
  if (a <= 0) return -1
  return norma.FAIXAS_AREA.findIndex(f => (f.min == null || a > f.min) && (f.max == null || a <= f.max))
}

/** Opções de classificação (Tipo + RTI) para uma coluna/faixa, considerando
 *  chuveiros automáticos. A Tabela 3 tem duas notas com condições
 *  DIFERENTES — por isso dois sinais distintos, não um só:
 *
 *  - Nota 1: só vale quando os chuveiros automáticos são EXIGIDOS
 *    (`sprinklersObrigatorio`) — permite Tipo 5 → Tipo 4, independente de
 *    o sistema já estar instalado ou não.
 *  - Nota 2: só vale quando os chuveiros NÃO são exigidos, mas foram
 *    instalados por outro motivo (`sprinklersAtivo && !sprinklersObrigatorio`,
 *    aqui `sprinklersVoluntario`) — permite Tipo 5 → Tipo 4 (mesmo
 *    resultado da Nota 1, só muda a nota citada) e Tipo 4 → Tipo 3.
 *
 *  Pra Tipo 4 (coluna 3, ou coluna 4 já Tipo 4), só a Nota 2 se aplica —
 *  se os chuveiros forem exigidos (`sprinklersObrigatorio`), nenhuma nota
 *  permite o rebaixamento pra Tipo 3, então a opção nem aparece.
 *
 *  Retorna uma lista — normalmente 1 opção, mas 2 quando o RT tem uma
 *  escolha a fazer: coluna 1 (Tipo 1 ou Tipo 2, sempre) ou um rebaixamento
 *  permitido por Nota 1/2. As notas só PERMITEM o rebaixamento — nunca
 *  impõem: por isso sempre voltam como uma escolha (pills), nunca
 *  aplicadas sozinhas.
 *
 *  Cada opção: { tipo, rti, origem: 'normal'|'nota1'|'nota2', nota? } —
 *  `nota` traz o texto a exibir/citar no memorial quando o rebaixamento
 *  foi aplicado.
 */
export function opcoesClassificacao(coluna, faixaIndex, sprinklersObrigatorio, sprinklersAtivo, norma) {
  if (coluna == null || faixaIndex < 0 || faixaIndex >= norma.TABELA3.length) return []
  const linha = norma.TABELA3[faixaIndex]
  const sprinklersVoluntario = sprinklersAtivo && !sprinklersObrigatorio

  if (coluna === 1) {
    return [
      { tipo: 1, rti: linha.col1.tipo1.rti, origem: 'normal' },
      { tipo: 2, rti: linha.col1.tipo2.rti, origem: 'normal' },
    ]
  }

  if (coluna === 2) {
    return [{ tipo: linha.col2.tipo, rti: linha.col2.rti, origem: 'normal' }]
  }

  // Texto literal das Notas 1 e 2 da Tabela 3 (NT 22/2021 CBMMA) — citado
  // ao pé da letra, sem paráfrase, pra exibir/citar no memorial exatamente
  // como está na norma.
  const NOTA1 = 'Nota 1 da Tabela 3, NT 22/2021 CBMMA: "As ocupações enquadradas no sistema tipo 5 que possuírem a exigência de sistema de chuveiros automáticos, podem aplicar o sistema tipo 4." O rebaixamento é uma opção do responsável técnico, não uma imposição normativa.'
  const NOTA2 = 'Nota 2 da Tabela 3, NT 22/2021 CBMMA: "As ocupações enquadradas no sistema tipo 5 e as ocupações enquadradas no sistema tipo 4, que não possuírem a exigência de sistema de chuveiros automáticos, mas que, por outras circunstâncias, tal sistema for instalado, podem aplicar, respectivamente, o sistema tipo 4 e o sistema tipo 3, com a RTI de um nível inferior no quadro acima." O rebaixamento é uma opção do responsável técnico, não uma imposição normativa.'

  if (coluna === 3) {
    const base = { tipo: linha.col3.tipo, rti: linha.col3.rti, origem: 'normal' }
    // Só a Nota 2 se aplica a Tipo 4 — exige que os chuveiros NÃO sejam
    // exigidos (senão nenhuma nota permite o rebaixamento pra Tipo 3).
    if (sprinklersVoluntario) {
      return [base, { tipo: 3, rti: linha.col2.rti, origem: 'nota2', nota: NOTA2 }]
    }
    return [base]
  }

  if (coluna === 4) {
    const base = { tipo: linha.col4.tipo, rti: linha.col4.rti, origem: 'normal' }
    if (linha.col4.tipo === 5) {
      // Nota 1 (exigência) ou Nota 2 (instalado por conta própria) — os
      // dois casos levam ao mesmo Tipo 4, só muda a nota citada. Nota 1
      // só PERMITE o rebaixamento — não impõe: o RT decide se adota (ver
      // FormularioSistema.jsx, mesmas pills de escolha da coluna 1). Tipo
      // 5 (base) continua a 1ª opção.
      if (sprinklersObrigatorio) {
        return [
          base,
          { tipo: 4, rti: linha.col3.rti, origem: 'nota1', nota: NOTA1 },
        ]
      }
      if (sprinklersVoluntario) {
        return [
          base,
          { tipo: 4, rti: linha.col3.rti, origem: 'nota2', nota: NOTA2 },
        ]
      }
      return [base]
    }
    // já era Tipo 4 na própria tabela — só a Nota 2 permite rebaixar mais
    // um nível, pra Tipo 3 (mesma exigência da coluna 3 acima).
    if (sprinklersVoluntario) {
      return [base, { tipo: 3, rti: linha.col2.rti, origem: 'nota2', nota: NOTA2 }]
    }
    return [base]
  }

  return []
}

/** Divisão de maior carga de incêndio entre uma lista de divisões — a NT 22
 *  não dá um critério explícito pra ocupação mista na classificação do
 *  Tipo/RTI, então adotamos a ocupação de maior carga de incêndio (mais
 *  exigente em termos de risco) como referência. Retorna null se a lista
 *  estiver vazia ou nenhuma divisão constar na Tabela 3. */
export function divisaoMaiorCarga(divisoesComCarga, norma) {
  let melhor = null
  divisoesComCarga.forEach(({ divisao, cargaMJm2 }) => {
    const coluna = colunaDaDivisao(divisao, cargaMJm2, norma)
    if (coluna == null) return
    if (!melhor || cargaMJm2 > melhor.cargaMJm2) melhor = { divisao, coluna, cargaMJm2 }
  })
  return melhor
}

/** Monta a sugestão completa de classificação pra um projeto: cruza área
 *  total (só das estruturas que exigem hidrantes — ver FormularioSistema)
 *  + divisão de maior carga de incêndio + chuveiros automáticos (exigidos
 *  e/ou instalados — ver opcoesClassificacao acima pra por que são dois
 *  sinais, não um só), e devolve as opções de Tipo/RTI já prontas pro
 *  formulário exibir. `divisoesComCarga`: [{ divisao, cargaMJm2 }]. */
export function sugerirClassificacao(areaTotal, divisoesComCarga, sprinklersObrigatorio, sprinklersAtivo, norma) {
  const faixaIndex = faixaAreaIndex(areaTotal, norma)
  if (faixaIndex < 0 || !divisoesComCarga?.length) {
    return { faixaIndex, coluna: null, divisao: null, opcoes: [] }
  }

  const maiorCarga = divisaoMaiorCarga(divisoesComCarga, norma)
  if (!maiorCarga) return { faixaIndex, coluna: null, divisao: null, opcoes: [] }

  const opcoes = opcoesClassificacao(maiorCarga.coluna, faixaIndex, sprinklersObrigatorio, sprinklersAtivo, norma)
  return { faixaIndex, coluna: maiorCarga.coluna, divisao: maiorCarga.divisao, opcoes }
}

/** RTI tabelada (Tabela 3) para um Tipo específico numa faixa de área —
 *  usada quando o RT sobrescreve manualmente o Tipo sugerido (item 5.8.10
 *  permite dimensionamento a critério do projetista) e a RTI precisa
 *  continuar automática, buscando na própria linha da tabela. Retorna null
 *  se aquele Tipo não aparecer em nenhuma coluna da faixa (ex.: Tipo 5 numa
 *  faixa cuja coluna 4 ainda é Tipo 4) — nesse caso não há RTI tabelada
 *  pronta e o RT precisa justificar o valor por cálculo (item 5.8.10). */
export function rtiParaTipoNaFaixa(tipo, faixaIndex, norma) {
  if (faixaIndex < 0 || faixaIndex >= norma.TABELA3.length) return null
  const linha = norma.TABELA3[faixaIndex]
  if (tipo === 1) return linha.col1.tipo1.rti
  if (tipo === 2) return linha.col1.tipo2.rti
  if (linha.col2.tipo === tipo) return linha.col2.rti
  if (linha.col3.tipo === tipo) return linha.col3.rti
  if (linha.col4.tipo === tipo) return linha.col4.rti
  return null
}

/** Dados de referência (Tabela 2/4) para um Tipo escolhido — esguicho,
 *  mangueira, componentes obrigatórios. `variante` é o índice dentro de
 *  `TIPOS_SISTEMA[tipo].variantes` (Tipo 4 tem 2; os demais só têm 1). */
export function dadosDoTipo(tipo, variante, norma) {
  const sistema = norma.TIPOS_SISTEMA[tipo]
  if (!sistema) return null
  const v = sistema.variantes[variante] || sistema.variantes[0]
  const componentes = norma.COMPONENTES_POR_TIPO[tipo]
  return {
    label: sistema.label,
    expedicoes: sistema.expedicoes,
    vazaoMin: sistema.vazaoMin,
    pressaoMin: v.pressaoMin,
    esguicho: v.esguicho,
    mangueiraDn: v.mangueiraDn,
    mangueiraComprimento: v.mangueiraComprimento,
    componentes,
  }
}

// ── Sistema "Personalizado" ─────────────────────────────────────────────────
// O RT digita os parâmetros mínimos (vazão, pressão, esguicho, mangueira,
// expedições) em vez de usar um Tipo da norma. O SITE interpreta o Tipo
// (da norma ou personalizado) e grava em state.hidrantes.parametros os
// valores que o plugin precisa — o plugin e o motor de cálculo não têm
// tabela de Tipos própria, só usam o que chega daqui.
export const TIPO_PERSONALIZADO = 'personalizado'
export const PERSONALIZADO_VAZIO = { vazaoMin: '', pressaoMin: '', esguicho: '', mangueiraDn: '', mangueiraComprimento: '', expedicoes: 'simples' }
// Componentes (Tabela 4) do sistema personalizado: sem tabela da norma, adota
// o conjunto exigido pelos Tipos de maior porte (abrigo + chave + esguicho).
const COMPONENTES_PERSONALIZADO = { abrigo: 'obrigatorio', mangueiraIncendio: 'tipo2_3_4_ou_5', chaveEngate: true, esguichoAvulso: true, mangueiraSemirrigida: false }

/** Dados do sistema ESCOLHIDO no projeto (`h` = state.hidrantes): um Tipo da
 *  norma (+ variante) ou o personalizado. null enquanto não há escolha válida
 *  (no personalizado, enquanto algum parâmetro estiver vazio ou <= 0). */
export function dadosDoSistemaDoProjeto(h, norma) {
  if (!h?.tipo) return null
  if (h.tipo === TIPO_PERSONALIZADO) {
    const p = { ...PERSONALIZADO_VAZIO, ...(h.personalizado || {}) }
    const n = k => parseFloat(String(p[k]).replace(',', '.'))
    const valores = { vazaoMin: n('vazaoMin'), pressaoMin: n('pressaoMin'), esguicho: n('esguicho'), mangueiraDn: n('mangueiraDn'), mangueiraComprimento: n('mangueiraComprimento') }
    if (Object.values(valores).some(v => !(v > 0))) return null
    if (p.expedicoes !== 'simples' && p.expedicoes !== 'duplo') return null
    return { label: 'Personalizado', expedicoes: p.expedicoes, ...valores, componentes: COMPONENTES_PERSONALIZADO }
  }
  return norma ? dadosDoTipo(h.tipo, h.tipoVariante || 0, norma) : null
}

/** Os parâmetros que o plugin precisa (state.hidrantes.parametros), a partir
 *  dos dados do sistema escolhido — null sem escolha válida. */
export function parametrosDoSistema(dados) {
  if (!dados) return null
  const { vazaoMin, pressaoMin, esguicho, mangueiraDn, mangueiraComprimento, expedicoes } = dados
  return { vazaoMin, pressaoMin, esguicho, mangueiraDn, mangueiraComprimento, expedicoes }
}

/** true se o número de entradas do dispositivo de recalque deve ser 2
 *  (item 5.3.3 — vazão do sistema acima do limite normativo). */
export function exigeRecalqueDuplo(vazaoMin, norma) {
  return num(vazaoMin) > norma.VAZAO_LIMITE_RECALQUE_DUPLO
}

/** Potência mínima da bomba de recalque: P_cv = (1000·Qt·Ht)/(75·η) — mesma
 *  fórmula que o plugin Revit usava (agora dimensionada aqui, no site, já
 *  que não depende de nenhum dado exclusivo do modelo — só de Qt/Ht, que
 *  continuam vindo do dimensionamento hidráulico do plugin). `qtLmin` em
 *  L/min, `htMca` em mca, `etaPercent` em % (0-100). Retorna
 *  `{ potCv: null, potKw: null }` se a eficiência ainda não foi informada. */
export function calcPotenciaBomba(qtLmin, htMca, etaPercent) {
  const etaDec = (parseFloat(etaPercent) || 0) / 100
  if (etaDec <= 0 || !qtLmin || !htMca) return { potCv: null, potKw: null }
  const qtM3s = qtLmin / 60000
  const potCv = (1000 * qtM3s * htMca) / (75 * etaDec)
  return { potCv, potKw: potCv / 1.36 }
}

/** Bomba reserva obrigatória (Anexo C, C.3.12) pra um risco baixo/medio/alto
 *  — risco 'baixo' nunca exige. Retorna null quando não exige. */
export function bombaReservaObrigatoria(risco, norma) {
  return norma.BOMBA_RESERVA_POR_RISCO[risco] ?? null
}
