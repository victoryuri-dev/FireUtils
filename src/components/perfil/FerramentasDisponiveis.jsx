import { useState } from 'react'
import { Link } from 'react-router-dom'
import { temAcesso, useLicencas } from '../../hooks/useLicencas'
import { supabase } from '../../lib/supabase'
import { linkDoInstalador } from '../../lib/instaladorPlugin'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'

function Atalho({ icone, titulo, descricao, children }) {
  return (
    <article className="profile-shortcut">
      <div className="profile-tool-icon"><Icon name={icone} size={18}/></div>
      <div className="profile-shortcut-copy">
        <h3>{titulo}</h3>
        <p>{descricao}</p>
      </div>
      <div className="profile-shortcut-action">{children}</div>
    </article>
  )
}

// Seção "Ferramentas disponíveis" do perfil: atalhos para o que a conta pode
// usar — só aparecem os que a licença libera. O plugin é para Revit
// (Hidrantes/Saídas, ou o PRO); o Memorial roda aqui na plataforma.
export default function FerramentasDisponiveis() {
  const { licencas } = useLicencas()
  const [baixando, setBaixando] = useState(false)
  const [erroPlugin, setErroPlugin] = useState(null)

  if (!licencas) {
    return <div className="flex items-center justify-center py-10"><Loader size={28}/></div>
  }

  const memorial = temAcesso(licencas, 'memorial')
  const assinaturas = temAcesso(licencas, 'assinaturas')
  const plugin = temAcesso(licencas, 'hidrantes') || temAcesso(licencas, 'saidas')

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

  if (!memorial && !plugin && !assinaturas) {
    return <p className="profile-empty-text">Nenhuma ferramenta liberada. Assim que uma licença estiver ativa, os atalhos aparecem aqui.</p>
  }

  return (
    <div className="profile-shortcuts">
      {memorial && (
        <Atalho
          icone="documentosMedida"
          titulo="Memorial"
          descricao="Cadastre a edificação e gere o Memorial Descritivo na plataforma."
        >
          <Link to="/projetos" className="btn-ghost">
            <Icon name="right" size={13}/> Abrir plataforma
          </Link>
        </Atalho>
      )}
      {assinaturas && (
        <Atalho
          icone="signature"
          titulo="Assinaturas"
          descricao="Assine pranchas e documentos em PDF em lote, com o campo de assinatura definido por grupo de arquivos."
        >
          <Link to="/assinaturas" className="btn-ghost">
            <Icon name="right" size={13}/> Abrir assinaturas
          </Link>
        </Atalho>
      )}
      {plugin && (
        <Atalho
          icone="download"
          titulo="Plugin para Revit"
          descricao="Instalador do Fire Utils (Hidrantes e Saídas) na versão mais recente."
        >
          <button type="button" className="btn-ghost" onClick={baixarPlugin} disabled={baixando}>
            {baixando
              ? <><Icon name="spinner" size={13} className="animate-spin"/> Preparando…</>
              : <><Icon name="download" size={13}/> Baixar plugin</>}
          </button>
        </Atalho>
      )}
      {erroPlugin && (
        <div className="ibox red" role="alert">
          <Icon name="warn" size={13} color="var(--color-red)" className="shrink-0"/>
          <span className="text-xs">{erroPlugin}</span>
        </div>
      )}
    </div>
  )
}
