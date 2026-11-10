import { useRef } from 'react'
import { usePaginaPdf } from '../../hooks/usePaginaPdf'
import { useVisivel } from '../../hooks/useMedidas'
import { useArquivoArrastavel } from '../../hooks/useArrastarArquivos'
import { retanguloVisivel, dimensoesVisiveis } from '../../utils/assinaturas/geometria'
import PaginaPdf from './PaginaPdf'
import CampoAssinatura from './CampoAssinatura'
import Icon from '../ui/Icon'
import Checkbox from '../ui/Checkbox'

// Todas as miniaturas ocupam a mesma moldura, qualquer que seja o formato da
// folha (A1 paisagem, A4 retrato...): assim a grade fica alinhada, com as
// legendas na mesma linha. A página é centralizada e encolhida para caber.
export const LARGURA_QUADRO = 176
export const ALTURA_QUADRO = 200
const BORDA = 2

/**
 * Miniatura de conferência: a página que será assinada, com o campo do grupo
 * calculado sobre a geometria DESTE arquivo (tamanho de folha e rotação
 * próprios). Só carrega quando chega perto da tela.
 */
export default function MiniaturaArquivo({ arquivo, grupo, referencia, selecionado, onEscolher, onAlternarSelecao }) {
  const caixa = useRef(null)
  const noRadar = useVisivel(caixa)
  const dados = usePaginaPdf(arquivo.arquivo, grupo.pagina, noRadar)
  const { setNodeRef, listeners, attributes, isDragging } = useArquivoArrastavel(arquivo.id, 'miniatura')

  let aviso = null
  let rect = null
  let larguraPx = 0
  if (dados.status === 'ok') {
    rect = retanguloVisivel(grupo.campo, dados.geometria)
    if (rect.fora) aviso = 'O campo não cabe nesta página'
    const vis = dimensoesVisiveis(dados.geometria)
    larguraPx = Math.floor(Math.min(
      LARGURA_QUADRO - 2 * BORDA - 8,
      ((ALTURA_QUADRO - 2 * BORDA - 8) * vis.largura) / vis.altura,
    ))
  } else if (dados.status === 'sem-pagina') {
    aviso = `O arquivo tem ${dados.total} ${dados.total === 1 ? 'página' : 'páginas'}; a página escolhida não existe`
  } else if (dados.status === 'erro') {
    aviso = 'Não foi possível ler este PDF'
  }

  return (
    <figure ref={caixa} className={`m-0 relative ${isDragging ? 'opacity-40' : ''}`} style={{ width: LARGURA_QUADRO }}>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onEscolher(arquivo.id)}
        title="Clique para usar como referência · arraste para outro grupo"
        aria-label={`Usar ${arquivo.nome} como referência`}
        aria-pressed={referencia}
        aria-roledescription="arrastável"
        className={`flex items-center justify-center w-full p-0 cursor-grab active:cursor-grabbing rounded-md bg-surface-2 border-2 border-solid ${referencia ? 'border-red' : 'border-transparent hover:border-border'}`}
        style={{ height: ALTURA_QUADRO }}
      >
        {dados.status === 'ok' ? (
          <PaginaPdf pagina={dados.pagina} geometria={dados.geometria} larguraPx={larguraPx}>
            {({ escala, visivel }) => (
              <CampoAssinatura rect={rect} escala={escala} limite={visivel} editavel={false}/>
            )}
          </PaginaPdf>
        ) : (
          <span className="grid place-items-center text-ink-faint text-[11px] text-center px-2">
            {dados.status === 'carregando' ? 'Carregando…' : aviso ? <Icon name="warn" size={18}/> : null}
          </span>
        )}
      </button>
      <span className="absolute top-2 left-2 rounded-[4px] bg-surface/90 p-0.5">
        <Checkbox checked={selecionado} onChange={() => onAlternarSelecao(arquivo.id)} title={`Selecionar ${arquivo.nome}`}/>
      </span>
      <figcaption className="mt-1.5">
        <div className="text-[11px] text-ink truncate" title={arquivo.nome}>{arquivo.nome}</div>
        {aviso && (
          <div className="mt-0.5 flex items-start gap-1 text-[11px] text-amber leading-snug">
            <Icon name="warn" size={11} className="shrink-0 mt-px"/><span>{aviso}</span>
          </div>
        )}
      </figcaption>
    </figure>
  )
}
