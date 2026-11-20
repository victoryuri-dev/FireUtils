import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Campos do responsavel tecnico guardados no perfil. Sao os mesmos nomes do
// estado do projeto (ver ProjetoContext.jsx), de proposito: aplicar o perfil
// numa etapa vira copia direta, sem tabela de-para pra manter sincronizada.
//
// A ART (artNumero, artData, artTipoServico, artValorObra) fica de fora: sao
// dados de cada projeto, nao do profissional.
const CAMPOS_RT = [
  'rtNome', 'rtConselhoTipo', 'rtConselho', 'rtCpf', 'rtEspecialidade', 'rtEmpresa', 'rtEmail', 'rtTelefone',
]

// `rtEspecialidade` nasce preenchido com o valor padrao, entao
// nao serve pra dizer se alguem chegou a preencher alguma coisa — daqui sai a
// pergunta "tem dado de verdade aqui?", usada nos dois lados: pra saber se o
// perfil tem o que oferecer e se a etapa ainda esta em branco.
const CAMPOS_PREENCHIVEIS = CAMPOS_RT.filter(c => c !== 'rtEspecialidade' && c !== 'rtConselhoTipo')

const RT_VAZIO = {
  rtNome: '', rtConselhoTipo: '', rtConselho: '', rtCpf: '', rtEspecialidade: 'Engenharia Civil',
  rtEmpresa: '', rtEmail: '', rtTelefone: '',
}

const PERFIL_VAZIO = { nome: '', telefone: '', responsavelTecnico: RT_VAZIO, rubrica: '', projetosFixados: [] }

export function temDadosRT(rt) {
  return !!rt && CAMPOS_PREENCHIVEIS.some(c => (rt[c] || '').trim())
}

// So os campos conhecidos, com default pra cada um — o jsonb do Postgres
// aceita qualquer forma, inclusive `{}` de uma linha criada antes de um campo
// novo existir, e o formulario precisa de string em todo input pra nao
// alternar entre controlado e nao controlado.
function normalizarRT(bruto) {
  const rt = { ...RT_VAZIO }
  for (const campo of CAMPOS_RT) {
    if (typeof bruto?.[campo] === 'string') rt[campo] = bruto[campo]
  }
  return rt
}

// Nome de usuário exibido pelo app (header, saudação do perfil): o
// nome salvo no perfil; sem ele, o nome que veio do provedor de login; por
// último, o início do e-mail. Uma função só, pra todos mostrarem o mesmo.
export function nomeDeUsuario(perfil, user, padrao = 'Perfil') {
  return perfil?.nome?.trim()
    || user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || padrao
}

// Salvar o perfil numa tela avisa as outras instâncias do hook (o header fica
// montado ao lado da página de perfil) pra o nome atualizar sem recarregar.
const EVENTO_PERFIL = 'fireutils:perfil-salvo'

// Perfil da conta logada. `perfil` e null enquanto carrega; sem usuario ou sem
// linha no banco, vem PERFIL_VAZIO — "ainda nao preencheu" nao e erro.
export function usePerfil() {
  const { user } = useAuth()
  const [perfil, setPerfil] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!user) { setPerfil(PERFIL_VAZIO); return }

    let cancelado = false
    setPerfil(null)
    setErro(null)

    supabase
      .from('perfis')
      // `*`: sem a coluna `rubrica` (migração ainda não rodada) o perfil
      // continua carregando — só fica sem rubrica.
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          setErro('Não foi possível carregar seu perfil.')
          setPerfil(PERFIL_VAZIO)
          return
        }
        setPerfil(data
          ? {
              nome: data.nome || '',
              telefone: data.telefone || '',
              responsavelTecnico: normalizarRT(data.responsavel_tecnico),
              rubrica: data.rubrica || '',
              projetosFixados: Array.isArray(data.projetos_fixados) ? data.projetos_fixados : [],
            }
          : PERFIL_VAZIO)
      })

    return () => { cancelado = true }
  }, [user])

  useEffect(() => {
    const aoSalvar = e => setPerfil(e.detail)
    window.addEventListener(EVENTO_PERFIL, aoSalvar)
    return () => window.removeEventListener(EVENTO_PERFIL, aoSalvar)
  }, [])

  const salvar = useCallback(async (novo) => {
    if (!user) return { ok: false, erro: 'Você precisa estar logado para salvar o perfil.' }

    const { error } = await supabase.from('perfis').upsert({
      user_id: user.id,
      nome: novo.nome,
      telefone: novo.telefone,
      responsavel_tecnico: normalizarRT(novo.responsavelTecnico),
      atualizado_em: new Date().toISOString(),
    })
    if (error) return { ok: false, erro: 'Não foi possível salvar. Tente de novo.' }

    // A rubrica tem gravação própria (salvarRubrica): vale a mais recente.
    const salvo = { ...novo, rubrica: perfil?.rubrica ?? novo.rubrica ?? '', projetosFixados: perfil?.projetosFixados ?? novo.projetosFixados ?? [] }
    setPerfil(salvo)
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL, { detail: salvo }))
    return { ok: true }
  }, [user, perfil])

  // Rubrica (data URL; '' remove): grava só essa coluna, na hora — vale para
  // todos os projetos (quadro "Rubrica" do memorial da PB).
  const salvarRubrica = useCallback(async (rubrica) => {
    if (!user) return { ok: false, erro: 'Você precisa estar logado para salvar a rubrica.' }
    const { error } = await supabase.from('perfis').upsert({ user_id: user.id, rubrica, atualizado_em: new Date().toISOString() })
    if (error) {
      const semColuna = /rubrica/i.test(error.message || '')
      return { ok: false, erro: semColuna
        ? 'A coluna da rubrica ainda não existe no banco (rode a migração 20261019120000_add_rubrica_perfis.sql).'
        : 'Não foi possível salvar a rubrica. Tente de novo.' }
    }
    const novo = { ...(perfil || PERFIL_VAZIO), rubrica }
    setPerfil(novo)
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL, { detail: novo }))
    return { ok: true }
  }, [user, perfil])

  // Projetos fixados no topo de "Meus projetos" (ids): grava só essa coluna.
  const salvarFixados = useCallback(async (ids) => {
    if (!user) return { ok: false, erro: 'Você precisa estar logado.' }
    const anterior = perfil
    const novo = { ...(perfil || PERFIL_VAZIO), projetosFixados: ids }
    setPerfil(novo)   // otimista: o card muda de grupo na hora
    const { error } = await supabase.from('perfis').upsert({ user_id: user.id, projetos_fixados: ids, atualizado_em: new Date().toISOString() })
    if (error) {
      setPerfil(anterior)
      const semColuna = /projetos_fixados/i.test(error.message || '')
      return { ok: false, erro: semColuna
        ? 'A coluna de projetos fixados ainda não existe no banco (rode a migração 20261019130000_add_projetos_fixados_perfis.sql).'
        : 'Não foi possível fixar o projeto. Tente de novo.' }
    }
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL, { detail: novo }))
    return { ok: true }
  }, [user, perfil])

  return { perfil, erro, salvar, salvarRubrica, salvarFixados }
}
