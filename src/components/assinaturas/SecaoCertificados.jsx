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

/**
 * Certificados A1 salvos na conta, num seletor: o escolhido é o usado ao assinar.
 * O arquivo fica guardado ainda cifrado pela senha dele; a senha nunca é salva.
 */
export default function SecaoCertificados({ certificados, onAdicionar }) {
  const { carregando, erro, lista, selecionadoId, selecionado, selecionar, remover } = certificados
  const [confirmando, setConfirmando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erroRemover, setErroRemover] = useState(null)

  const situacao = selecionado ? situacaoDoCertificado(selecionado) : null
  const validade = selecionado ? isoParaData(selecionado.valido_ate)?.toLocaleDateString('pt-BR') : null

  async function confirmarRemocao() {
    setRemovendo(true)
    setErroRemover(null)
    try {
      await remover(selecionado.id)
    } catch (e) {
      setErroRemover(e.message)
    } finally {
      setRemovendo(false)
      setConfirmando(false)
    }
  }

  return (
    <section aria-label="Certificado para assinar" className="flex flex-col gap-2.5 pt-4 border-t border-solid border-border-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-ink">Certificado</h3>
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
        <>
          <label className="flex flex-col gap-1">
            <span className="sr-only">Certificado usado para assinar</span>
            <select
              value={selecionadoId ?? ''}
              onChange={e => { setConfirmando(false); selecionar(e.target.value) }}
              className="h-9 py-0 px-2 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
            >
              {lista.map(c => {
                const vencido = situacaoDoCertificado(c).status === 'vencido'
                return <option key={c.id} value={c.id} disabled={vencido}>{c.nome}{vencido ? ' (vencido)' : ''}</option>
              })}
            </select>
          </label>

          {selecionado && (
            <div className="flex flex-col gap-1.5 rounded-md bg-bg border border-solid border-border-2 px-3 py-2.5">
              <span className="text-[12px] text-ink truncate" title={selecionado.titular}>{selecionado.titular}</span>
              <span className="flex flex-wrap items-center gap-1">
                {selecionado.icp_brasil && <Selo tom="green">ICP-Brasil</Selo>}
                {selecionado.autoassinado && <Selo tom="amber">Autoassinado</Selo>}
                {situacao.status === 'vencido' && <Selo tom="red">Vencido</Selo>}
                {situacao.status === 'vencendo' && <Selo tom="amber">{situacao.rotulo}</Selo>}
                <span className="text-[10px] text-ink-faint">até {validade}</span>
              </span>

              {confirmando ? (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="m-0 text-[12px] text-ink">Remover “{selecionado.nome}” da sua conta?</p>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary text-[11px] py-1 px-2.5" onClick={confirmarRemocao} disabled={removendo}>
                      {removendo ? <Icon name="spinner" size={12} className="animate-spin"/> : 'Remover'}
                    </button>
                    <button type="button" className="btn-ghost text-[11px] py-1 px-2.5" onClick={() => setConfirmando(false)} disabled={removendo}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(true)}
                  className="self-start inline-flex items-center gap-1 text-[11px] text-ink-faint hover:text-red bg-transparent border-0 p-0 cursor-pointer"
                >
                  <Icon name="trash" size={11}/> Remover da conta
                </button>
              )}
            </div>
          )}
        </>
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
