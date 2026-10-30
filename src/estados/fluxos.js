// Estados com fluxo próprio de preenchimento das medidas (páginas em
// estados/<UF>/paginas) — em vez das páginas detalhadas do MA. Só dado, para
// módulos de cálculo/auditoria consultarem sem importar componentes.
export const ESTADOS_COM_FLUXO_PROPRIO = new Set(['PB'])

// Campos da Configuração que o estado não usa — somem da tela e da auditoria
// (PB: o formulário do CBMPB não pede contato, proprietário, AVCB, terreno,
// público, área complementar nem características construtivas).
const CAMPOS_OCULTOS = {
  PB: new Set([
    'respFantasia', 'respTelefone', 'respEmail',
    'propNome', 'propDocumento', 'propTelefone', 'propEmail',
    'areaTerreno', 'areaComplementar',
    'caracteristicasEstrutura', 'cobertura', 'fachada',
  ]),
}
// Campos que o estado deixa opcionais (PB: CNPJ).
const CAMPOS_OPCIONAIS = { PB: new Set(['respCNPJ']) }

/** O campo da Configuração fica fora da tela para o estado? */
export const campoOculto = (uf, id) => !!CAMPOS_OCULTOS[uf]?.has(id)
/** O campo (obrigatório no padrão) é opcional para o estado? */
export const campoOpcionalNoEstado = (uf, id) => !!CAMPOS_OPCIONAIS[uf]?.has(id)

// Estados em que a ART é obrigatória (o RT não pode desligá-la na Etapa 3).
const ART_OBRIGATORIA = new Set(['PB'])
export const artObrigatoria = uf => ART_OBRIGATORIA.has(uf)
/** ART em uso no projeto: ligada pelo RT ou obrigatória no estado. */
export const usaArtNoProjeto = state => !!state?.usaArt || artObrigatoria(state?.uf)
