import { useCallback, useMemo, useReducer, useState } from 'react'
import { useAcesso } from '../hooks/useLicencas'
import { liberarPdf } from '../lib/pdfjs'
import {
  estadoInicial, reducer, novoId, grupoAtivo, arquivosDoGrupo,
} from '../utils/assinaturas/grupos'
import ListaGrupos from '../components/assinaturas/ListaGrupos'
import PainelCampo from '../components/assinaturas/PainelCampo'
import SecaoGrupo from '../components/assinaturas/SecaoGrupo'
import ProvedorArrastar from '../components/assinaturas/ProvedorArrastar'
import SemLicenca from '../components/perfil/SemLicenca'
import Loader from '../components/ui/Loader'
import Icon from '../components/ui/Icon'

function FerramentaAssinaturas() {
  const [estado, dispatch] = useReducer(reducer, undefined, () => estadoInicial())
  // Arquivo de referência de cada grupo: { [grupoId]: arquivoId }.
  const [refs, setRefs] = useState({})
  const [arrastando, setArrastando] = useState(false)
  const [medidas, setMedidas] = useState({ geometria: null, total: null })

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

  function aoSoltar(e) {
    e.preventDefault()
    setArrastando(false)
    adicionar(Array.from(e.dataTransfer.files), grupo.id)
  }

  const semArquivos = estado.arquivos.length === 0

  return (
    <ProvedorArrastar arquivos={estado.arquivos} selecionados={estado.selecionados} onMover={mover}>
    <div
      className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-bg"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setArrastando(false) }}
      onDrop={aoSoltar}
    >
      <aside className="lg:w-[320px] shrink-0 lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-solid border-border bg-surface p-4" aria-label="Grupos e arquivos">
        <ListaGrupos
          estado={estado}
          dispatch={dispatch}
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
          <div className="grid place-items-center text-center rounded-lg border-2 border-dashed border-border bg-surface px-6 py-16">
            <div>
              <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-surface-2 grid place-items-center text-ink-muted"><Icon name="upload" size={18}/></div>
              <p className="m-0 mb-1 text-[14px] font-semibold text-ink">Solte os PDFs aqui</p>
              <p className="m-0 text-[12px] text-ink-faint">ou use “Adicionar PDFs” na lateral. Pranchas e demais documentos, de uma vez.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {estado.grupos.map(g => (
              <SecaoGrupo
                key={g.id}
                grupo={g}
                arquivos={arquivosDoGrupo(estado, g.id)}
                ativo={g.id === grupo.id}
                refId={refs[g.id]}
                selecionados={estado.selecionados}
                onEscolherRef={escolherRef}
                onAlternarSelecao={alternarSelecao}
                onAtivar={ativar}
                onCampo={mudarCampo}
                onGeometria={aoMedir}
              />
            ))}
            <div className="ibox m-0 bg-surface border border-solid border-border">
              <Icon name="info" size={14} className="shrink-0"/>
              <span>A assinatura digital com certificado (.pfx) será a próxima etapa. Por enquanto você já pode organizar os grupos e posicionar os campos.</span>
            </div>
          </div>
        )}

        {arrastando && (
          <div className="absolute inset-3 rounded-lg border-2 border-dashed border-red bg-red-dim grid place-items-center pointer-events-none" aria-hidden="true">
            <span className="text-[14px] font-semibold text-red">Solte para adicionar ao grupo “{grupo.nome}”</span>
          </div>
        )}
      </main>

      {/* Sempre presente quando há arquivos: se o painel aparecesse e sumisse ao
          trocar de grupo, a largura da área central mudaria no meio de um arrasto. */}
      {!semArquivos && (
        <aside className="lg:w-[300px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-solid border-border bg-surface p-4" aria-label="Posição do campo">
          {arquivos.length > 0 ? (
            <PainelCampo
              grupo={grupo}
              geometria={medidas.geometria}
              totalPaginas={medidas.total}
              onCampo={campo => mudarCampo(grupo.id, campo)}
              onPagina={pagina => dispatch({ type: 'DEFINIR_PAGINA', id: grupo.id, pagina })}
            />
          ) : (
            <p className="m-0 text-[12px] text-ink-faint">O grupo “{grupo.nome}” está vazio. Arraste arquivos para ele para posicionar o campo.</p>
          )}
        </aside>
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
