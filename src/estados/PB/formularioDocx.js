// formularioDocx.js — o Memorial Descritivo da PB (formulário do CBMPB) como
// .docx nativo, montado direto dos dados de buildFormularioPB (os mesmos
// tipos de linha que SecaoFormulario.jsx desenha na tela): cada seção vira
// uma tabela do Word com a grade de colunas real, faixas coloridas, caixas
// de X e células mescladas — editável no Word sem a conversão do PDF.
import {
  mmTw, ptTw, run, runsComDestaque, par, tabelaGrade, blocosOoxml, montarDocx, imagemInline,
} from '../../utils/docx/ooxml'
import { numerarBlocos } from '../../utils/memorialEstilo'
import { siglaConselho } from '../../utils/conselho'

// Mesmas medidas do CSS_PAGINA da MemorialPBPage.
const MARGENS = { t: 15, r: 15, b: 22, l: 20 }
const LARGURA = mmTw(210 - MARGENS.l - MARGENS.r)
const CAIXA = ptTw(16)
const SZ = 8.5
const VERMELHO = 'C00000', LARANJA = 'C55A11', CINZA = '7F7F7F'

const p = (runs, o) => par(runs, { linha: 252, ...o })
const t = (texto, o = {}) => run(texto, { sz: SZ, ...o })

// Distribui `total` pelos pesos (flex-grow do formulário).
function repartir(total, pesos) {
  const soma = pesos.reduce((s, x) => s + x, 0) || 1
  let acc = 0
  return pesos.map((w, i) => {
    if (i === pesos.length - 1) return total - acc
    const v = Math.round((total * w) / soma)
    acc += v
    return v
  })
}

const celCaixa = x => ({ w: CAIXA, conteudo: p(t(x ? 'X' : '', { b: true }), { alinha: 'center' }) })

function conteudoItem(item) {
  const label = item.negrito ? t(item.label, { b: true }) : runsComDestaque(item.label, { sz: SZ })
  const valor = item.valor ? t(` ${item.valor}`, { b: true }) : ''
  const detalhe = item.detalhe ? p(t(item.detalhe)) : ''
  return p(label + valor) + detalhe
}

// Itens lado a lado (checks / exigível): cada item = caixa + texto.
function linhaItens(itens) {
  const larguras = repartir(LARGURA, itens.map(i => i.peso || 1))
  const cels = []
  itens.forEach((item, i) => {
    const w = larguras[i]
    if (item.semCaixa) cels.push({ w, conteudo: conteudoItem(item) })
    else cels.push(celCaixa(item.x), { w: w - CAIXA, conteudo: conteudoItem(item) })
  })
  return { cels }
}

const faixaCheia = (conteudo, fundo) => ({ cels: [{ w: LARGURA, fundo, conteudo }] })

function linhasDe(linha) {
  switch (linha.tipo) {
    case 'sub':
      return [faixaCheia(p(t(linha.titulo, { cor: 'FFFFFF' })) + (linha.nota ? p(t(linha.nota, { cor: 'FFFFFF' })) : ''), LARANJA)]
    case 'exigivel':
      return [linhaItens([
        { x: linha.exigivel === true, label: linha.rotuloExigivel || 'EXIGÍVEL', negrito: true, peso: 3 },
        { x: linha.exigivel === false, label: linha.rotuloNao || 'NÃO EXIGÍVEL', negrito: true, peso: 2 },
      ])]
    case 'campos': {
      const larguras = repartir(LARGURA, linha.celulas.map(c => c.peso || 1))
      return [{
        altura: linha.celulas.some(c => c.alto) ? ptTw(48) : undefined,
        cels: linha.celulas.map((c, i) => ({
          w: larguras[i], alinhaV: c.alto ? 'top' : 'center',
          conteudo: p(t(c.label) + (c.valor ? t(` ${c.valor}`, { b: true }) : ''), { alinha: c.centro ? 'center' : undefined }),
        })),
      }]
    }
    case 'checks':
      return [linhaItens(linha.itens)]
    case 'checkValor': {
      const [a, b] = repartir(LARGURA, [1, 1])
      return [{ cels: [celCaixa(linha.x), { w: a - CAIXA, conteudo: p(runsComDestaque(linha.label, { sz: SZ })) }, { w: b, conteudo: p(t(linha.valor || '', { b: true })) }] }]
    }
    case 'grupo': {
      // 16pt | 32% | resto — o nome do grupo mesclado na vertical.
      const nome = Math.round((LARGURA - CAIXA) * 0.32)
      return linha.itens.map((it, i) => ({
        cels: [
          celCaixa(it.x),
          { w: nome, vMerge: i === 0 ? 'restart' : 'continue', conteudo: i === 0 ? p(t(linha.titulo, { b: true, u: true }), { alinha: 'center' }) : p('') },
          { w: LARGURA - CAIXA - nome, conteudo: p(t(it.label)) },
        ],
      }))
    }
    case 'texto':
      return [faixaCheia(p(runsComDestaque(linha.texto, { sz: SZ, b: !!linha.negrito }), {
        alinha: linha.centro ? 'center' : linha.justificado ? 'both' : undefined,
      }))]
    case 'obs': {
      const conteudo = p(t(linha.label)) + (linha.valor ? p(t(linha.valor)) : '')
        + (linha.blocos?.length ? blocosOoxml(linha.blocos, { largura: LARGURA - ptTw(8) - 200, sz: SZ }) : '')
      return [{ altura: ptTw(32), cels: [{ w: LARGURA, alinhaV: 'top', conteudo }] }]
    }
    default:
      return []
  }
}

function secaoOoxml(secao) {
  const linhas = []
  if (secao.faixa) linhas.push(faixaCheia(p(t(secao.faixa, { cor: 'FFFFFF' })), CINZA))
  linhas.push(faixaCheia(p(t(secao.titulo, { cor: 'FFFFFF' }) + (secao.nota ? t(` ${secao.nota}`, { cor: 'FFFFFF' }) : '')), VERMELHO))
  for (const l of secao.linhas) linhas.push(...linhasDe(l))
  // Faixas de título não ficam sozinhas no pé da folha.
  return tabelaGrade(linhas, { largura: LARGURA }) + p('', { depois: 9 })
}

// Brasão do CBMPB no topo, como no modelo (26 mm).
function cabecalhoOoxml(norma, comLogo) {
  const c = texto => p(run(texto, { sz: 9.5 }), { alinha: 'center' })
  return (comLogo ? p(imagemInline('rIdLogo', 26, 26, 2), { alinha: 'center', depois: 4 }) : '')
    + c('ESTADO DA PARAÍBA')
    + c('Secretária de Estado da Segurança e da Defesa Social')
    + c(norma.orgao.replace(' — ', '- '))
    + c(norma.diretoria)
    + c(norma.secao)
    + p(run('MEMORIAL DESCRITIVO DO PROJETO DE SEGURANÇA CONTRA INCÊNDIO', { sz: 10, b: true, u: true }), { alinha: 'center', antes: 10, depois: 10 })
}

const blocosDe = s => s.blocos || (s.paragrafos || []).map(texto => ({ tipo: 'paragrafo', texto }))

function anexoOoxml(letra, secoes, numerar) {
  if (!secoes?.length) return ''
  return p(t(`ANEXO ${letra}`, { b: true, u: true }), { alinha: 'center', quebraAntes: true, depois: 6 })
    + secoes.map(s => blocosOoxml(numerar ? numerarBlocos(blocosDe(s), letra) : blocosDe(s), { largura: LARGURA, sz: SZ })).join('')
}

// Assinatura no pé da folha em que cair: parágrafos em quadro ancorado no
// fim da margem (mesmo efeito do .assinatura-no-fim da tela).
function assinaturaOoxml(state) {
  const frame = `<w:framePr w:w="${mmTw(70)}" w:hSpace="0" w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:xAlign="center" w:yAlign="bottom"/>`
  const borda = '<w:pBdr><w:top w:val="single" w:sz="6" w:space="2" w:color="000000"/></w:pBdr>'
  const linha = (texto, primeira) => `<w:p><w:pPr>${frame}${primeira ? borda : ''}<w:jc w:val="center"/></w:pPr>${t(texto, { b: true })}</w:p>`
  return linha(state.rtNome || 'Nome do projetista', true)
    + linha(state.rtEspecialidade || 'Graduação')
    + linha(`Nº ${siglaConselho(state)}${state.rtConselho ? ` ${state.rtConselho}` : ''}`)
}

/** Blob do .docx do memorial da PB. */
export function gerarDocxPB({ state, formulario, anexoA, anexoB, rubrica, titulo, logo = null }) {
  const corpo = cabecalhoOoxml(formulario.norma, !!logo)
    + formulario.secoes.map(secaoOoxml).join('')
    + anexoOoxml('A', anexoA, false)
    + anexoOoxml('B', anexoB, true)
    + assinaturaOoxml(state)
  return montarDocx({
    corpo, margens: MARGENS, fonte: 'Arial', sz: SZ, titulo,
    imagens: logo ? [{ rId: 'rIdLogo', nome: 'logo-cbmpb.png', bytes: logo }] : [],
    rodape: { comRubrica: true, rubrica },
  })
}
