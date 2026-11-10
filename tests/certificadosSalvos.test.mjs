import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bytesParaBase64, base64ParaBytes, dataParaIso, isoParaData, situacaoDoCertificado, escolherSelecionado, apelidoPadrao,
} from '../src/utils/assinaturas/certificadosSalvos.js'
import { criarRepositorioMemoria, criarRepositorioSupabase, traduzirErro, ErroCertificados } from '../src/lib/certificadosRepo.js'

const hoje = new Date(2026, 10, 10, 12)
const cert = (id, valido_ate) => ({ id, nome: id, valido_ate })

test('base64: ida e volta com todos os bytes, inclusive arquivos grandes', () => {
  const todos = Uint8Array.from({ length: 256 }, (_, i) => i)
  assert.deepEqual(base64ParaBytes(bytesParaBase64(todos)), todos)
  const grande = Uint8Array.from({ length: 200000 }, (_, i) => (i * 7) % 256)
  assert.deepEqual(base64ParaBytes(bytesParaBase64(grande)), grande)
})

test('datas: ISO local, sem escorregar para o dia anterior', () => {
  assert.equal(dataParaIso(new Date(2028, 0, 5)), '2028-01-05')
  const d = isoParaData('2028-01-05')
  assert.equal(d.getFullYear(), 2028); assert.equal(d.getMonth(), 0); assert.equal(d.getDate(), 5)
  assert.equal(isoParaData(null), null)
})

test('situação: vencido, vencendo (30 dias) e válido', () => {
  assert.equal(situacaoDoCertificado(cert('a', '2026-11-09'), hoje).status, 'vencido')
  assert.equal(situacaoDoCertificado(cert('a', '2026-11-10'), hoje).rotulo, 'Vence hoje')
  assert.deepEqual(situacaoDoCertificado(cert('a', '2026-11-11'), hoje), { status: 'vencendo', dias: 1, rotulo: 'Vence em 1 dia' })
  assert.equal(situacaoDoCertificado(cert('a', '2026-12-10'), hoje).status, 'vencendo')
  assert.equal(situacaoDoCertificado(cert('a', '2026-12-11'), hoje).status, 'ok')
})

test('seleção: mantém o preferido; senão o primeiro não vencido; senão o primeiro; vazio = null', () => {
  const lista = [cert('velho', '2025-01-01'), cert('novo', '2028-01-01'), cert('outro', '2029-01-01')]
  assert.equal(escolherSelecionado(lista, 'outro', hoje), 'outro')
  assert.equal(escolherSelecionado(lista, 'removido', hoje), 'novo', 'preferido sumiu: primeiro válido')
  assert.equal(escolherSelecionado(lista, null, hoje), 'novo')
  assert.equal(escolherSelecionado([cert('v1', '2020-01-01')], null, hoje), 'v1', 'todos vencidos: o primeiro')
  assert.equal(escolherSelecionado([], 'x', hoje), null)
})

test('apelido padrão: o titular, sem espaços repetidos e limitado a 80', () => {
  assert.equal(apelidoPadrao('  MARIA   DA SILVA '), 'MARIA DA SILVA')
  assert.equal(apelidoPadrao('x'.repeat(200)).length, 80)
  assert.equal(apelidoPadrao(''), 'Certificado')
})

test('erros do banco viram mensagens em português', () => {
  assert.equal(traduzirErro({ message: 'Limite de 10 certificados por conta. Remova um para adicionar outro.' }).codigo, 'limite')
  assert.match(traduzirErro({ message: 'Limite de 10 certificados por conta. Remova um para adicionar outro.' }).message, /^Limite de 10/)
  assert.equal(traduzirErro({ code: '23505', message: 'duplicate key value' }).codigo, 'duplicado')
  assert.equal(traduzirErro({ code: '42501', message: 'new row violates row-level security policy' }).codigo, 'licenca')
  assert.equal(traduzirErro({ message: 'TypeError: Failed to fetch' }).codigo, 'rede')
  assert.ok(traduzirErro({ message: 'algo estranho' }) instanceof ErroCertificados)
})

const dados = (n, extra = {}) => ({
  nome: `c${n}`, titular: `T${n}`, emissor: 'AC', validoDe: new Date(2026, 0, 1), validoAte: new Date(2028, 0, 1),
  icpBrasil: true, autoassinado: false, impressao: String(n).padStart(64, '0'), bytes: Uint8Array.from([1, 2, 3, n]), ...extra,
})

test('repositório em memória: listar NÃO traz o arquivo; baixar devolve os bytes exatos', async () => {
  const repo = criarRepositorioMemoria()
  const novo = await repo.salvar(dados(1))
  assert.ok(!('pfx_base64' in novo))
  assert.equal(novo.valido_ate, '2028-01-01')
  assert.ok((await repo.listar()).every(l => !('pfx_base64' in l)))
  assert.deepEqual(await repo.baixar(novo.id), Uint8Array.from([1, 2, 3, 1]))
  await repo.remover(novo.id)
  assert.equal((await repo.listar()).length, 0)
})

test('repositório em memória: recusa duplicado e o 11º certificado', async () => {
  const repo = criarRepositorioMemoria()
  await repo.salvar(dados(1))
  await assert.rejects(repo.salvar(dados(1)), e => e.codigo === 'duplicado')
  for (let n = 2; n <= 10; n++) await repo.salvar(dados(n))
  await assert.rejects(repo.salvar(dados(11)), e => e.codigo === 'limite')
})

// Cliente Supabase falso que registra o que foi pedido.
function clienteFalso(respostas) {
  const chamadas = []
  const montar = (tabela) => {
    const q = { tabela, operacoes: [] }
    chamadas.push(q)
    const api = new Proxy({}, {
      get(_, nome) {
        if (nome === 'then') return (res) => res(respostas[q.operacoes[0]?.[0]] ?? { data: null, error: null })
        return (...args) => { q.operacoes.push([nome, ...args]); return api }
      },
    })
    return api
  }
  return { cliente: { from: montar }, chamadas }
}

test('repositório Supabase: a listagem pede só colunas públicas, nunca o pfx_base64', async () => {
  const { cliente, chamadas } = clienteFalso({ select: { data: [{ id: 'a' }], error: null } })
  await criarRepositorioSupabase(cliente).listar()
  const colunas = chamadas[0].operacoes.find(o => o[0] === 'select')[1]
  assert.ok(!colunas.includes('pfx_base64'), colunas)
  assert.match(colunas, /titular/)
})

test('repositório Supabase: salvar grava o arquivo em base64 e devolve só colunas públicas; baixar decodifica', async () => {
  const { cliente, chamadas } = clienteFalso({ insert: { data: { id: 'n1' }, error: null }, select: { data: { pfx_base64: bytesParaBase64(Uint8Array.from([9, 8, 7])) }, error: null } })
  const repo = criarRepositorioSupabase(cliente)
  await repo.salvar(dados(5))
  const corpo = chamadas[0].operacoes.find(o => o[0] === 'insert')[1]
  assert.equal(corpo.pfx_base64, bytesParaBase64(Uint8Array.from([1, 2, 3, 5])))
  assert.equal(corpo.valido_ate, '2028-01-01')
  assert.ok(!('user_id' in corpo), 'user_id vem do banco (auth.uid()), nunca do cliente')
  const colunasRetorno = chamadas[0].operacoes.filter(o => o[0] === 'select').pop()[1]
  assert.ok(!colunasRetorno.includes('pfx_base64'))
  assert.deepEqual(await repo.baixar('n1'), Uint8Array.from([9, 8, 7]))
})

test('repositório Supabase: erro do banco vira ErroCertificados traduzido', async () => {
  const { cliente } = clienteFalso({ insert: { data: null, error: { code: '23505', message: 'duplicate key' } } })
  await assert.rejects(criarRepositorioSupabase(cliente).salvar(dados(1)), e => e instanceof ErroCertificados && e.codigo === 'duplicado')
})
