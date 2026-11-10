// lib/certificadosRepo.js — onde ficam os certificados salvos na conta.
//
// Dois repositórios com a mesma interface:
//   • criarRepositorioSupabase: tabela `certificados_assinatura` (ver a migration
//     20261110120000_certificados_assinatura.sql; RLS garante que cada conta só vê os seus);
//   • criarRepositorioMemoria: em memória, para testes.
//
// Interface: listar(), salvar(dados), baixar(id) -> Uint8Array do .pfx, remover(id).
// O arquivo .pfx guardado continua cifrado pela senha dele; a senha nunca passa por aqui.

import { bytesParaBase64, base64ParaBytes, dataParaIso } from '../utils/assinaturas/certificadosSalvos.js'

// Nunca selecionar `pfx_base64` ao listar: o arquivo só é baixado quando vai ser usado.
const COLUNAS_LISTA = 'id,nome,titular,emissor,valido_ate,icp_brasil,autoassinado,criado_em'

/** Erro com mensagem em português para mostrar na tela. */
export class ErroCertificados extends Error {
  constructor(mensagem, codigo) {
    super(mensagem)
    this.name = 'ErroCertificados'
    this.codigo = codigo
  }
}

/** Traduz um erro do Supabase/Postgres para algo que a pessoa entenda. */
export function traduzirErro(erro) {
  const msg = String(erro?.message || erro || '')
  if (/Limite de \d+ certificados/.test(msg)) return new ErroCertificados(msg.replace(/^.*?(Limite de)/, '$1'), 'limite')
  if (erro?.code === '23505' || /duplicate key|unique/i.test(msg)) return new ErroCertificados('Este certificado já está salvo na sua conta.', 'duplicado')
  if (erro?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return new ErroCertificados('Sua conta não tem permissão para salvar certificados. Confira a licença do módulo Assinaturas.', 'licenca')
  }
  if (/fetch|network|failed to/i.test(msg)) return new ErroCertificados('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.', 'rede')
  return new ErroCertificados('Não foi possível concluir a operação com os certificados.', 'desconhecido')
}

export function criarRepositorioSupabase(supabase) {
  const tratar = ({ data, error }) => {
    if (error) throw traduzirErro(error)
    return data
  }
  return {
    async listar() {
      return tratar(await supabase.from('certificados_assinatura').select(COLUNAS_LISTA).order('criado_em', { ascending: true }))
    },
    async salvar({ nome, titular, emissor, validoDe, validoAte, icpBrasil, autoassinado, impressao, bytes }) {
      return tratar(await supabase.from('certificados_assinatura').insert({
        nome,
        titular,
        emissor: emissor || '',
        valido_de: validoDe ? dataParaIso(validoDe) : null,
        valido_ate: dataParaIso(validoAte),
        icp_brasil: Boolean(icpBrasil),
        autoassinado: Boolean(autoassinado),
        impressao,
        pfx_base64: bytesParaBase64(bytes),
      }).select(COLUNAS_LISTA).single())
    },
    async baixar(id) {
      const linha = tratar(await supabase.from('certificados_assinatura').select('pfx_base64').eq('id', id).single())
      return base64ParaBytes(linha.pfx_base64)
    },
    async remover(id) {
      tratar(await supabase.from('certificados_assinatura').delete().eq('id', id))
    },
  }
}

export function criarRepositorioMemoria(inicial = []) {
  const linhas = inicial.map(l => ({ ...l }))
  let contador = linhas.length
  const publico = ({ pfx_base64, ...resto }) => ({ ...resto }) // eslint-disable-line no-unused-vars
  return {
    async listar() { return linhas.map(publico) },
    async salvar({ nome, titular, emissor, validoDe, validoAte, icpBrasil, autoassinado, impressao, bytes }) {
      if (linhas.some(l => l.impressao === impressao)) throw new ErroCertificados('Este certificado já está salvo na sua conta.', 'duplicado')
      if (linhas.length >= 10) throw new ErroCertificados('Limite de 10 certificados por conta. Remova um para adicionar outro.', 'limite')
      const linha = {
        id: `mem-${++contador}`, nome, titular, emissor: emissor || '',
        valido_de: validoDe ? dataParaIso(validoDe) : null, valido_ate: dataParaIso(validoAte),
        icp_brasil: Boolean(icpBrasil), autoassinado: Boolean(autoassinado), impressao,
        pfx_base64: bytesParaBase64(bytes), criado_em: new Date().toISOString(),
      }
      linhas.push(linha)
      return publico(linha)
    },
    async baixar(id) {
      const l = linhas.find(x => x.id === id)
      if (!l) throw new ErroCertificados('Certificado não encontrado.', 'inexistente')
      return base64ParaBytes(l.pfx_base64)
    },
    async remover(id) {
      const i = linhas.findIndex(x => x.id === id)
      if (i >= 0) linhas.splice(i, 1)
    },
  }
}
