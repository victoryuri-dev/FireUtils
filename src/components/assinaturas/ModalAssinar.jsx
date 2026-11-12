import { useEffect, useRef, useState } from 'react'
import { useAssinarLote } from '../../hooks/useAssinarLote'
import { ROTULO_ANCORA } from '../../utils/assinaturas/geometria'
import { situacaoDoCertificado } from '../../utils/assinaturas/certificadosSalvos'
import { temSenha, lerSenha, guardarSenha, apagarSenha } from '../../lib/senhaLocal'
import Icon from '../ui/Icon'
import Checkbox from '../ui/Checkbox'

const PAGINA = { ultima: 'última página', primeira: 'primeira página' }
const rotuloPagina = p => (p.modo === 'numero' ? `página ${p.numero}` : PAGINA[p.modo])
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

function Painel({ titulo, children, rodape, id }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 id={id} className="m-0 font-heading text-[18px] font-semibold text-ink tracking-[-0.01em]">{titulo}</h2>
      {children}
      {rodape && <div className="flex flex-wrap justify-end gap-2 pt-1">{rodape}</div>}
    </div>
  )
}

function IconeStatus({ status }) {
  if (status === 'ok') return <Icon name="checkCircle" size={16} className="text-green"/>
  if (status === 'erro') return <Icon name="warn" size={16} className="text-red"/>
  if (status === 'assinando') return <Icon name="spinner" size={16} className="animate-spin text-ink-muted"/>
  return <span className={`w-2 h-2 rounded-full ${status === 'cancelado' ? 'bg-ink-hint' : 'bg-border'} mx-1`} aria-hidden="true"/>
}

const ROTULO_STATUS = { aguardando: 'Aguardando', assinando: 'Assinando…', ok: 'Assinado', erro: 'Não assinado', cancelado: 'Cancelado' }

/**
 * Diálogo de assinatura em lote. O certificado (.pfx) e a senha ficam só na
 * memória: nada é enviado a servidor e a chave é descartada ao terminar.
 */
export default function ModalAssinar({ grupos, arquivos, onFechar, onTitular, certificados }) {
  const lote = useAssinarLote({ grupos, arquivos })
  const { fase, erro, certificado, itens, resultado } = lote
  const [pfx, setPfx] = useState(null)
  const [senha, setSenha] = useState('')
  const [verificando, setVerificando] = useState(false)
  const inputPfx = useRef(null)
  const painel = useRef(null)
  // Certificado: um dos salvos na conta (padrão, se houver) ou um arquivo escolhido agora.
  const [origem, setOrigem] = useState(null) // null = o padrão
  const [idSalvo, setIdSalvo] = useState(null)
  const salvos = certificados?.lista ?? []
  const usarSalvo = salvos.length > 0 && origem !== 'arquivo'
  const idEfetivo = idSalvo ?? certificados?.selecionadoId ?? null
  // Senha lembrada neste dispositivo para o certificado salvo escolhido (senhaLocal): se houver,
  // não é pedida. `lembradaDe` guarda de qual id foi consultada; antes disso, aguarda.
  const [lembradaDe, setLembradaDe] = useState({ id: null, tem: false })
  const [lembrar, setLembrar] = useState(true)
  useEffect(() => {
    if (!usarSalvo || !idEfetivo) return undefined
    let ativo = true
    temSenha(idEfetivo).then(tem => { if (ativo) setLembradaDe({ id: idEfetivo, tem }) })
    return () => { ativo = false }
  }, [usarSalvo, idEfetivo])
  const consultando = usarSalvo && Boolean(idEfetivo) && lembradaDe.id !== idEfetivo
  const usaLembrada = usarSalvo && lembradaDe.id === idEfetivo && lembradaDe.tem
  const faltaSenha = !usaLembrada && !senha

  const grupos_com_arquivos = grupos
    .map(g => ({ grupo: g, total: arquivos.filter(a => a.grupoId === g.id).length }))
    .filter(x => x.total > 0)
  const total = grupos_com_arquivos.reduce((s, x) => s + x.total, 0)
  const executando = fase === 'executando'

  // O nome do certificado lido alimenta a prévia do selo na página.
  useEffect(() => { if (certificado?.titular) onTitular?.(certificado.titular) }, [certificado, onTitular])

  // Esc fecha (menos no meio da assinatura); o foco começa dentro do diálogo.
  useEffect(() => {
    const aoTeclar = e => { if (e.key === 'Escape' && !executando) onFechar() }
    window.addEventListener('keydown', aoTeclar)
    painel.current?.focus()
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [executando, onFechar])

  async function continuar(e) {
    e.preventDefault()
    if ((usarSalvo ? !idEfetivo : !pfx) || faltaSenha || consultando || verificando) return
    setVerificando(true)
    let origemPfx = pfx
    if (usarSalvo) {
      try {
        origemPfx = { bytes: await certificados.baixar(idEfetivo) }
      } catch (ex) {
        lote.relatarErro(ex.message || 'Não foi possível abrir o certificado salvo.')
        setVerificando(false)
        return
      }
    }
    const senhaUsada = usaLembrada ? await lerSenha(idEfetivo) : senha
    if (senhaUsada == null) {
      // A senha lembrada não pôde ser lida (dados do navegador limpos): volta a pedir.
      await apagarSenha(idEfetivo)
      setLembradaDe({ id: idEfetivo, tem: false })
      lote.relatarErro('Não foi possível usar a senha lembrada neste dispositivo. Digite a senha do certificado.')
      setVerificando(false)
      return
    }
    const lido = await lote.verificar(origemPfx, senhaUsada)
    if (lido && usarSalvo && !usaLembrada && lembrar) await guardarSenha(idEfetivo, senhaUsada)
    if (!lido && usaLembrada) {
      // A senha lembrada não abre mais o arquivo: esquece e pede de novo.
      await apagarSenha(idEfetivo)
      setLembradaDe({ id: idEfetivo, tem: false })
    }
    // Com o certificado lido a senha não precisa mais ficar no estado; se der erro,
    // ela fica para a pessoa corrigir sem redigitar tudo.
    if (lido) setSenha('')
    setVerificando(false)
  }

  function escolherCertificado(valor) {
    if (valor === '__arquivo') { setOrigem('arquivo'); return }
    setOrigem('salvo')
    setIdSalvo(valor)
    certificados.selecionar(valor) // lembra a escolha e atualiza a lista da página
  }

  const concluidos = itens.filter(i => ['ok', 'erro', 'cancelado'].includes(i.status)).length

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-4 bg-black/55" role="presentation">
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-assinar"
        className="w-full max-w-[560px] max-h-[calc(100vh-32px)] overflow-y-auto rounded-xl border border-solid border-border bg-surface p-6 shadow-[var(--shadow-md)] outline-none"
      >
        {fase === 'config' && (
          <form onSubmit={continuar}>
            <Painel
              id="titulo-assinar"
              titulo={`Assinar ${plural(total, 'arquivo', 'arquivos')}`}
              rodape={<>
                <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={(usarSalvo ? !idEfetivo : !pfx) || faltaSenha || consultando || verificando}>
                  {verificando ? <><Icon name="spinner" size={13} className="animate-spin"/> Lendo…</> : 'Continuar'}
                </button>
              </>}
            >
              <p className="m-0 text-[13px] text-ink-faint leading-relaxed">
                {usarSalvo
                  ? 'Escolha o certificado. Se a senha já foi lembrada neste dispositivo, ela não é pedida; o arquivo do certificado só é aberto neste navegador.'
                  : 'Escolha o certificado digital A1 (arquivo .pfx ou .p12). Ele e a senha ficam só na memória deste navegador e não são enviados a nenhum servidor.'}
              </p>

              {salvos.length > 0 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-ink-faint">Certificado</span>
                  <select
                    value={usarSalvo ? (idEfetivo ?? '') : '__arquivo'}
                    onChange={e => escolherCertificado(e.target.value)}
                    className="h-10 py-0 px-3 text-[13px] rounded-md border border-solid border-border bg-bg text-ink"
                  >
                    {salvos.map(c => {
                      const vencido = situacaoDoCertificado(c).status === 'vencido'
                      return <option key={c.id} value={c.id} disabled={vencido}>{c.nome}{vencido ? ' (vencido)' : ''}</option>
                    })}
                    <option value="__arquivo">Usar outro arquivo .pfx (sem salvar)…</option>
                  </select>
                </label>
              )}

              {!usarSalvo && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-ink-faint">Certificado digital</span>
                  <button type="button" className="btn-ghost justify-start h-10 w-full" onClick={() => inputPfx.current?.click()}>
                    <Icon name="upload" size={13}/>
                    <span className="truncate">{pfx ? pfx.name : 'Escolher arquivo .pfx ou .p12'}</span>
                  </button>
                  <input ref={inputPfx} type="file" accept=".pfx,.p12,application/x-pkcs12" hidden onChange={e => { setPfx(e.target.files[0] ?? null); e.target.value = '' }}/>
                  {salvos.length === 0 && (
                    <span className="text-[11px] text-ink-faint">
                      Dica: salve o certificado na sua conta com “Adicionar” em Certificados, na lateral, para não escolher o arquivo toda vez.
                    </span>
                  )}
                </div>
              )}

              {usaLembrada && (
                <p className="m-0 flex items-center gap-2 text-[12px] text-ink-faint">
                  <Icon name="check" size={13}/> Senha lembrada neste dispositivo.
                  <button type="button" className="text-[12px] text-ink-faint hover:text-ink underline bg-transparent border-0 p-0 cursor-pointer" onClick={async () => { await apagarSenha(idEfetivo); setLembradaDe({ id: idEfetivo, tem: false }) }}>
                    Esquecer
                  </button>
                </p>
              )}

              {!usaLembrada && (
                <>
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
                  {usarSalvo && (
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <span className="mt-0.5"><Checkbox checked={lembrar} onChange={() => setLembrar(v => !v)} title="Lembrar a senha neste dispositivo"/></span>
                      <span className="text-[12px] text-ink-faint leading-snug">Lembrar a senha neste dispositivo (cifrada, só neste navegador; não vai para a conta)</span>
                    </label>
                  )}
                </>
              )}

              {erro && (
                <div className="ibox red m-0" role="alert">
                  <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
                  <span>
                    {erro.mensagem}
                    {erro.detalhe && <span className="block mt-1 text-[11px] opacity-80 break-words">Detalhe técnico: {erro.detalhe}</span>}
                  </span>
                </div>
              )}
            </Painel>
          </form>
        )}

        {fase === 'confirmar' && certificado && (
          <Painel
            id="titulo-assinar"
            titulo="Confirme quem vai assinar"
            rodape={<>
              <button type="button" className="btn-ghost" onClick={lote.voltar}>Voltar</button>
              <button type="button" className="btn-primary" onClick={lote.executar} disabled={certificado.vencido}>
                <Icon name="signature" size={13}/> Assinar {plural(total, 'arquivo', 'arquivos')}
              </button>
            </>}
          >
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-ink-faint">Titular</dt><dd className="m-0 text-ink font-medium break-words">{certificado.titular}</dd>
              <dt className="text-ink-faint">Emissor</dt><dd className="m-0 text-ink break-words">{certificado.emissor || '—'}</dd>
              <dt className="text-ink-faint">Válido até</dt><dd className="m-0 text-ink">{certificado.validoAte.toLocaleDateString('pt-BR')}</dd>
            </dl>

            {certificado.vencido ? (
              <div className="ibox red m-0" role="alert">
                <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
                <span>Este certificado está vencido (ou ainda não começou a valer). Use um certificado válido.</span>
              </div>
            ) : certificado.icpBrasil ? (
              <div className="ibox m-0 bg-green-dim border border-solid border-green-border">
                <Icon name="checkCircle" size={14} color="var(--color-green)" className="shrink-0"/>
                <span>Certificado ICP-Brasil identificado.</span>
              </div>
            ) : (
              <div className="ibox amber m-0">
                <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/>
                <span>
                  {certificado.autoassinado
                    ? 'Este certificado é autoassinado (como os IDs digitais criados no Adobe Reader), e não emitido por uma autoridade certificadora. '
                    : 'Este certificado não parece ser ICP-Brasil. '}
                  A assinatura será criada e o PDF não poderá ser alterado sem que isso apareça, mas os leitores de PDF mostrarão “identidade desconhecida” e ela não terá validade como assinatura ICP-Brasil.
                </span>
              </div>
            )}

            <div>
              <div className="text-[11px] text-ink-faint mb-1.5">O que será assinado</div>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {grupos_com_arquivos.map(({ grupo, total: n }) => (
                  <li key={grupo.id} className="text-[12px] text-ink-muted">
                    <strong className="text-ink">{grupo.nome}</strong> — {plural(n, 'arquivo', 'arquivos')}, {rotuloPagina(grupo.pagina)}, campo {grupo.campo.larguraMm}×{grupo.campo.alturaMm} mm a {grupo.campo.dxMm}/{grupo.campo.dyMm} mm do canto {ROTULO_ANCORA[grupo.campo.ancora].toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>

            <p className="m-0 text-[12px] text-ink-faint leading-relaxed">
              Sem carimbo do tempo: a data da assinatura é a do relógio deste computador.
            </p>
          </Painel>
        )}

        {(executando || fase === 'concluido') && (
          <Painel
            id="titulo-assinar"
            titulo={executando ? `Assinando… ${concluidos} de ${itens.length}` : (resultado?.assinados ? 'Assinatura concluída' : 'Nenhum arquivo foi assinado')}
            rodape={executando
              ? <button type="button" className="btn-ghost" onClick={lote.cancelar}>Cancelar o restante</button>
              : <>
                  <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
                  {resultado?.blob && (
                    <button type="button" className="btn-primary" onClick={lote.baixar}>
                      <Icon name="download" size={13}/> {resultado.assinados > 1 ? 'Baixar ZIP' : 'Baixar PDF'}
                    </button>
                  )}
                </>}
          >
            {fase === 'concluido' && (
              <p className="m-0 text-[13px] text-ink-muted" role="status">
                {plural(resultado.assinados, 'arquivo assinado', 'arquivos assinados')}
                {resultado.falhas > 0 && <> · <span className="text-red">{plural(resultado.falhas, 'não assinado', 'não assinados')}</span></>}
                {resultado.cancelado && ' · interrompido'}.
                {' '}Os originais não foram alterados.
              </p>
            )}
            <ul className="m-0 p-0 list-none flex flex-col gap-1 max-h-[300px] overflow-y-auto">
              {itens.map(i => (
                <li key={i.id} className="flex items-start gap-2.5 py-1.5 border-b border-solid border-border-2 last:border-b-0">
                  <span className="mt-0.5 shrink-0"><IconeStatus status={i.status}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-ink truncate" title={i.nome}>{i.nome}</span>
                    <span className={`block text-[11px] ${i.status === 'erro' ? 'text-red' : 'text-ink-faint'}`}>
                      {i.status === 'erro' ? i.mensagem : i.status === 'ok' ? `${ROTULO_STATUS.ok} · página ${i.pagina}` : ROTULO_STATUS[i.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        )}
      </div>
    </div>
  )
}
