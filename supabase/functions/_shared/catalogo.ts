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

export const BUCKET_FAMILIAS = 'revit-families'
export const BUCKET_ASSETS = 'plugin-assets'

export interface Categoria { id: string; nome: string; icon_key: string | null; ordem: number }
export interface Familia {
  id: string; nome: string; category_id: string; thumbnail_key: string | null
  storage_key: string; size_bytes: number; sha256: string; ordem: number
}
export interface Rascunho { categorias: Categoria[]; familias: Familia[]; todasIconKey: string | null }
export interface Arquivo { bucket: string; key: string; size: number | null }

// 'Extintor Portátil - ABC' -> 'extintor-portatil-abc'. Igual ao slugify de
// migration/generate_catalog.py (FireUtils.extension): acentos saem, o resto
// que não é ASCII é descartado, não vira hífen.
export function slugify(texto: string): string {
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

export function gerarCatalogo(r: Rascunho, geradoEm: string) {
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
export function canonico(catalogo: Record<string, unknown>): string {
  const { generated_at: _ignorado, ...resto } = catalogo
  return JSON.stringify(resto)
}

// Lê um catalog.json no formato publicado e devolve o rascunho equivalente.
export function rascunhoDoCatalogo(cat: any): Rascunho {
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

export type Uso = 'familia' | 'thumbnail' | 'icone'
interface Referencia { bucket: string; key: string; uso: Uso; dono: string; tamanho?: number }

export function referencias(r: Rascunho): Referencia[] {
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

export interface Problema {
  tipo: string
  bloqueia: boolean
  mensagem: string
  alvo?: string
}

// Confere o rascunho contra os arquivos que existem de verdade.
export function verificarRascunho(r: Rascunho, arquivos: Arquivo[]): Problema[] {
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

export type Situacao = 'em_uso' | 'so_publicado' | 'orfao'
export interface ArquivoClassificado extends Arquivo {
  situacao: Situacao
  usos: { uso: Uso; dono: string }[]
}

// em_uso: o rascunho cita. so_publicado: só o catalog.json publicado cita
// (apagar quebraria quem usa a dockpane agora). orfao: ninguém cita.
export function classificarArquivos(arquivos: Arquivo[], rascunho: Rascunho, publicado: Rascunho | null): ArquivoClassificado[] {
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
export function diferencas(rascunho: Rascunho, publicado: Rascunho | null, geradoEm = '') {
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
