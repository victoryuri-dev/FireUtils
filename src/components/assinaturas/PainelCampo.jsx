import { useState } from 'react'
import { ANCORAS, ROTULO_ANCORA, trocarAncora } from '../../utils/assinaturas/geometria'
import { paraNumero } from '../../utils/numero'

// Campo numérico que aceita digitação livre ("12,5") e só grava valores válidos.
function CampoMm({ rotulo, valor, onMudar, min = 0, max = 2000 }) {
  const [texto, setTexto] = useState(null) // null = não está editando
  const exibido = texto ?? String(valor).replace('.', ',')

  function mudar(v) {
    setTexto(v)
    const n = paraNumero(v)
    if (Number.isFinite(n) && n >= min && n <= max) onMudar(Math.round(n * 10) / 10)
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-faint">{rotulo}</span>
      <span className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={exibido}
          onFocus={() => setTexto(String(valor).replace('.', ','))}
          onChange={e => mudar(e.target.value)}
          onBlur={() => setTexto(null)}
          className="w-full h-9 py-0 pl-2.5 pr-9 text-[13px] tabular-nums rounded-md border border-solid border-border bg-bg text-ink"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint pointer-events-none">mm</span>
      </span>
    </label>
  )
}

/**
 * Ajuste fino do campo do grupo: âncora, distâncias, tamanho e página.
 * `geometria` é a da página de referência (usada para trocar de âncora sem
 * mover o campo de lugar); pode ser ausente enquanto o PDF carrega.
 */
export default function PainelCampo({ grupo, geometria, totalPaginas, onCampo, onPagina }) {
  const { campo, pagina } = grupo
  const ancoraDireita = campo.ancora.endsWith('direita')
  const ancoraBaixo = campo.ancora.startsWith('inferior')

  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 text-[13px] font-semibold text-ink">Posição no grupo “{grupo.nome}”</h3>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-faint">Canto de referência</span>
        <select
          value={campo.ancora}
          onChange={e => onCampo(geometria ? trocarAncora(campo, geometria, e.target.value) : { ancora: e.target.value })}
          className="h-9 py-0 px-2 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
        >
          {ANCORAS.map(a => <option key={a} value={a}>{ROTULO_ANCORA[a]}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <CampoMm rotulo={`Da borda ${ancoraDireita ? 'direita' : 'esquerda'}`} valor={campo.dxMm} onMudar={v => onCampo({ dxMm: v })}/>
        <CampoMm rotulo={`Da borda ${ancoraBaixo ? 'inferior' : 'superior'}`} valor={campo.dyMm} onMudar={v => onCampo({ dyMm: v })}/>
        <CampoMm rotulo="Largura" valor={campo.larguraMm} min={25} onMudar={v => onCampo({ larguraMm: v })}/>
        <CampoMm rotulo="Altura" valor={campo.alturaMm} min={10} onMudar={v => onCampo({ alturaMm: v })}/>
      </div>

      <div role="group" aria-labelledby={`pagina-${grupo.id}`} className="flex flex-col gap-2">
        <span id={`pagina-${grupo.id}`} className="text-[11px] text-ink-faint">Página que recebe a assinatura</span>
        <div role="radiogroup" aria-labelledby={`pagina-${grupo.id}`} className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-2">
          {[['ultima', 'Última'], ['primeira', 'Primeira'], ['numero', 'Nº']].map(([modo, rotulo]) => (
            <button
              key={modo}
              type="button"
              role="radio"
              aria-checked={pagina.modo === modo}
              onClick={() => onPagina({ modo })}
              className={`h-8 rounded-md text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-red ${pagina.modo === modo ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-faint hover:text-ink'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {pagina.modo === 'numero' && (
          <label className="flex items-center gap-2 text-[12px] text-ink-faint">
            Número da página
            <input
              type="number"
              min={1}
              value={pagina.numero}
              onChange={e => onPagina({ modo: 'numero', numero: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })}
              className="w-16 h-8 py-0 px-2 text-[12px] tabular-nums rounded-md border border-solid border-border bg-bg text-ink"
            />
          </label>
        )}
        {totalPaginas ? <span className="text-[11px] text-ink-faint">O arquivo de referência tem {totalPaginas} {totalPaginas === 1 ? 'página' : 'páginas'}.</span> : null}
      </div>
    </div>
  )
}
