import { useProjeto } from '../../context/ProjetoContext'
import { getNormaRemota } from '../../lib/normasRemote'
import { resolverLinksNormas } from '../../utils/linksNormas'
import Icon from './Icon'

export default function LinkNorma({ sistema }) {
  const { state } = useProjeto()
  // Projeto avulso não tem estado — sem link de norma de um estado.
  if (state.avulso) return null
  const links = resolverLinksNormas(state.uf, sistema, getNormaRemota(state.uf, 'links_normas'))
  if (!links.length) return null
  return <span className="no-print ml-2 inline-flex flex-wrap items-center gap-2 shrink-0 text-xs font-normal">
    {links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-red"
      title={`Abrir ${link.titulo} no site oficial — nova aba`}
      aria-label={`Consultar ${link.titulo}, norma oficial de ${state.uf} (abre em nova aba)`}>
      {link.titulo}<Icon name="externalLink" size={13}/>
    </a>)}
  </span>
}
