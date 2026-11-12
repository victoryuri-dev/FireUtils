// Servidor Vite de teste com a base normativa servida a partir dos arquivos
// de seed (src/data/normas/<UF>/*.js) no lugar do Supabase.
//
// O app não lê mais esses arquivos (toda norma vem de normas_dados — ver
// src/lib/normasRemote.js): aqui o módulo normasRemote é trocado por um stub
// que devolve, para cada (uf, sistema), a mesma linha que as migrações de
// seed gravam no banco — chaves em minúsculo, saida_emergencia com os nomes
// curtos. Assim os testes exercitam exatamente o caminho de produção
// (getters de normas/index.js lendo a "linha remota").
//
// `sobrescrever` ({ UF: { sistema: dados | null } }) troca ou remove linhas
// para um teste específico (null = sistema não cadastrado para o estado).
import { createServer } from 'vite'

const STUB = (sobrescrever) => `
import * as MA_OC   from '/src/data/normas/MA/ocupacoes.js'
import * as MA_SE   from '/src/data/normas/MA/saida_emergencia.js'
import * as MA_MED  from '/src/data/normas/MA/medidas.js'
import * as MA_AV   from '/src/data/normas/MA/acesso_viatura.js'
import * as MA_TRRF from '/src/data/normas/MA/trrf.js'
import * as MA_EXT  from '/src/data/normas/MA/extintores.js'
import * as MA_ILU  from '/src/data/normas/MA/iluminacao.js'
import * as MA_SIN  from '/src/data/normas/MA/sinalizacao.js'
import * as MA_CMAR from '/src/data/normas/MA/controle_acabamento.js'
import * as MA_COMP from '/src/data/normas/MA/compartimentacao.js'
import * as MA_NTS  from '/src/data/normas/MA/nts.js'
import * as MA_HID  from '/src/data/normas/MA/hidrantes.js'
import * as MA_BRIG from '/src/data/normas/MA/brigada_incendio.js'
import * as MA_DA   from '/src/data/normas/MA/deteccao_alarme.js'
import * as PB_OC   from '/src/data/normas/PB/ocupacoes.js'
import * as PB_SE   from '/src/data/normas/PB/saida_emergencia.js'
import * as PB_MEMF from '/src/data/normas/PB/memorial_formulario.js'
import * as PB_EXT  from '/src/data/normas/PB/extintores.js'
import * as PB_BRIG from '/src/data/normas/PB/brigada_incendio.js'
import * as PB_TRRF from '/src/data/normas/PB/trrf.js'
import * as PB_ILU  from '/src/data/normas/PB/iluminacao.js'
import * as PB_COMP from '/src/data/normas/PB/compartimentacao.js'
import * as PB_CMAR from '/src/data/normas/PB/controle_acabamento.js'
import * as PB_VAL from '/src/data/normas/PB/validade_inspecao.js'
import * as PB_ISO from '/src/data/normas/PB/isolamento_risco.js'

const linha = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]))
const se = m => ({ tabela: m.TAXA_POPULACIONAL, notas: m.NOTAS_NORMATIVAS, larguras_minimas: m.LARGURAS_MINIMAS, distancias_maximas: m.DISTANCIAS_MAXIMAS, ...(m.TIPOS_ESCADA ? { tipos_escada: m.TIPOS_ESCADA } : {}) })
const semImagem = m => ({ ...linha(m), tipos_placa: m.TIPOS_PLACA.map(({ img: _img, ...t }) => t) })

const DADOS = {
  MA: {
    ocupacoes: { norma: MA_OC.NORMA, ocupacoes: MA_OC.OCUPACOES },
    carga_incendio: { cargadeincendio: MA_OC.CARGADEINCENDIO },
    saida_emergencia: se(MA_SE), medidas_seguranca: linha(MA_MED), acesso_viatura: linha(MA_AV),
    trrf: linha(MA_TRRF), extintores: linha(MA_EXT), iluminacao: linha(MA_ILU), sinalizacao: semImagem(MA_SIN),
    controle_acabamento: linha(MA_CMAR), compartimentacao: linha(MA_COMP), nts: linha(MA_NTS),
    hidrantes: linha(MA_HID), brigada: linha(MA_BRIG), deteccao_alarme: linha(MA_DA),
  },
  PB: {
    ocupacoes: { norma: PB_OC.NORMA, ocupacoes: PB_OC.OCUPACOES },
    saida_emergencia: se(PB_SE), memorial_formulario: linha(PB_MEMF), extintores: linha(PB_EXT), brigada: linha(PB_BRIG), trrf: linha(PB_TRRF), iluminacao: linha(PB_ILU),
    compartimentacao: linha(PB_COMP), controle_acabamento: linha(PB_CMAR), validade_inspecao: linha(PB_VAL), isolamento_risco: linha(PB_ISO),
  },
}
const SOBRESCREVER = ${JSON.stringify(sobrescrever || {})}
for (const [uf, sistemas] of Object.entries(SOBRESCREVER)) {
  DADOS[uf] = DADOS[uf] || {}
  for (const [s, d] of Object.entries(sistemas)) { if (d === null) delete DADOS[uf][s]; else DADOS[uf][s] = d }
}

export const getNormaRemota = (uf, s) => DADOS[uf]?.[s] ?? null
export const sistemaExisteNoCatalogo = (uf, s) => !!DADOS[uf]?.[s]
export const normasCarregadas = () => true
export const statusNormas = () => 'ok'
export const statusCatalogo = () => 'ok'
export const carregarNormasRemotas = async () => {}
export const carregarCatalogoNormas = async () => {}
`

// `projeto` (opcional): estado servido por um stub de context/ProjetoContext
// (useProjeto) — para renderizar páginas em teste sem o Provider real.
const STUB_PROJETO = projeto => `
let estado = ${JSON.stringify(projeto || {})}
export function useProjeto() {
  return { state: estado, normasVersion: 0, dispatch: () => {}, recarregarNormas: () => {} }
}
export function ProjetoProvider({ children }) { return children }
`

export async function servidorComNormas(sobrescrever, projeto) {
  return createServer({
    server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent',
    plugins: [{
      name: 'normas-de-teste', enforce: 'pre',
      resolveId: id => (/lib\/normasRemote(\.js)?$/.test(id) ? '\0normas-de-teste'
        : projeto && /context\/ProjetoContext(\.jsx)?$/.test(id) ? '\0projeto-de-teste' : null),
      load: id => (id === '\0normas-de-teste' ? STUB(sobrescrever) : id === '\0projeto-de-teste' ? STUB_PROJETO(projeto) : null),
    }],
  })
}
