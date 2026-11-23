import { useRef } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { textoMemorialCalculoHidrantes } from '../../data/memorial/hidrantesCalculo'
import { useZoomDocumento } from '../../hooks/useZoomDocumento'
import { BarraZoom, JanelaDocumento } from '../../components/documentos/ZoomDocumento'
import PreviewPaginado from '../../components/documentos/PreviewPaginado'
import Icon from '../../components/ui/Icon'
import Loader from '../../components/ui/Loader'
import SemLicenca from '../../components/perfil/SemLicenca'
import { useAcesso } from '../../hooks/useLicencas'
import { exportarWord, imprimirComNome } from '../../utils/exportarWord'
import { SecaoMedida, FOLHA, CSS_PAGINA } from './MemorialDescritivoPage'

// Memorial de cálculo do Sistema de Hidrantes (marcha hidráulica narrada a
// partir do dimensionamento do plugin Revit) como documento próprio — usado
// no projeto "Dimensionamento de hidrantes", que não tem memorial descritivo.
// Mesmo conteúdo da última folha do memorial descritivo (memorial/
// hidrantesCalculo.js), aqui com uma capa simples.
function Capa({ state }) {
  return (
    <div className={`${FOLHA} memorial-pretextual`}>
      <div className="text-center my-auto py-16">
        <h1 className="capa-titulo font-heading font-bold text-black uppercase">
          Memorial de Cálculo — Sistema de Hidrantes
        </h1>
      </div>
      <div className="text-center text-[12px] text-black flex flex-col gap-1.5 pb-8">
        {state.nome && <div>{state.nome}</div>}
        {state.uf && <div>{state.uf}</div>}
      </div>
    </div>
  )
}

export default function MemorialCalculoPage({ onBack }) {
  const { state } = useProjeto()
  const acesso = useAcesso('memorial')
  const rolagemRef = useRef(null)
  const zoomDoc = useZoomDocumento(rolagemRef)
  const { zoom, maximizado, setMaximizado } = zoomDoc
  const secao = textoMemorialCalculoHidrantes(state)
  const nomeArquivo = `Memorial de Cálculo Hidrantes - ${(state.nome || '').trim() || 'Sem nome'}`.replace(/[\\/:*?"<>|]+/g, '-')

  if (acesso.carregando) return <div className="flex-1 flex items-center justify-center"><Loader size={32}/></div>
  if (!acesso.liberado) {
    return (
      <SemLicenca
        titulo="O memorial de cálculo faz parte do módulo Memorial"
        texto="Gerar o memorial exige a licença do módulo Memorial ou do FireUtils PRO."
      />
    )
  }

  return (
    <JanelaDocumento maximizado={maximizado} onFechar={() => setMaximizado(false)} className="flex flex-col flex-1 overflow-hidden bg-none">
      <div className="no-print shrink-0 flex items-center justify-between py-3 px-8 border-b border-solid border-border bg-none">
        <button className="btn-ghost" onClick={onBack}><Icon name="left" size={13}/> Voltar</button>
        <BarraZoom {...zoomDoc}/>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => exportarWord(rolagemRef.current, nomeArquivo)} title="Baixar o memorial como documento do Word (.doc)">
            <Icon name="download" size={13}/> Salvar Word
          </button>
          <button className="btn-primary" onClick={() => imprimirComNome(nomeArquivo)}>
            <Icon name="file" size={13}/> Imprimir / Salvar PDF
          </button>
        </div>
      </div>
      <div className="relative print:static flex-1 min-h-0 flex flex-col">
        <div ref={rolagemRef} className="flex-1 overflow-auto py-8 flex flex-col" style={{ '--memorial-zoom': zoom }}>
          <PreviewPaginado css={CSS_PAGINA}>
            <Capa state={state}/>
            <SecaoMedida secao={secao} numeroSecao={1} state={state} ultima={false}/>
          </PreviewPaginado>
        </div>
      </div>
    </JanelaDocumento>
  )
}
