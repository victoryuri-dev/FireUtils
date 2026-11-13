import { useState } from 'react'
import { Link } from 'react-router-dom'
import { temAcesso, useLicencas } from '../../hooks/useLicencas'
import { supabase } from '../../lib/supabase'
import { linkDoInstalador } from '../../lib/instaladorPlugin'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'

// Atalho "Assinaturas" no hub: oculto por enquanto. A ferramenta continua
// acessível em /assinaturas (com login e licença); mude para `true` para mostrar o atalho.
const MOSTRAR_ATALHO_ASSINATURAS = false

// Cartão de ferramenta do hub. Liberado: ação principal. Bloqueado: mostra que
// existe, mas que a licença atual não cobre, com caminho para os planos.
function Ferramenta({ icone, titulo, descricao, liberado, children }) {
  return (
    <article className={`hub-tool ${liberado ? '' : 'is-locked'}`}>
      <div className="hub-tool-icon"><Icon name={liberado ? icone : 'lock'} size={20}/></div>
      <div className="hub-tool-copy">
        <h3>{titulo}</h3>
        <p>{descricao}</p>
      </div>
      <div className="hub-tool-action">
        {liberado ? children : (
          <Link to="/pricing" className="btn-ghost"><Icon name="right" size={13}/> Ver planos</Link>
        )}
      </div>
    </article>
  )
}

// "Suas ferramentas": o ponto de partida do hub. O Memorial roda aqui na
// plataforma; o plugin é para Revit (Hidrantes/Saídas, ou o PRO).
export default function FerramentasDisponiveis() {
  const { licencas } = useLicencas()
  const [baixando, setBaixando] = useState(false)
  const [erroPlugin, setErroPlugin] = useState(null)

  if (!licencas) {
    return <div className="flex items-center justify-center py-10"><Loader size={28}/></div>
  }

  const memorial = temAcesso(licencas, 'memorial')
  const assinaturas = MOSTRAR_ATALHO_ASSINATURAS && temAcesso(licencas, 'assinaturas')
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

  return (
    <div className="hub-tools">
      <Ferramenta
        icone="documentosMedida"
        titulo="Memorial Descritivo"
        descricao="Cadastre a edificação, defina as medidas de segurança e gere o Memorial na plataforma."
        liberado={memorial}
      >
        <Link to="/projetos" className="btn-primary">
          <Icon name="right" size={13}/> Abrir meus projetos
        </Link>
      </Ferramenta>

      <Ferramenta
        icone="download"
        titulo="Plugin para Revit"
        descricao="Hidrantes e Saídas direto no modelo. Baixe o instalador na versão mais recente."
        liberado={plugin}
      >
        <button type="button" className="btn-ghost" onClick={baixarPlugin} disabled={baixando}>
          {baixando
            ? <><Icon name="spinner" size={13} className="animate-spin"/> Preparando…</>
            : <><Icon name="download" size={13}/> Baixar plugin</>}
        </button>
      </Ferramenta>

      {MOSTRAR_ATALHO_ASSINATURAS && (
        <Ferramenta
          icone="signature"
          titulo="Assinaturas"
          descricao="Assine pranchas e documentos em PDF em lote, com o campo de assinatura definido por grupo de arquivos."
          liberado={assinaturas}
        >
          <Link to="/assinaturas" className="btn-ghost">
            <Icon name="right" size={13}/> Abrir assinaturas
          </Link>
        </Ferramenta>
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
