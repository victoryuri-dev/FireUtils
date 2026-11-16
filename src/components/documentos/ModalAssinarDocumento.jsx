import { useEffect, useRef, useState } from 'react'
import { useCertificadosSalvos } from '../../hooks/useCertificadosSalvos'
import { lerCertificado, assinarPdf } from '../../lib/pades'
import { folhasParaPdf, campoAcimaDaAssinatura } from '../../lib/documentoPdf'
import { temSenha, lerSenha, guardarSenha, apagarSenha } from '../../lib/senhaLocal'
import { situacaoDoCertificado } from '../../utils/assinaturas/certificadosSalvos'
import Icon from '../ui/Icon'
import Checkbox from '../ui/Checkbox'

const campoInput = 'h-10 py-0 px-3 text-[13px] rounded-md border border-solid border-border bg-bg text-ink'

// Campo de assinatura quando o documento não tem bloco de assinatura reconhecível: rodapé da última folha.
const CAMPO_RESERVA = { dxMm: 70, dyMm: 235, larguraMm: 70, alturaMm: 18 }

/**
 * "Assinar e imprimir": gera o PDF do documento aberto, assina digitalmente com o certificado A1
 * (acima da assinatura do responsável técnico, sempre no mesmo lugar) e abre o PDF para imprimir.
 * `coletar()` lê as folhas da tela no momento de assinar: `{ folhas, bloco, nome }`.
 * A senha só é lembrada, cifrada, neste dispositivo (ver lib/senhaLocal) e nunca vai para a conta.
 */
export default function ModalAssinarDocumento({ coletar, onFechar }) {
  const certificados = useCertificadosSalvos()
  const salvos = certificados.lista
  const [usarArquivo, setUsarArquivo] = useState(false)
  const [pfx, setPfx] = useState(null)
  const [idSalvo, setIdSalvo] = useState(null)
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [lembradaDe, setLembradaDe] = useState({ id: null, tem: false })
  const [fase, setFase] = useState('config') // config | gerando | assinando | pronto
  const [progresso, setProgresso] = useState(null)
  const [erro, setErro] = useState(null)
  const [resultado, setResultado] = useState(null) // { url, nome }
  const inputPfx = useRef(null)
  const painel = useRef(null)
  const aba = useRef(null)

  const comSalvo = salvos.length > 0 && !usarArquivo
  const idEfetivo = idSalvo ?? certificados.selecionadoId ?? null
  const ocupado = fase === 'gerando' || fase === 'assinando'

  useEffect(() => {
    if (!comSalvo || !idEfetivo) return undefined
    let ativo = true
    temSenha(idEfetivo).then(tem => { if (ativo) setLembradaDe({ id: idEfetivo, tem }) })
    return () => { ativo = false }
  }, [comSalvo, idEfetivo])
  const consultando = comSalvo && Boolean(idEfetivo) && lembradaDe.id !== idEfetivo
  const usaLembrada = comSalvo && lembradaDe.id === idEfetivo && lembradaDe.tem

  useEffect(() => {
    const aoTeclar = e => { if (e.key === 'Escape' && !ocupado) onFechar() }
    window.addEventListener('keydown', aoTeclar)
    painel.current?.focus()
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [ocupado, onFechar])
  useEffect(() => () => { if (resultado?.url) URL.revokeObjectURL(resultado.url) }, [resultado])

  const pronto = (comSalvo ? Boolean(idEfetivo) : Boolean(pfx)) && (usaLembrada || senha) && !consultando

  async function assinar(e) {
    e.preventDefault()
    if (!pronto || ocupado) return
    setErro(null)
    // A aba precisa ser aberta já, dentro do clique (depois de esperar a geração o navegador bloquearia).
    aba.current = window.open('', '_blank')
    if (aba.current) aba.current.document.write('<title>Gerando PDF…</title><p style="font-family:sans-serif;padding:24px">Gerando e assinando o PDF…</p>')
    try {
      const { folhas, bloco, nome } = coletar()
      if (!folhas.length) throw new Error('O documento ainda não tem páginas geradas. Aguarde a pré-visualização e tente de novo.')

      // 1) Certificado e senha (antes do trabalho pesado: erro de senha aparece logo).
      const bytesPfx = comSalvo ? await certificados.baixar(idEfetivo) : new Uint8Array(await pfx.arrayBuffer())
      const senhaUsada = usaLembrada ? await lerSenha(idEfetivo) : senha
      if (senhaUsada == null) {
        await apagarSenha(idEfetivo)
        setLembradaDe({ id: idEfetivo, tem: false })
        throw new Error('Não foi possível usar a senha lembrada neste dispositivo. Digite a senha do certificado.')
      }
      let certificado
      try {
        certificado = lerCertificado(bytesPfx, senhaUsada)
      } catch (ex) {
        if (usaLembrada) { await apagarSenha(idEfetivo); setLembradaDe({ id: idEfetivo, tem: false }) }
        throw ex
      }
      if (certificado.vencido) throw new Error('Este certificado está vencido (ou ainda não começou a valer).')

      // 2) PDF do documento, folha por folha.
      setFase('gerando')
      const folhaDoBloco = bloco ? (bloco.closest('.pagedjs_page') ?? folhas[folhas.length - 1]) : folhas[folhas.length - 1]
      const campo = bloco ? campoAcimaDaAssinatura(folhaDoBloco, bloco) : CAMPO_RESERVA
      const numero = Math.max(1, folhas.indexOf(folhaDoBloco) + 1)
      const bytes = await folhasParaPdf(folhas, { aoProgresso: (feito, total) => setProgresso({ feito, total }) })

      // 3) Assinatura, no campo acima da assinatura do responsável técnico.
      setFase('assinando')
      await new Promise(r => setTimeout(r, 30))
      const { pdf } = await assinarPdf(bytes, certificado, {
        campo: { ancora: 'superior-esquerda', ...campo },
        pagina: { modo: 'numero', numero },
      })
      if (!usaLembrada && comSalvo && lembrar) await guardarSenha(idEfetivo, senhaUsada)
      setSenha('')

      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
      setResultado({ url, nome: `${nome}.pdf` })
      setFase('pronto')
      if (aba.current && !aba.current.closed) aba.current.location.href = url
    } catch (ex) {
      aba.current?.close()
      setErro(ex.message || 'Não foi possível assinar o documento.')
      setFase('config')
    }
  }

  return (
    <div className="no-print fixed inset-0 z-[1100] grid place-items-center p-4 bg-black/55" role="presentation">
      <form
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-assinar-doc"
        onSubmit={assinar}
        className="w-full max-w-[520px] max-h-[calc(100vh-32px)] overflow-y-auto rounded-xl border border-solid border-border bg-surface p-6 shadow-[var(--shadow-md)] outline-none flex flex-col gap-4"
      >
        <h2 id="titulo-assinar-doc" className="m-0 font-heading text-[18px] font-semibold text-ink tracking-[-0.01em]">Assinar e imprimir</h2>

        {fase === 'pronto' && resultado ? (
          <>
            <p className="m-0 text-[13px] text-ink-muted leading-relaxed flex items-start gap-2">
              <Icon name="checkCircle" size={16} className="shrink-0 mt-0.5 text-green"/>
              <span>O documento foi assinado e aberto em outra aba, onde você pode imprimir ou salvar. Se a aba não abriu, use os botões abaixo.</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <a className="btn-ghost no-underline" href={resultado.url} download={resultado.nome}><Icon name="download" size={13}/> Baixar PDF</a>
              <a className="btn-primary no-underline" href={resultado.url} target="_blank" rel="noreferrer"><Icon name="file" size={13}/> Abrir para imprimir</a>
              <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
            </div>
          </>
        ) : ocupado ? (
          <div className="flex items-center gap-3 py-4 text-[13px] text-ink-muted" role="status">
            <Icon name="spinner" size={18} className="animate-spin shrink-0"/>
            <span>
              {fase === 'gerando'
                ? `Gerando as páginas… ${progresso ? `${Math.min(progresso.feito + 1, progresso.total)} de ${progresso.total}` : ''}`
                : 'Assinando…'}
            </span>
          </div>
        ) : (
          <>
            <p className="m-0 text-[13px] text-ink-faint leading-relaxed">
              O documento vira um PDF assinado digitalmente, com o campo de assinatura acima da assinatura do responsável técnico. O PDF é gerado e assinado neste navegador, sem enviar nada a servidor.
            </p>

            {salvos.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-ink-faint">Certificado</span>
                <select
                  value={comSalvo ? (idEfetivo ?? '') : '__arquivo'}
                  onChange={e => {
                    if (e.target.value === '__arquivo') { setUsarArquivo(true); return }
                    setUsarArquivo(false); setIdSalvo(e.target.value); certificados.selecionar(e.target.value)
                  }}
                  className={campoInput}
                >
                  {salvos.map(c => {
                    const vencido = situacaoDoCertificado(c).status === 'vencido'
                    return <option key={c.id} value={c.id} disabled={vencido}>{c.nome}{vencido ? ' (vencido)' : ''}</option>
                  })}
                  <option value="__arquivo">Usar outro arquivo .pfx (sem salvar)…</option>
                </select>
              </label>
            )}

            {!comSalvo && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-ink-faint">Certificado digital A1</span>
                <button type="button" className="btn-ghost justify-start h-10 w-full" onClick={() => inputPfx.current?.click()}>
                  <Icon name="upload" size={13}/>
                  <span className="truncate">{pfx ? pfx.name : 'Escolher arquivo .pfx ou .p12'}</span>
                </button>
                <input ref={inputPfx} type="file" accept=".pfx,.p12,application/x-pkcs12" hidden onChange={e => { setPfx(e.target.files[0] ?? null); e.target.value = '' }}/>
                {salvos.length === 0 && <span className="text-[11px] text-ink-faint">Dica: salve o certificado na conta pela ferramenta Assinaturas para não escolher o arquivo toda vez.</span>}
              </div>
            )}

            {usaLembrada ? (
              <p className="m-0 flex items-center gap-2 text-[12px] text-ink-faint">
                <Icon name="check" size={13}/> Senha lembrada neste dispositivo.
                <button type="button" className="text-[12px] text-ink-faint hover:text-ink underline bg-transparent border-0 p-0 cursor-pointer" onClick={async () => { await apagarSenha(idEfetivo); setLembradaDe({ id: idEfetivo, tem: false }) }}>Esquecer</button>
              </p>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-ink-faint">Senha do certificado</span>
                  <input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="off" className={campoInput}/>
                </label>
                {comSalvo && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <span className="mt-0.5"><Checkbox checked={lembrar} onChange={() => setLembrar(v => !v)} title="Lembrar a senha neste dispositivo"/></span>
                    <span className="text-[12px] text-ink-faint leading-snug">Lembrar a senha neste dispositivo</span>
                  </label>
                )}
              </>
            )}

            {erro && (
              <div className="ibox red m-0" role="alert">
                <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
                <span>{erro}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={!pronto}><Icon name="signature" size={13}/> Assinar e imprimir</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
