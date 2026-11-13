import { Link } from 'react-router-dom'
import { MODULOS, formatarData, situacaoLicenca, temAcesso, useLicencas } from '../../hooks/useLicencas'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'
import fireutilsMark from '../../assets/fireutils-mark-red.svg'

const TOM = {
  green:  'border-green-border bg-green-dim text-green',
  blue:   'border-blue-border bg-blue-dim text-blue',
  amber:  'border-amber-border bg-amber-dim text-amber',
  red:    'border-red-border bg-red-dim text-red',
  neutro: 'border-border bg-transparent text-ink-faint',
}

function Selo({ tom, children }) {
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-full border border-solid text-[11px] font-semibold whitespace-nowrap ${TOM[tom]}`}>
      {children}
    </span>
  )
}

function Campo({ rotulo, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[.06em] text-ink-faint mb-1">{rotulo}</div>
      <div className="text-[13px] text-ink">{children}</div>
    </div>
  )
}

// Licença do PRO em destaque: é a que libera tudo, então leva plano e validade.
function CartaoPro({ licenca }) {
  const s = situacaoLicenca(licenca)
  return (
    <article className="hub-license-pro">
      <div className="hub-license-pro-head">
        <span className="hub-license-pro-icon"><img src={fireutilsMark} alt="" className="profile-tool-brand-mark"/></span>
        <h3>FireUtils PRO</h3>
        <Selo tom={s.tom}>{s.rotulo}</Selo>
      </div>
      <div className="hub-license-meta">
        <Campo rotulo="Plano">{licenca.plano || '—'}</Campo>
        <Campo rotulo="Início">{formatarData(licenca.inicio_em) || '—'}</Campo>
        <Campo rotulo="Validade">{licenca.expira_em ? formatarData(licenca.expira_em) : 'Sem data de término'}</Campo>
      </div>
      <p className="hub-license-note">{s.detalhe}</p>
    </article>
  )
}

// Módulo em linha compacta: nome, de onde vem o acesso e a validade.
function LinhaModulo({ modulo, licencas }) {
  const licenca = licencas[modulo.key]
  const s = situacaoLicenca(licenca)
  const peloPro = !s.valida
  return (
    <li className="hub-license-row">
      <span className="hub-license-row-icon"><Icon name={modulo.icon} size={16}/></span>
      <div className="hub-license-row-copy">
        <strong>{modulo.nome}</strong>
        <span>{peloPro ? 'Liberado pelo FireUtils PRO' : s.detalhe}</span>
      </div>
      <Selo tom={peloPro ? 'green' : s.tom}>{peloPro ? 'Incluído no PRO' : s.rotulo}</Selo>
    </li>
  )
}

// "Sua licença": o plano que a conta tem hoje e o que ele libera. Módulos
// cobertos pelo PRO aparecem como linhas curtas, não como cartões repetidos.
export default function LicencasAtivas() {
  const { licencas, erro } = useLicencas()

  if (!licencas) {
    return <div className="flex items-center justify-center py-16"><Loader size={32}/></div>
  }

  const ativos = MODULOS.filter(m => temAcesso(licencas, m.key))
  const pro = situacaoLicenca(licencas.pro).valida ? licencas.pro : null
  const modulos = ativos.filter(m => m.key !== 'pro')

  return (
    <div className="hub-licenses">
      {erro && (
        <div className="ibox red mb-5" role="alert">
          <Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/>
          <span className="text-xs">{erro}</span>
        </div>
      )}
      {!erro && pro && <CartaoPro licenca={pro}/>}
      {!erro && modulos.length > 0 && (
        <ul className="hub-license-list">
          {modulos.map(m => <LinhaModulo key={m.key} modulo={m} licencas={licencas}/>)}
        </ul>
      )}
      {!erro && ativos.length === 0 && (
        <div className="profile-empty">
          <p>Esta conta não tem nenhuma licença ativa.</p>
          <Link to="/pricing" className="btn-ghost">Ver planos</Link>
        </div>
      )}
    </div>
  )
}
