// utils/assinaturas/geometria.js — onde cai o campo de assinatura em cada página.
//
// O campo é definido UMA vez por grupo e aplicado a todos os PDFs dele. Para
// valer em folhas de tamanhos diferentes (A1, A3...), a posição é guardada em
// milímetros a partir de um CANTO da página, e não em porcentagem: o selo
// mantém o tamanho e a distância da borda, como o carimbo de uma prancha.
//
// Três sistemas de coordenadas aparecem aqui:
//   • "visível": a página como aparece na tela, já girada por /Rotate, origem
//     no canto superior esquerdo, eixo y para baixo, em pontos (1/72 pol).
//   • "PDF": o espaço do arquivo, SEM rotação, origem no canto inferior
//     esquerdo da caixa da página, eixo y para cima. É o que o /Rect de uma
//     assinatura usa.
//   • "campo": o que o usuário configura — âncora + deslocamentos em mm.

export const PT_POR_MM = 72 / 25.4
export const mmParaPt = mm => mm * PT_POR_MM
export const ptParaMm = pt => pt / PT_POR_MM

export const ANCORAS = ['superior-esquerda', 'superior-direita', 'inferior-esquerda', 'inferior-direita']

export const ROTULO_ANCORA = {
  'superior-esquerda': 'Superior esquerdo',
  'superior-direita': 'Superior direito',
  'inferior-esquerda': 'Inferior esquerdo',
  'inferior-direita': 'Inferior direito',
}

/** Campo de assinatura padrão: canto inferior direito, onde costuma ficar o carimbo. */
export const CAMPO_PADRAO = Object.freeze({
  ancora: 'inferior-direita',
  dxMm: 10,
  dyMm: 10,
  larguraMm: 70,
  alturaMm: 30,
  proporcional: true, // acompanha o tamanho de cada folha (vale depois da 1ª edição, que define `base`)
})

/** Rotação /Rotate do PDF normalizada para 0, 90, 180 ou 270. */
export function normalizarRotacao(graus) {
  const n = Number(graus)
  if (!Number.isFinite(n)) return 0
  return (((Math.round(n / 90) * 90) % 360) + 360) % 360
}

/**
 * Tamanho da página como é vista (já girada).
 * @param {{ largura:number, altura:number, rotacao?:number }} pagina  pontos, sem rotação
 */
export function dimensoesVisiveis(pagina) {
  const girada = normalizarRotacao(pagina.rotacao) % 180 !== 0
  return girada
    ? { largura: pagina.altura, altura: pagina.largura }
    : { largura: pagina.largura, altura: pagina.altura }
}

/**
 * Fator pelo qual o campo cresce/encolhe numa folha. O campo guarda `base` (tamanho visível
 * da folha em que foi posicionado, em pt) e, com `proporcional` ligado, acompanha o tamanho
 * das outras folhas: numa A0 o selo e as distâncias ficam ~1,41× os de uma A1, caindo no mesmo
 * lugar de uma prancha cujo carimbo cresce junto com a folha. Sem `base` ou desligado: 1
 * (milímetros fixos, como em qualquer carimbo de tamanho único).
 */
export function fatorDaFolha(campo, pagina) {
  const b = campo.base
  if (campo.proporcional === false || !b || !(b.largura > 0) || !(b.altura > 0)) return 1
  const vis = dimensoesVisiveis(pagina)
  return Math.sqrt((vis.largura * vis.altura) / (b.largura * b.altura))
}

/** Tamanho visível da folha, para guardar como `base` do campo. */
export function baseDaFolha(pagina) {
  const { largura, altura } = dimensoesVisiveis(pagina)
  return { largura: arredondar(largura, 2), altura: arredondar(altura, 2) }
}

const arredondar = (v, casas = 1) => {
  const f = 10 ** casas
  return Math.round(v * f) / f
}

/**
 * Retângulo do campo na página visível (pt, origem no canto superior esquerdo).
 * `fora` indica que o campo não cabe na página (ex.: campo pensado para uma A1
 * aplicado a uma A4) — não corta nada, só avisa.
 */
export function retanguloVisivel(campo, pagina) {
  const vis = dimensoesVisiveis(pagina)
  const k = fatorDaFolha(campo, pagina)
  const l = mmParaPt(campo.larguraMm) * k
  const a = mmParaPt(campo.alturaMm) * k
  const dx = mmParaPt(campo.dxMm) * k
  const dy = mmParaPt(campo.dyMm) * k
  const direita = campo.ancora.endsWith('direita')
  const baixo = campo.ancora.startsWith('inferior')
  const x = direita ? vis.largura - dx - l : dx
  const y = baixo ? vis.altura - dy - a : dy
  const tol = 0.01
  const fora = x < -tol || y < -tol || x + l > vis.largura + tol || y + a > vis.altura + tol
  return { x, y, largura: l, altura: a, fora }
}

/**
 * Inverso de `retanguloVisivel`: dado o retângulo arrastado na tela (pt,
 * visível), devolve o campo (deslocamentos em mm, 0,1 mm de precisão) relativo
 * à âncora informada. Largura e altura vêm do retângulo.
 */
export function campoDoRetanguloVisivel(ret, pagina, ancora) {
  const vis = dimensoesVisiveis(pagina)
  const direita = ancora.endsWith('direita')
  const baixo = ancora.startsWith('inferior')
  const dx = direita ? vis.largura - (ret.x + ret.largura) : ret.x
  const dy = baixo ? vis.altura - (ret.y + ret.altura) : ret.y
  return {
    ancora,
    dxMm: arredondar(ptParaMm(dx)),
    dyMm: arredondar(ptParaMm(dy)),
    larguraMm: arredondar(ptParaMm(ret.largura)),
    alturaMm: arredondar(ptParaMm(ret.altura)),
    // Os milímetros acima são os DESTA folha: ela passa a ser a base das proporções.
    base: baseDaFolha(pagina),
  }
}

/** Liga/desliga "acompanhar o tamanho da folha" sem mover o campo na folha mostrada. */
export function trocarProporcional(campo, pagina, proporcional) {
  const ret = retanguloVisivel(campo, pagina)
  return { ...campoDoRetanguloVisivel(ret, pagina, campo.ancora), proporcional }
}

/** Troca a âncora preservando o MESMO lugar físico na página. */
export function trocarAncora(campo, pagina, novaAncora) {
  const ret = retanguloVisivel(campo, pagina)
  return campoDoRetanguloVisivel(ret, pagina, novaAncora)
}

/**
 * Ponto visível (pt, origem no canto superior esquerdo) -> espaço PDF (sem
 * rotação, origem no canto inferior esquerdo), relativo à caixa da página.
 * Fórmulas conferidas à mão para os quatro /Rotate (ver testes).
 */
function visivelParaPdf(xv, yv, w, h, rotacao) {
  switch (rotacao) {
    case 90:  return [yv, xv]
    case 180: return [w - xv, yv]
    case 270: return [w - yv, h - xv]
    default:  return [xv, h - yv]
  }
}

/**
 * Retângulo do campo no espaço PDF — o /Rect do widget de assinatura.
 * @param {{ x0?:number, y0?:number, largura:number, altura:number, rotacao?:number }} pagina
 *        caixa da página (CropBox ou MediaBox) e /Rotate
 * @returns {{ x:number, y:number, largura:number, altura:number, fora:boolean }}
 */
export function retanguloPdf(campo, pagina) {
  const rot = normalizarRotacao(pagina.rotacao)
  const vis = retanguloVisivel(campo, pagina)
  const [ax, ay] = visivelParaPdf(vis.x, vis.y, pagina.largura, pagina.altura, rot)
  const [bx, by] = visivelParaPdf(vis.x + vis.largura, vis.y + vis.altura, pagina.largura, pagina.altura, rot)
  const x0 = pagina.x0 || 0
  const y0 = pagina.y0 || 0
  return {
    x: Math.min(ax, bx) + x0,
    y: Math.min(ay, by) + y0,
    largura: Math.abs(bx - ax),
    altura: Math.abs(by - ay),
    fora: vis.fora,
  }
}

// ── Qual página assinar ───────────────────────────────────────────────

/** Opções de página por grupo. Uma assinatura criptográfica tem um só lugar
 *  visível, por isso não há "todas as páginas". */
export const MODOS_PAGINA = ['ultima', 'primeira', 'numero']

/**
 * Índice (base 0) da página a assinar, ou -1 se a escolha não existe no
 * arquivo (ex.: página 5 de um PDF de 3 páginas).
 * @param {{ modo:'ultima'|'primeira'|'numero', numero?:number }} escolha
 */
export function indiceDaPagina(escolha, totalPaginas) {
  if (!(totalPaginas > 0)) return -1
  if (escolha.modo === 'primeira') return 0
  if (escolha.modo === 'numero') {
    const n = Math.trunc(Number(escolha.numero))
    return n >= 1 && n <= totalPaginas ? n - 1 : -1
  }
  return totalPaginas - 1
}

// ── Arrastar e redimensionar na tela ──────────────────────────────────

/**
 * Novo retângulo (pt, visível) depois de arrastar `dx`/`dy` pontos.
 * `modo`: 'mover' ou o canto puxado ('nw', 'ne', 'sw', 'se'). O resultado
 * nunca sai da página nem fica menor que `minimo` ({ largura, altura }).
 */
export function moverRedimensionar(ret, modo, dx, dy, limite, minimo = { largura: 0, altura: 0 }) {
  const grampo = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b))
  if (modo === 'mover') {
    return {
      ...ret,
      x: grampo(ret.x + dx, 0, limite.largura - ret.largura),
      y: grampo(ret.y + dy, 0, limite.altura - ret.altura),
    }
  }
  let esq = ret.x
  let topo = ret.y
  let dir = ret.x + ret.largura
  let base = ret.y + ret.altura
  if (modo.includes('w')) esq = grampo(ret.x + dx, 0, dir - minimo.largura)
  if (modo.includes('e')) dir = grampo(dir + dx, esq + minimo.largura, limite.largura)
  if (modo.includes('n')) topo = grampo(ret.y + dy, 0, base - minimo.altura)
  if (modo.includes('s')) base = grampo(base + dy, topo + minimo.altura, limite.altura)
  return { ...ret, x: esq, y: topo, largura: dir - esq, altura: base - topo }
}
