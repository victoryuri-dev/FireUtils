import { useEffect, useRef, useState } from 'react'
import { lerCertificado, ErroAssinatura } from '../../lib/pades'
import { guardarSenha } from '../../lib/senhaLocal'
import { apelidoPadrao } from '../../utils/assinaturas/certificadosSalvos'
import Icon from '../ui/Icon'
import Checkbox from '../ui/Checkbox'

/**
 * Adiciona um certificado A1 (.pfx/.p12) à conta. A senha abre o arquivo agora (conferir que é
 * válido e ler titular e validade) e NUNCA vai para a conta: o arquivo é salvo como está, ainda
 * cifrado por ela. Se a pessoa quiser, a senha fica lembrada só neste dispositivo (lib/senhaLocal),
 * e as assinaturas seguintes não a pedem.
 */
export default function ModalCertificado({ certificados, onFechar }) {
  const [pfx, setPfx] = useState(null)
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const inputPfx = useRef(null)
  const painel = useRef(null)

  useEffect(() => {
    const aoTeclar = e => { if (e.key === 'Escape' && !salvando) onFechar() }
    window.addEventListener('keydown', aoTeclar)
    painel.current?.focus()
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [salvando, onFechar])

  async function salvar(e) {
    e.preventDefault()
    if (!pfx || !senha || salvando) return
    setSalvando(true)
    setErro(null)
    try {
      const bytes = new Uint8Array(await pfx.arrayBuffer())
      const cert = lerCertificado(bytes, senha)
      if (cert.vencido) throw new ErroAssinatura('vencido', 'Este certificado está vencido (ou ainda não começou a valer).')
      const novo = await certificados.adicionar({
        nome: nome.trim() || apelidoPadrao(cert.titular),
        titular: cert.titular,
        emissor: cert.emissor,
        validoDe: cert.validoDe,
        validoAte: cert.validoAte,
        icpBrasil: cert.icpBrasil,
        autoassinado: cert.autoassinado,
        impressao: cert.impressao,
        bytes,
      })
      if (lembrar) await guardarSenha(novo.id, senha)
      setSenha('')
      onFechar()
    } catch (ex) {
      setErro({ mensagem: ex.message || 'Não foi possível salvar o certificado.', detalhe: ex.detalhe })
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4 bg-black/55" role="presentation">
      <form
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-certificado"
        onSubmit={salvar}
        className="w-full max-w-[520px] max-h-[calc(100vh-32px)] overflow-y-auto rounded-xl border border-solid border-border bg-surface p-6 shadow-[var(--shadow-md)] outline-none flex flex-col gap-4"
      >
        <h2 id="titulo-certificado" className="m-0 font-heading text-[18px] font-semibold text-ink tracking-[-0.01em]">Adicionar certificado</h2>

        <p className="m-0 text-[13px] text-ink-faint leading-relaxed">
          O arquivo .pfx é guardado na sua conta <strong className="text-ink font-semibold">ainda protegido pela senha dele</strong>.
          A senha <strong className="text-ink font-semibold">nunca vai para a conta</strong>: você a informa agora e, se quiser, ela fica lembrada só neste dispositivo. Os PDFs nunca saem do seu navegador.
        </p>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-faint">Certificado digital</span>
          <button type="button" className="btn-ghost justify-start h-10 w-full" onClick={() => inputPfx.current?.click()}>
            <Icon name="upload" size={13}/>
            <span className="truncate">{pfx ? pfx.name : 'Escolher arquivo .pfx ou .p12'}</span>
          </button>
          <input ref={inputPfx} type="file" accept=".pfx,.p12,application/x-pkcs12" hidden onChange={e => { setPfx(e.target.files[0] ?? null); e.target.value = '' }}/>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-faint">Senha do certificado</span>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            autoComplete="off"
            className="h-10 py-0 px-3 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
          />
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <span className="mt-0.5"><Checkbox checked={lembrar} onChange={() => setLembrar(v => !v)} title="Lembrar a senha neste dispositivo"/></span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] text-ink">Lembrar a senha neste dispositivo</span>
            <span className="text-[11px] text-ink-faint leading-snug">
              Fica cifrada só neste navegador (não vai para a conta) e as assinaturas deixam de pedi-la. Em outro computador ou navegador ela é pedida uma vez. Desmarque em computadores compartilhados.
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-faint">Nome para identificar (opcional)</span>
          <input
            type="text"
            value={nome}
            maxLength={80}
            onChange={e => setNome(e.target.value)}
            placeholder="ex.: A1 pessoal, A1 da empresa"
            className="h-10 py-0 px-3 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
          />
        </label>

        {erro && (
          <div className="ibox red m-0" role="alert">
            <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
            <span>
              {erro.mensagem}
              {erro.detalhe && <span className="block mt-1 text-[11px] opacity-80 break-words">Detalhe técnico: {erro.detalhe}</span>}
            </span>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={!pfx || !senha || salvando}>
            {salvando ? <><Icon name="spinner" size={13} className="animate-spin"/> Salvando…</> : 'Salvar certificado'}
          </button>
        </div>
      </form>
    </div>
  )
}
