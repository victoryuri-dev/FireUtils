// Acesso de viatura da PB (item 6 do formulário, NT 14/2023): com as
// distâncias e os dados da via informados pelo RT, decide qual linha do
// formulário vale — mesma ideia do gatilho do MA (av_calc.js), com o
// critério da PB: hidrante de recalque e caminhamentos até a via pública.
//
// Casos (linhas do formulário, na ordem):
//   1 sem recalque, edificação ≤ 20 m              → facultativo
//   2 recalque ≤ 20 m e edificação ≤ 50 m          → facultativo
//   3 sem recalque, edificação > 20 m              → obrigatório
//   4 recalque ≤ 20 m e edificação > 50 m          → obrigatório
//   5 recalque > 20 m e edificação > 50 m          → obrigatório
// Recalque > 20 m com edificação ≤ 50 m não tem linha no formulário: o
// acesso é obrigatório (o recalque fica fora do alcance) e nenhuma das cinco
// é marcada — a página avisa.
//
// Hidrante de recalque: há sempre que o sistema de hidrantes é exigido no
// projeto (não é pergunta ao RT). Dados da via em branco valem o padrão da
// página (largura 6 m, altura livre 4,5 m, portão 4 × 4,5 m) — mesmo
// esquema do MA (av_calc.js, numOr).

const num = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const numOr = (v, padrao) => num(v) ?? padrao

/** `temRecalque`: sistema de hidrantes exigido no projeto. */
export function decidirAcessoViaturaPB(av = {}, temRecalqueProjeto, P) {
  if (!P) return null
  const temRecalque = !!temRecalqueProjeto
  const edificacao = num(av.distanciaEdificacao)
  const recalque = num(av.distanciaRecalque)
  let caso = null, obrigatorio = null, foraDoFormulario = false
  if (!temRecalque) {
    if (edificacao != null) {
      obrigatorio = edificacao > P.semRecalque.edificacaoMax
      caso = obrigatorio ? 3 : 1
    }
  } else if (edificacao != null && recalque != null) {
    const recalqueOk = recalque <= P.comRecalque.recalqueMax
    const edificacaoOk = edificacao <= P.comRecalque.edificacaoMax
    if (recalqueOk && edificacaoOk) { caso = 2; obrigatorio = false }
    else if (recalqueOk) { caso = 4; obrigatorio = true }
    else if (!edificacaoOk) { caso = 5; obrigatorio = true }
    else { obrigatorio = true; foraDoFormulario = true }
  }

  // Facultativo (linhas 1 e 2): o RT escolhe se aplica o acesso mesmo assim
  // (av.facultativoAplicavel). Aplicado, a via segue as mesmas exigências
  // do obrigatório.
  const aplica = obrigatorio === true || (obrigatorio === false && av.facultativoAplicavel === true)

  // Via de acesso (vale quando o acesso é obrigatório ou aplicado).
  const V = P.via
  const largura = numOr(av.larguraVia, V.larguraMin)
  const alturaLivre = numOr(av.alturaLivre, V.alturaLivreMin)
  const extensao = num(av.extensaoVia)
  const viaPadrao = largura >= V.larguraMin
  const viaReduzida = largura >= V.larguraReduzidaMin && largura < V.larguraMin
  const exigeRetorno = extensao != null && largura < P.retorno.larguraAbaixoDe && extensao > P.retorno.comprimentoAcimaDe
  const portaoOk = !!av.temPortao && numOr(av.portaoLargura, P.portao.larguraMin) >= P.portao.larguraMin && numOr(av.portaoAltura, P.portao.alturaMin) >= P.portao.alturaMin

  return {
    temRecalque, edificacao, recalque, caso, obrigatorio, foraDoFormulario, aplica,
    via: {
      // a)–f): largura ≥ 6, altura livre ≥ 4,5, suporta 25.000 kgf (resposta
      // do RT) e portão (se houver) nas dimensões mínimas. A desobstrução é
      // condição da norma, não pergunta — não entra na decisão.
      atende: aplica && viaPadrao && alturaLivre >= V.alturaLivreMin && av.cargaConfirmada === true && (!av.temPortao || portaoOk),
      reduzida: aplica && viaReduzida,
      exigeRetorno,
    },
    portaoOk,
    // Faixa de estacionamento: compensação obrigatória quando o RT adota via
    // com menos de 6 m (até o mínimo de 5 m); com 6 m ou mais, não se aplica.
    faixa: aplica && viaReduzida,
  }
}
