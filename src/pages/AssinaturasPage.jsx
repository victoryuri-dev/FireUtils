import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useAcesso } from '../hooks/useLicencas'
import { liberarPdf } from '../lib/pdfjs'
import {
  estadoInicial, reducer, novoId, grupoAtivo, arquivosDoGrupo,
} from '../utils/assinaturas/grupos'
import ListaGrupos from '../components/assinaturas/ListaGrupos'
import SecaoCertificados from '../components/assinaturas/SecaoCertificados'
import { useCertificadosSalvos } from '../hooks/useCertificadosSalvos'
import { useSoltarArquivos } from '../hooks/useSoltarArquivos'
import PainelCampo from '../components/assinaturas/PainelCampo'
import SecaoGrupo from '../components/assinaturas/SecaoGrupo'
import ProvedorArrastar from '../components/assinaturas/ProvedorArrastar'
import SemLicenca from '../components/perfil/SemLicenca'
import Loader from '../components/ui/Loader'
import Icon from '../components/ui/Icon'

// O diálogo traz a criptografia e a escrita de PDF (pdf-lib, node-forge, fflate):
// só é baixado quando a pessoa clica em Assinar.
const ModalAssinar = lazy(() => import('../components/assinaturas/ModalAssinar'))
const ModalCertificado = lazy(() => import('../components/assinaturas/ModalCertificado'))

function FerramentaAssinaturas() {
  const [estado, dispatch] = useReducer(reducer, undefined, () => estadoInicial())
  // Arquivo de referência de cada grupo: { [grupoId]: arquivoId }.
  const [refs, setRefs] = useState({})
  const [medidas, setMedidas] = useState({ geometria: null, total: null })
  const [assinando, setAssinando] = useState(false)
  // Nome do último certificado escolhido: a prévia do selo passa a mostrá-lo.
  const [titularLido, setTitularLido] = useState(undefined)
  // Certificados salvos na conta; o selecionado é o usado ao assinar.
  const certificados = useCertificadosSalvos()
  // A lateral direita ocupa 300 px à direita (a partir de lg). Declara isso para o botão
  // flutuante de feedback (FeedbackWidget) ficar ao lado dela, e não por cima do botão de assinar.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.style.setProperty('--feedback-direita', '300px')
    return () => raiz.style.removeProperty('--feedback-direita')
  }, [])
  const [adicionandoCert, setAdicionandoCert] = useState(false)
  // A prévia do selo mostra o nome do certificado selecionado (ou do último que foi lido).
  const titularPrevia = certificados.selecionado?.titular ?? titularLido

  const grupo = grupoAtivo(estado)
  const arquivos = useMemo(() => arquivosDoGrupo(estado, grupo.id), [estado, grupo.id])

  const adicionar = useCallback((arquivos, grupoId) => {
    const lista = arquivos.map(f => ({ id: novoId(), nome: f.name, tamanho: f.size, arquivo: f }))
    dispatch({ type: 'ADICIONAR_ARQUIVOS', arquivos: lista, grupoId })
  }, [])

  const remover = useCallback(ids => {
    for (const a of estado.arquivos) if (ids.includes(a.id)) liberarPdf(a.arquivo)
    dispatch({ type: 'REMOVER_ARQUIVOS', ids })
  }, [estado.arquivos])

  const mudarCampo = useCallback((grupoId, campo) => dispatch({ type: 'DEFINIR_CAMPO', id: grupoId, campo }), [])
  const escolherRef = useCallback((grupoId, arquivoId) => setRefs(r => ({ ...r, [grupoId]: arquivoId })), [])
  const ativar = useCallback(id => dispatch({ type: 'SELECIONAR_GRUPO', id }), [])
  const alternarSelecao = useCallback(id => dispatch({ type: 'ALTERNAR_SELECAO', id }), [])
  const mover = useCallback((ids, grupoId) => dispatch({ type: 'MOVER_ARQUIVOS', ids, grupoId }), [])

  // A referência só reporta a geometria quando muda; evita laço de render.
  const aoMedir = useCallback((geometria, total) => {
    setMedidas(m => (m.geometria === geometria && m.total === total ? m : { geometria, total }))
  }, [])

  // PDFs soltos do computador: entram no grupo sob o mouse, que passa a ser o grupo em edição.
  const aoSoltarArquivos = useCallback((arquivos, grupoId) => {
    adicionar(arquivos, grupoId)
    dispatch({ type: 'SELECIONAR_GRUPO', id: grupoId })
  }, [adicionar])
  const { alvo: alvoDeArquivos, propsDoAlvo, propsDoFundo } = useSoltarArquivos(aoSoltarArquivos)
  const soltarNoGrupo = grupoId => ({ alvo: alvoDeArquivos === grupoId, props: propsDoAlvo(grupoId) })

  const semArquivos = estado.arquivos.length === 0

  return (
    <ProvedorArrastar arquivos={estado.arquivos} selecionados={estado.selecionados} onMover={mover}>
    <div
      className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-bg"
      {...propsDoFundo}
    >
      <aside className="lg:w-[320px] shrink-0 lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-solid border-border bg-surface p-4" aria-label="Grupos e arquivos">
        <ListaGrupos
          estado={estado}
          dispatch={dispatch}
          soltar={soltarNoGrupo}
          onAdicionar={adicionar}
          onRemoverArquivos={remover}
          onNovoGrupo={() => dispatch({ type: 'CRIAR_GRUPO', id: novoId() })}
        />
      </aside>

      <main className="shrink-0 lg:shrink lg:flex-1 min-w-0 lg:overflow-y-auto p-4 sm:p-6 relative">
        <header className="mb-5">
          <h1 className="m-0 font-heading text-[22px] font-semibold text-ink tracking-[-0.02em]">Assinaturas em lote</h1>
        </header>

        {semArquivos ? (
          <div
            {...propsDoAlvo(grupo.id)}
            className={`grid place-items-center text-center rounded-lg border-2 border-dashed px-6 py-16 transition-colors ${alvoDeArquivos === grupo.id ? 'border-red bg-red-dim' : 'border-border bg-surface'}`}
          >
            <div className="pointer-events-none">
              <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-surface-2 grid place-items-center text-ink-muted"><Icon name="upload" size={18}/></div>
              <p className="m-0 mb-1 text-[14px] font-semibold text-ink">Solte os PDFs aqui</p>
              <p className="m-0 text-[12px] text-ink-faint">ou use “Adicionar PDFs” na lateral. Pranchas e demais documentos, de uma vez.</p>
            </div>
          </div>
        ) : (
          // Até 2 grupos por linha. Cada box tem no mínimo 680 px: se a área não comporta
          // dois, os grupos passam para uma coluna só (o min() com 100% cobre telas estreitas).
          <div
            className="grid gap-6 items-start"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, max(680px, calc(50% - 12px))), 1fr))' }}
          >
            {estado.grupos.map(g => (
              <SecaoGrupo
                key={g.id}
                grupo={g}
                arquivos={arquivosDoGrupo(estado, g.id)}
                ativo={g.id === grupo.id}
                refId={refs[g.id]}
                selecionados={estado.selecionados}
                titularPrevia={titularPrevia}
                soltar={soltarNoGrupo(g.id)}
                onEscolherRef={escolherRef}
                onAlternarSelecao={alternarSelecao}
                onAtivar={ativar}
                onCampo={mudarCampo}
                onGeometria={aoMedir}
              />
            ))}
          </div>
        )}
      </main>

      {/* Sempre presente quando há arquivos: se o painel aparecesse e sumisse ao
          trocar de grupo, a largura da área central mudaria no meio de um arrasto. */}
      {/* Lateral direita: ajustes do grupo em edição, certificado e o botão de assinar. Fica
          sempre montada (também sem arquivos), para a largura da área central não mudar no
          meio de um arrasto. O botão fica fixo no rodapé, sempre à vista. */}
      <aside
        className="lg:w-[300px] shrink-0 lg:overflow-y-auto flex flex-col border-t lg:border-t-0 lg:border-l border-solid border-border bg-surface px-4 pt-4 pb-0"
        aria-label="Ajustes e assinatura"
      >
        <div className="flex flex-col gap-4 flex-1 pb-4">
          {!semArquivos && (arquivos.length > 0 ? (
            <PainelCampo
              grupo={grupo}
              geometria={medidas.geometria}
              onCampo={campo => mudarCampo(grupo.id, campo)}
              onPagina={pagina => dispatch({ type: 'DEFINIR_PAGINA', id: grupo.id, pagina })}
              onSelo={selo => dispatch({ type: 'DEFINIR_SELO', id: grupo.id, selo })}
            />
          ) : (
            <p className="m-0 text-[12px] text-ink-faint">O grupo “{grupo.nome}” está vazio. Arraste arquivos para ele para posicionar o campo.</p>
          ))}
          <SecaoCertificados certificados={certificados} onAdicionar={() => setAdicionandoCert(true)}/>
        </div>
        <div className="sticky bottom-0 -mx-4 mt-4 bg-surface border-t border-solid border-border-2">
          <div className="px-4 pt-3 pb-0">
            <button
              type="button"
              className="btn-primary w-full justify-center h-10"
              disabled={semArquivos}
              title={semArquivos ? 'Adicione PDFs para assinar' : undefined}
              onClick={() => setAssinando(true)}
            >
              <Icon name="signature" size={14}/> Assinar{semArquivos ? '' : ` ${estado.arquivos.length} ${estado.arquivos.length === 1 ? 'arquivo' : 'arquivos'}`}
            </button>
          </div>
        </div>
      </aside>
      {assinando && (
        <Suspense fallback={null}>
          <ModalAssinar
            grupos={estado.grupos}
            arquivos={estado.arquivos}
            certificados={certificados}
            onTitular={setTitularLido}
            onFechar={() => setAssinando(false)}
          />
        </Suspense>
      )}
      {adicionandoCert && (
        <Suspense fallback={null}>
          <ModalCertificado certificados={certificados} onFechar={() => setAdicionandoCert(false)}/>
        </Suspense>
      )}
    </div>
    </ProvedorArrastar>
  )
}

export default function AssinaturasPage() {
  const acesso = useAcesso('assinaturas')
  if (acesso.carregando) {
    return <div className="flex-1 flex items-center justify-center"><Loader size={32}/></div>
  }
  if (!acesso.liberado) {
    return (
      <SemLicenca
        titulo="Assinaturas fazem parte de um módulo próprio"
        texto="Assinar PDFs em lote exige a licença do módulo Assinaturas ou do FireUtils PRO."
      />
    )
  }
  return <FerramentaAssinaturas/>
}
