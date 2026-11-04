// GERADO por scripts/gerar-admin-catalogo.mjs — não edite à mão.
// Fonte: supabase/functions/_shared/catalogo.ts e _shared/adminCatalogo.ts.
//
// Edge Function: admin-catalogo
//
// Mantém o catálogo da biblioteca de famílias consistente com os buckets:
// confere fantasmas (item que cita arquivo inexistente) e órfãos (arquivo que
// nenhum item cita), publica o plugin-assets/catalog.json só quando tudo
// confere, importa o catálogo atual e remove órfãos.
//
// Requer o usuário com linha em `admins`; usa a service role só aqui dentro.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ---- _shared/catalogo.ts ----
// Lógica pura do catálogo da biblioteca de famílias (sem Supabase, sem Deno),
// usada pela Edge Function `admin-catalogo` e coberta por tests/catalogo.test.mjs.
//
// Contrato do `plugin-assets/catalog.json` que a dockpane lê (NÃO quebrar):
//   { generated_at, todas_icon_key,
//     categories: [{ id, name, icon_key }],
//     families:   [{ id, name, category_id, category, thumbnail_key,
//                    storage_key, size_bytes, sha256 }] }
//
// Ficam "fantasma" os itens do catálogo que citam um arquivo que não existe
// no bucket; ficam "órfãos" os arquivos do bucket que nenhum item cita.

const BUCKET_FAMILIAS = 'revit-families'
const BUCKET_ASSETS = 'plugin-assets'

interface Categoria { id: string; nome: string; icon_key: string | null; ordem: number }
interface Familia {
  id: string; nome: string; category_id: string; thumbnail_key: string | null
  storage_key: string; size_bytes: number; sha256: string; ordem: number
}
interface Rascunho { categorias: Categoria[]; familias: Familia[]; todasIconKey: string | null }
interface Arquivo { bucket: string; key: string; size: number | null }

// 'Extintor Portátil - ABC' -> 'extintor-portatil-abc'. Igual ao slugify de
// migration/generate_catalog.py (FireUtils.extension): acentos saem, o resto
// que não é ASCII é descartado, não vira hífen.
function slugify(texto: string): string {
  const slug = texto
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'item'
}

const porOrdemENome = (a: { ordem: number; nome: string }, b: { ordem: number; nome: string }) =>
  a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')

function gerarCatalogo(r: Rascunho, geradoEm: string) {
  const categorias = [...r.categorias].sort(porOrdemENome)
  const posicao = new Map(categorias.map((c, i) => [c.id, i]))
  const nomeDe = new Map(categorias.map((c) => [c.id, c.nome]))
  const familias = [...r.familias].sort(
    (a, b) => (posicao.get(a.category_id) ?? 0) - (posicao.get(b.category_id) ?? 0) || porOrdemENome(a, b),
  )
  return {
    generated_at: geradoEm,
    todas_icon_key: r.todasIconKey,
    categories: categorias.map((c) => ({ id: c.id, name: c.nome, icon_key: c.icon_key })),
    families: familias.map((f) => ({
      id: f.id,
      name: f.nome,
      category_id: f.category_id,
      category: nomeDe.get(f.category_id) ?? '',
      thumbnail_key: f.thumbnail_key,
      storage_key: f.storage_key,
      size_bytes: f.size_bytes,
      sha256: f.sha256,
    })),
  }
}

// JSON estável, sem generated_at: serve para saber se o rascunho já está publicado.
function canonico(catalogo: Record<string, unknown>): string {
  const { generated_at: _ignorado, ...resto } = catalogo
  return JSON.stringify(resto)
}

// Lê um catalog.json no formato publicado e devolve o rascunho equivalente.
function rascunhoDoCatalogo(cat: any): Rascunho {
  const categorias: Categoria[] = (cat?.categories ?? []).map((c: any, i: number) => ({
    id: String(c.id), nome: String(c.name), icon_key: c.icon_key ?? null, ordem: i,
  }))
  const familias: Familia[] = (cat?.families ?? []).map((f: any, i: number) => ({
    id: String(f.id), nome: String(f.name), category_id: String(f.category_id),
    thumbnail_key: f.thumbnail_key ?? null, storage_key: String(f.storage_key),
    size_bytes: Number(f.size_bytes), sha256: String(f.sha256), ordem: i,
  }))
  return { categorias, familias, todasIconKey: cat?.todas_icon_key ?? null }
}

type Uso = 'familia' | 'thumbnail' | 'icone'
interface Referencia { bucket: string; key: string; uso: Uso; dono: string; tamanho?: number }

function referencias(r: Rascunho): Referencia[] {
  const refs: Referencia[] = []
  for (const f of r.familias) {
    refs.push({ bucket: BUCKET_FAMILIAS, key: f.storage_key, uso: 'familia', dono: f.nome, tamanho: f.size_bytes })
    if (f.thumbnail_key) refs.push({ bucket: BUCKET_ASSETS, key: f.thumbnail_key, uso: 'thumbnail', dono: f.nome })
  }
  for (const c of r.categorias) {
    if (c.icon_key) refs.push({ bucket: BUCKET_ASSETS, key: c.icon_key, uso: 'icone', dono: c.nome })
  }
  if (r.todasIconKey) refs.push({ bucket: BUCKET_ASSETS, key: r.todasIconKey, uso: 'icone', dono: 'Todas' })
  return refs
}

interface Problema {
  tipo: string
  bloqueia: boolean
  mensagem: string
  alvo?: string
}

// Confere o rascunho contra os arquivos que existem de verdade.
function verificarRascunho(r: Rascunho, arquivos: Arquivo[]): Problema[] {
  const existentes = new Map(arquivos.map((a) => [`${a.bucket}/${a.key}`, a]))
  const problemas: Problema[] = []

  for (const ref of referencias(r)) {
    const arq = existentes.get(`${ref.bucket}/${ref.key}`)
    if (!arq) {
      const rotulo = { familia: 'o arquivo', thumbnail: 'a miniatura', icone: 'o ícone' }[ref.uso]
      problemas.push({
        tipo: `${ref.uso}_ausente`, bloqueia: true, alvo: ref.dono,
        mensagem: `"${ref.dono}" aponta para ${rotulo} ${ref.key}, que não existe em ${ref.bucket}.`,
      })
    } else if (ref.uso === 'familia' && arq.size != null && ref.tamanho != null && arq.size !== ref.tamanho) {
      problemas.push({
        tipo: 'tamanho_divergente', bloqueia: true, alvo: ref.dono,
        mensagem: `"${ref.dono}": o arquivo no bucket tem ${arq.size} bytes, mas o catálogo diz ${ref.tamanho}. Reenvie o arquivo.`,
      })
    }
  }

  // Chave usada por mais de um item: apagar um quebraria o outro.
  const donos = new Map<string, string[]>()
  for (const ref of referencias(r)) {
    const k = `${ref.bucket}/${ref.key}`
    donos.set(k, [...(donos.get(k) ?? []), ref.dono])
  }
  for (const [k, lista] of donos) {
    if (lista.length > 1 && !k.endsWith('icons/todas.png')) {
      problemas.push({
        tipo: 'arquivo_compartilhado', bloqueia: false,
        mensagem: `${k} é usado por mais de um item (${lista.join(', ')}).`,
      })
    }
  }

  const comFamilia = new Set(r.familias.map((f) => f.category_id))
  for (const c of r.categorias) {
    if (!comFamilia.has(c.id)) {
      problemas.push({ tipo: 'categoria_vazia', bloqueia: false, alvo: c.nome, mensagem: `A categoria "${c.nome}" não tem famílias.` })
    }
    if (!c.icon_key) {
      problemas.push({ tipo: 'categoria_sem_icone', bloqueia: false, alvo: c.nome, mensagem: `A categoria "${c.nome}" não tem ícone.` })
    }
  }
  for (const f of r.familias) {
    if (!f.thumbnail_key) {
      problemas.push({ tipo: 'familia_sem_miniatura', bloqueia: false, alvo: f.nome, mensagem: `A família "${f.nome}" não tem miniatura.` })
    }
  }
  return problemas
}

type Situacao = 'em_uso' | 'so_publicado' | 'orfao'
interface ArquivoClassificado extends Arquivo {
  situacao: Situacao
  usos: { uso: Uso; dono: string }[]
}

// em_uso: o rascunho cita. so_publicado: só o catalog.json publicado cita
// (apagar quebraria quem usa a dockpane agora). orfao: ninguém cita.
function classificarArquivos(arquivos: Arquivo[], rascunho: Rascunho, publicado: Rascunho | null): ArquivoClassificado[] {
  const usos = new Map<string, { uso: Uso; dono: string }[]>()
  for (const ref of referencias(rascunho)) {
    const k = `${ref.bucket}/${ref.key}`
    usos.set(k, [...(usos.get(k) ?? []), { uso: ref.uso, dono: ref.dono }])
  }
  const doPublicado = new Set((publicado ? referencias(publicado) : []).map((r) => `${r.bucket}/${r.key}`))
  return arquivos.map((a) => {
    const k = `${a.bucket}/${a.key}`
    const u = usos.get(k) ?? []
    const situacao: Situacao = u.length ? 'em_uso' : doPublicado.has(k) ? 'so_publicado' : 'orfao'
    return { ...a, situacao, usos: u }
  })
}

// O que mudou do publicado para o rascunho (para a tela de publicação).
function diferencas(rascunho: Rascunho, publicado: Rascunho | null, geradoEm = '') {
  const novo = gerarCatalogo(rascunho, geradoEm)
  const antigo = publicado ? gerarCatalogo(publicado, geradoEm) : { categories: [], families: [] }
  const comparar = (a: any[], b: any[], rotulo: (x: any) => string) => {
    const antes = new Map(b.map((x) => [x.id, JSON.stringify(x)]))
    const depois = new Map(a.map((x) => [x.id, JSON.stringify(x)]))
    return {
      adicionadas: a.filter((x) => !antes.has(x.id)).map(rotulo),
      removidas: b.filter((x) => !depois.has(x.id)).map(rotulo),
      alteradas: a.filter((x) => antes.has(x.id) && antes.get(x.id) !== depois.get(x.id)).map(rotulo),
    }
  }
  return {
    categorias: comparar(novo.categories, antigo.categories, (c) => c.name),
    familias: comparar(novo.families, antigo.families, (f) => f.name),
    todas_icone_mudou: (publicado?.todasIconKey ?? null) !== rascunho.todasIconKey,
  }
}

// ---- _shared/adminCatalogo.ts ----
// Lógica da Edge Function `admin-catalogo`, separada do index.ts para poder
// ser testada com um cliente Supabase falso (tests/adminCatalogo.test.mjs).
//
// POST { acao, ... }  (Authorization: Bearer <access token do admin>)
//   verificar                      → estado do catálogo × arquivos (fantasmas, órfãos, diferenças)
//   publicar                       → gera e sobe plugin-assets/catalog.json (só se consistente)
//   importar { sobrescrever? }     → lê o catalog.json publicado para as tabelas
//   remover_orfaos { itens: [{bucket, key}] }  → apaga arquivos que ninguém cita
//
// Ordem fixa: valida o JWT → confere `admins` → valida a entrada → executa →
// grava em `admin_auditoria`. A service role nunca sai daqui.


const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

const PASTAS_ASSETS = ['icons', 'category-icons', 'thumbnails'] // o resto de plugin-assets não é do catálogo
const MAX_ORFAOS_POR_CHAMADA = 200

// deno-lint-ignore no-explicit-any
function criarHandler(supabase: any) {
  async function listar(bucket: string, prefixo: string, nivel = 0): Promise<Arquivo[]> {
    if (nivel > 4) return []
    const saida: Arquivo[] = []
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from(bucket).list(prefixo, {
        limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`falha ao listar ${bucket}/${prefixo}: ${error.message}`)
      for (const item of data ?? []) {
        const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
        if (item.id === null) saida.push(...await listar(bucket, caminho, nivel + 1))
        else if (!item.name.startsWith('.')) saida.push({ bucket, key: caminho, size: item.metadata?.size ?? null })
      }
      if ((data?.length ?? 0) < 100) break
    }
    return saida
  }

  async function listarTudo(): Promise<Arquivo[]> {
    const partes = await Promise.all([
      listar(BUCKET_FAMILIAS, ''),
      ...PASTAS_ASSETS.map((p) => listar(BUCKET_ASSETS, p)),
    ])
    return partes.flat()
  }

  async function lerRascunho(): Promise<Rascunho & { config: any }> {
    const [cats, fams, cfg] = await Promise.all([
      supabase.from('catalogo_categorias').select('*'),
      supabase.from('catalogo_familias').select('*'),
      supabase.from('catalogo_config').select('*'),
    ])
    for (const r of [cats, fams, cfg]) if (r.error) throw new Error(r.error.message)
    const config = cfg.data?.[0] ?? null
    return { categorias: cats.data, familias: fams.data, todasIconKey: config?.todas_icon_key ?? null, config }
  }

  async function lerPublicado(): Promise<{ catalogo: any; rascunho: Rascunho } | null> {
    const { data, error } = await supabase.storage.from(BUCKET_ASSETS).download('catalog.json')
    if (error || !data) return null
    try {
      const catalogo = JSON.parse(await data.text())
      return { catalogo, rascunho: rascunhoDoCatalogo(catalogo) }
    } catch {
      return null
    }
  }

  async function estado() {
    const [{ config, ...rascunho }, arquivos, publicado] = await Promise.all([
      lerRascunho(), listarTudo(), lerPublicado(),
    ])
    const problemas = verificarRascunho(rascunho, arquivos)
    const classificados = classificarArquivos(arquivos, rascunho, publicado?.rascunho ?? null)
    return { rascunho, arquivos: classificados, publicado, problemas, config }
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'login obrigatorio' }, 401)

    const { data: auth, error: erroAuth } = await supabase.auth.getUser(token)
    const admin = auth?.user
    if (erroAuth || !admin) return json({ error: 'sessao invalida ou expirada' }, 401)

    const { data: ehAdmin, error: erroAdmin } = await supabase
      .from('admins').select('user_id').eq('user_id', admin.id).maybeSingle()
    if (erroAdmin) return json({ error: 'falha ao verificar permissao' }, 500)
    if (!ehAdmin) return json({ error: 'sem permissao' }, 403)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return json({ error: 'corpo invalido' }, 400)
    }

    async function auditar(acao: string, depois: unknown) {
      const { error } = await supabase.from('admin_auditoria').insert({
        admin_id: admin.id, admin_email: admin.email ?? null,
        acao, alvo_tipo: 'catalogo', alvo_id: null, antes: null, depois,
      })
      if (error) console.error('admin-catalogo: falha ao auditar', error.message)
    }

    try {
      const acao = String(corpo.acao ?? '')

      if (acao === 'verificar') {
        const e = await estado()
        const atual = gerarCatalogo(e.rascunho, '')
        const sincronizado = !!e.publicado && canonico(atual) === canonico(e.publicado.catalogo)
        return json({
          resumo: {
            categorias: e.rascunho.categorias.length,
            familias: e.rascunho.familias.length,
            arquivos: e.arquivos.length,
            fantasmas: e.problemas.filter((p) => p.bloqueia).length,
            avisos: e.problemas.filter((p) => !p.bloqueia).length,
            orfaos: e.arquivos.filter((a) => a.situacao === 'orfao').length,
          },
          problemas: e.problemas,
          arquivos: e.arquivos,
          publicacao: {
            publicado_em: e.config?.publicado_em ?? null,
            existe: !!e.publicado,
            sincronizado,
            diferencas: diferencas(e.rascunho, e.publicado?.rascunho ?? null),
          },
        })
      }

      if (acao === 'publicar') {
        const e = await estado()
        const bloqueios = e.problemas.filter((p) => p.bloqueia)
        if (bloqueios.length) {
          return json({ error: 'catalogo inconsistente: corrija os itens fantasmas antes de publicar', problemas: bloqueios }, 409)
        }
        if (e.rascunho.familias.length === 0) return json({ error: 'catalogo vazio: nada a publicar' }, 409)

        const agora = new Date().toISOString()
        const catalogo = gerarCatalogo(e.rascunho, agora)
        const { error } = await supabase.storage.from(BUCKET_ASSETS).upload(
          'catalog.json',
          new Blob([JSON.stringify(catalogo, null, 2)], { type: 'application/json' }),
          { upsert: true, contentType: 'application/json', cacheControl: '60' },
        )
        if (error) return json({ error: `falha ao publicar: ${error.message}` }, 500)

        await supabase.from('catalogo_config').update({ publicado_em: agora, publicado_por: admin.id }).eq('id', true)
        await auditar('catalogo.publicar', {
          categorias: catalogo.categories.length, familias: catalogo.families.length,
          diferencas: diferencas(e.rascunho, e.publicado?.rascunho ?? null),
        })
        return json({ ok: true, publicado_em: agora, categorias: catalogo.categories.length, familias: catalogo.families.length })
      }

      if (acao === 'importar') {
        const { config: _c, ...atual } = await lerRascunho()
        const vazio = atual.categorias.length === 0 && atual.familias.length === 0
        if (!vazio && corpo.sobrescrever !== true) {
          return json({
            error: 'o catalogo ja tem dados; confirme para sobrescrever',
            categorias: atual.categorias.length, familias: atual.familias.length,
          }, 409)
        }
        const publicado = await lerPublicado()
        if (!publicado) return json({ error: 'nao ha catalog.json publicado para importar' }, 404)

        const r = publicado.rascunho
        const em = async (tabela: string, linhas: unknown[]) => {
          for (let i = 0; i < linhas.length; i += 200) {
            const { error } = await supabase.from(tabela).upsert(linhas.slice(i, i + 200), { onConflict: 'id' })
            if (error) throw new Error(`${tabela}: ${error.message}`)
          }
        }
        try {
          await em('catalogo_categorias', r.categorias.map((c) => ({ id: c.id, nome: c.nome, icon_key: c.icon_key, ordem: c.ordem })))
          await em('catalogo_familias', r.familias.map((f) => ({
            id: f.id, nome: f.nome, category_id: f.category_id, thumbnail_key: f.thumbnail_key,
            storage_key: f.storage_key, size_bytes: f.size_bytes, sha256: f.sha256, ordem: f.ordem,
          })))
          await supabase.from('catalogo_config').update({ todas_icon_key: r.todasIconKey }).eq('id', true)
        } catch (ex) {
          return json({ error: `falha ao importar: ${(ex as Error).message}` }, 400)
        }
        await auditar('catalogo.importar', { categorias: r.categorias.length, familias: r.familias.length, sobrescreveu: !vazio })
        return json({ ok: true, categorias: r.categorias.length, familias: r.familias.length })
      }

      if (acao === 'remover_orfaos') {
        const itens = Array.isArray(corpo.itens) ? corpo.itens : []
        if (itens.length === 0 || itens.length > MAX_ORFAOS_POR_CHAMADA) {
          return json({ error: `informe de 1 a ${MAX_ORFAOS_POR_CHAMADA} itens` }, 400)
        }
        for (const it of itens) {
          const ok = it && typeof it.key === 'string' && !it.key.includes('..') && !it.key.startsWith('/') &&
            (it.bucket === BUCKET_FAMILIAS ||
              (it.bucket === BUCKET_ASSETS && PASTAS_ASSETS.some((p) => it.key.startsWith(`${p}/`))))
          if (!ok) return json({ error: 'item invalido' }, 400)
        }

        // Reclassifica agora: só apaga o que continua órfão neste instante.
        const e = await estado()
        const situacao = new Map(e.arquivos.map((a) => [`${a.bucket}/${a.key}`, a.situacao]))
        const apagar: Record<string, string[]> = {}
        const ignorados: { bucket: string; key: string; motivo: string }[] = []
        for (const it of itens) {
          const s = situacao.get(`${it.bucket}/${it.key}`)
          if (s === 'orfao') (apagar[it.bucket] ??= []).push(it.key)
          else ignorados.push({ bucket: it.bucket, key: it.key, motivo: s === undefined ? 'nao existe' : s === 'em_uso' ? 'em uso no catalogo' : 'ainda usado pelo catalogo publicado' })
        }
        let removidos = 0
        for (const [bucket, keys] of Object.entries(apagar)) {
          const { error } = await supabase.storage.from(bucket).remove(keys)
          if (error) return json({ error: `falha ao remover de ${bucket}: ${error.message}` }, 500)
          removidos += keys.length
        }
        await auditar('catalogo.remover_orfaos', { removidos: apagar, ignorados })
        return json({ ok: true, removidos, ignorados })
      }

      return json({ error: 'acao desconhecida' }, 400)
    } catch (ex) {
      console.error('admin-catalogo:', (ex as Error).message)
      return json({ error: 'falha interna' }, 500)
    }
  }
}

// ---- servidor ----
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(criarHandler(supabase))
