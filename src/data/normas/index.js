/**
 * normas/index.js — Loader central de normas
 *
 * TODA norma vem da base central (tabela `normas_dados` do Supabase — ver
 * lib/normasRemote.js). Não há mais fallback para arquivos locais nem para
 * a norma de outro estado: o projeto só abre depois que as normas do estado
 * carregaram (ver ProjectLayout em App.jsx) e, se um sistema não estiver
 * cadastrado para o estado, o getter devolve null — quem consome mostra
 * "norma não cadastrada" em vez de aplicar a norma errada em silêncio.
 *
 * Os arquivos em src/data/normas/<UF>/*.js ficam só como fonte das
 * migrações de seed (supabase/migrations/*seed_normas*) e dos testes — o
 * app não os importa.
 *
 * COMO ADICIONAR UM NOVO ESTADO:
 *   1. Cadastre as normas do estado na tabela `normas_dados` do Supabase
 *      (sistemas 'ocupacoes' + 'medidas_seguranca', no mínimo, pra um
 *      projeto completo; só 'saida_emergencia' já libera "apenas
 *      dimensionamento").
 *   2. Adicione { uf:'UF', nome:'...' } em ESTADOS_BASE, logo abaixo.
 *   3. Pronto — getEstadosDisponiveis() calcula ativo/ativoDimensionamento
 *      sozinho a partir do catálogo do Supabase (ver disponibilidadeEstado).
 */

import { getNormaRemota, sistemaExisteNoCatalogo } from '../../lib/normasRemote'
import * as CATALOGOS_HIDRANTES from '../hidrantesCatalogos'
import { IMAGEM_PLACA } from '../sinalizacaoImagens'

// Estados listados no seletor — nome/uf fixos (cadastro de um estado novo
// ainda exige entrar aqui), mas `ativo`/`ativoDimensionamento` vêm do
// catálogo do Supabase (getEstadosDisponiveis).
const ESTADOS_BASE = [
  { uf: 'MA', nome: 'Maranhao — MA'   },
  { uf: 'PE', nome: 'Pernambuco — PE' },
  { uf: 'PB', nome: 'Paraiba — PB'    },
]

// Projeto completo precisa, no mínimo, de classificação de ocupação
// ('ocupacoes') e da tabela de medidas obrigatórias ('medidas_seguranca',
// Tabela 5/6) — sem as duas, o motor de normas (useMedidasObrigatorias)
// não tem como classificar nem decidir nada pra esse estado. Projeto
// "apenas dimensionamento" só precisa de saída de emergência.
function disponibilidadeEstado(uf) {
  const ativo = sistemaExisteNoCatalogo(uf, 'ocupacoes') && sistemaExisteNoCatalogo(uf, 'medidas_seguranca')
  const ativoDimensionamento = ativo || sistemaExisteNoCatalogo(uf, 'saida_emergencia')
  return { ativo, ativoDimensionamento }
}

/** Lista de estados pro seletor, com `ativo`/`ativoDimensionamento`
 * recalculados a cada chamada — chamar dentro do render, pra sempre
 * refletir o catálogo mais recente (ver normasVersion em ProjetoContext.jsx). */
export function getEstadosDisponiveis() {
  return ESTADOS_BASE.map(e => ({ ...e, ...disponibilidadeEstado(e.uf) }))
}

// A tabela `normas_dados` guarda as chaves em minúsculo; o resto do site lê
// os nomes SCREAMING_SNAKE_CASE. Convenção: cada chave devolvida é o nome em
// maiúsculo, lido de `remoto[chave em minúsculo]`
// (ex.: DISTANCIA_MAXIMA <- remoto.distancia_maxima).
function renomearDaBaseCentral(remoto, chaves) {
  const out = {}
  for (const chave of chaves) out[chave] = remoto[chave.toLowerCase()]
  return out
}

// saida_emergencia é a única exceção a essa convenção — foi o primeiro
// sistema migrado, e herdou os nomes mais curtos que o lado Python já
// usava antes de a base central existir (ver
// Fire Utils.tab/lib/normas/__init__.py._CHAVES_SAIDAS): tabela, notas,
// larguras_minimas, distancias_maximas em vez de TAXA_POPULACIONAL,
// NOTAS_NORMATIVAS, LARGURAS_MINIMAS, DISTANCIAS_MAXIMAS.
function adaptarSEDaBaseCentral(remoto) {
  return {
    ...remoto,
    TAXA_POPULACIONAL: remoto.tabela,
    NOTAS_NORMATIVAS: remoto.notas,
    LARGURAS_MINIMAS: remoto.larguras_minimas,
    DISTANCIAS_MAXIMAS: remoto.distancias_maximas,
    // Sem `tipos_escada` na linha: fica sem tabela (a tela avisa).
    TIPOS_ESCADA: remoto.tipos_escada ?? null,
  }
}

const CHAVES_AV   = ['GATILHO', 'NOTAS', 'VIA_ACESSO']
const CHAVES_TRRF = ['NORMA', 'CLASSES_ALTURA', 'CLASSES_SUBSOLO', 'DIVISOES_SEM_OCUPACAO_SUBSOLO', 'METODOLOGIA_POR_MATERIAL', 'NOTAS_ANEXO_B', 'TABELA_TRRF']
const CHAVES_EXT  = ['NORMA', 'CAPACIDADE_POR_NIVEL', 'ALTURA_INSTALACAO', 'AREA_LIMITE_UNIDADE_UNICA', 'DISTANCIA_ENTRADA_ESCADA', 'DISTANCIA_MAXIMA', 'LIMIARES_RISCO', 'LOCAIS_RISCO_ESPECIAL', 'NOTAS', 'PROPORCAO_RISCO_SECUNDARIO', 'TIPOS_PORTATIL', 'TIPOS_SOBRE_RODAS']
const CHAVES_ILU  = ['NORMA', 'ROTULOS_ILUMINANCIA', 'DISTANCIA_MAXIMA_PONTOS_M', 'DISTANCIA_MAXIMA_PAREDE_M', 'TENSAO_MAXIMA_V', 'AUTONOMIA_MINIMA_HORAS', 'CAMPOS_EQUIPAMENTO', 'EQUIPAMENTOS_ACLARAMENTO', 'ILUMINANCIA_MINIMA', 'NOTAS', 'PRESETS_EQUIPAMENTO', 'RAZAO_UNIFORMIDADE_MAX', 'TEMPO_RESPOSTA_MAX_S', 'TIPOS_SISTEMA']
const CHAVES_SIN  = ['CATEGORIAS', 'NOTAS', 'TIPOS_PLACA']
const CHAVES_MED  = ['LIMIARES', 'MEDIDAS', 'NOTAS_ESPECIFICAS', 'TABELA_SIMPLIFICADA']
const CHAVES_NTS  = ['NTS_PADRAO_MA', 'NTS_POR_SISTEMA', 'NT_CARGA_INCENDIO']
const CHAVES_DA   = ['NORMA', 'REFERENCIAS', 'ALIMENTACAO', 'CENTRAL', 'ACIONADOR', 'AVISADOR', 'FIACAO', 'ENTREFORROS', 'SEM_FIO', 'COMPLEMENTARES', 'DETECTORES', 'COMISSIONAMENTO', 'MANUTENCAO', 'ITENS', 'NOTAS_POR_DIVISAO', 'NOTAS_GERAIS']
const CHAVES_MEMF = [
  'NORMA', 'FORMAS_APRESENTACAO', 'DIVISOES_FORA_DO_FORMULARIO', 'CLASSES_ALTURA', 'RISCOS_VALIDADE',
  'NIVEIS_CARGA', 'CLASSES_GLP', 'ESTAGIOS_CONSTRUCAO', 'RISCOS_ESPECIAIS', 'CMAR_LINHAS',
  'MODELOS_PLANO', 'EXTINTORES_NIVEL', 'ACESSO_VIATURA',
]
const CHAVES_BRIG = ['NORMA', 'TABELA_A1', 'NOTAS_TABELA_A1', 'NOTAS_GERAIS', 'OBSERVACOES_TRANSCRICAO', 'DIMENSIONAMENTO_PUBLICO', 'CARGA_HORARIA_TREINAMENTO']
const CHAVES_COMP = [
  'CLASSES_TIPO_EDIFICACAO', 'TABELA_AREA_MAXIMA', 'NOTA_AREA_MAXIMA_M2',
  'TRRF_MINIMO_PAREDE_COMPARTIMENTACAO', 'TRRF_REDUCAO_MAXIMA_ABERTURAS',
  'TRRF_MINIMO_ENCLAUSURAMENTO_ESCADA_ELEVADOR', 'TRRF_MINIMO_SELAGEM_PRUMADAS',
  'TRRF_MINIMO_DUTO_SEM_REGISTRO', 'TRRF_PORTA_ESCADA_SEM_ANTECAMARA',
  'TRRF_PORTA_ESCADA_COM_ANTECAMARA', 'TRRF_ESCADA_RAMPA_SUBSOLO',
  'ELEMENTOS_COMPART_HORIZONTAL', 'ELEMENTOS_COMPART_VERTICAL',
  'CONDICOES_ESPECIAIS_HORIZONTAL', 'CONDICOES_ESPECIAIS_VERTICAL',
  'SUBSTITUICOES_COMPARTIMENTACAO', 'NOTAS_GERAIS_AREA_MAXIMA', 'NORMA',
]
const CHAVES_CMAR = ['TABELA_B1', 'NOTAS', 'NORMA']
const CHAVES_VAL  = ['NORMA', 'TABELA_ANEXO_B']
const CHAVES_ISO  = ['NORMA', 'TABELA_A1', 'REDUTORES']
const CHAVES_HID  = [
  'NORMA', 'REFERENCIA_PRESSAO_VAZAO', 'TIPOS_SISTEMA', 'COMPONENTES_POR_TIPO',
  'LABEL_MANGUEIRA_INCENDIO', 'FAIXAS_AREA', 'TABELA3', 'DIVISOES_COLUNA',
  'DIVISOES_POR_CARGA',
  'BOMBA_RESERVA_POR_RISCO', 'VAZAO_LIMITE_RECALQUE_DUPLO', 'ALTITUDES_SUCCAO',
  'TEMPERATURAS_SUCCAO', 'ALTITUDE_SUCCAO_PADRAO', 'TEMPERATURA_SUCCAO_PADRAO',
  'HIDRANTES_SIMULTANEOS', 'HIDRANTES_SIMULTANEOS_REF', 'V_MAX_TUBULACAO',
  'V_MAX_TUBULACAO_REF', 'V_MAX_SUCCAO_POSITIVA', 'V_MAX_SUCCAO_NEGATIVA',
  'V_MAX_SUCCAO_REF', 'TOLERANCIA_EQUILIBRIO_MCA', 'TOLERANCIA_EQUILIBRIO_MCA_REF',
  'NPSHD_FATOR_VAZAO', 'NPSHD_REF',
]

// JSON não serializa `Infinity` (vira `null`) — as migrações gravam "sem
// teto" como a string "Infinity"; desfaz aqui antes de entregar pros calcs
// (comparam `valor <= classe.max`).
function comInfinidade(classes) {
  return (classes || []).map((c) => (c.max === 'Infinity' ? { ...c, max: Infinity } : c))
}

// Linha remota de `sistema` com as chaves renomeadas, ou null quando o
// estado não tem esse sistema cadastrado.
function remotoRenomeado(uf, sistema, chaves) {
  const remoto = getNormaRemota(uf, sistema)
  return remoto ? renomearDaBaseCentral(remoto, chaves) : null
}

/** Ocupações (sistema 'ocupacoes' = norma + ocupações) e mapa de CNAEs
 * (sistema 'carga_incendio') do estado; null sem nenhum dos dois. */
export function getNorma(uf) {
  const remotoOcup  = getNormaRemota(uf, 'ocupacoes')
  const remotoCarga = getNormaRemota(uf, 'carga_incendio')
  if (!remotoOcup && !remotoCarga) return null
  return {
    NORMA: remotoOcup?.norma ?? null,
    OCUPACOES: remotoOcup?.ocupacoes ?? {},
    CARGADEINCENDIO: remotoCarga?.cargadeincendio ?? {},
  }
}

export function getSE(uf) {
  const remoto = getNormaRemota(uf, 'saida_emergencia')
  return remoto ? adaptarSEDaBaseCentral(remoto) : null
}
export function getAV(uf) { return remotoRenomeado(uf, 'acesso_viatura', CHAVES_AV) }
export function getTRRF(uf) {
  const adaptado = remotoRenomeado(uf, 'trrf', CHAVES_TRRF)
  if (!adaptado) return null
  return { ...adaptado, CLASSES_ALTURA: comInfinidade(adaptado.CLASSES_ALTURA), CLASSES_SUBSOLO: comInfinidade(adaptado.CLASSES_SUBSOLO) }
}
export function getExtintores(uf) { return remotoRenomeado(uf, 'extintores', CHAVES_EXT) }
export function getIluminacao(uf) { return remotoRenomeado(uf, 'iluminacao', CHAVES_ILU) }
// TIPOS_PLACA da base central não carrega `img` (asset do bundler, não dá
// pra serializar): o pictograma é casado pelo `key` (data/sinalizacaoImagens.js).
export function getSinalizacao(uf) {
  const adaptado = remotoRenomeado(uf, 'sinalizacao', CHAVES_SIN)
  if (!adaptado) return null
  // E1 é o alarme sonoro (não "telefone"); e a altura de instalação não é
  // exibida nas placas — vale para qualquer origem dos dados (base central ou seed).
  const semAltura = local => (/altura/i.test(local || '') ? undefined : local)
  return {
    ...adaptado,
    TIPOS_PLACA: (adaptado.TIPOS_PLACA || []).map(t => ({
      ...t, img: IMAGEM_PLACA[t.key],
      ...(t.key === 'e1' ? { label: 'Alarme sonoro' } : {}),
      localInstalacao: semAltura(t.localInstalacao),
    })),
  }
}
export function getCompartimentacao(uf) {
  const adaptado = remotoRenomeado(uf, 'compartimentacao', CHAVES_COMP)
  if (!adaptado) return null
  return { ...adaptado, CLASSES_TIPO_EDIFICACAO: comInfinidade(adaptado.CLASSES_TIPO_EDIFICACAO) }
}
// Anexo B da NT 02/2023 CBMPB: risco e validade da inspeção por divisão.
export function getValidadeInspecao(uf) { return remotoRenomeado(uf, 'validade_inspecao', CHAVES_VAL) }
// NT 20/2023 CBMPB: índice α (Tabela A-1) e redutores do isolamento de risco.
export function getIsolamentoRisco(uf) { return remotoRenomeado(uf, 'isolamento_risco', CHAVES_ISO) }
export function getControleAcabamento(uf) { return remotoRenomeado(uf, 'controle_acabamento', CHAVES_CMAR) }
export function getNts(uf) { return remotoRenomeado(uf, 'nts', CHAVES_NTS) }
// Catálogos globais de hidrantes (materiais, recalque, acionamento) são
// listas de equipamento do app, não norma — juntados à norma do estado.
export function getHidrantes(uf) {
  const base = remotoRenomeado(uf, 'hidrantes', CHAVES_HID)
  return base ? { ...base, ...CATALOGOS_HIDRANTES } : null
}
// Norma compartilhada pelas medidas 'alarme' e 'deteccao' (NT 19).
export function getDeteccaoAlarme(uf) { return remotoRenomeado(uf, 'deteccao_alarme', CHAVES_DA) }
// Parâmetros do memorial em formato de formulário do CBM (hoje só a PB);
// null = o estado usa o memorial em texto corrido (MemorialDescritivoPage.jsx).
export function getMemorialFormulario(uf) { return remotoRenomeado(uf, 'memorial_formulario', CHAVES_MEMF) }
export function usaMemorialFormulario(uf) { return !!getNormaRemota(uf, 'memorial_formulario') }
export function getBrigada(uf) { return remotoRenomeado(uf, 'brigada', CHAVES_BRIG) }
export function getOcupacoes(uf)   { return getNorma(uf)?.OCUPACOES ?? {} }
export function getGrupos(uf)      {
  const oc = getOcupacoes(uf)
  return Object.fromEntries(Object.entries(oc).map(([k, v]) => [k, v.descricao ?? k]))
}
export function getCargaMap(uf)    { return getNorma(uf)?.CARGADEINCENDIO ?? {} }
export function getNormaInfo(uf)   { return getNorma(uf)?.NORMA ?? null }

// Retorna todos os CNAEs de uma divisao especifica
export function getCNAEsDivisao(uf, divisao) {
  const mapa = getCargaMap(uf)
  return mapa[divisao] ?? {}
}

// Retorna a carga de um CNAE especifico numa divisao
export function getCargaCNAE(uf, divisao, cnae) {
  return getCNAEsDivisao(uf, divisao)[cnae] ?? null
}

// Busca um CNAE (codigo exato) em toda a base, em qualquer divisao — usado
// pra resolver automaticamente grupo/divisao a partir de um CNAE já
// conhecido (ex: vindo da Receita Federal via consulta de CNPJ), ao
// contrario de buscarCNAE (que faz busca textual parcial pro autocomplete).
export function buscarCNAEExato(uf, cnae) {
  const mapa = getCargaMap(uf)
  for (const [divisao, cnaes] of Object.entries(mapa)) {
    if (cnaes[cnae]) return { cnae, divisao, grupo: divisao.charAt(0), ...cnaes[cnae] }
  }
  return null
}

// Indica se a divisao tem algum CNAE cadastrado na base normativa. Algumas
// divisoes (ex: J-1..J-4, varias do grupo M) nao tem nenhum — a carga ja
// vem definida no proprio nome da divisao, e o usuario preenche por
// levantamento em vez de escolher um CNAE. Usado pra nao exigir CNAE de
// divisoes que nunca terao um pra escolher.
export function temCNAECadastrado(uf, divisao) {
  return Object.keys(getCNAEsDivisao(uf, divisao)).length > 0
}

// ── Medidas de segurança ─────────────────────────────────────────────────────

export function getMedidas(uf) { return remotoRenomeado(uf, 'medidas_seguranca', CHAVES_MED) }

/**
 * Resolve as medidas de segurança exigidas para uma edificação.
 *
 * @param {string}   uf       — estado (ex: 'MA')
 * @param {string[]} divisoes — lista de divisões (ex: ['C-2','D-1'])
 * @param {number}   altura   — altura em metros
 * @param {number}   area     — área construída total em m²
 *
 * @returns {{
 *   simplificado: boolean,
 *   medidas: Record<string, { obrigatorio: boolean, notasGerais: string[], notaSimp?: number }>
 * }}
 */
export function getMedidasObrigatorias(uf, divisoes, altura, area) {
  const norma = getMedidas(uf)
  if (!norma) return null

  const h = parseFloat(altura) || 0
  const a = parseFloat(area)   || 0
  const { LIMIARES, TABELA_SIMPLIFICADA, MEDIDAS } = _partesMedidas(norma)
  const simplificado = ehSimplificado(LIMIARES, a, h)

  return simplificado
    ? _resolverSimplificado(TABELA_SIMPLIFICADA, divisoes)
    : _resolverNormal(MEDIDAS, divisoes, h)
}

/**
 * Retorna as letras de grupo (dentre `divisoes`) para as quais a norma
 * ainda nao possui dados cadastrados na tabela aplicavel (simplificada ou
 * normal, conforme altura/area). Usado para sinalizar quando o resultado de
 * `getMedidasObrigatorias` esta incompleto e uma exigencia minima de
 * referencia deve ser aplicada manualmente.
 *
 * @param {string}   uf
 * @param {string[]} divisoes
 * @param {number}   altura
 * @param {number}   area
 * @returns {string[]} letras de grupo sem dados (ex: ['G','K'])
 */
export function getGruposSemDados(uf, divisoes, altura, area) {
  const norma = getMedidas(uf)
  if (!norma) return [...new Set(divisoes.map(d => d.charAt(0)))]

  const h = parseFloat(altura) || 0
  const a = parseFloat(area)   || 0
  const { LIMIARES, TABELA_SIMPLIFICADA, MEDIDAS } = _partesMedidas(norma)
  const simplificado = ehSimplificado(LIMIARES, a, h)

  const faltantes = new Set()
  divisoes.forEach(div => {
    const grupo = div.charAt(0)
    const temDado = simplificado
      ? !!(TABELA_SIMPLIFICADA.divisoes?.[div] || TABELA_SIMPLIFICADA.grupos?.[grupo])
      : !!_medidasDaDivisaoNormal(MEDIDAS, div)
    if (!temDado) faltantes.add(grupo)
  })
  return [...faltantes]
}

/**
 * Retorna o texto da nota específica de uma medida para um grupo/divisão.
 * Prioridade: divisão exata → grupo (letra).
 *
 * @param {string} uf
 * @param {string} divisao — ex: 'A-1' ou 'F-3'
 * @param {string} medida  — ex: 'compart_horizontal'
 * @returns {string|null}
 */
export function getNotaMedida(uf, divisao, medida) {
  const norma = getMedidas(uf)
  if (!norma?.NOTAS_ESPECIFICAS) return null
  const notas = norma.NOTAS_ESPECIFICAS
  return notas[divisao.charAt(0)]?.[medida] ?? null
}

// Partes da tabela de medidas com fallback vazio: uma linha da base central
// que venha sem a tabela simplificada (ou sem a normal) não pode derrubar a
// tela — a divisão sem dado vira "grupo sem dados" (getGruposSemDados) e o
// motor aplica o mínimo de referência (useMedidasObrigatorias), como já
// acontece com uma divisão que a tabela não cobre.
// Processo simplificado (Tabela 5): abaixo dos limiares de área e altura.
// `inclusivo` = o próprio limite ainda é simplificado ("área menor ou igual a
// 930 m² e altura inferior ou igual a 12 m", NT 04/2023 CBMPB); sem a marca,
// "<" estrito (regra do MA).
export function ehSimplificado(LIMIARES, area, altura) {
  return LIMIARES.inclusivo
    ? area <= LIMIARES.areaMin && altura <= LIMIARES.alturaMin
    : area < LIMIARES.areaMin && altura < LIMIARES.alturaMin
}

function _partesMedidas(norma) {
  return {
    LIMIARES: norma.LIMIARES || { areaMin: 0, alturaMin: 0 },
    TABELA_SIMPLIFICADA: norma.TABELA_SIMPLIFICADA || {},
    MEDIDAS: norma.MEDIDAS || {},
  }
}

// Resolve Tabela 5 — processo simplificado
function _resolverSimplificado(tabela, divisoes) {
  const resultado = {}

  divisoes.forEach(div => {
    const grupo = div.charAt(0)
    const src = tabela.divisoes?.[div] ?? tabela.grupos?.[grupo] ?? {}

    Object.entries(src).forEach(([medida, val]) => {
      if (!resultado[medida]) resultado[medida] = { obrigatorio: true, notasGerais: [] }
      // val pode ser true ou { notaSimp: N } — registra a nota da Tabela 5
      if (val !== true && val?.notaSimp !== undefined) {
        resultado[medida].notaSimp = val.notaSimp
      }
    })
  })

  return { simplificado: true, medidas: resultado }
}

// Resolve Tabela 6 — processo normal (condições por divisão e altura)
function _resolverNormal(MEDIDAS, divisoes, altura) {
  const todasMedidas = new Set()
  divisoes.forEach(div => {
    const medidas = _medidasDaDivisaoNormal(MEDIDAS, div)
    if (medidas) Object.keys(medidas).forEach(m => todasMedidas.add(m))
  })

  const resultado = {}
  todasMedidas.forEach(m => { resultado[m] = { obrigatorio: false, notasGerais: [] } })

  divisoes.forEach(divisao => {
    const medidas = _medidasDaDivisaoNormal(MEDIDAS, divisao)
    if (!medidas) return

    Object.entries(medidas).forEach(([medida, cond]) => {
      const conditions = Array.isArray(cond) ? cond : [cond]

      for (const c of conditions) {
        if (_condSatisfeita(c, divisao, altura)) {
          resultado[medida].obrigatorio = true
          if (c.notaGeral && !resultado[medida].notasGerais.includes(c.notaGeral)) {
            resultado[medida].notasGerais.push(c.notaGeral)
          }
          break
        }
      }
    })
  })

  return { simplificado: false, medidas: resultado }
}

// Retorna o mapa `medida -> condicao` (Tabela 6) aplicavel a uma divisao.
//
// A maioria dos grupos guarda isso diretamente em `MEDIDAS[grupo].medidas`
// (mapa plano medida->condicao, valido para todas as divisoes do grupo,
// com a propria condicao filtrando por `divisoes` quando necessario).
//
// Grupos com multiplas subtabelas por divisao (ex: Grupo F, que tem as
// Tabelas 6F.1 a 6F.5) nao tem `.medidas` direto — em vez disso `MEDIDAS[grupo]`
// e um dicionario de subtabelas, cada uma com seu proprio `.medidas` indexado
// pela(s) divisao(oes) daquela linha (chave exata, ex: 'F-11', ou combinada
// com '_', ex: 'F-3_F-9' para divisoes que compartilham a mesma linha).
function _medidasDaDivisaoNormal(MEDIDAS, divisao) {
  const grupo = MEDIDAS[divisao.charAt(0)]
  if (!grupo) return null
  if (grupo.medidas) return _tabelaAvaliavel(grupo)

  // Subtabela indexada pela(s) divisão(ões) na PRÓPRIA chave (formato da
  // NT 04/2023 CBMPB: MEDIDAS.F['F-3_F-9'].medidas = { medida: condição }).
  // Pode ainda vir com um nível por divisão dentro de `medidas` (M-4_M-7:
  // .medidas['M-4'] = { brigada: true, ... }).
  const daChave = Object.entries(grupo).find(([k, sub]) => sub && typeof sub === 'object' && k.split('_').includes(divisao))
  if (daChave) {
    const medidas = _tabelaAvaliavel(daChave[1])
    const porDivisao = medidas && Object.keys(medidas).find(k => k.split('_').includes(divisao))
    return porDivisao ? medidas[porDivisao] : medidas
  }

  // Subtabela com as divisões DENTRO de `medidas` (formato do MA:
  // MEDIDAS.F['F1_F2'].medidas['F-1'] = { medida: condição }).
  for (const subtabela of Object.values(grupo)) {
    const porDivisao = subtabela?.medidas
    if (!porDivisao || typeof porDivisao !== 'object') continue
    const chave = Object.keys(porDivisao).find(k => k.split('_').includes(divisao))
    if (chave) return porDivisao[chave]
  }
  return null
}

// Só tabelas por divisão × altura entram no motor. As que dependem de outro
// critério que o app não coleta (volume de líquidos do Grupo K, extensão do
// túnel M-1, colunas de tanques/plataformas do M-2) ou que remetem a
// Comissão Técnica / norma específica (`medidas` em texto — L, M-6) contam
// como "sem dados": o motor aplica o mínimo de referência e sinaliza o grupo
// (getGruposSemDados) em vez de decidir sozinho.
function _tabelaAvaliavel(tabela) {
  if (!tabela.medidas || typeof tabela.medidas !== 'object') return null
  if (tabela.criterio || tabela.faixas || tabela.colunas) return null
  return tabela.medidas
}

function _condSatisfeita(cond, divisao, altura) {
  // Exigência fixa, sem condição de altura (ex.: M-4/M-7 da NT 04/2023 CBMPB:
  // `brigada: true` ou `{ exigido: true, notaEspecifica }`).
  if (typeof cond === 'boolean') return cond
  if (!cond || typeof cond !== 'object') return false
  if (cond.divisoes === undefined) return !!cond.exigido
  if (Array.isArray(cond.divisoes) && cond.divisoes.length === 0) return false
  if (cond.divisoes !== 'todas' && !cond.divisoes.includes(divisao)) return false
  const min = cond.alturaMin ?? -Infinity
  const max = cond.alturaMax ?? Infinity
  return altura > min && altura <= max
}

// ── CNAEs ────────────────────────────────────────────────────────────────────

// Busca um CNAE em TODAS as divisoes (para autocomplete global)
export function buscarCNAE(uf, query) {
  if (!query || query.length < 3) return []
  const mapa = getCargaMap(uf)
  const results = []
  const q = query.toLowerCase()
  Object.entries(mapa).forEach(([divisao, cnaes]) => {
    Object.entries(cnaes).forEach(([cnae, dados]) => {
      if (
        cnae.includes(query) ||
        dados.descricao.toLowerCase().includes(q)
      ) {
        results.push({ cnae, divisao, ...dados })
      }
    })
  })
  return results.slice(0, 20) // max 20 resultados
}
