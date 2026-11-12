// utils/assinaturas/selo.js — aparência do selo visível da assinatura, por grupo.
//
// O selo é o quadro que aparece na página com o nome do titular e a data. As
// opções abaixo controlam só o desenho; o tamanho e a posição do quadro são do
// campo (geometria.js). O desenho é sempre o padrão do Adobe Acrobat, sem borda, e o
// tamanho do texto é sempre o maior que cabe no quadro (ver seloLayout.js).

export const SELO_PADRAO = Object.freeze({
  mostrarRotulo: true,      // "Assinado de forma digital por …"
  mostrarData: true,        // "Dados: 2026.11.10 08:18:05 -03'00'"
  textoExtra: '',           // linha opcional abaixo das outras (ex.: "CREA 1234-MA")
})

export const MAX_TEXTO_EXTRA = 80

/** Completa e valida as opções; qualquer valor inválido volta ao padrão. */
export function normalizarSelo(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  return {
    mostrarRotulo: e.mostrarRotulo !== false,
    mostrarData: e.mostrarData !== false,
    textoExtra: String(e.textoExtra ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_EXTRA),
  }
}
