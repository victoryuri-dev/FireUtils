import { useState } from 'react'
import { Link } from 'react-router-dom'
import { temAcesso, useLicencas } from '../../hooks/useLicencas'
import { supabase } from '../../lib/supabase'
import { linkDoInstalador } from '../../lib/instaladorPlugin'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'
import ArtePoster from './ArtePoster'

// Pôster de ferramenta do hub: cada uma tem a sua composição (ver ArtePoster).
// Liberada: chamada principal. Bloqueada: o pôster fica apagado, com cadeado e
// caminho para os planos — a conta vê tudo o que existe, não só o que assinou.
function Poster({ id, tag, titulo, descricao, liberado, acao }) {
  return (
    <article className={`poster poster-${id} ${liberado ? '' : 'is-locked'}`}>
      <div className="poster-art"><ArtePoster id={id}/></div>
      <div className="poster-top">
        <span className="poster-tag">{tag}</span>
        {!liberado && <span className="poster-lock" title="Fora da sua licença"><Icon name="lock" size={12}/></span>}
      </div>
      <h3 className="poster-title">{titulo}</h3>
      <div className="poster-foot">
        <p>{descricao}</p>
        {liberado ? acao : (
          <Link to="/pricing" className="poster-btn"><Icon name="right" size={13}/> Ver planos</Link>
        )}
      </div>
    </article>
  )
}

// "Suas ferramentas": todas as ferramentas da plataforma, assinadas ou não.
// Memorial e Assinaturas rodam aqui na Web; Hidrantes e Saídas rodam no Revit,
// pelo plugin (que também vem com o PRO).
export default function FerramentasDisponiveis() {
  const { licencas } = useLicencas()
  const [baixando, setBaixando] = useState(false)
  const [erroPlugin, setErroPlugin] = useState(null)

  if (!licencas) {
    return <div className="flex items-center justify-center py-10"><Loader size={28}/></div>
  }

  const hidrantes = temAcesso(licencas, 'hidrantes')
  const saidas = temAcesso(licencas, 'saidas')

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

  const botaoPlugin = (rotulo = 'Baixar plugin') => (
    <button type="button" className="poster-btn" onClick={baixarPlugin} disabled={baixando}>
      {baixando
        ? <><Icon name="spinner" size={13} className="animate-spin"/> Preparando…</>
        : <><Icon name="download" size={13}/> {rotulo}</>}
    </button>
  )

  return (
    <>
      <div className="poster-grid">
        <Poster
          id="memorial" tag="Plataforma web" titulo="Memorial Descritivo"
          descricao="Cadastre a edificação, defina as medidas e gere o Memorial."
          liberado={temAcesso(licencas, 'memorial')}
          acao={<Link to="/projetos" className="poster-btn"><Icon name="right" size={13}/> Abrir projetos</Link>}
        />
        <Poster
          id="hidrantes" tag="Revit" titulo="Hidrantes"
          descricao="Rede, perdas de carga, pressão e vazão do hidrante crítico."
          liberado={hidrantes}
          acao={botaoPlugin('Instalar plugin')}
        />
        <Poster
          id="saidas" tag="Revit" titulo="Saídas de emergência"
          descricao="População, larguras e distâncias de percurso por pavimento."
          liberado={saidas}
          acao={botaoPlugin('Instalar plugin')}
        />
        <Poster
          id="assinaturas" tag="Plataforma web" titulo="Assinaturas"
          descricao="Assine pranchas e PDFs em lote, com o campo definido uma vez."
          liberado={temAcesso(licencas, 'assinaturas')}
          acao={<Link to="/assinaturas" className="poster-btn"><Icon name="right" size={13}/> Abrir assinaturas</Link>}
        />
        <Poster
          id="plugin" tag="Instalador" titulo="Plugin para Revit"
          descricao="FireUtils no seu modelo, sempre na versão mais recente."
          liberado={hidrantes || saidas}
          acao={botaoPlugin()}
        />
      </div>
      {erroPlugin && (
        <div className="ibox red mt-3" role="alert">
          <Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/>
          <span className="text-xs">{erroPlugin}</span>
        </div>
      )}
    </>
  )
}
