import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useAcesso } from '../hooks/useLicencas'
import { usePaginaPdf } from '../hooks/usePaginaPdf'
import { useLargura } from '../hooks/useMedidas'
import { liberarPdf } from '../lib/pdfjs'
import {
  estadoInicial, reducer, novoId, grupoAtivo, arquivosDoGrupo,
} from '../utils/assinaturas/grupos'
import { retanguloVisivel, campoDoRetanguloVisivel } from '../utils/assinaturas/geometria'
import ListaGrupos from '../components/assinaturas/ListaGrupos'
import PainelCampo from '../components/assinaturas/PainelCampo'
import PaginaPdf from '../components/assinaturas/PaginaPdf'
import CampoAssinatura from '../components/assinaturas/CampoAssinatura'
import MiniaturaArquivo from '../components/assinaturas/MiniaturaArquivo'
import SemLicenca from '../components/perfil/SemLicenca'
import Loader from '../components/ui/Loader'
import Icon from '../components/ui/Icon'

const LARGURA_MAX_REFERENCIA = 860

// Área central: o PDF de referência do grupo com o campo arrastável.
function Referencia({ grupo, arquivos, arquivo, onEscolher, onCampo, onGeometria }) {
  const caixa = useRef(null)
  const larguraCaixa = useLargura(caixa, 600)
  const dados = usePaginaPdf(arquivo?.arquivo, grupo.pagina, Boolean(arquivo))

  // Avisa o pai da geometria/total para o painel lateral (âncora e contagem).
  const geometria = dados.status === 'ok' ? dados.geometria : null
  const total = dados.status === 'ok' || dados.status === 'sem-pagina' ? dados.total : null
  useEffect(() => { onGeometria(geometria, total) }, [geometria, total, onGeometria])

  if (!arquivo) return null

  let corpo
  if (dados.status === 'ok') {
    // A página inteira cabe na tela: limita também pela altura disponível.
    const vis = geometria.rotacao % 180 ? { l: geometria.altura, a: geometria.largura } : { l: geometria.largura, a: geometria.altura }
    const alturaMax = Math.max(360, (globalThis.innerHeight || 900) - 280)
    const larguraPx = Math.max(220, Math.min(larguraCaixa, LARGURA_MAX_REFERENCIA, Math.floor((alturaMax * vis.l) / vis.a)))
    const rect = retanguloVisivel(grupo.campo, geometria)
    corpo = (
      <PaginaPdf pagina={dados.pagina} geometria={geometria} larguraPx={larguraPx}>
        {({ escala, visivel }) => (
          <CampoAssinatura
            rect={rect}
            escala={escala}
            limite={visivel}
            onMudar={novo => onCampo(campoDoRetanguloVisivel(novo, geometria, grupo.campo.ancora))}
          />
        )}
      </PaginaPdf>
    )
  } else if (dados.status === 'sem-pagina') {
    corpo = (
      <div className="ibox amber m-0">
        <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/>
        <span>Este arquivo tem {dados.total} {dados.total === 1 ? 'página' : 'páginas'} e a página escolhida para o grupo não existe nele. Escolha outro arquivo de referência ou ajuste a página.</span>
      </div>
    )
  } else if (dados.status === 'erro') {
    corpo = (
      <div className="ibox red m-0">
        <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
        <span>Não foi possível ler “{arquivo.nome}”. O arquivo pode estar corrompido ou protegido por senha.</span>
      </div>
    )
  } else {
    corpo = <div className="py-16 grid place-items-center"><Loader size={28}/></div>
  }

  return (
    <section aria-label="Arquivo de referência" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="m-0 font-heading text-[15px] font-semibold text-ink">Posicione o campo</h2>
        <label className="flex items-center gap-2 text-[12px] text-ink-faint min-w-0">
          Arquivo de referência
          <select
            value={arquivo.id}
            onChange={e => onEscolher(e.target.value)}
            className="h-8 max-w-[260px] py-0 px-2 text-[12px] rounded-md border border-solid border-border bg-bg text-ink"
          >
            {arquivos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </label>
      </div>
      <p className="m-0 text-[12px] text-ink-faint">
        Arraste o campo até o lugar da assinatura e puxe os cantos para ajustar o tamanho. A posição vale para os {arquivos.length} {arquivos.length === 1 ? 'arquivo' : 'arquivos'} do grupo.
      </p>
      <div ref={caixa} className="w-full overflow-x-auto pb-1">{corpo}</div>
    </section>
  )
}

function FerramentaAssinaturas() {
  const [estado, dispatch] = useReducer(reducer, undefined, () => estadoInicial())
  const [refId, setRefId] = useState(null)
  const [arrastando, setArrastando] = useState(false)
  const [medidas, setMedidas] = useState({ geometria: null, total: null })

  const grupo = grupoAtivo(estado)
  const arquivos = useMemo(() => arquivosDoGrupo(estado, grupo.id), [estado, grupo.id])
  const arquivoRef = arquivos.find(a => a.id === refId) ?? arquivos[0] ?? null

  const adicionar = useCallback((arquivos, grupoId) => {
    const lista = arquivos.map(f => ({ id: novoId(), nome: f.name, tamanho: f.size, arquivo: f }))
    dispatch({ type: 'ADICIONAR_ARQUIVOS', arquivos: lista, grupoId })
  }, [])

  const remover = useCallback(ids => {
    for (const a of estado.arquivos) if (ids.includes(a.id)) liberarPdf(a.arquivo)
    dispatch({ type: 'REMOVER_ARQUIVOS', ids })
  }, [estado.arquivos])

  const mudarCampo = useCallback(campo => dispatch({ type: 'DEFINIR_CAMPO', id: grupo.id, campo }), [grupo.id])

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
          <p className="m-0 mt-1 text-[13px] text-ink-faint">
            Agrupe os PDFs que são assinados no mesmo lugar e posicione o campo uma vez por grupo. Os arquivos são lidos no seu navegador e não são enviados a nenhum servidor.
          </p>
        </header>

        {semArquivos ? (
          <div className="grid place-items-center text-center rounded-lg border-2 border-dashed border-border bg-surface px-6 py-16">
            <div>
              <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-surface-2 grid place-items-center text-ink-muted"><Icon name="upload" size={18}/></div>
              <p className="m-0 mb-1 text-[14px] font-semibold text-ink">Solte os PDFs aqui</p>
              <p className="m-0 text-[12px] text-ink-faint">ou use “Adicionar PDFs” na lateral. Pranchas e demais documentos, de uma vez.</p>
            </div>
          </div>
        ) : arquivos.length === 0 ? (
          <div className="ibox m-0 bg-surface border border-solid border-border">
            <Icon name="info" size={14} className="shrink-0"/>
            <span>O grupo “{grupo.nome}” está vazio. Adicione PDFs ou mova arquivos de outro grupo.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <Referencia
              grupo={grupo}
              arquivos={arquivos}
              arquivo={arquivoRef}
              onEscolher={setRefId}
              onCampo={mudarCampo}
              onGeometria={aoMedir}
            />
            <section aria-label="Conferência do grupo">
              <h2 className="m-0 mb-1 font-heading text-[15px] font-semibold text-ink">Conferência do grupo</h2>
              <p className="m-0 mb-3 text-[12px] text-ink-faint">Onde a assinatura cai em cada arquivo. Clique numa miniatura para usá-la como referência.</p>
              <div className="flex flex-wrap gap-4">
                {arquivos.map(a => (
                  <MiniaturaArquivo
                    key={a.id}
                    arquivo={a}
                    grupo={grupo}
                    referencia={a.id === arquivoRef?.id}
                    onEscolher={setRefId}
                  />
                ))}
              </div>
            </section>
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

      {!semArquivos && arquivos.length > 0 && (
        <aside className="lg:w-[300px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-solid border-border bg-surface p-4" aria-label="Posição do campo">
          <PainelCampo
            grupo={grupo}
            geometria={medidas.geometria}
            totalPaginas={medidas.total}
            onCampo={mudarCampo}
            onPagina={pagina => dispatch({ type: 'DEFINIR_PAGINA', id: grupo.id, pagina })}
          />
        </aside>
      )}
    </div>
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
