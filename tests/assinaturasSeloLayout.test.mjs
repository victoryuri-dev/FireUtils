import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { montarSelo, larguraDoTexto, winAnsi, dataAdobe } from '../src/utils/assinaturas/seloLayout.js'

const quando = new Date(2026, 10, 10, 8, 18, 5)
const NOME = 'FELLIPE ALVES DE SOUSA - CPF: 000.000.000-00'

test('as métricas embutidas batem com a medição do pdf-lib (sem kerning), em todo o WinAnsi', async () => {
  const doc = await PDFDocument.create()
  const fontes = { normal: await doc.embedFont(StandardFonts.Helvetica), negrito: await doc.embedFont(StandardFonts.HelveticaBold) }
  for (const [nome, fonte] of Object.entries(fontes)) {
    for (let codigo = 32; codigo < 256; codigo++) {
      if (codigo > 126 && codigo < 160) continue
      const ch = String.fromCharCode(codigo)
      assert.ok(Math.abs(larguraDoTexto(nome, ch, 1000) - fonte.widthOfTextAtSize(ch, 1000)) < 1, `${nome} U+${codigo.toString(16)}`)
    }
  }
})

test('formato da data como o Adobe Acrobat: AAAA.MM.DD hh:mm:ss -03\'00\'', () => {
  assert.match(dataAdobe(quando), /^2026\.11\.10 08:18:05 [+-]\d{2}'\d{2}'$/)
})

test('winAnsi troca o que não existe em WinAnsi por "?" e mantém acentos', () => {
  assert.equal(winAnsi('JOÃO ÇÃO 北'), 'JOÃO ÇÃO ?')
})

// Propriedades que valem para qualquer combinação de opções e tamanho de quadro.
const tamanhosQuadro = [[198, 85], [140, 57], [283, 100], [300, 40]] // pt
const opcoes = [{}, { mostrarRotulo: false }, { mostrarData: false }, { textoExtra: 'CREA 1119839084-MA' }, { mostrarRotulo: false, mostrarData: false }]

test('nenhuma palavra é partida e tudo fica dentro do quadro', () => {
  for (const [largura, altura] of tamanhosQuadro) for (const o of opcoes) {
    const { textos } = montarSelo({ largura, altura, titular: NOME, quando, selo: o })
    const rotulo = `${largura}x${altura} ${JSON.stringify(o)}`
    assert.ok(textos.length > 0, rotulo)
    for (const t of textos) {
      const w = larguraDoTexto(t.fonte, t.texto, t.tamanho)
      assert.ok(t.x >= -0.01 && t.x + w <= largura + 0.5, `${rotulo}: "${t.texto}" estoura a largura (${(t.x + w).toFixed(1)} > ${largura})`)
      assert.ok(t.y >= -0.5 && t.y <= altura + 0.5, `${rotulo}: "${t.texto}" fora da altura`)
    }
    const junto = textos.map(t => t.texto).join(' ')
    for (const palavra of ['FELLIPE', 'ALVES', 'SOUSA']) assert.ok(junto.includes(palavra), `${rotulo}: ${palavra} inteira`)
  }
})

test('nome à esquerda (maior), detalhes à direita (menores); sem detalhes o nome ocupa o quadro', () => {
  const { textos } = montarSelo({ largura: 198, altura: 85, titular: 'RICARDO CECHINEL', quando, selo: {} })
  const nomes = textos.filter(t => t.x < 198 * 0.45)
  const detalhes = textos.filter(t => t.x >= 198 * 0.45)
  assert.ok(nomes.length >= 1 && detalhes.length >= 2)
  assert.ok(Math.max(...nomes.map(t => t.tamanho)) > Math.max(...detalhes.map(t => t.tamanho)), 'nome maior que os detalhes')
  const textoDetalhes = detalhes.map(t => t.texto).join(' ') // o texto pode quebrar em várias linhas
  assert.match(textoDetalhes, /Assinado de forma digital por RICARDO CECHINEL/)
  assert.match(textoDetalhes, /Dados: 2026\.11\.10 08:18:05 [+-]\d{2}'\d{2}'/)

  const so = montarSelo({ largura: 198, altura: 85, titular: 'RICARDO CECHINEL', quando, selo: { mostrarRotulo: false, mostrarData: false } })
  assert.ok(so.textos.every(t => /RICARDO|CECHINEL/.test(t.texto)) && so.textos.some(t => t.tamanho > Math.max(...nomes.map(n => n.tamanho))), 'nome maior sem detalhes')
})

test('o nome da coluna esquerda é em NEGRITO e os detalhes em fonte normal', () => {
  const { textos } = montarSelo({ largura: 198, altura: 85, titular: 'RICARDO CECHINEL', quando, selo: {} })
  const nome = textos.filter(t => t.x < 198 * 0.45)
  const detalhes = textos.filter(t => t.x >= 198 * 0.45)
  assert.ok(nome.length > 0 && nome.every(t => t.fonte === 'negrito'), 'nome em negrito')
  assert.ok(detalhes.length > 0 && detalhes.every(t => t.fonte === 'normal'), 'detalhes em fonte normal')
})

test('o tamanho é sempre o maior que cabe: detalhes crescem com o quadro, sem passar do nome', () => {
  const tamanhoDetalhes = (largura, altura) => {
    const { textos } = montarSelo({ largura, altura, titular: 'ANA SOUZA', quando, selo: {} })
    const nome = Math.max(...textos.filter(t => t.fonte === 'negrito').map(t => t.tamanho))
    const det = Math.max(...textos.filter(t => t.fonte === 'normal').map(t => t.tamanho))
    return { nome, det }
  }
  const pequeno = tamanhoDetalhes(140, 57)
  const grande = tamanhoDetalhes(283, 120)
  assert.ok(grande.det > pequeno.det, 'quadro maior, detalhes maiores')
  assert.ok(grande.det > 9, 'sem o teto antigo de 9 pt')
  for (const t of [pequeno, grande]) assert.ok(t.det <= t.nome + 1e-9, 'detalhes não passam do nome')
})
