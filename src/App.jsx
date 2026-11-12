import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Routes, Route, Navigate, Outlet,
  useNavigate, useParams, useLocation,
} from 'react-router-dom'
import { ProjetoProvider, useProjeto, newIds } from './context/ProjetoContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import { statusNormas } from './lib/normasRemote'
import { getSE, getHidrantes, getExtintores, getAV, getTRRF, getCompartimentacao, getIluminacao, getSinalizacao, getBrigada, getDeteccaoAlarme } from './data/normas/index'
import { usePerfil, nomeDeUsuario } from './hooks/usePerfil'
import LoginPage, { RedefinirSenhaPage } from './pages/LoginPage'
import LandingPage    from './pages/LandingPage'
import PricingPage    from './pages/PricingPage'
import LicencaProvider from './context/LicencaContext'
import { useAcesso }   from './hooks/useLicencas'
import ProjectAside   from './components/layout/ProjectAside'
import { paginaDaMedida } from './estados/registro'
import DashboardPage  from './pages/DashboardPage'
import ConfiguracaoPage from './pages/ConfiguracaoPage'
import ProjetosPage   from './pages/ProjetosPage'
import PerfilPage     from './pages/PerfilPage'
import DocumentosPage from './pages/DocumentosPage'
// Carregada sob demanda: traz o pdf.js, que não deve pesar no resto do app.
const AssinaturasPage = lazy(() => importarOuRecarregar(() => import('./pages/AssinaturasPage')))
import MedidaPage            from './pages/MedidaPage'
import SaidaEmergenciaPage   from './pages/medidas/SaidaEmergenciaPage'
import HidrantesPage          from './pages/medidas/HidrantesPage'
import AcessoViaturaPage      from './pages/medidas/AcessoViaturaPage'
import SegurancaEstruturalPage from './pages/medidas/SegurancaEstruturalPage'
import CompartimentacaoPage    from './pages/medidas/CompartimentacaoPage'
import ExtintoresPage         from './pages/medidas/ExtintoresPage'
import IluminacaoPage         from './pages/medidas/IluminacaoPage'
import SinalizacaoPage        from './pages/medidas/SinalizacaoPage'
import ControleAcabamentoPage from './pages/medidas/ControleAcabamentoPage'
import GerenciamentoRiscoPage from './pages/medidas/GerenciamentoRiscoPage'
import BrigadaIncendioPage    from './pages/medidas/BrigadaIncendioPage'
import AlarmeIncendioPage     from './pages/medidas/AlarmeIncendioPage'
import DeteccaoIncendioPage   from './pages/medidas/DeteccaoIncendioPage'
import Icon           from './components/ui/Icon'
import Loader         from './components/ui/Loader'
import ProjectNotesCard from './components/notes/ProjectNotesCard'
import { AuditoriaProvider } from './context/AuditoriaContext'
import AuditoriaPage from './pages/AuditoriaPage'
import ToastProvider   from './components/ui/ToastProvider'
import FeedbackWidget  from './components/feedback/FeedbackWidget'
import ComPrevia       from './components/previa/ComPrevia'
import landingLogo from './assets/logo-fireutils-light.svg'
import landingLogoDark from './assets/logo-fireutils-dark.svg'
import { ThemeProvider } from './context/ThemeContext'
import { useTheme } from './context/theme-context'
import { tituloDaRota } from './utils/tituloPagina'
import { importarOuRecarregar } from './lib/recarregarPorVersao'

// ── SaveStatusIndicator ───────────────────────────────────────────────
// Mostra se o projeto esta sendo sincronizado com o servidor ou se ja foi
// salvo — ve syncStatus (ProjetoContext), atualizado pelo autosave debounced.
// Fica invisivel ate a primeira sincronizacao (ex: sem usuario logado, ou
// projeto ainda nao pronto pra salvar).
function SaveStatusIndicator({ status }) {
  if (!status) return null
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Icon name="spinner" size={12} className="animate-spin"/> Salvando...
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-red">
        <Icon name="warn" size={12}/> Erro ao salvar
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
      <Icon name="checkCircle" size={12} className="text-green"/> Salvo
    </span>
  )
}

function HeaderNotes({ notes, dispatch, open, onToggle, onClose }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Notas do projeto"
        aria-label="Notas do projeto"
        aria-expanded={open}
        className={`w-8 h-8 grid place-items-center rounded-md border border-solid bg-surface transition-colors ${open ? 'border-red text-red bg-red-dim' : 'border-border text-ink-faint hover:text-ink hover:bg-surface-2'}`}
      >
        <Icon name="notebookPen" size={16}/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose}/>
          <section className="header-notes-popover absolute right-0 top-[42px] z-50 w-[360px] max-w-[calc(100vw-32px)]" aria-label="Notas do projeto">
            <ProjectNotesCard notes={notes} dispatch={dispatch} height={300} className="header-notes-card"/>
          </section>
        </>
      )}
    </div>
  )
}

// ── AppHeader ─────────────────────────────────────────────────────────
function AppHeader({ onGoProjetos, isProjectPage, showProjectsLink = false }) {
  const { user, signOut } = useAuth()
  const { perfil } = usePerfil()
  const { state, dispatch, syncStatus } = useProjeto()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const navigate = useNavigate()
  const profileName = nomeDeUsuario(perfil, user)
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="relative flex items-center justify-between gap-3 px-4 sm:px-6 h-16 border-b border-border border-solid bg-surface shadow-[0_1px_0_rgba(19,24,34,.02)] shrink-0 z-100">
      {/* Logo — omitida dentro de um projeto, ja mostrada no topo do aside */}
      {!isProjectPage && (
        <div className="flex items-center gap-2.5">
          <img src={theme === 'light' ? landingLogo : landingLogoDark} alt="FireUtils" className="w-[126px] h-auto"/>
        </div>
      )}

      {/* Nav — breadcrumb estilo url: Projeto / UF / nome. So aparece dentro
          de um projeto, ja que fora dele nao ha contexto pra mostrar. */}
      {isProjectPage && (
        <nav className="flex items-center gap-1.5 text-[14px] min-w-0 overflow-hidden whitespace-nowrap">
          <button onClick={onGoProjetos} className="inline-flex items-center gap-2 text-ink-muted hover:text-ink transition-colors cursor-pointer">
            <Icon name="left" size={14}/> PROJETOS
          </button>
          {state.uf && <>
            <span className="text-ink-hint">/</span>
            <span className="text-ink-muted">{state.uf}</span>
          </>}
          <span className="text-ink-hint">/</span>
          <span className="text-ink font-medium truncate">{state.nome || 'Sem nome'}</span>
          {syncStatus && (
            <span className="ml-2 pl-2.5 border-l border-solid border-border">
              <SaveStatusIndicator status={syncStatus}/>
            </span>
          )}
        </nav>
      )}

      {showProjectsLink && (
        <button
          type="button"
          onClick={onGoProjetos}
          className="absolute left-1/2 -translate-x-1/2 text-[12px] font-medium text-ink-muted hover:text-ink transition-colors"
        >
          Meus projetos
        </button>
      )}

      {/* Direita — conta */}
      <div className="flex items-center gap-5 sm:gap-6 relative shrink-0">
        <div className="flex items-center gap-2">
          {isProjectPage && <button type="button" className="btn-ghost text-xs" onClick={() => navigate(`/projeto/${state.id}/auditoria`)}>
            <Icon name="search" size={14}/><span className="hidden sm:inline">Auditar projeto</span>
            <span className="sm:hidden">Auditar</span>
          </button>}
          {isProjectPage && (
            <HeaderNotes
              notes={state.notas || []}
              dispatch={dispatch}
              open={notesOpen}
              onToggle={() => { setMenuOpen(false); setNotesOpen(value => !value) }}
              onClose={() => setNotesOpen(false)}
            />
          )}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            className="w-8 h-8 grid place-items-center rounded-md border border-solid border-border bg-surface text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15}/>
          </button>
        </div>
        <button
          onClick={() => { setNotesOpen(false); setMenuOpen(o => !o) }}
          title={user?.email}
          className="group flex items-center gap-2.5 min-w-0 cursor-pointer text-ink-muted hover:text-ink transition-colors"
        >
          <span className="max-w-[180px] truncate text-[12px]">{profileName}</span>
          <span className="w-[30px] h-[30px] rounded-full bg-surface-2 flex items-center justify-center shrink-0 text-ink-faint transition-colors group-hover:text-ink">
            <Icon name="user" size={13}/>
          </span>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)}/>
            <div className="absolute right-0 top-[42px] bg-surface border border-border border-solid rounded-lg shadow-[var(--shadow-md)] py-1 min-w-[200px] z-50">
              <div className="px-3 py-2 text-[11px] text-ink-faint border-b border-border border-solid truncate">
                {user?.email}
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate('/perfil') }}
                className="w-full text-left px-3 py-2 text-[12px] text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center gap-2"
              >
                <Icon name="settings" size={13}/> Perfil e configurações
              </button>
              <button
                onClick={() => { setMenuOpen(false); signOut() }}
                className="w-full text-left px-3 py-2 text-[12px] text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center gap-2"
              >
                <Icon name="exit" size={13}/> Sair
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

// Normas da base central de que cada página de medida depende (getter +
// nome do sistema em normas_dados) — sem alguma delas para o estado do
// projeto, a página mostra "norma não cadastrada" em vez de quebrar ou de
// aplicar a norma de outro estado.
const NORMAS_DA_MEDIDA = {
  saida_emergencia:    [[getSE, 'saida_emergencia']],
  hidrantes:           [[getHidrantes, 'hidrantes'], [getExtintores, 'extintores']],
  acesso_viatura:      [[getAV, 'acesso_viatura']],
  seg_estrutural:      [[getTRRF, 'trrf']],
  compart_horizontal:  [[getCompartimentacao, 'compartimentacao']],
  compart_vertical:    [[getCompartimentacao, 'compartimentacao']],
  extintores:          [[getExtintores, 'extintores']],
  iluminacao:          [[getIluminacao, 'iluminacao']],
  sinalizacao:         [[getSinalizacao, 'sinalizacao']],
  brigada:             [[getBrigada, 'brigada'], [getExtintores, 'extintores']],
  alarme:              [[getDeteccaoAlarme, 'deteccao_alarme']],
  deteccao:            [[getDeteccaoAlarme, 'deteccao_alarme']],
}

function NormaNaoCadastrada({ uf, sistemas }) {
  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-[720px] mx-auto pt-12 px-10 pb-20">
      <div className="ibox amber">
        <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/>
        <span>
          A norma desta medida ainda não está cadastrada para {uf} na base normativa
          (Supabase — normas_dados, sistema {sistemas.map(s => `'${s}'`).join(' e ')}).
          Cadastre-a para dimensionar esta medida.
        </span>
      </div>
    </div></div>
  )
}

function MedidaRoute() {
  const { sistKey } = useParams()
  return <ComPrevia sistKey={sistKey}><PaginaDaMedida sistKey={sistKey}/></ComPrevia>
}

// Página de uma medida (sem a prévia — ver MedidaRoute/ComPrevia).
function PaginaDaMedida({ sistKey }) {
  const { state } = useProjeto()
  // Estado com fluxo próprio (PB: formulário do CBMPB) — página do estado,
  // que mostra a seção mesmo sem a norma da medida cadastrada.
  const propria = paginaDaMedida(state.uf, sistKey)
  if (propria) return propria
  const faltando = (NORMAS_DA_MEDIDA[sistKey] || []).filter(([get]) => !get(state.uf)).map(([, nome]) => nome)
  if (faltando.length) return <NormaNaoCadastrada uf={state.uf} sistemas={[...new Set(faltando)]}/>
  if (sistKey === 'saida_emergencia')  return <SaidaEmergenciaPage/>
  if (sistKey === 'hidrantes')         return <HidrantesPage/>
  if (sistKey === 'acesso_viatura')    return <AcessoViaturaPage/>
  if (sistKey === 'seg_estrutural')    return <SegurancaEstruturalPage/>
  if (sistKey === 'compart_horizontal') return <CompartimentacaoPage sentido="horizontal"/>
  if (sistKey === 'compart_vertical')   return <CompartimentacaoPage sentido="vertical"/>
  if (sistKey === 'extintores')        return <ExtintoresPage/>
  if (sistKey === 'iluminacao')        return <IluminacaoPage/>
  if (sistKey === 'sinalizacao')       return <SinalizacaoPage/>
  if (sistKey === 'controle_acabamento') return <ControleAcabamentoPage/>
  if (sistKey === 'gerenciamento_risco') return <GerenciamentoRiscoPage/>
  if (sistKey === 'brigada')             return <BrigadaIncendioPage/>
  if (sistKey === 'alarme')              return <AlarmeIncendioPage/>
  if (sistKey === 'deteccao')            return <DeteccaoIncendioPage/>
  return <MedidaPage sistKey={sistKey}/>
}

function DashboardRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  return (
    <DashboardPage
      onGoConfig={() => navigate(`/projeto/${id}/config`)}
      onNavigate={(pageKey) => navigate(pageKey === 'documentos'
        ? `/projeto/${id}/documentos`
        : `/projeto/${id}/medida/${pageKey}`)}
    />
  )
}

function ConfigRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  return <ConfiguracaoPage onGoDashboard={() => navigate(`/projeto/${id}/dashboard`)}/>
}

// ── ProjetosRoute ─────────────────────────────────────────────────────
// Página "Meus projetos" — fora do contexto de um projeto aberto.
function ProjetosRoute() {
  const navigate = useNavigate()
  const { dispatch } = useProjeto()

  const handleOpenProject = (proj) => {
    dispatch({ type: 'LOAD', payload: proj })
    navigate(`/projeto/${proj.id}/dashboard`)
  }

  const handleNewProject = (tipo = 'completo', uf) => {
    const ids = newIds()
    dispatch({ type: 'NEW_PROJECT', ...ids, tipo, uf })
    navigate(`/projeto/${ids.id}/config`)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader onGoProjetos={() => navigate('/projetos')} isProjectPage={false}/>
      <ProjetosPage
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
      />
    </div>
  )
}

// ── PerfilRoute ───────────────────────────────────────────────────────
// Página da conta — fora do contexto de um projeto, como "Meus projetos".
function PerfilRoute() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader onGoProjetos={() => navigate('/projetos')} isProjectPage={false} showProjectsLink/>
      <PerfilPage/>
    </div>
  )
}

// ── AssinaturasRoute ──────────────────────────────────────────────────
// Ferramenta de assinatura em lote — independente de projeto, como o perfil.
function AssinaturasRoute() {
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader onGoProjetos={() => navigate('/projetos')} isProjectPage={false} showProjectsLink/>
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader size={32}/></div>}>
        <AssinaturasPage/>
      </Suspense>
    </div>
  )
}

// ── ProjectLayout ─────────────────────────────────────────────────────
// Envolve as rotas de um projeto aberto (/projeto/:id/*). Garante que o
// projeto correto esteja carregado no contexto antes de renderizar — isso
// é o que permite recarregar a página (F5) sem cair de volta na lista de
// projetos: o :id na URL é a fonte da verdade, não o estado em memória.
// Tela de espera/erro enquanto a base normativa do estado do projeto
// (normas_dados no Supabase) não carrega — sem ela nenhuma tela de medida,
// classificação ou documento tem dado para mostrar.
function NormasIndisponiveis({ status, uf }) {
  const { recarregarNormas } = useProjeto()
  const navigate = useNavigate()
  if (status === 'carregando') {
    return <div className="flex-1 flex items-center justify-center"><Loader size={32}/></div>
  }
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-[440px] text-center">
        <div className="text-[15px] font-semibold text-ink mb-2">Não foi possível carregar as normas de {uf}</div>
        <p className="text-[13px] text-ink-faint leading-[1.6] mb-5">
          As normas técnicas vêm da base normativa central (Supabase). Verifique a conexão e tente de novo.
        </p>
        <div className="flex gap-2 justify-center">
          <button className="btn-ghost" onClick={() => navigate('/projetos')}>Meus projetos</button>
          <button className="btn-primary" onClick={recarregarNormas}>Tentar de novo</button>
        </div>
      </div>
    </div>
  )
}

function ProjectLayout() {
  const { id } = useParams()
  const { state, dispatch, conflito, definirVersaoConhecida } = useProjeto()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const carregado = state.id === id

  // Roda a cada entrada no projeto (troca de :id ou de sessão) — sempre
  // busca a versão atual do Postgres, mesmo se o projeto já estiver em
  // memória (cache local ou navegação anterior), pra manter a versão
  // conhecida em dia e o controle de concorrência (ver ProjetoContext.jsx)
  // funcionando. Não depende de `state.id` — LOAD mudaria `state.id` e
  // re-disparia este efeito, criando um loop de refetch.
  useEffect(() => {
    let cancelado = false

    function carregarDoCacheLocal() {
      try {
        const raw = localStorage.getItem('etos-projetos')
        const all = raw ? JSON.parse(raw) : {}
        const proj = all[id]
        if (proj) dispatch({ type: 'LOAD', payload: proj })
        else if (state.id !== id) navigate('/projetos', { replace: true })
      } catch {
        if (state.id !== id) navigate('/projetos', { replace: true })
      }
    }

    async function carregar() {
      if (!user) return carregarDoCacheLocal()
      const { data, error } = await supabase
        .from('projetos').select('dados, version').eq('id', id).eq('user_id', user.id).maybeSingle()
      if (cancelado) return
      if (data) {
        dispatch({ type: 'LOAD', payload: data.dados })
        definirVersaoConhecida(data.version)
      } else if (!error) {
        if (state.id === id) {
          // Projeto novo (NEW_PROJECT), ainda não existe no Postgres — o
          // primeiro autosave cria a linha. Não é "não encontrado".
          definirVersaoConhecida(0)
        } else {
          navigate('/projetos', { replace: true })
        }
      } else {
        // Erro de rede (ex.: offline) — cai pro cache local como fallback
        carregarDoCacheLocal()
      }
    }
    carregar()

    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user])

  const rest = location.pathname.split(`/projeto/${id}/`)[1]?.split('/') || []
  const activePage = rest[0] === 'medida' ? `medida-${rest[1]}` : (rest[0] || 'dashboard')

  const handleNavigate = (pageKey) => {
    navigate(pageKey.startsWith('medida-')
      ? `/projeto/${id}/medida/${pageKey.slice(7)}`
      : `/projeto/${id}/${pageKey}`)
  }

  if (!carregado) return null
  // Toda norma vem do Supabase (sem fallback local): o projeto só abre com as
  // normas do estado carregadas.
  const normas = statusNormas(state.uf)
  if (normas !== 'ok') return <NormasIndisponiveis status={normas} uf={state.uf}/>

  return (
    <>
      <ProjectAside
        activePage={activePage}
        onNavigate={handleNavigate}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader onGoProjetos={() => navigate('/projetos')} isProjectPage/>
        {/* Conflito de edição: banner fixo (não some sozinho) — perder as
            edições desta aba é o tipo de aviso que precisa ficar visível. */}
        {conflito && (
          <div className="ibox red m-0 rounded-none border-x-0 border-t-0 shrink-0" role="alert">
            <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
            <span className="text-xs flex-1">
              <strong>Projeto alterado em outra sessão.</strong> Para não perder o que foi salvo lá, recarregue antes de continuar — suas últimas mudanças nesta aba não foram salvas.
            </span>
            <button type="button" className="btn-ghost text-[11px] py-1 px-2.5 shrink-0" onClick={() => window.location.reload()}>Recarregar</button>
          </div>
        )}
        <Outlet/>
      </div>
    </>
  )
}

// ── AuthedLayout ──────────────────────────────────────────────────────
// Rota-layout das páginas autenticadas: navegação de verdade pro /login
// (preservando a página de origem em state.from) em vez de só trocar o
// que é renderizado — assim o back/forward do navegador e o retorno pós
// -login funcionam como esperado.
function AuthedLayout() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" state={{ from: location }} replace/>

  return (
    <ThemeProvider>
      <LicencaProvider>
        <PortaoLicenca/>
      </LicencaProvider>
      {/* Dentro do ThemeProvider pra herdar data-theme (claro/escuro) — fora
          daqui as variaveis de cor caem no padrao claro. */}
      <FeedbackWidget/>
    </ThemeProvider>
  )
}

// ── PortaoLicenca ─────────────────────────────────────────────────────
// A conta sem nenhuma licença válida não entra na plataforma: qualquer rota
// vai direto pro perfil, que é a única liberada para consultar a situação das
// licenças. A regra também existe no banco para impedir gravações por fora da
// interface.
function PortaoLicenca() {
  const location = useLocation()
  const { carregando, liberado } = useAcesso()

  if (liberado || location.pathname === '/perfil') return <Outlet/>
  if (carregando) return <div className="flex-1 flex items-center justify-center"><Loader size={32}/></div>
  return <Navigate to="/perfil" replace/>
}

// ── LoginRoute ────────────────────────────────────────────────────────
// Única fonte de verdade pro redirecionamento pós-login: quando `user`
// muda de null pra autenticado, este componente re-renderiza e navega —
// LoginPage não precisa (e não deve) chamar navigate() ela mesma, senão
// as duas navegações competem. Todo login (e-mail/senha ou Google) cai na
// página do perfil, independente da página de origem.
function LoginRoute() {
  const { user } = useAuth()
  if (user) return <Navigate to="/perfil" replace/>
  return <LoginPage/>
}

// Link de recuperação de senha (e-mail): a página fica fora do LoginRoute, que
// mandaria quem tem sessão direto pra /projetos antes de trocar a senha.
function RedefinirSenhaRoute() {
  const navigate = useNavigate()
  return <RedefinirSenhaPage onConcluir={() => navigate('/projetos', { replace: true })}/>
}

// ── AppInner ──────────────────────────────────────────────────────────
// Título da aba conforme a rota ("FireUtils | Página").
function TituloDaAba() {
  const { pathname } = useLocation()
  useEffect(() => {
    const titulo = tituloDaRota(pathname)
    if (titulo) document.title = titulo
  }, [pathname])
  return null
}

function AppInner() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-bg">
        <Loader size={40}/>
      </div>
    )
  }

  return (
    <>
    <TituloDaAba/>
    <Routes>
      <Route path="/landing" element={<LandingPage/>}/>
      <Route path="/pricing" element={<PricingPage/>}/>
      <Route path="/login" element={<LoginRoute/>}/>
      <Route path="/redefinir-senha" element={<RedefinirSenhaRoute/>}/>

      <Route element={<AuthedLayout/>}>
        <Route path="/" element={<Navigate to="/projetos" replace/>}/>
        <Route path="/projetos" element={<ProjetosRoute/>}/>
        <Route path="/perfil" element={<PerfilRoute/>}/>
        <Route path="/assinaturas" element={<AssinaturasRoute/>}/>

        <Route path="/projeto/:id" element={<ProjectLayout/>}>
          <Route index element={<Navigate to="dashboard" replace/>}/>
          <Route path="dashboard" element={<DashboardRoute/>}/>
          <Route path="auditoria" element={<AuditoriaPage/>}/>
          <Route path="config/:step?" element={<ConfigRoute/>}/>
          <Route path="documentos" element={<DocumentosPage/>}/>
          <Route path="documentos/:docId" element={<DocumentosPage/>}/>
          <Route path="medida/:sistKey" element={<MedidaRoute/>}/>
        </Route>

        <Route path="*" element={<Navigate to="/projetos" replace/>}/>
      </Route>
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ProjetoProvider>
          <AuditoriaProvider><AppInner/></AuditoriaProvider>
        </ProjetoProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
