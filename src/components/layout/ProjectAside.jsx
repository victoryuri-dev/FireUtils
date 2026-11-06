import { useEffect, useState } from 'react'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import Icon from '../ui/Icon'
import logoFullDark from '../../assets/logo-fireutils-dark.svg'
import { SISTEMAS } from '../../data/sistemasMenu'
import { useProjeto } from '../../context/ProjetoContext'
import { useAuditoria } from '../../context/AuditoriaContext'
import { statusMedida } from '../../utils/statusMedida'

// Lista completa de sistemas — mesma ordem do Step7

const STATUS_MEDIDA = {
  concluida: { cor: '#2fbf8a', texto: 'Concluída' },
  andamento: { cor: '#f2b84b', texto: 'Em andamento' },
}

function NavItem({ pageKey, icon, label, onClick, activePage, collapsed, onNavigate, status }) {
  const active = activePage === pageKey
  return (
    <button
      type="button"
      onClick={onClick || (() => onNavigate(pageKey))}
      title={collapsed ? (status ? `${label} — ${STATUS_MEDIDA[status].texto}` : label) : undefined}
      className={[
        'relative w-full flex items-center gap-2.5 cursor-pointer whitespace-nowrap transition-[background-color,color] duration-100 text-[13px] border-l-2 border-y-0 border-r-0 border-solid',
        collapsed ? 'py-2.5 px-0 justify-center' : 'py-2.5 px-5 justify-start',
        active
          ? 'text-white font-medium bg-[rgba(204,26,50,.18)] border-l-red'
          : 'text-[#b0b0b9] font-normal bg-transparent border-l-transparent hover:bg-[#1a1a20] hover:text-white',
        active && collapsed ? 'border-r-2 border-r-solid border-r-red' : '',
      ].filter(Boolean).join(' ')}
    >
      <Icon name={icon} size={18} className="shrink-0"/>
      {!collapsed && <span className="overflow-hidden text-ellipsis">{label}</span>}
      {status && (
        <span
          role="img"
          aria-label={STATUS_MEDIDA[status].texto}
          title={STATUS_MEDIDA[status].texto}
          className={`shrink-0 w-1.5 h-1.5 rounded-full ${collapsed ? 'absolute top-1.5 right-2.5' : 'ml-auto'}`}
          style={{ background: STATUS_MEDIDA[status].cor }}
        />
      )}
    </button>
  )
}

function SectionLabel({ text, collapsed }) {
  if (collapsed) return null
  return <div className="text-[10px] text-[#777781] px-5 pt-3 pb-1 tracking-[.08em] uppercase whitespace-nowrap">{text}</div>
}

// Último estado do menu lateral (recolhido/aberto), lembrado no navegador.
const CHAVE_MENU = 'fireutils:menu-lateral-recolhido'
function lerMenuRecolhido() {
  try { return localStorage.getItem(CHAVE_MENU) === '1' } catch { return false }
}
function salvarMenuRecolhido(valor) {
  try { localStorage.setItem(CHAVE_MENU, valor ? '1' : '0') } catch { /* sem armazenamento: só não lembra */ }
}

export default function ProjectAside({ activePage, onNavigate }) {
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const { state } = useProjeto()
  const { pendencias } = useAuditoria()
  // Telas estreitas sempre abrem recolhidas (sem sobrescrever a preferência salva);
  // nas demais vale a última escolha do usuário.
  const [col, setCol] = useState(() => window.matchMedia('(max-width: 720px)').matches || lerMenuRecolhido())
  const definirRecolhido = valor => { setCol(valor); salvarMenuRecolhido(valor) }

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 720px)')
    const collapseOnMobile = event => { if (event.matches) setCol(true) }
    mobile.addEventListener('change', collapseOnMobile)
    return () => mobile.removeEventListener('change', collapseOnMobile)
  }, [])

  // `ativo` já cai para `obrigatorio` sem toggle manual; medida desativada
  // pelo RT (isenção manual) sai do menu; a isenção pelos próprios dados do
  // projeto (`isento`, ex.: compartimentação por área) continua nele.
  const enabledSystems = SISTEMAS.filter(s => sistemas[s.key]?.ativo || sistemas[s.key]?.isento)

  const itemProps = { activePage, collapsed: col, onNavigate }

  return (
    <aside className={`shrink-0 border-r border-solid border-[#2b2b32] bg-[#101014] text-white flex flex-col overflow-hidden transition-[width] duration-200 ${col ? 'w-14' : 'w-60'}`}>

      {/* Marca + toggle colapso */}
      <div className="p-2 shrink-0">
        {col ? (
          <button
            onClick={() => { if (!window.matchMedia('(max-width: 720px)').matches) definirRecolhido(false) }}
            title={window.matchMedia('(max-width: 720px)').matches ? 'Fire Utils' : 'Expandir menu'}
            className="w-full h-12 flex items-center justify-center rounded-lg hover:bg-[#1a1a20] transition-colors cursor-pointer"
          >
            <span className="block w-7 h-8 overflow-hidden" aria-hidden="true">
              <img src={logoFullDark} alt="" className="h-8 w-auto max-w-none"/>
            </span>
            <span className="sr-only">FireUtils</span>
          </button>
        ) : (
          <div className="h-12 flex items-center justify-between gap-2 pl-1 pr-1">
            <img src={logoFullDark} alt="FireUtils" className="h-8 w-auto"/>
            <button
              onClick={() => definirRecolhido(true)}
              title="Retrair menu"
              className="w-6 h-6 flex items-center justify-center rounded-md text-[#85858f] hover:bg-[#1a1a20] hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <Icon name="panelLeft" size={15}/>
            </button>
          </div>
        )}
      </div>

      {/* Navegação principal */}
      <div className="py-1.5 border-b border-solid border-[#2b2b32] shrink-0">
        <NavItem pageKey="dashboard" icon="dash"     label="Dashboard" {...itemProps}/>
        <NavItem pageKey="config"    icon="settings" label="Configuração" {...itemProps}/>
      </div>

      {/* Medidas de segurança + Documentos */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {enabledSystems.length > 0 && (
          <>
            <SectionLabel text="Medidas de segurança" collapsed={col}/>
            {enabledSystems.map(s => (
              <NavItem key={s.key} pageKey={`medida-${s.key}`} icon={s.icon} label={s.label} status={statusMedida(s.key, { state, porEstrutura, pendencias })} {...itemProps}/>
            ))}
          </>
        )}

        <div className="border-t border-solid border-[#2b2b32] mt-1.5"/>
        <SectionLabel text="Documentos" collapsed={col}/>
        <NavItem pageKey="documentos" icon="documentosMedida" label="Documentos" {...itemProps}/>
      </div>

    </aside>
  )
}
