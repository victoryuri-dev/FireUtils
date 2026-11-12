import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePaginaPdf } from '../../hooks/usePaginaPdf'
import { useLargura } from '../../hooks/useMedidas'
import { useAlvoGrupo } from '../../hooks/useArrastarArquivos'
import {
  retanguloVisivel, campoDoRetanguloVisivel, dimensoesVisiveis,
} from '../../utils/assinaturas/geometria'
import PaginaPdf from './PaginaPdf'
import CampoAssinatura from './CampoAssinatura'
import MiniaturaArquivo, { ALTURA_QUADRO } from './MiniaturaArquivo'
import CarrosselMiniaturas from './CarrosselMiniaturas'
import NomeDoGrupo from './NomeDoGrupo'
import PreviaSelo from './PreviaSelo'
import VisorMaximizado from './VisorMaximizado'
import Loader from '../ui/Loader'
import Icon from '../ui/Icon'

// Em box largo, a referência fica com até esta fração da largura; o resto é das miniaturas.
const FRACAO_REFERENCIA = 0.62
// Largura mínima do box para pôr referência e miniaturas lado a lado.
const LARGURA_LINHA = 620
// Ao lado das miniaturas, a folha de referência tem a altura das 2 linhas delas (quadro + legenda
// de cada linha, mais o vão entre as linhas): os dois lados terminam alinhados.
const ALTURA_LEGENDA_MINIATURA = 23
const ALTURA_BLOCO_MINIATURAS = 2 * (ALTURA_QUADRO + ALTURA_LEGENDA_MINIATURA) + 16

// O PDF de referência do grupo, com o campo arrastável por cima.
function Referencia({ grupo, arquivo, ativo, titular, larguraMax, alturaMax, onCampo, onGeometria, onMedida }) {
  const caixa = useRef(null)
  // Elemento onde o visor é montado (ou null = fechado). Fora do box do grupo: o box usa
  // container query, que em alguns navegadores prende elementos `fixed` ao próprio box.
  const [alvoDoVisor, setAlvoDoVisor] = useState(null)
  const dados = usePaginaPdf(arquivo?.arquivo, grupo.pagina, Boolean(arquivo))

  // Só o grupo em edição informa a geometria ao painel lateral (âncora e contagem).
  const geometria = dados.status === 'ok' ? dados.geometria : null
  const total = dados.status === 'ok' || dados.status === 'sem-pagina' ? dados.total : null
  useEffect(() => { if (ativo) onGeometria(geometria, total) }, [ativo, geometria, total, onGeometria])

  // Informa o tamanho da folha na tela: o box ajusta a coluna e a altura das miniaturas a ele.
  const medidaW = dados.status === 'ok' ? Math.max(220, Math.min(larguraMax, Math.floor((alturaMax * dimensoesVisiveis(geometria).largura) / dimensoesVisiveis(geometria).altura))) : null
  const medidaH = medidaW ? Math.round((medidaW * dimensoesVisiveis(geometria).altura) / dimensoesVisiveis(geometria).largura) : null
  useEffect(() => { onMedida(medidaW ? { w: medidaW, h: medidaH } : null) }, [medidaW, medidaH, onMedida])

  if (!arquivo) return null

  let corpo
  if (dados.status === 'ok') {
    // A página inteira cabe na tela: limita também pela altura disponível.
    const larguraPx = medidaW
    const rect = retanguloVisivel(grupo.campo, geometria)
    corpo = (
      <>
        <PaginaPdf pagina={dados.pagina} geometria={geometria} larguraPx={larguraPx}>
          {({ escala, visivel }) => (
            <>
              <CampoAssinatura
                rect={rect}
                escala={escala}
                limite={visivel}
                onMudar={novo => onCampo(campoDoRetanguloVisivel(novo, geometria, grupo.campo.ancora))}
                previa={<PreviaSelo largura={rect.largura} altura={rect.altura} titular={titular} selo={grupo.selo}/>}
              />
              <button
                type="button"
                onClick={() => setAlvoDoVisor(caixa.current?.closest('.platform-theme') ?? document.body)}
                title="Maximizar a folha (zoom para posicionar com precisão)"
                aria-label="Maximizar a folha"
                className="absolute top-2 right-2 z-10 w-8 h-8 grid place-items-center rounded-md border border-solid border-border bg-surface/90 text-ink shadow-[var(--shadow-sm)] cursor-pointer hover:bg-surface-2"
              >
                <Icon name="maximize" size={15}/>
              </button>
            </>
          )}
        </PaginaPdf>
        {alvoDoVisor && createPortal(
          <VisorMaximizado
            pagina={dados.pagina}
            geometria={geometria}
            grupo={grupo}
            titular={titular}
            nomeArquivo={arquivo.nome}
            onCampo={onCampo}
            onFechar={() => setAlvoDoVisor(null)}
          />,
          alvoDoVisor,
        )}
      </>
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

  return <div ref={caixa} className="w-full overflow-x-auto pb-1">{corpo}</div>
}

/**
 * Um grupo de assinatura na área central: à esquerda o PDF de referência, onde
 * se posiciona o campo; à direita, as miniaturas de TODOS os PDFs do grupo em
 * grade alinhada, mostrando onde o campo cai em cada um. Tocar em qualquer
 * ponto da seção a torna o grupo em edição (o painel da direita acompanha) e
 * soltar arquivos arrastados sobre ela os move para este grupo.
 */
export default function SecaoGrupo({
  grupo, arquivos, ativo, refId, selecionados, titularPrevia, soltar, onEscolherRef, onAlternarSelecao, onAtivar, onCampo, onGeometria, onRenomear,
}) {
  const arquivoRef = arquivos.find(a => a.id === refId) ?? arquivos[0] ?? null
  // Largura do box (container) e tamanho da referência na tela: em box largo a referência
  // cresce com ele e as duas linhas de miniaturas se ajustam à altura dela.
  const outros = arquivos.filter(a => a.id !== arquivoRef?.id)
  const corpo = useRef(null)
  const larguraCorpo = useLargura(corpo, 0)
  const emLinha = larguraCorpo >= LARGURA_LINHA
  const [medidaRef, setMedidaRef] = useState(null)
  const aoMedir = useCallback(m => setMedidaRef(m), [])
  const larguraMaxRef = emLinha ? Math.floor((larguraCorpo - 24) * FRACAO_REFERENCIA) : Math.max(220, larguraCorpo)
  // Lado a lado: altura do bloco de miniaturas; empilhado: o que couber na tela.
  const alturaMaxRef = emLinha ? ALTURA_BLOCO_MINIATURAS : Math.max(360, (globalThis.innerHeight || 900) - 300)
  // A seção inteira é um alvo: soltar arquivos arrastados aqui os move para o grupo.
  const { setNodeRef, isOver } = useAlvoGrupo(grupo.id, 'secao')

  return (
    <section
      ref={setNodeRef}
      aria-label={`Grupo ${grupo.nome}`}
      {...soltar?.props}
      onPointerDownCapture={() => { if (!ativo) onAtivar(grupo.id) }}
      onFocusCapture={() => { if (!ativo) onAtivar(grupo.id) }}
      className={`relative rounded-lg border border-solid p-4 sm:p-5 transition-colors ${isOver || soltar?.alvo ? 'border-red bg-red-dim' : `bg-surface ${ativo ? 'border-red-border' : 'border-border'}`}`}
    >
      {soltar?.alvo && (
        <div className="absolute inset-2 z-10 rounded-md border-2 border-dashed border-red grid place-items-center pointer-events-none bg-surface/70" aria-hidden="true">
          <span className="text-[14px] font-semibold text-red">Solte para adicionar ao {grupo.nome}</span>
        </div>
      )}
      <header className="flex items-center gap-2.5 mb-4">
        <Icon name="folderOpen" size={18} className={`shrink-0 ${ativo ? 'text-red' : 'text-ink-faint'}`}/>
        <NomeDoGrupo grupo={grupo} onRenomear={onRenomear} variante="secao"/>
        <span className="text-[12px] text-ink-faint tabular-nums shrink-0">
          {arquivos.length} {arquivos.length === 1 ? 'arquivo' : 'arquivos'}
        </span>
        {ativo && (
          <span className="ml-auto shrink-0 h-5 px-2 grid place-items-center rounded-full border border-solid border-red-border bg-red-dim text-red text-[10px] font-semibold uppercase tracking-[.04em]">
            Em edição
          </span>
        )}
      </header>

      {/* O contêiner medido existe sempre: um grupo que começa vazio e recebe arquivos depois
          precisa já estar sendo observado (senão a largura fica 0 e o layout trava no modo estreito). */}
      <div ref={corpo}>
      {arquivos.length === 0 ? (
        <div className="ibox m-0 bg-bg border border-solid border-border">
          <Icon name="info" size={14} className="shrink-0"/>
          <span>Este grupo está vazio. Adicione PDFs ou mova arquivos de outro grupo.</span>
        </div>
      ) : (
        // O layout reage à largura do PRÓPRIO box (container query), e não da tela: com 2
        // grupos lado a lado cada box é mais estreito. Box largo: referência à esquerda e
        // miniaturas à direita; box estreito: uma sobre a outra.
        <div>
          <div className={`flex gap-6 ${emLinha ? "flex-row" : "flex-col"}`}>
            <div className="shrink-0 min-w-0" style={emLinha && medidaRef ? { width: medidaRef.w } : undefined}>
              <Referencia
                grupo={grupo}
                arquivo={arquivoRef}
                ativo={ativo}
                titular={titularPrevia}
                larguraMax={larguraMaxRef}
                alturaMax={alturaMaxRef}
                onMedida={aoMedir}
                onCampo={campo => onCampo(grupo.id, campo)}
                onGeometria={onGeometria}
              />
            </div>

            {/* A folha de referência já aparece grande ao lado: a lista de miniaturas só tem os
                demais arquivos (clicar em um deles o torna a referência). */}
            {outros.length > 0 && (
            <div className="flex-1 min-w-0">
              <CarrosselMiniaturas rotulo={`Conferência do ${grupo.nome}`}>
                {outros.map(a => (
                  <MiniaturaArquivo
                    key={a.id}
                    arquivo={a}
                    grupo={grupo}
                    referencia={false}
                    selecionado={selecionados.includes(a.id)}
                    onEscolher={id => onEscolherRef(grupo.id, id)}
                    onAlternarSelecao={onAlternarSelecao}
                  />
                ))}
              </CarrosselMiniaturas>
            </div>
            )}
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
