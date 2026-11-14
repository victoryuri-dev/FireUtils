import { useState } from 'react'
import { Link } from 'react-router-dom'
import { temAcesso, useLicencas } from '../../hooks/useLicencas'
import { supabase } from '../../lib/supabase'
import { linkDoInstalador } from '../../lib/instaladorPlugin'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'
import ArtePoster from './ArtePoster'

// Pôster do hub: a arte (badge + título) vem pronta; aqui entram só a descrição,
// que sobe no hover, e o botão. Sem licença, o botão vira "Liberar Módulo" e o
// cadeado abre no hover. `claro`: arte clara, então o botão em repouso é escuro.
function Poster({ id, titulo, descricao, claro = false, liberado, acao, rotuloBloqueado = 'Ver planos' }) {
  return (
    <article className={`poster ${claro ? 'is-claro' : ''} ${liberado ? '' : 'is-locked'}`}>
      <div className="poster-art"><ArtePoster id={id} titulo={titulo}/></div>
      <h3 className="sr-only">{titulo}</h3>
      <div className="poster-foot">
        <p>{descricao}</p>
        {liberado ? acao : (
          <Link to="/pricing" className="poster-btn">
            <Icon name="lock" size={14} className="poster-ico-fechado"/>
            <Icon name="lockOpen" size={14} className="poster-ico-aberto"/>
            {rotuloBloqueado}
          </Link>
        )}
      </div>
    </article>
  )
}

function Secao({ id, titulo, children }) {
  return (
    <section aria-labelledby={id}>
      <div className="profile-section-heading"><h2 id={id}>{titulo}</h2></div>
      {children}
    </section>
  )
}

// Hub de ferramentas e módulos. Ferramentas: o que roda na plataforma e o
// plugin. Módulos: o que roda dentro do Revit (Hidrantes, Saídas) e a
// biblioteca. Aparece tudo, assinado ou não.
export default function FerramentasDisponiveis() {
  const { licencas } = useLicencas()
  const [baixando, setBaixando] = useState(false)
  const [erroPlugin, setErroPlugin] = useState(null)

  if (!licencas) {
    return <div className="flex items-center justify-center py-10"><Loader size={28}/></div>
  }

  async function baixarPlugin() {
    setBaixando(true)
    setErroPlugin(null)
    const r = await linkDoInstalador(supabase)
    setBaixando(false)
    if (!r.ok) {
      setErroPlugin(r.erro)
      return
    }
    // Link assinado com `download`: o navegador baixa sem sair da página.
    window.location.assign(r.url)
  }

  const botaoPlugin = (
    <button type="button" className="poster-btn" onClick={baixarPlugin} disabled={baixando}>
      {baixando
        ? <><Icon name="spinner" size={14} className="animate-spin"/> Preparando…</>
        : <><Icon name="download" size={14}/> Baixar plugin</>}
    </button>
  )
  const ir = (to, rotulo) => (
    <Link to={to} className="poster-btn"><Icon name="right" size={14}/> {rotulo}</Link>
  )

  const hidrantes = temAcesso(licencas, 'hidrantes')
  const saidas = temAcesso(licencas, 'saidas')

  return (
    <div className="hub-catalogo">
      <Secao id="hub-ferramentas" titulo="Ferramentas">
        <div className="poster-grid">
          <Poster
            id="memorial" titulo="Memorial Descritivo Automático"
            descricao="Cadastre a edificação, e gere o Memorial automaticamente."
            liberado={temAcesso(licencas, 'memorial')}
            acao={ir('/projetos', 'Ir para Projetos')}
          />
          <Poster
            id="assinaturas" titulo="Assinaturas em lote" claro
            descricao="Assine várias pranchas e PDFs com um só clique."
            liberado={temAcesso(licencas, 'assinaturas')}
            acao={ir('/assinaturas', 'Ir para Assinaturas')}
          />
          <Poster
            id="plugin" titulo="Plugin para Revit"
            descricao="FireUtils conectando Modelo, Cálculo e Memorial no Revit."
            liberado={hidrantes || saidas}
            acao={botaoPlugin}
          />
        </div>
      </Secao>

      <Secao id="hub-modulos" titulo="Módulos">
        <div className="poster-grid">
          <Poster
            id="hidrantes" titulo="Modelagem e cálculo de hidrantes no Revit"
            descricao="Dimensione e modele sistemas de hidrantes e bombas com ferramentas automáticas."
            liberado={hidrantes} rotuloBloqueado="Liberar Módulo"
            acao={botaoPlugin}
          />
          <Poster
            id="saidas" titulo="Cálculo de população no Revit"
            descricao="Calcule a população por pavimento e dimensione larguras e rotas de saída."
            liberado={saidas} rotuloBloqueado="Liberar Módulo"
            acao={botaoPlugin}
          />
          {/* Ainda sem licença própria em MODULOS: fica bloqueado até existir. */}
          <Poster
            id="biblioteca" titulo="Biblioteca de famílias" claro
            descricao="Carregue famílias Revit para dentro do seu template."
            liberado={false} rotuloBloqueado="Liberar Módulo"
          />
        </div>
      </Secao>

      {erroPlugin && (
        <div className="ibox red" role="alert">
          <Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/>
          <span className="text-xs">{erroPlugin}</span>
        </div>
      )}
    </div>
  )
}
