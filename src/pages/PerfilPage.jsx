import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePerfil, nomeDeUsuario, temDadosRT } from '../hooks/usePerfil'
import FormSection from '../components/ui/FormSection'
import Icon from '../components/ui/Icon'
import Loader from '../components/ui/Loader'
import FerramentasDisponiveis from '../components/perfil/FerramentasDisponiveis'
import LicencasAtivas from '../components/perfil/LicencasAtivas'
import PrimeirosPassos from '../components/perfil/PrimeirosPassos'
import CampoRubrica from '../components/perfil/CampoRubrica'
import CampoConselho from '../components/ui/CampoConselho'
import './PerfilPage.css'


// O perfil é o hub da conta: "Início" (ferramentas e módulos, primeiros passos),
// "Licenças" (o plano e o que ele libera) e "Meus dados" (formulário). A aba vive
// na URL (?aba=dados) para poder ser linkada; qualquer outro valor — inclusive o
// antigo `ferramentas` — é o início.
const ABAS = [
  { id: 'inicio', rotulo: 'Início' },
  { id: 'licencas', rotulo: 'Licenças' },
  { id: 'dados', rotulo: 'Meus dados' },
]

export default function PerfilPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(a => a.id === params.get('aba')) ? params.get('aba') : 'inicio'
  const irPara = id => setParams(id === 'inicio' ? {} : { aba: id }, { replace: true })
  const { perfil, erro, salvar } = usePerfil()
  // Copia local pro formulario: o usuario edita a vontade e so o botao grava.
  // `null` ate o perfil chegar — e o que segura o Loader abaixo.
  const [form, setForm] = useState(null)
  const [salvando, setSalvando] = useState(false)
  // Retorno do salvamento, ao lado do botão (toasts ficam reservados ao
  // retorno das importações do Revit).
  const [retorno, setRetorno] = useState(null) // { ok, texto }

  useEffect(() => { if (perfil) setForm(perfil) }, [perfil])

  const setConta = campo => e => {
    const { value } = e.target
    setForm(f => ({ ...f, [campo]: value }))
  }
  const setRT = campo => e => {
    const { value } = e.target
    setForm(f => ({ ...f, responsavelTecnico: { ...f.responsavelTecnico, [campo]: value } }))
  }

  const handleSalvar = async () => {
    setSalvando(true)
    setRetorno(null)
    const r = await salvar(form)
    setSalvando(false)
    setRetorno(r.ok ? { ok: true, texto: 'Perfil salvo.' } : { ok: false, texto: r.erro })
  }

  const rt = form?.responsavelTecnico
  // Mesmo nome de usuário do header — o já salvo, não o que está sendo digitado.
  const nomeSalvo = nomeDeUsuario(perfil, user, 'Usuário')

  return (
    <div className="profile-overview-shell">
      <div className="profile-overview-scroll">
        <main className="profile-overview">
          <header className="profile-overview-header">
            <div>
              <h1>Olá, {nomeSalvo}.</h1>
              <p>Seu painel FireUtils: ferramentas, licença e dados da conta num só lugar.</p>
            </div>
          </header>

          <nav className="hub-tabs" role="tablist" aria-label="Seções do perfil">
            {ABAS.map(a => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                className={aba === a.id ? 'is-active' : ''}
                onClick={() => irPara(a.id)}
              >{a.rotulo}</button>
            ))}
          </nav>

          {aba === 'inicio' && (
            <div className="hub-home">
              {perfil && !temDadosRT(perfil.responsavelTecnico) && (
                <PrimeirosPassos onDados={() => irPara('dados')}/>
              )}
              <FerramentasDisponiveis/>
            </div>
          )}

          {aba === 'licencas' && (
            <section className="hub-home" aria-labelledby="hub-license-title">
              <div className="profile-section-heading"><h2 id="hub-license-title">Sua licença</h2></div>
              <LicencasAtivas/>
            </section>
          )}

          {aba === 'dados' && (
            <section className="profile-data-column" aria-label="Seus dados">

          {!form && (
            <div className="flex items-center justify-center py-16"><Loader size={32}/></div>
          )}

          {form && (<>

          {erro && (
            <div className="ibox red mb-5" role="alert">
              <Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/>
              <span className="text-xs">{erro}</span>
            </div>
          )}

          <FormSection title="Conta">
            <div className="profile-identity" aria-label="Conta atual">
              <span className="profile-identity-icon"><Icon name="user" size={18}/></span>
              <div><strong>{nomeSalvo}</strong><span>{user?.email || '—'}</span></div>
            </div>
            <div className="g2">
              <div className="fg"><label>Nome</label>
                <input value={form.nome} onChange={setConta('nome')}/>
              </div>
              <div className="fg"><label>Telefone</label>
                <input type="tel" value={form.telefone} onChange={setConta('telefone')}/>
              </div>
            </div>
          </FormSection>

          <FormSection title="Responsável técnico">
            <div className="g2 mb-3">
              <div className="fg"><label>Nome completo</label>
                <input value={rt.rtNome} onChange={setRT('rtNome')}/>
              </div>
              <CampoConselho tipo={rt.rtConselhoTipo} numero={rt.rtConselho} onTipo={setRT('rtConselhoTipo')} onNumero={setRT('rtConselho')}/>
            </div>
            <div className="g2 mb-3">
              <div className="fg"><label>CPF</label>
                <input value={rt.rtCpf} onChange={setRT('rtCpf')} placeholder="000.000.000-00"/>
              </div>
              <div className="fg"><label htmlFor="rt-especialidade">Especialidade</label>
                <input id="rt-especialidade" type="text" value={rt.rtEspecialidade} onChange={setRT('rtEspecialidade')}/>
              </div>
            </div>
            <div className="fg mb-3">
              <label>Empresa / Escritório</label>
              <input value={rt.rtEmpresa} onChange={setRT('rtEmpresa')}/>
            </div>
            <div className="g2">
              <div className="fg"><label>E-mail</label>
                <input type="email" value={rt.rtEmail} onChange={setRT('rtEmail')}/>
              </div>
              <div className="fg"><label>Telefone</label>
                <input type="tel" value={rt.rtTelefone} onChange={setRT('rtTelefone')}/>
              </div>
            </div>
          </FormSection>

          <FormSection title="Rubrica" description="Salva na hora, sem precisar do botão abaixo.">
            <CampoRubrica/>
          </FormSection>

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={handleSalvar} disabled={salvando}>
              {salvando
                ? <><Icon name="spinner" size={13} className="animate-spin"/> Salvando...</>
                : <><Icon name="save" size={13}/> Salvar perfil</>}
            </button>
            {retorno && (
              <span className={`flex items-center gap-1.5 text-xs ${retorno.ok ? 'text-green' : 'text-red'}`} role={retorno.ok ? 'status' : 'alert'}>
                <Icon name={retorno.ok ? 'check' : 'warn'} size={13}/>
                {retorno.texto}
              </span>
            )}
          </div>

          </>)}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
