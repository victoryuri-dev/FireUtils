// Motor de hidrantes (supabase/functions/_shared/motor/hidrantes/*.ts).
//
// A referência é o motor ORIGINAL em Python, do plugin Revit: golden.json
// foi gerado por fixtures/motor-hidrantes/gerar_golden.py rodando
// hidrantes/calc.py, succao.py e npshd.py. Cada teste abaixo confere que o
// TypeScript chega ao mesmo número, e o conjunto cobre os dois métodos de
// cálculo, os dois ramais governantes e o equilíbrio que não converge.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as hid from '../supabase/functions/_shared/motor/hidrantes/hidraulica.ts'
import { verificarCondicaoSuccao } from '../supabase/functions/_shared/motor/hidrantes/succao.ts'
import { calcularNpshd } from '../supabase/functions/_shared/motor/hidrantes/npshd.ts'
import { resolverPerfil, montarPerfil } from '../supabase/functions/_shared/motor/hidrantes/perfil.ts'
import {
  dimensionar,
  resumoFalhaHidrante,
  resumoFalhaVelocidade,
  validarEntrada,
  EntradaInvalida,
} from '../supabase/functions/_shared/motor/hidrantes/dimensionar.ts'

const golden = JSON.parse(readFileSync(new URL('./fixtures/motor-hidrantes/golden.json', import.meta.url), 'utf8'))

// Python e V8 usam implementações diferentes de pow(): o último bit pode
// divergir, então números comparam com tolerância relativa; o resto, igual.
const REL = 1e-9
function igual(obtido, esperado, caminho = 'raiz') {
  if (typeof esperado === 'number') {
    assert.equal(typeof obtido, 'number', `${caminho}: esperado número`)
    const escala = Math.max(1, Math.abs(esperado))
    assert.ok(Math.abs(obtido - esperado) <= REL * escala, `${caminho}: ${obtido} ≠ ${esperado}`)
  } else if (Array.isArray(esperado)) {
    assert.ok(Array.isArray(obtido), `${caminho}: esperado lista`)
    assert.equal(obtido.length, esperado.length, `${caminho}: tamanho da lista`)
    esperado.forEach((e, i) => igual(obtido[i], e, `${caminho}[${i}]`))
  } else if (esperado && typeof esperado === 'object') {
    assert.ok(obtido && typeof obtido === 'object', `${caminho}: esperado objeto`)
    assert.deepEqual(Object.keys(obtido).sort(), Object.keys(esperado).sort(), `${caminho}: chaves`)
    for (const chave of Object.keys(esperado)) igual(obtido[chave], esperado[chave], `${caminho}.${chave}`)
  } else {
    assert.equal(obtido, esperado, caminho)
  }
}

for (const caso of golden.casos) {
  test(`rede ${caso.nome} bate com o motor Python`, () => {
    const e = caso.entrada
    const res = hid.calcularRede(e.trechos, {
      Qs_lmin: e.Qs_lmin,
      Pmin: e.Pmin,
      C: e.C,
      cotas: e.cotas,
      tolerancia_equilibrio_mca: e.tolerancia_equilibrio_mca,
      metodo: e.metodo,
      mang_dn_mm: e.mang_dn_mm,
      mang_comp_m: e.mang_comp_m,
      max_iter_equilibrio: e.max_iter_equilibrio,
    })
    igual(JSON.parse(JSON.stringify(res)), caso.saida)
  })
}

test('equilíbrio que esgota as iterações volta convergiu=false, como no Python', () => {
  const caso = golden.casos.find((c) => c.nome === 'rede-sem-convergencia')
  assert.equal(caso.saida.equilibrio.convergiu, false)
  assert.equal(caso.saida.equilibrio.historico.length, 2)
})

test('condição de sucção bate com o Python (positiva, folga de 1 mm e negativa)', () => {
  for (const { entrada, saida } of golden.succoes) {
    igual(JSON.parse(JSON.stringify(verificarCondicaoSuccao(...entrada))), saida)
  }
})

test('NPSH disponível bate com o Python', () => {
  for (const { entrada, saida } of golden.npshds) {
    igual(JSON.parse(JSON.stringify(calcularNpshd(...entrada))), saida)
  }
})

test('NPSH recusa altitude e temperatura fora das tabelas', () => {
  assert.throws(() => calcularNpshd(250, 30, 1, 1), /Altitude 250 m/)
  assert.throws(() => calcularNpshd(0, 33, 1, 1), /Temperatura 33/)
})

test('método do esguicho sem mangueira falha com mensagem própria', () => {
  const caso = golden.casos[0]
  assert.throws(
    () =>
      hid.calcularRede(caso.entrada.trechos, {
        Qs_lmin: 300,
        Pmin: 65,
        C: 120,
        cotas: caso.entrada.cotas,
        tolerancia_equilibrio_mca: 0.5,
        metodo: hid.METODO_ESGUICHO,
      }),
    /exige o DN e o comprimento da mangueira/,
  )
})

// ---------------------------------------------------------------------------
// Dimensionamento completo, com a norma real de MA (a mesma migração que
// popula normas_dados em produção).
// ---------------------------------------------------------------------------

function normaMA() {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260916120000_seed_normas_hidrantes_ma.sql', import.meta.url),
    'utf8',
  )
  const json = sql.match(/\$j\$(\{[\s\S]*?\})\$j\$::jsonb/)[1]
  return JSON.parse(json)
}

const perfilMA = () => resolverPerfil('MA', (uf) => (uf === 'MA' ? normaMA() : null))

const seg = (d_mm, L, Leq = 0) => ({ d_mm, L, Leq, n_tubos: 1, ids: [1, 2], acessorios: [], conexoes: [] })

function entradaBase(sobrescrever = {}) {
  return {
    uf: 'MA',
    valor_sistema: 'Tipo 4 Var. A',
    metodo: hid.METODO_VALVULA,
    trechos: {
      t1: [seg(100, 4, 3)],
      t2: [seg(100, 6, 5)],
      t3: [seg(65, 20, 6)],
      t4: [seg(65, 28, 7)],
    },
    cotas: { z_rti: 2, z_succao: 1, z_recalque: 1, z_ponto_a: 6, z_hd01: 5, z_hd02: 5 },
    dados_succao: { altitude_m: null, temperatura_c: null },
    ...sobrescrever,
  }
}

test('perfil de MA é montado no vocabulário do motor, como no plugin', () => {
  const perfil = perfilMA()
  assert.equal(perfil.norma, 'NT 22/2021 CBMMA')
  assert.equal(perfil.tolerancia_equilibrio_mca, 0.5)
  assert.equal(perfil.hazen_c.galvanizado, 120)
  assert.equal(perfil.hazen_c.ff_sem_revest, 100)
  assert.equal(perfil.hazen_c.ff_revest_cimento, 140)
  assert.deepEqual(perfil.tipos[4].variantes[1], {
    mang_dn: 65,
    mang_comp: 30,
    q_min: 300,
    p_min: 30,
    expedicoes: 'simples',
    esguicho_dn: 60,
  })
  assert.equal(perfil._uf_efetiva, 'MA')
})

test('UF sem domínio de hidrantes cai para MA e registra a substituição', () => {
  const perfil = resolverPerfil('ZZ', (uf) => (uf === 'MA' ? normaMA() : null))
  assert.equal(perfil._uf_solicitada, 'ZZ')
  assert.equal(perfil._uf_efetiva, 'MA')
})

test('sem nenhuma norma de hidrantes (nem MA) o motor recusa com mensagem clara', () => {
  assert.throws(() => resolverPerfil('MA', () => null), /Nenhum perfil normativo de hidrantes/)
  assert.equal(montarPerfil(null), null)
})

test('dimensionamento aprovado devolve o mesmo formato que o plugin gravava', () => {
  const r = dimensionar(entradaBase(), perfilMA())
  assert.equal(r.ok, true, r.erro)
  assert.equal(r.norma, 'NT 22/2021 CBMMA')
  const chaves = Object.keys(r.resultado).sort()
  assert.deepEqual(chaves, [
    'C_HW', 'avisos_velocidade', 'cotas', 'dados_sistema', 'dados_succao', 'erro_npshd', 'j_succao_npsh',
    'metodo', 'res', 'succao', 'uf', 'valor_sistema', 'verif_npshd', 'verif_succao',
  ])
  assert.equal(r.resultado.C_HW, 120)
  assert.equal(r.resultado.dados_sistema.q_min, 300)
  assert.equal(r.resultado.succao, 'positiva')
  assert.equal(r.resultado.verif_npshd, null)
  assert.deepEqual(r.resultado.avisos_velocidade, [])
  assert.ok(r.resultado.res.Qt >= 600 - 0.02)
})

test('Ltotal e totais do trecho são recalculados no servidor, não aceitos do cliente', () => {
  const entrada = entradaBase()
  entrada.trechos.t3 = [{ ...seg(65, 20, 6), Ltotal: 0.001 }]
  const r = dimensionar(validarEntrada(entrada), perfilMA())
  assert.equal(r.ok, true)
  assert.equal(r.resultado.res.j.t3.segmentos[0].Ltotal, 26)
})

test('Leq das conexões (cotovelo/tê/redução/tampão/união/luva Y) soma no Ltotal do trecho e aparece no memorial', () => {
  const entrada = entradaBase()
  entrada.trechos.t3 = [
    {
      ...seg(65, 20, 0),
      conexoes: [
        { tipo: 'cotovelo', qtd: 2, angulo_graus: 90, d2_mm: null },
        { tipo: 'cotovelo', qtd: 1, angulo_graus: 45, d2_mm: null },
        { tipo: 'tee', qtd: 1, angulo_graus: null, d2_mm: null },
        { tipo: 'uniao', qtd: 3, angulo_graus: null, d2_mm: null },
      ],
    },
  ]
  const r = dimensionar(validarEntrada(entrada), perfilMA())
  assert.equal(r.ok, true, r.erro)
  const seg0 = r.resultado.res.j.t3.segmentos[0]
  // L/D: cotovelo 90°=30, cotovelo 45°=16, tê(ramal)=60, união=0 — D=0.065 m.
  const leqEsperado = (2 * 30 + 1 * 16 + 1 * 60 + 0) * 0.065
  assert.ok(Math.abs(seg0.Leq - leqEsperado) < 1e-9, `Leq: ${seg0.Leq} ≠ ${leqEsperado}`)
  assert.ok(Math.abs(seg0.Ltotal - (20 + leqEsperado)) < 1e-9)
  const nomes = seg0.acessorios.map((a) => a.nome).sort()
  assert.deepEqual(nomes, ['Cotovelo 45°', 'Cotovelo 90°', 'Tê', 'União'])
})

test('sucção negativa dispara o NPSH com a vazão majorada pelo perfil', () => {
  const entrada = entradaBase({
    cotas: { z_rti: -2, z_succao: 1, z_recalque: 1, z_ponto_a: 6, z_hd01: 5, z_hd02: 5 },
    dados_succao: { altitude_m: 500, temperatura_c: 25 },
  })
  const r = dimensionar(entrada, perfilMA())
  assert.equal(r.ok, true, r.erro)
  const { res, verif_succao: v, verif_npshd: n, j_succao_npsh: j } = r.resultado
  assert.equal(v.condicao, 'NEGATIVA')
  assert.equal(v.fator_vazao_npsh, 1.5)
  assert.ok(Math.abs(v.vazao_npsh_lmin - 1.5 * res.Qt) < 1e-9)
  assert.equal(n.Ha, 9.72)
  assert.equal(n.Hvp, 0.323)
  assert.equal(n.Hs_abs, 3)
  assert.equal(n.Hf_s, j.J)
})

test('altitude fora da tabela não derruba o resultado: vira erro_npshd', () => {
  const entrada = entradaBase({
    cotas: { z_rti: -2, z_succao: 1, z_recalque: 1, z_ponto_a: 6, z_hd01: 5, z_hd02: 5 },
    dados_succao: { altitude_m: 250, temperatura_c: 25 },
  })
  const r = dimensionar(entrada, perfilMA())
  assert.equal(r.ok, true)
  assert.match(r.resultado.erro_npshd, /Altitude 250 m/)
  assert.equal(r.resultado.verif_npshd, null)
})

test('velocidade acima do limite não barra mais o dimensionamento — vira aviso, com o texto do plugin', () => {
  const entrada = entradaBase({ trechos: { ...entradaBase().trechos, t3: [seg(25, 20, 6)] } })
  const r = dimensionar(entrada, perfilMA())
  assert.equal(r.ok, true, r.erro)
  assert.equal(r.resultado.avisos_velocidade.length, 1)
  assert.match(
    r.resultado.avisos_velocidade[0],
    /^Velocidade acima do limite normativo em "Ponto A → HD01" \(limite 5\.000 m\/s\):\n- DN25 : /,
  )
  // Pressão/vazão no hidrante continua interrompendo normalmente — não faz
  // parte deste aviso.
  assert.ok(r.resultado.res.Qt > 0)
})

test('texto das falhas é idêntico ao que o plugin mostrava (golden)', () => {
  assert.equal(
    resumoFalhaVelocidade('Ponto A → HD01', 5.0, [
      { d_mm: 50.0, V: 6.123456 },
      { d_mm: 65.0, V: 5.0004 },
    ]),
    golden.textos.velocidade,
  )
  assert.equal(
    resumoFalhaHidrante('HD02', 28.4567, 291.234, 'pressão na válvula', 'Ponto A → HD02', 30.0, 300.0),
    golden.textos.hidrante,
  )
})

test('tipo inexistente e variante inexistente na norma voltam como erro, não exceção', () => {
  assert.match(dimensionar(entradaBase({ valor_sistema: 'Tipo 9' }), perfilMA()).erro, /não define o Tipo 9/)
  assert.match(dimensionar(entradaBase({ valor_sistema: 'Tipo 4 Var. F' }), perfilMA()).erro, /variante F do Tipo 4/)
  assert.match(dimensionar(entradaBase({ valor_sistema: 'sistema' }), perfilMA()).erro, /interpretar o tipo classificado/)
})

test('método de cálculo desconhecido é recusado; ausente cai para Válvula', () => {
  assert.match(dimensionar(entradaBase({ metodo: 'Outro' }), perfilMA()).erro, /Método de cálculo desconhecido/)
  const r = dimensionar(entradaBase({ metodo: null }), perfilMA())
  assert.equal(r.ok, true)
  assert.equal(r.resultado.metodo, hid.METODO_VALVULA)
})

test('parâmetro normativo ausente na norma é reportado, sem usar valor de outro estado', () => {
  const norma = normaMA()
  delete norma.tolerancia_equilibrio_mca
  const perfil = resolverPerfil('MA', () => norma)
  assert.match(dimensionar(entradaBase(), perfil).erro, /nao define o parametro obrigatorio 'tolerancia_equilibrio_mca'/)
})

test('equilíbrio que não converge é recusado com a tolerância da norma', () => {
  // Ramais muito finos e desiguais: a vazão oscila entre zero e o máximo.
  const norma = normaMA()
  norma.tolerancia_equilibrio_mca = 1e-12
  const perfil = resolverPerfil('MA', () => norma)
  const entrada = entradaBase({
    metodo: hid.METODO_ESGUICHO,
    trechos: { ...entradaBase().trechos, t3: [seg(32, 55.3, 8.1)], t4: [seg(25, 30.8, 9.2)] },
    cotas: { z_rti: 2, z_succao: 1, z_recalque: 1, z_ponto_a: 6, z_hd01: 13.8, z_hd02: 12.9 },
  })
  const r = dimensionar(entrada, perfil)
  assert.equal(r.ok, false)
  assert.match(r.erro, /^O equilíbrio hidráulico entre HD01 e HD02 não convergiu \(diferença de [\d.]+ mca, limite 0\.00 mca — NT 22\/2021 CBMMA\)\. Revise/)
})

// ---------------------------------------------------------------------------
// Validação da entrada (a function responde 400 para qualquer EntradaInvalida)
// ---------------------------------------------------------------------------

test('entrada válida é normalizada; chaves extras do cliente são descartadas', () => {
  const entrada = entradaBase()
  entrada.trechos.t1[0].lixo = 'x'
  entrada.pmin_do_cliente = 1
  const v = validarEntrada(entrada)
  assert.equal('lixo' in v.trechos.t1[0], false)
  assert.equal('pmin_do_cliente' in v, false)
})

test('entrada malformada é recusada', () => {
  const casos = [
    null,
    {},
    { ...entradaBase(), cotas: null },
    { ...entradaBase(), cotas: { ...entradaBase().cotas, z_rti: 'a' } },
    { ...entradaBase(), cotas: { ...entradaBase().cotas, z_rti: Infinity } },
    { ...entradaBase(), trechos: { ...entradaBase().trechos, t1: 'x' } },
    { ...entradaBase(), trechos: { ...entradaBase().trechos, t1: [{ ...seg(100, 1), d_mm: 0 }] } },
    { ...entradaBase(), trechos: { ...entradaBase().trechos, t1: [{ ...seg(100, 1), L: -1 }] } },
    { ...entradaBase(), trechos: { ...entradaBase().trechos, t1: Array(101).fill(seg(100, 1)) } },
    { ...entradaBase(), valor_sistema: 'x'.repeat(101) },
  ]
  for (const c of casos) assert.throws(() => validarEntrada(c), EntradaInvalida)
})
