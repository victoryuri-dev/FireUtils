// utils/assinaturas/selo.js — aparência do selo visível da assinatura, por grupo.
//
// O selo é o quadro que aparece na página com o nome do titular e a data. As
// opções abaixo controlam só o desenho; o tamanho e a posição do quadro são do
// campo (geometria.js). O tamanho do texto não é opção: é sempre o maior que cabe
// no quadro (ver seloLayout.js).

/** 'adobe': nome grande à esquerda e detalhes à direita, como no Adobe Acrobat. */
export const ESTILOS = ['adobe', 'simples']

export const ROTULO_ESTILO = { adobe: 'Adobe Acrobat', simples: 'Simples (texto corrido)' }

export const ALINHAMENTOS = ['esquerda', 'centro']

export const ROTULO_ALINHAMENTO = { esquerda: 'Esquerda', centro: 'Centralizado' }

export const SELO_PADRAO = Object.freeze({
  estilo: 'adobe',
  alinhamento: 'esquerda',  // só no estilo simples; 'centro' também centraliza na vertical
  mostrarRotulo: true,      // "Assinado de forma digital por …" (adobe) / "Assinado digitalmente por" (simples)
  mostrarData: true,        // "Dados: 2026.11.10 08:18:05 -03'00'" (adobe) / "Data: …" (simples)
  borda: true,
  textoExtra: '',           // linha opcional abaixo das outras (ex.: "CREA 1234-MA")
})

export const MAX_TEXTO_EXTRA = 80

/** Completa e valida as opções; qualquer valor inválido volta ao padrão. */
export function normalizarSelo(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  return {
    estilo: ESTILOS.includes(e.estilo) ? e.estilo : SELO_PADRAO.estilo,
    alinhamento: ALINHAMENTOS.includes(e.alinhamento) ? e.alinhamento : SELO_PADRAO.alinhamento,
    mostrarRotulo: e.mostrarRotulo !== false,
    mostrarData: e.mostrarData !== false,
    borda: e.borda !== false,
    textoExtra: String(e.textoExtra ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_EXTRA),
  }
}
