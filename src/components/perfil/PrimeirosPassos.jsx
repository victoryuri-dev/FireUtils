import { Link } from 'react-router-dom'
import Icon from '../ui/Icon'

// Guia para quem acabou de criar a conta: some assim que os dados do
// responsável técnico estão preenchidos (eles entram sozinhos nos memoriais).
export default function PrimeirosPassos({ onDados }) {
  return (
    <section className="hub-steps" aria-label="Primeiros passos">
      <h2>Por onde começar</h2>
      <ol>
        <li>
          <span className="hub-step-n">1</span>
          <div>
            <strong>Preencha seus dados</strong>
            <p>Responsável técnico e rubrica entram automaticamente em cada memorial.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onDados}>Preencher</button>
        </li>
        <li>
          <span className="hub-step-n">2</span>
          <div>
            <strong>Crie seu primeiro projeto</strong>
            <p>Cadastre a edificação e gere o Memorial Descritivo.</p>
          </div>
          <Link to="/projetos" className="btn-ghost"><Icon name="right" size={13}/> Abrir projetos</Link>
        </li>
      </ol>
    </section>
  )
}
