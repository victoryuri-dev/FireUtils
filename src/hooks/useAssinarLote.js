import { useCallback, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import { lerCertificado, assinarPdf, ErroAssinatura } from '../lib/pades'
import { carregarPdf, molduraDaPagina } from '../lib/pdfjs'
import { indiceDaPagina } from '../utils/assinaturas/geometria'

// Deixa o navegador pintar o "assinando…" antes do trabalho pesado do arquivo.
const pausa = () => new Promise(r => setTimeout(r, 30))

// Margens da moldura do desenho na página que será assinada (as mesmas que a tela mostrou).
// Falha ao ler: sem moldura (o campo é medido da borda da folha; o PDF é lido de novo ao assinar).
async function molduraDoArquivo(file, escolha) {
  try {
    const doc = await carregarPdf(file)
    const indice = indiceDaPagina(escolha, doc.numPages)
    if (indice < 0) return null
    return await molduraDaPagina(await doc.getPage(indice + 1))
  } catch {
    return null
  }
}

// Nome do arquivo assinado, sem repetir nomes dentro do mesmo ZIP.
function nomeAssinado(nome, usados) {
  const base = nome.replace(/\.pdf$/i, '')
  let candidato = `${base}_assinado.pdf`
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base}_assinado (${n}).pdf`
  usados.add(candidato.toLowerCase())
  return candidato
}

/**
 * Orquestra a assinatura em lote: lê o certificado, assina cada arquivo no campo
 * do seu grupo e monta o download (um PDF, ou um ZIP quando são vários).
 *
 * Fases: 'config' → 'confirmar' (mostra quem vai assinar) → 'executando' → 'concluido'.
 * O certificado com a chave privada fica só numa ref e é descartado ao terminar.
 */
export function useAssinarLote({ grupos, arquivos }) {
  const [fase, setFase] = useState('config')
  const [erro, setErro] = useState(null)
  const [certificado, setCertificado] = useState(null) // só dados de exibição, sem a chave
  const [itens, setItens] = useState([])
  const [resultado, setResultado] = useState(null)     // { blob, nome, assinados, falhas }
  const certRef = useRef(null)
  const cancelado = useRef(false)

  // `origemPfx`: um File escolhido agora, ou { bytes } de um certificado salvo na conta.
  const verificar = useCallback(async (origemPfx, senha) => {
    setErro(null)
    try {
      const bytes = origemPfx.bytes ?? await origemPfx.arrayBuffer()
      const completo = lerCertificado(bytes, senha)
      certRef.current = completo
      setCertificado({
        titular: completo.titular,
        emissor: completo.emissor,
        validoAte: completo.validoAte,
        vencido: completo.vencido,
        icpBrasil: completo.icpBrasil,
        autoassinado: completo.autoassinado,
      })
      setFase('confirmar')
      return true
    } catch (e) {
      setErro(e instanceof ErroAssinatura
        ? { mensagem: e.message, detalhe: e.detalhe }
        : { mensagem: 'Não foi possível ler o certificado.', detalhe: String(e?.message || e) })
      return false
    }
  }, [])

  const relatarErro = useCallback(mensagem => setErro({ mensagem }), [])

  const voltar = useCallback(() => {
    certRef.current = null
    setCertificado(null)
    setErro(null)
    setFase('config')
  }, [])

  const executar = useCallback(async () => {
    const certificadoCompleto = certRef.current
    if (!certificadoCompleto) return
    cancelado.current = false

    const fila = grupos.flatMap(g => arquivos.filter(a => a.grupoId === g.id).map(a => ({ arquivo: a, grupo: g })))
    setItens(fila.map(({ arquivo, grupo }) => ({ id: arquivo.id, nome: arquivo.nome, grupo: grupo.nome, status: 'aguardando' })))
    setFase('executando')

    const atualizar = (id, dados) => setItens(l => l.map(i => (i.id === id ? { ...i, ...dados } : i)))
    const saidas = {}
    const usados = new Set()
    let falhas = 0

    for (const { arquivo, grupo } of fila) {
      if (cancelado.current) { atualizar(arquivo.id, { status: 'cancelado' }); continue }
      atualizar(arquivo.id, { status: 'assinando' })
      await pausa()
      try {
        const bytes = new Uint8Array(await arquivo.arquivo.arrayBuffer())
        const moldura = grupo.campo.daMoldura === false ? null : await molduraDoArquivo(arquivo.arquivo, grupo.pagina)
        const r = await assinarPdf(bytes, certificadoCompleto, { campo: grupo.campo, pagina: grupo.pagina, selo: grupo.selo, moldura })
        saidas[nomeAssinado(arquivo.nome, usados)] = r.pdf
        atualizar(arquivo.id, { status: 'ok', pagina: r.pagina })
      } catch (e) {
        falhas++
        atualizar(arquivo.id, {
          status: 'erro',
          mensagem: e instanceof ErroAssinatura ? e.message : 'Falha inesperada ao assinar este arquivo.',
        })
      }
    }

    // A chave privada não é mais necessária.
    certRef.current = null

    const nomes = Object.keys(saidas)
    let saida = null
    if (nomes.length === 1) {
      saida = { blob: new Blob([saidas[nomes[0]]], { type: 'application/pdf' }), nome: nomes[0] }
    } else if (nomes.length > 1) {
      // Os PDFs já são comprimidos: guardar sem recomprimir é mais rápido.
      const zip = zipSync(Object.fromEntries(nomes.map(n => [n, [saidas[n], { level: 0 }]])))
      saida = { blob: new Blob([zip], { type: 'application/zip' }), nome: 'documentos_assinados.zip' }
    }
    setResultado({ ...saida, assinados: nomes.length, falhas, cancelado: cancelado.current })
    setFase('concluido')
  }, [grupos, arquivos])

  const cancelar = useCallback(() => { cancelado.current = true }, [])

  const baixar = useCallback(() => {
    if (!resultado?.blob) return
    const url = URL.createObjectURL(resultado.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultado.nome
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }, [resultado])

  return { fase, erro, certificado, itens, resultado, verificar, relatarErro, voltar, executar, cancelar, baixar }
}
