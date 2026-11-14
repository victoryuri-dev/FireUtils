import { useNavigate } from 'react-router-dom'
import { useLicencas } from '../../hooks/useLicencas'
import Icon from '../ui/Icon'

// Tela mostrada no lugar de uma área bloqueada por falta de licença. `titulo`
// e `texto` dizem o que está bloqueado; o botão leva à aba Ferramentas do
// perfil, onde a conta vê a situação de cada módulo.
export default function SemLicenca({ titulo, texto }) {
  const navigate = useNavigate()
  const { erro } = useLicencas()

  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="max-w-[440px] text-center">
        <div className="mx-auto mb-4 w-11 h-11 rounded-full bg-surface border border-solid border-border flex items-center justify-center text-ink-muted">
          <Icon name="lock" size={18}/>
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">{titulo}</h1>
        <p className="text-[13px] text-ink-faint leading-[1.6] mb-5">{erro || texto}</p>
        <button className="btn-primary" onClick={() => navigate('/perfil?aba=licencas')}>
          <Icon name="settings" size={13}/> Ver minhas licenças
        </button>
      </div>
    </div>
  )
}
