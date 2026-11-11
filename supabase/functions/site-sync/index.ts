// Edge Function: site-sync
//
// Caminho inverso do revit-sync: em vez do plugin empurrar dados pro site,
// aqui o plugin PUXA dados que o site já tem/calculou. Somente leitura —
// nunca grava nada. Identifica o projeto por `projetoId` (id escolhido no
// Dashboard da dockpane, ver revit-sync) — mesmo esquema, sem token
// secreto.
//
// Três ações (mesmo body, campo "acao"):
//   1. listar_estruturas — lista as estruturas do projeto, pro plugin
//      mostrar um seletor e o usuário escolher qual delas aquele arquivo
//      Revit representa (vínculo salvo localmente no plugin).
//   2. ocupacao_area — nome/UF do projeto, dados de ocupação (divisão/grupo/
//      CNAE por pavimento) e área construída de UMA estrutura específica
//      (a vinculada).
//   3. populacao_ambientes — População e Taxa Populacional já calculadas
//      pelo site pra cada ambiente (Saída de Emergência) de UMA estrutura
//      específica, casado por `revitId` (Room.UniqueId) — é o caminho
//      Site → Revit: Nome/Grupo/Área são autoridade do Revit (sobem pelo
//      revit-sync), mas População/Taxa Populacional viram autoridade do
//      site (ele sabe o popTipo de cada ambiente — por área, manual ou
//      assento fixo — e a taxa normativa vigente), então o plugin busca o
//      resultado já pronto aqui em vez de recalcular por conta própria.
//      Só devolve ambiente que tem `revitId` — um ambiente criado
//      manualmente no site (sem Room correspondente no Revit) não tem
//      pra onde mandar o valor, então nem entra na resposta.
//
// Não é este o caminho usado pela classificação do Sistema de Hidrantes e
// Mangotinhos (state.hidrantes) — a dockpane já lê a coluna `dados` inteira
// direto do Supabase com a sessão do usuário (RLS — ver
// webapp/src/lib/projectData.js), então `dados.hidrantes` chega lá sem
// precisar de Edge Function nenhuma. Este arquivo serve só o vínculo por
// sync_token usado pelos scripts Python (sem sessão de usuário).
//
// Só devolve o recorte necessário — nunca o projeto inteiro, que tem dados
// sensíveis (CPF, dados de proprietário/responsável).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { donoTemLicenca, ERRO_SEM_LICENCA } from '../_shared/licenca.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// Mesma fórmula de src/data/se_calc.js (calcPopAmb) — duplicada aqui porque
// esta function roda em Deno, fora do bundle do site. Mantenha as duas em
// sincronia se a regra de população mudar.
function calcPopAmbiente(amb, tabela) {
  return calcPopBase(amb, tabela) + calcPopArquibancada(amb)
}

// Arquibancada (F-3, nota Q): 1 pessoa por 0,50 m linear de banco.
function calcPopArquibancada(amb) {
  if (!amb.arquibancada || amb.divisao !== 'F-3') return 0
  return Math.ceil((parseFloat(amb.arquibancadaComprimento) || 0) / 0.5)
}

function calcPopBase(amb, tabela) {
  if (amb.popTipo === 'fixo') return Math.max(0, parseInt(amb.assentos) || 0)
  if (amb.popTipo === 'manual') return Math.max(0, parseInt(amb.popManual) || 0)
  const taxa = tabela[amb.divisao]
  if (!taxa || taxa.A == null) return Math.max(0, parseInt(amb.popManual) || 0)
  return Math.ceil((parseFloat(amb.area) || 0) / taxa.A)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'json invalido' }, 400)
  }

  const { projetoId, acao, estruturaId } = body || {}

  if (!projetoId || typeof projetoId !== 'string') return json({ error: 'projetoId obrigatorio' }, 400)
  if (acao !== 'listar_estruturas' && acao !== 'ocupacao_area' && acao !== 'populacao_ambientes') {
    return json({ error: 'acao invalida — use "listar_estruturas", "ocupacao_area" ou "populacao_ambientes"' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const { data: projeto } = await supabase
    .from('projetos').select('nome, user_id, dados').eq('id', projetoId).maybeSingle()

  if (!projeto) return json({ error: 'projetoId invalido' }, 401)

  // População dos ambientes é do módulo Saídas (ou PRO); listar estruturas e
  // ocupação/área servem a qualquer módulo, então basta ter alguma licença.
  const modulos = acao === 'populacao_ambientes' ? ['saidas'] : null
  if (!await donoTemLicenca(supabase, projeto.user_id, modulos)) {
    return json(ERRO_SEM_LICENCA, 403)
  }

  const dados = projeto.dados || {}
  const estruturas = dados.estruturas || []

  if (acao === 'listar_estruturas') {
    return json(estruturas.map(e => ({ id: e.id, nome: e.nome })))
  }

  // acao === 'ocupacao_area' ou 'populacao_ambientes' — ambas exigem estruturaId
  if (!estruturaId || typeof estruturaId !== 'string') {
    return json({ error: 'estruturaId obrigatorio para esta acao' }, 400)
  }

  const estrutura = estruturas.find(e => e.id === estruturaId)
  if (!estrutura) return json({ error: 'estrutura nao encontrada neste projeto' }, 404)

  if (acao === 'populacao_ambientes') {
    const { data: normaRow } = await supabase
      .from('normas_dados').select('dados')
      .eq('uf', dados.uf).eq('sistema', 'saida_emergencia').maybeSingle()
    const tabela = normaRow?.dados?.tabela || {}

    const pavimentos = (dados.pavimentos || [])
      .filter(p => p.estruturaId === estruturaId)
      .map(p => ({
        nome: p.label,
        ambientes: (p.ambientes || [])
          .filter(a => a.revitId)
          .map(a => ({
            revitId: a.revitId,
            pop: calcPopAmbiente(a, tabela),
            taxaObs: tabela[a.divisao]?.obs || '',
          })),
      }))
    return json({ pavimentos })
  }

  const pavimentos = (dados.pavimentos || [])
    .filter(p => p.estruturaId === estruturaId)
    .map(p => ({ id: p.id, label: p.label, divisao: p.divisao, grupo: p.grupo, cnae: p.cnae }))

  return json({
    projeto: {
      nome: projeto.nome,
      uf: dados.uf,
    },
    estrutura: {
      id: estrutura.id,
      nome: estrutura.nome,
      areaTotal: estrutura.areaTotal,
      altura: estrutura.altura,
      nPavimentos: estrutura.nPavimentos,
      nSubsolos: estrutura.nSubsolos,
    },
    pavimentos,
  })
})
