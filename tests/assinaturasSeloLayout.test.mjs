import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { montarSelo, larguraDoTexto, winAnsi, dataAdobe, dataParaSelo } from '../src/utils/assinaturas/seloLayout.js'
import { TAMANHOS_FONTE } from '../src/utils/assinaturas/selo.js'

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

test('formatos de data: Adobe (AAAA.MM.DD hh:mm:ss -03\'00\') e simples (DD/MM/AAAA hh:mm:ss -03:00)', () => {
  assert.match(dataAdobe(quando), /^2026\.11\.10 08:18:05 [+-]\d{2}'\d{2}'$/)
  assert.match(dataParaSelo(quando), /^10\/11\/2026 08:18:05 [+-]\d{2}:\d{2}$/)
})

test('winAnsi troca o que não existe em WinAnsi por "?" e mantém acentos', () => {
  assert.equal(winAnsi('JOÃO ÇÃO 北'), 'JOÃO ÇÃO ?')
})

// Propriedades que valem para qualquer combinação de opções e tamanho de quadro.
const estilos = ['adobe', 'simples']
const tamanhosQuadro = [[198, 85], [140, 57], [283, 100], [300, 40]] // pt
const opcoes = [{}, { mostrarRotulo: false }, { mostrarData: false }, { textoExtra: 'CREA 1119839084-MA' }, { fonte: 7 }, { mostrarRotulo: false, mostrarData: false }]

test('nenhuma palavra é partida e tudo fica dentro do quadro (automático)', () => {
  for (const estilo of estilos) for (const [largura, altura] of tamanhosQuadro) for (const o of opcoes) {
    if (o.fonte) continue // tamanho fixo pode ser maior que o quadro; o desenho recorta
    const { textos } = montarSelo({ largura, altura, titular: NOME, quando, selo: { ...o, estilo } })
    const rotulo = `${estilo} ${largura}x${altura} ${JSON.stringify(o)}`
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

test('estilo Adobe: nome à esquerda (maior), detalhes à direita (menores); sem detalhes o nome ocupa o quadro', () => {
  const { textos } = montarSelo({ largura: 198, altura: 85, titular: 'RICARDO CECHINEL', quando, selo: { estilo: 'adobe' } })
  const nomes = textos.filter(t => t.x < 198 * 0.45)
  const detalhes = textos.filter(t => t.x >= 198 * 0.45)
  assert.ok(nomes.length >= 1 && detalhes.length >= 2)
  assert.ok(Math.max(...nomes.map(t => t.tamanho)) > Math.max(...detalhes.map(t => t.tamanho)), 'nome maior que os detalhes')
  assert.ok(detalhes.some(t => /Dados:/.test(t.texto)) && detalhes.some(t => /Assinado de forma digital/.test(t.texto)))

  const so = montarSelo({ largura: 198, altura: 85, titular: 'RICARDO CECHINEL', quando, selo: { mostrarRotulo: false, mostrarData: false } })
  assert.ok(so.textos.every(t => /RICARDO|CECHINEL/.test(t.texto)) && so.textos.some(t => t.tamanho > Math.max(...nomes.map(n => n.tamanho))), 'nome maior sem detalhes')
})

test('tamanho fixo é respeitado nos detalhes (Adobe) e em todas as linhas (simples)', () => {
  const adobe = montarSelo({ largura: 283, altura: 100, titular: 'ANA', quando, selo: { estilo: 'adobe', fonte: TAMANHOS_FONTE[2] } })
  assert.ok(adobe.textos.filter(t => /Dados|Assinado/.test(t.texto)).every(t => t.tamanho === TAMANHOS_FONTE[2]))
  const simples = montarSelo({ largura: 283, altura: 100, titular: 'ANA', quando, selo: { estilo: 'simples', fonte: 10 } })
  assert.equal(Math.max(...simples.textos.map(t => t.tamanho)), 10)
})

test('simples centralizado: cada linha centrada na horizontal', () => {
  const { textos } = montarSelo({ largura: 283, altura: 100, titular: 'ANA SOUZA', quando, selo: { estilo: 'simples', alinhamento: 'centro' } })
  for (const t of textos) assert.ok(Math.abs(t.x + larguraDoTexto(t.fonte, t.texto, t.tamanho) / 2 - 283 / 2) < 0.01, t.texto)
})
