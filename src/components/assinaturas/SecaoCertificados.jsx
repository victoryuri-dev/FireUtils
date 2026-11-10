import { useState } from 'react'
import { isoParaData, situacaoDoCertificado } from '../../utils/assinaturas/certificadosSalvos'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'

const TOM = {
  green: 'border-green-border bg-green-dim text-green',
  amber: 'border-amber-border bg-amber-dim text-amber',
  red: 'border-red-border bg-red-dim text-red',
}

function Selo({ tom, children }) {
  return (
    <span className={`inline-flex items-center h-[18px] px-1.5 rounded-full border border-solid text-[10px] font-semibold whitespace-nowrap ${TOM[tom]}`}>
      {children}
    </span>
  )
}

// Um certificado: o box inteiro seleciona; remover só aparece com o mouse em cima.
function ItemCertificado({ certificado, selecionado, onSelecionar, onRemover }) {
  const [confirmando, setConfirmando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const situacao = situacaoDoCertificado(certificado)
  const validade = isoParaData(certificado.valido_ate)?.toLocaleDateString('pt-BR')

  async function remover() {
    setRemovendo(true)
    try { await onRemover(certificado.id) } finally { setRemovendo(false); setConfirmando(false) }
  }

  if (confirmando) {
    return (
      <li className="rounded-md border border-solid border-red bg-red-dim px-3 py-2.5">
        <p className="m-0 mb-2 text-[12px] text-ink">Remover “{certificado.nome}” da sua conta?</p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary text-[11px] py-1 px-2.5" onClick={remover} disabled={removendo}>
            {removendo ? <Icon name="spinner" size={12} className="animate-spin"/> : 'Remover'}
          </button>
          <button type="button" className="btn-ghost text-[11px] py-1 px-2.5" onClick={() => setConfirmando(false)} disabled={removendo}>Cancelar</button>
        </div>
      </li>
    )
  }

  return (
    <li className="group relative">
      <button
        type="button"
        role="radio"
        aria-checked={selecionado}
        onClick={() => onSelecionar(certificado.id)}
        className={`w-full text-left rounded-md border border-solid px-3 py-2.5 cursor-pointer transition-colors ${
          selecionado ? 'border-red bg-red-dim' : 'border-border bg-bg hover:border-ink-hint'
        }`}
      >
        <span className="block pr-6 text-[12px] font-medium text-ink truncate" title={certificado.nome}>{certificado.nome}</span>
        <span className="block text-[11px] text-ink-faint truncate" title={certificado.titular}>{certificado.titular}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {certificado.icp_brasil && <Selo tom="green">ICP-Brasil</Selo>}
          {certificado.autoassinado && <Selo tom="amber">Autoassinado</Selo>}
          {situacao.status === 'vencido' && <Selo tom="red">Vencido</Selo>}
          {situacao.status === 'vencendo' && <Selo tom="amber">{situacao.rotulo}</Selo>}
          <span className="text-[10px] text-ink-faint">até {validade}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title="Remover da conta"
        aria-label={`Remover ${certificado.nome}`}
        className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center rounded-sm text-ink-faint hover:text-red bg-transparent border-0 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <Icon name="trash" size={12}/>
      </button>
    </li>
  )
}

/**
 * Certificados A1 salvos na conta. O selecionado é o usado ao assinar. O arquivo
 * fica guardado ainda cifrado pela senha dele; a senha nunca é salva.
 */
export default function SecaoCertificados({ certificados, onAdicionar }) {
  const { carregando, erro, lista, selecionadoId, selecionar, remover } = certificados
  const [erroRemover, setErroRemover] = useState(null)

  async function aoRemover(id) {
    setErroRemover(null)
    try { await remover(id) } catch (e) { setErroRemover(e.message) }
  }

  return (
    <section aria-label="Certificados" className="flex flex-col gap-2.5 pt-4 mt-1 border-t border-solid border-border-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[13px] font-semibold text-ink">Certificados</h2>
        <button type="button" className="btn-ghost text-[11px] py-1 px-2.5" onClick={onAdicionar}>
          <Icon name="plus" size={12}/> Adicionar
        </button>
      </div>

      {carregando ? (
        <div className="py-3 grid place-items-center"><Loader size={20}/></div>
      ) : erro ? (
        <div className="ibox red m-0" role="alert">
          <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
          <span>{erro}</span>
        </div>
      ) : lista.length === 0 ? (
        <p className="m-0 text-[12px] text-ink-faint leading-relaxed">
          Nenhum certificado salvo. Adicione o seu .pfx para assinar sem escolher o arquivo toda vez.
        </p>
      ) : (
        <ul role="radiogroup" aria-label="Certificado para assinar" className="list-none m-0 p-0 flex flex-col gap-2">
          {lista.map(c => (
            <ItemCertificado
              key={c.id}
              certificado={c}
              selecionado={c.id === selecionadoId}
              onSelecionar={selecionar}
              onRemover={aoRemover}
            />
          ))}
        </ul>
      )}

      {erroRemover && (
        <div className="ibox red m-0" role="alert">
          <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
          <span>{erroRemover}</span>
        </div>
      )}
    </section>
  )
}
