import { useRef } from 'react'
import { usePaginaPdf } from '../../hooks/usePaginaPdf'
import { useVisivel } from '../../hooks/useMedidas'
import { retanguloVisivel } from '../../utils/assinaturas/geometria'
import PaginaPdf from './PaginaPdf'
import CampoAssinatura from './CampoAssinatura'
import Icon from '../ui/Icon'

export const LARGURA_MINIATURA = 168

/**
 * Miniatura de conferência: a página que será assinada, com o campo do grupo
 * calculado sobre a geometria DESTE arquivo (tamanho de folha e rotação
 * próprios). Só carrega quando chega perto da tela.
 */
export default function MiniaturaArquivo({ arquivo, grupo, referencia, onEscolher }) {
  const caixa = useRef(null)
  const noRadar = useVisivel(caixa)
  const dados = usePaginaPdf(arquivo.arquivo, grupo.pagina, noRadar)

  let aviso = null
  let rect = null
  if (dados.status === 'ok') {
    rect = retanguloVisivel(grupo.campo, dados.geometria)
    if (rect.fora) aviso = 'O campo não cabe nesta página'
  } else if (dados.status === 'sem-pagina') {
    aviso = `O arquivo tem ${dados.total} ${dados.total === 1 ? 'página' : 'páginas'}; a página escolhida não existe`
  } else if (dados.status === 'erro') {
    aviso = 'Não foi possível ler este PDF'
  }

  return (
    <figure ref={caixa} className="m-0" style={{ width: LARGURA_MINIATURA }}>
      <button
        type="button"
        onClick={() => onEscolher(arquivo.id)}
        title="Usar como arquivo de referência"
        aria-label={`Usar ${arquivo.nome} como referência`}
        className={`block w-full p-0 bg-transparent cursor-pointer rounded-sm border-2 border-solid ${referencia ? 'border-red' : 'border-transparent hover:border-border'}`}
      >
        {dados.status === 'ok' ? (
          <PaginaPdf pagina={dados.pagina} geometria={dados.geometria} larguraPx={LARGURA_MINIATURA - 4}>
            {({ escala, visivel }) => (
              <CampoAssinatura rect={rect} escala={escala} limite={visivel} editavel={false}/>
            )}
          </PaginaPdf>
        ) : (
          <div className="grid place-items-center bg-surface-2 text-ink-faint text-[11px] text-center px-2" style={{ width: LARGURA_MINIATURA - 4, height: 110 }}>
            {dados.status === 'carregando' ? 'Carregando…' : aviso ? <Icon name="warn" size={18}/> : null}
          </div>
        )}
      </button>
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
