import { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { carregarNormasRemotas, carregarCatalogoNormas } from '../lib/normasRemote'
import { useAuth } from './AuthContext'
import { PROCEDIMENTOS_PADRAO } from '../utils/planoEmergencia'
import { dimsPadrao } from '../data/se_calc'
import { alturaEdificacaoBase, limparAlturasOcultas } from '../data/trrf_calc'

// Gera um ID interno único
export function newIds() {
  return {
    id:        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(),
  }
}

// Contador em memória — evita colisão de ID quando várias unidades são
// criadas no mesmo milissegundo (ex.: importação em lote do firedata.json).
let extintorSeq = 0
function idExtintor() {
  extintorSeq += 1
  return `ext-${Date.now().toString(36)}-${extintorSeq}-${Math.random().toString(36).slice(2, 5)}`
}

function novoExtintor(estruturaId, pavimentoId, ambiente, id) {
  return {
    id: id || idExtintor(),
    estruturaId, pavimentoId, ambiente: ambiente || '',
    // Capacidade extintora do agente escolhido no projeto — livre para o
    // projetista aumentar, mas sempre nasce preenchida com o mínimo
    // normativo do tipo padrão (pó ABC portátil, item 5.1.1 NT 21 CBMMA).
    tipo: 'po_abc', sobreRodas: false, capacidade: '2-A:20-B:C', quantidade: 1, carga: '',
  }
}

// Mesma lógica de idExtintor — evita colisão entre itens criados no mesmo
// milissegundo.
let iluminacaoSeq = 0
function idIluminacao() {
  iluminacaoSeq += 1
  return `ilu-${Date.now().toString(36)}-${iluminacaoSeq}-${Math.random().toString(36).slice(2, 5)}`
}

// Item de iluminação de emergência (aclaramento) — granularidade só até
// pavimento (sem ambiente), conforme NT 18 CBMMA / NBR 10898. `categoria`
// é sempre 'aclaramento'; `overrides` carrega a especificação completa do
// equipamento (tipoBase + campos técnicos + quantidade), uma cópia própria
// por item — sem catálogo compartilhado (ver IluminacaoPage.jsx).
function novoItemIluminacao(estruturaId, pavimentoId, categoria, overrides = {}, id) {
  return { id: id || idIluminacao(), estruturaId, pavimentoId, categoria, quantidade: 1, ...overrides }
}

// Mesma lógica de idExtintor/idIluminacao — evita colisão entre placas
// cadastradas no mesmo milissegundo.
let sinalizacaoSeq = 0
function idSinalizacao() {
  sinalizacaoSeq += 1
  return `sin-${Date.now().toString(36)}-${sinalizacaoSeq}-${Math.random().toString(36).slice(2, 5)}`
}

// entre linhas do CMAR cadastradas no mesmo milissegundo.
let acabamentoSeq = 0
function idAcabamento() {
  acabamentoSeq += 1
  return `cmar-${Date.now().toString(36)}-${acabamentoSeq}-${Math.random().toString(36).slice(2, 5)}`
}

// Linha do CMAR (Controle de Material de Acabamento e Revestimento) — uma
// por combinação estrutura+chave (`chave` = `${ambienteId}|${elemento}`,
// ver cmar_calc.js — `ambienteId` referencia acabamentoAmbientes, não mais
// o código da divisão). `origem` discrimina se a classe vem do catálogo de
// materiais incombustíveis ('incombustivel', classe sempre 'I'), do
// catálogo de materiais ensaiados ('ensaiado'), de cadastro manual
// ('manual', exige classeAdotada + fabricante + laudoNumero preenchidos
// para a classe ser considerada comprovada — ver classeResolvida em
// cmar_calc.js, nunca presume classe sem essa documentação) ou de
// 'nao_possui' (elemento dispensado pelo usuário, sem material algum).
// `normasEnsaio` é o campo livre do Quadro Resumo do memorial (ex.: "ISO
// 1182, NBR 9442") — não participa da comparação de classe, só da citação
// no memorial.
function novaLinhaAcabamento(estruturaId, chave) {
  return {
    id: idAcabamento(), estruturaId, chave,
    origem: '', materialId: '', materialNome: '',
    classeAdotada: '', fabricante: '', laudoNumero: '', laudoValidade: '', normasEnsaio: '',
  }
}

// Mesma lógica de idAcabamento — evita colisão entre ambientes do CMAR
// cadastrados no mesmo milissegundo.
let ambienteAcabamentoSeq = 0
function idAmbienteAcabamento() {
  ambienteAcabamentoSeq += 1
  return `cmaramb-${Date.now().toString(36)}-${ambienteAcabamentoSeq}-${Math.random().toString(36).slice(2, 5)}`
}

// Caixa "Edificação/Ambiente" do Quadro Resumo — por estrutura, totalmente
// editável pelo usuário (nome livre, adicionar/remover quantas quiser).
// Nasce com `nome` vazio quando criada manualmente (ControleAcabamentoPage.jsx
// pede o nome logo em seguida); quando semeada automaticamente a partir das
// divisões já classificadas na estrutura (INIT_AMBIENTES_ACABAMENTO), já
// nasce com um nome sugerido — mas sempre editável depois, nunca travado.
function novoAmbienteAcabamento(estruturaId, nome, id) {
  return { id: id || idAmbienteAcabamento(), estruturaId, nome: nome || '' }
}

// Mesma lógica de idAcabamento — evita colisão entre ambientes cadastrados
// no mesmo milissegundo (Saída de Emergência, SaidaEmergenciaPage.jsx).
let ambienteSESeq = 0
function idAmbienteSE() {
  ambienteSESeq += 1
  return `amb-${Date.now().toString(36)}-${ambienteSESeq}-${Math.random().toString(36).slice(2, 5)}`
}

// Mesma lógica de idAmbienteSE — evita colisão entre nós de Acesso/Saída
// criados no mesmo milissegundo (árvore de saída, SaidaEmergenciaPage.jsx
// / tela de Acessos e Descargas).
let acessoSeq = 0
function idAcesso() {
  acessoSeq += 1
  return `acs-${Date.now().toString(36)}-${acessoSeq}-${Math.random().toString(36).slice(2, 5)}`
}

// Árvore inicial de todo pavimento novo: uma raiz (Saída, se o pavimento
// nasce como piso de descarga; Escada/Rampa nos demais — ver tipoDoNo em
// se_calc.js, que decide isso pela posição na árvore + `pisoDescarga` do
// pavimento, não por um campo aqui) já com um Acesso dentro dela, pronto
// pra receber ambientes. Evita a tela vazia "Nenhuma saída criada ainda"
// no primeiro uso — o usuário sempre pode renomear, criar mais raízes/
// acessos ou remover estes, como qualquer outro nó da árvore.
function acessosPadrao(pisoDescarga) {
  const raizId = idAcesso()
  return [
    { id: raizId, nome: pisoDescarga ? 'Saída 01' : 'Escada/Rampa 01', alimentaEm: null },
    { id: idAcesso(), nome: 'Acesso 1', alimentaEm: raizId },
  ]
}

// Item de sinalização de emergência — granularidade só até estrutura (sem
// pavimento nem ambiente): as famílias de placa (categoria "Dispositivos de
// Segurança", parâmetro de tipo "Código da Placa") não são lançadas por
// pavimento no Revit, então o quantitativo do plugin também sai agregado só
// por estrutura. `tipoPlaca` referencia a chave do catálogo em
// normas/MA/sinalizacao.js (TIPOS_PLACA).
function novoItemSinalizacao(estruturaId, tipoPlaca, quantidade, id) {
  return { id: id || idSinalizacao(), estruturaId, tipoPlaca, quantidade }
}

// Mesma lógica de idSinalizacao/idAcabamento — evita colisão entre notas
// criadas no mesmo milissegundo (bloco de Notas do Dashboard).
let notaSeq = 0
function idNota() {
  notaSeq += 1
  return `nota-${Date.now().toString(36)}-${notaSeq}-${Math.random().toString(36).slice(2, 5)}`
}

// Bloco de nota livre do Dashboard — `html` guarda o conteúdo já formatado
// (negrito/itálico/sublinhado/traçado/cor/lista), gerado pelo próprio
// contentEditable (ver NotasCard em DashboardPage.jsx). Uso livre do
// projetista, não entra em nenhum cálculo normativo nem no memorial.
// `atualizadoEm` vem sempre já resolvido pelo resolverAcaoLocal (mesmo
// motivo do id) — se cada aba calculasse o próprio `new Date()` ao receber
// a action via broadcast, o timestamp divergiria entre as abas conforme a
// latência da rede.
function novaNota(id, atualizadoEm) {
  return { id: id || idNota(), titulo: '', html: '', cor: null, atualizadoEm }
}

// Normaliza um estado salvo (localStorage ou payload de LOAD) contra
// INITIAL_STATE — protege objetos aninhados que ganharam campos novos desde
// que o projeto foi salvo (ex.: manobraRetornoOk, iluminacaoSistema.especi-
// ficacoes) de sumirem só porque o resto do objeto salvo já existia. Usada
// tanto na hidratação inicial (boot/F5) quanto na ação 'LOAD' — as duas
// precisam da mesma proteção, senão um estado salvo com o formato antigo
// quebra o reducer (ex.: `especificacoes` inexistente vira `undefined`,
// não iterável).
// Migra projetos salvos antes de cargaState/sistemas/riscosEspeciais virarem
// por-estrutura. Formato antigo: cargaState tinha o codigo da divisao (ex:
// "C-1") como chave direta; sistemas/riscosEspeciais eram um unico objeto
// pro projeto inteiro. Best-effort: joga tudo pra primeira estrutura (cobre
// o caso comum de projeto com uma estrutura so — com mais de uma, o usuario
// precisa reclassificar as demais).
function migrarParaPorEstrutura(saved) {
  const firstEstId = saved.estruturas?.[0]?.id
  const estIds = new Set((saved.estruturas || []).map(e => e.id))

  let cargaState = saved.cargaState || {}
  const cargaKeys = Object.keys(cargaState)
  const cargaFormatoAntigo = cargaKeys.length > 0 && !cargaKeys.some(k => estIds.has(k))
  if (cargaFormatoAntigo && firstEstId) cargaState = { [firstEstId]: cargaState }

  let sistemasPorEstrutura = saved.sistemasPorEstrutura || {}
  if (saved.sistemas && !saved.sistemasPorEstrutura && firstEstId) {
    const ativos = {}
    Object.entries(saved.sistemas).forEach(([k, v]) => { if (v?.ativo) ativos[k] = true })
    if (Object.keys(ativos).length) sistemasPorEstrutura = { [firstEstId]: ativos }
  }

  let riscosEspeciaisPorEstrutura = saved.riscosEspeciaisPorEstrutura || {}
  if (saved.riscosEspeciais && !saved.riscosEspeciaisPorEstrutura && firstEstId) {
    riscosEspeciaisPorEstrutura = { [firstEstId]: saved.riscosEspeciais }
  }

  let riscosOutrosDescPorEstrutura = saved.riscosOutrosDescPorEstrutura || {}
  if (saved.riscosOutrosDesc && !saved.riscosOutrosDescPorEstrutura && firstEstId) {
    riscosOutrosDescPorEstrutura = { [firstEstId]: saved.riscosOutrosDesc }
  }

  return { cargaState, sistemasPorEstrutura, riscosEspeciaisPorEstrutura, riscosOutrosDescPorEstrutura }
}

// Migração: especificações de equipamentos de aclaramento já viveram em
// dois formatos antigos — (1) iluminacaoSistema.especificacoes, uma lista
// só pro projeto inteiro, sem associação a nenhuma estrutura específica, e
// (2) iluminacaoEspecificacoesPorEstrutura, um catálogo por estrutura —
// ambos referenciados pelos itens de quantitativo via `tipoEquipamento` (um
// id do catálogo). Hoje cada item de aclaramento (state.iluminacao) carrega
// sua própria especificação completa, sem catálogo à parte — cada pavimento
// tem sua cópia independente (ver IluminacaoPage.jsx). Mescla de volta nos
// itens a especificação salva em qualquer um dos formatos antigos.
//
// Busca o id em TODOS os catálogos salvos de uma vez (por estrutura + o
// antigo global) em vez de só no catálogo da própria estrutura do item —
// ids de especificação são gerados aleatoriamente, sem risco de colisão
// entre catálogos, então não há motivo pra restringir a busca. Restringir
// por estruturaId é o que causava o bug: o formato (1) era uma lista única,
// e uma migração anterior já tinha jogado ela inteira só pra primeira
// estrutura do projeto — item de qualquer outra estrutura referenciando uma
// dessas especificações não encontrava correspondência e ficava sem
// tipoBase/campos técnicos (sem imagem nem nome na tela, só a quantidade).
function migrarAclaramentoParaItens(saved) {
  const itens = saved.iluminacao || []
  if (!itens.some(i => i.categoria === 'aclaramento' && i.tipoEquipamento)) return itens

  const especsPorId = new Map()
  Object.values(saved.iluminacaoEspecificacoesPorEstrutura || {}).forEach(lista => {
    (lista || []).forEach(s => especsPorId.set(s.id, s))
  })
  ;(saved.iluminacaoSistema?.especificacoes || []).forEach(s => especsPorId.set(s.id, s))

  return itens.map(item => {
    if (item.categoria !== 'aclaramento' || !item.tipoEquipamento) return item
    const spec = especsPorId.get(item.tipoEquipamento)
    if (!spec) return item
    const resto = { ...item }
    delete resto.tipoEquipamento
    const specFields = { ...spec }
    delete specFields.id
    return { ...resto, ...specFields }
  })
}

// Remove `especificacoes` de um iluminacaoSistema salvo no formato antigo
// (ver migrarParaPorEstrutura) — sem isso, o campo ficaria duplicado e
// esquecido dentro de iluminacaoSistema depois da migração.
function hydratarIluminacaoSistema(saved) {
  const resto = { ...(saved || {}) }
  delete resto.especificacoes
  return { ...INITIAL_STATE.iluminacaoSistema, ...resto }
}

// Mescla planoEmergencia salvo com os defaults atuais (INITIAL_STATE) — mas,
// diferente do merge simples usado pelos outros campos aninhados, aqui um
// valor salvo em branco ('' ou null/undefined) NAO sobrescreve o default.
// Sem isso, o texto padrao dos 10 procedimentos (PROCEDIMENTOS_PADRAO) nunca
// apareceria em projetos salvos antes dessa mudanca, que ja gravaram esses
// campos como string vazia — o usuario so editou de verdade continua
// preservado normalmente.
function hydratarPlanoEmergencia(saved) {
  const base = { ...INITIAL_STATE.planoEmergencia }
  Object.entries(saved || {}).forEach(([k, v]) => { if (v !== '' && v != null) base[k] = v })
  return base
}

// Migração: projetos salvos antes do campo "Altura da edificação" existir
// guardavam esse mesmo valor (piso de descarga ao último pavimento, sem o
// subsolo) em alturaPisoPiso — que agora virou só a soma bloqueada
// (profundidadeSubsolo + alturaEdificacao) exibida na tela. Recalcula
// alturaPisoPiso na migração pra telas de leitura (memorial, dashboard)
// já mostrarem o valor somado sem o usuário precisar reabrir a Etapa 2.
function semAlturasOcultas(e) {
  const limpo = limparAlturasOcultas(e)
  if (limpo === e) return e
  const nPav = parseInt(limpo.nPavimentos) || 1
  const alturaPisoPiso = nPav === 1 ? alturaEdificacaoBase(limpo) : (parseFloat(limpo.profundidadeSubsolo) || 0) + alturaEdificacaoBase(limpo)
  return { ...limpo, alturaPisoPiso }
}

// Também zera, em projetos salvos antes da limpeza automática da Etapa 2, a
// altura/profundidade que ficaram guardadas em campos já escondidos
// (limparAlturasOcultas, trrf_calc.js), recalculando a altura piso a piso.
function migrarAlturaEdificacao(estruturas) {
  // Ordem importa: a migração do formato antigo lê alturaPisoPiso, que a
  // limpeza recalcula — limpar antes apagaria a altura antiga.
  return estruturas.map(e => {
    const nPav = parseInt(e.nPavimentos) || 1
    const jaTemCampo = e.alturaEdificacao !== undefined && e.alturaEdificacao !== null && e.alturaEdificacao !== ''
    if (nPav <= 1 || jaTemCampo) return e
    const alturaEdificacao = e.alturaPisoPiso ?? ''
    const alturaPisoPiso = (parseFloat(e.profundidadeSubsolo) || 0) + (parseFloat(alturaEdificacao) || 0)
    return { ...e, alturaEdificacao, alturaPisoPiso }
  }).map(semAlturasOcultas)
}

// Também usado fora do provider (ProjetosPage: completude dos cards com o
// projeto no mesmo formato que o dashboard vê).
// eslint-disable-next-line react-refresh/only-export-components
export function hydrateState(saved) {
  return {
    ...INITIAL_STATE,
    ...saved,
    estruturas: migrarAlturaEdificacao(saved.estruturas || INITIAL_STATE.estruturas),
    // Projetos salvos antes de uma medida existir nao tem a chave dela.
    sistemas: { ...INITIAL_STATE.sistemas, ...(saved.sistemas || {}) },
    acessoViatura: { ...INITIAL_STATE.acessoViatura, ...(saved.acessoViatura || {}) },
    iluminacaoSistema: hydratarIluminacaoSistema(saved.iluminacaoSistema),
    iluminacao: migrarAclaramentoParaItens(saved),
    hidrantes: { ...INITIAL_STATE.hidrantes, ...(saved.hidrantes || {}) },
    planoEmergencia: hydratarPlanoEmergencia(saved.planoEmergencia),
    memorialPB: { ...INITIAL_STATE.memorialPB, ...(saved.memorialPB || {}) },
    // Migração: pavimentos salvos antes de `ambientes` (Saída de Emergência)
    // ou de `acessos`/`pisoDescarga` (árvore de Acessos e Descargas)
    // existirem não têm esses campos — sem isso, o reducer quebraria ao
    // tentar ler/mapear `p.ambientes`/`p.acessos` de um pavimento antigo.
    // `pisoDescarga` nasce do `tipo` antigo (só o térreo era considerado
    // piso de descarga), mas agora é um campo independente, editável por
    // pavimento na tela de Acessos e Descargas. Detecção de incêndio NÃO é
    // mais por pavimento — vem de sistemasPorEstrutura (Medidas de
    // Segurança), igual chuveiros automáticos. Pavimentos antigos sem
    // acessos ficam com `[]` mesmo (não ganham a árvore padrão
    // retroativamente) — só pavimentos criados a partir de agora nascem com
    // ela, ver acessosPadrao.
    pavimentos: (saved.pavimentos || INITIAL_STATE.pavimentos).map(p => ({ ambientes: [], acessos: [], pisoDescarga: p.tipo === 'terreo', ...p })),
    ...migrarParaPorEstrutura(saved),
  }
}

// Remove uma chave de um objeto sem mutar o original — usado pra limpar os
// mapas por-estrutura (cargaState, sistemasPorEstrutura, etc.) quando uma
// estrutura e removida.
function semChave(obj, key) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key))
}

// Valor base de riscosEspeciaisPorEstrutura[estruturaId] — replicado (nao
// referenciado) sempre que uma estrutura ainda nao tem entrada.
const RISCOS_DEFAULT = {
  liquidos_inflamaveis: false, fogos_artificio: false, glp: false,
  vasos_pressao: false, produtos_perigosos: false, outros: false,
}

// Mesma lógica de idExtintor/idIluminacao/idSinalizacao — evita colisão
// entre estruturas criadas no mesmo milissegundo.
let estruturaSeq = 0
function idEstrutura() {
  estruturaSeq += 1
  return `est-${Date.now().toString(36)}-${estruturaSeq}-${Math.random().toString(36).slice(2, 5)}`
}

function novaEstrutura(nome, id) {
  return {
    id: id || idEstrutura(),
    nome,
    areaTotal: '', altura: '', alturaPisoPiso: 0,
    nPavimentos: 1, nSubsolos: 0, profundidadeSubsolo: '', alturaEdificacao: '',
    estrutura: ['Concreto armado'],
    obsSegEstrutural: '',
    // Compartimentação horizontal/vertical (NT 09 CBMMA) — elementos de
    // proteção efetivamente adotados (chaves de ELEMENTOS_COMPART_HORIZONTAL/
    // VERTICAL em normas/MA/compartimentacao.js) e condições especiais
    // (dispensas) confirmadas pelo responsável técnico para esta estrutura.
    elementosCompartHorizontal: [],
    elementosCompartVertical: [],
    condicoesEspeciaisCompartHorizontal: [],
    condicoesEspeciaisCompartVertical: [],
    obsCompartimentacao: '',
    // Substituição por sistema alternativo (notas de rodapé da Tabela 6,
    // NT 01 CBMMA — ver SUBSTITUICOES_COMPARTIMENTACAO em
    // normas/MA/compartimentacao.js). null = sem isenção; senão, a `key` da
    // combinação escolhida (isenta a compartimentação correspondente do
    // cumprimento da área máxima do Anexo B da NT 09 e habilita os sistemas
    // substitutos desta estrutura).
    isencaoCompartHorizontal: null,
    isencaoCompartVertical: null,
  }
}

// Pavimento térreo padrão de uma estrutura recém-criada — toda estrutura
// nasce com nPavimentos:1/nSubsolos:0, então já cadastra este único
// pavimento de saída, em vez de deixar `pavimentos` vazio até o usuário
// mexer nos campos do Step2 (mesmo formato produzido pelo térreo em
// REBUILD_PAVIMENTOS, que o reaproveita ao invés de recriar quando os
// valores mudam). `acessos`/`pisoDescarga`: ver árvore de Acessos e
// Descargas (tela dedicada, dentro de Saída de Emergência) — piso de
// descarga nasce true aqui (é o térreo), mas fica editável lá.
// `populacaoFixa`: ocupantes fixos DESTE pavimento, usada pelo dimensionamento
// da Brigada de Incêndio (Tabela A.1, NT 17) — é também a fonte da população
// fixa total mostrada no Plano de Emergência (ver utils/planoEmergencia.js).
function pavimentoTerreo(estruturaId) {
  return { id: `${estruturaId}-P1`, estruturaId, tipo:'terreo', label: 'Terreo', grupo: 'E', divisao: 'E-1', cnae: '', cnaeDesc: '', area: '', populacaoFixa: '', acess: [], ambientes: [], acessos: acessosPadrao(true), pisoDescarga: true }
}

const INITIAL_STATE = {
  id: '', createdAt: '', saveReady: false,
  configStep: 1, configUnlocked: 1,
  // 'completo' = wizard cheio (Etapas 1-7); 'dimensionamento' = wizard
  // reduzido (Edificação/Classificação/Carga de Incêndio/Medidas), sem
  // responsável pelo uso, localização nem responsável técnico — só o
  // necessário pra dimensionar Saída de Emergência, Hidrantes e Chuveiros
  // Automáticos (ver ConfiguracaoPage.jsx e Step6.jsx).
  tipoProjeto: 'completo',
  nome: '', dataInicio: '', fase: 'Em desenvolvimento',
  endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'MA', cep: '',
  situacao: 'nova', numeroAlvara: '',
  anoConstrucao: '', situacaoCBM: 'Sem AVCB anterior',
  numeroAVCB: '', validadeAVCB: '', condicoesAtuais: '',
  informarDadosLegais: '', // '' (não respondeu) | 'sim' | 'nao' — informar alvará/AVCB/ano de construção?
  areaTerreno: '', areaConstruidaTotal: '', areaComplementar: '',
  areaMaiorPav: '', peDireito: '',
  usoSubsolo: '', coberturaHabitavel: 'Nao',
  compartVertical: 'Sem compartimentacao',
  caracteristicasEstrutura: '', fachada: '', cobertura: '',
  estruturas: [{
    id: 'est-1', nome: 'Estrutura 1', areaTotal: '', altura: '', alturaPisoPiso: 0,
    nPavimentos: 1, nSubsolos: 0, profundidadeSubsolo: '', alturaEdificacao: '',
    estrutura: ['Concreto armado'],
    obsSegEstrutural: '',
    elementosCompartHorizontal: [], elementosCompartVertical: [],
    condicoesEspeciaisCompartHorizontal: [], condicoesEspeciaisCompartVertical: [],
    obsCompartimentacao: '',
    isencaoCompartHorizontal: null, isencaoCompartVertical: null,
  }],
  propNome: '', propDocumento: '', propTelefone: '', propEmail: '',
  respRazaoSocial: '', respFantasia: '', respCNPJ: '', respTelefone: '', respEmail: '',
  cnaePrincipal: '', cnaePrincipalDesc: '',
  rtNome: '', rtCpf: '', rtConselhoTipo: '', rtConselho: '', rtEspecialidade: 'Engenharia Civil',
  rtEmpresa: '', rtEmail: '', rtTelefone: '',
  usaArt: true,
  artNumero: '', artData: '', artTipoServico: 'Projeto', artValorObra: '',
  pavimentos: [pavimentoTerreo('est-1')],
  // Todos por-estrutura: chave = id da estrutura. cargaState guarda, dentro
  // de cada estrutura, o codigo da divisao (ex: "C-1"). sistemasPorEstrutura
  // guarda so o "ativo" manual (opcional habilitado) — o obrigatorio vem do
  // motor de normas (useMedidasObrigatorias). riscosEspeciaisPorEstrutura
  // segue o formato de RISCOS_DEFAULT. motivosIsencaoPorEstrutura guarda,
  // por sistema, o motivo digitado pelo RT quando desativa manualmente um
  // sistema obrigatorio (chave = sistemaKey, ex. 'compart_horizontal') — sem
  // isso a desativacao ficava sem nenhuma justificativa registrada no
  // projeto, so sinalizada em vermelho na tela.
  cargaState: {},
  sistemasPorEstrutura: {},
  motivosIsencaoPorEstrutura: {},
  // Por estrutura+sistema: true quando o RT escolheu NAO prestar justificativa
  // ao desativar manualmente a medida (padrao = justificar). Sem justificativa
  // a medida nao ganha secao de isencao no memorial nem marca na tabela.
  semMotivoIsencaoPorEstrutura: {},
  riscosEspeciaisPorEstrutura: {},
  riscosOutrosDescPorEstrutura: {},
  extintores: [],
  iluminacao: [],
  sinalizacao: [],
  acabamentos: [],
  // Caixas "Edificação/Ambiente" do Quadro Resumo do CMAR — por estrutura,
  // ver novoAmbienteAcabamento acima.
  acabamentoAmbientes: [],
  // Blocos de nota livre exibidos no Dashboard ao lado de Identificação —
  // { id, html, atualizadoEm }. Uso livre do projetista.
  notas: [],
  // Se todas as edificações do projeto usam o mesmo sistema de iluminação de
  // emergência — perguntado no topo de IluminacaoPage.jsx. true (padrão) =
  // um único sistema pra todo o projeto, guardado em `iluminacaoSistema`;
  // false = cada estrutura escolhe o seu, em `iluminacaoSistemaPorEstrutura`.
  iluminacaoMesmoSistema: true,
  // Sistema de iluminação de emergência escolhido pro projeto todo — só
  // usado quando `iluminacaoMesmoSistema` é true. `localizacaoFonte` só se
  // aplica a 'central'/'motogerador'.
  iluminacaoSistema: {
    tipo: '', // '' | 'bloco_autonomo' | 'central' | 'motogerador'
    localizacaoFonte: '',
  },
  // Mesmo formato de `iluminacaoSistema`, um por estrutura — usado quando
  // `iluminacaoMesmoSistema` é false (chave = id da estrutura).
  iluminacaoSistemaPorEstrutura: {},
  // Área de compartimentação horizontal considerada por pavimento (chave =
  // pavimentoId) — item 5.1.2, NT 09 CBMMA: deve somar a área de todos os
  // pavimentos e mezaninos interligados com o pavimento em questão, não só
  // a área do próprio pavimento (state.pavimentos[].area, cadastrada na
  // Etapa 2). Ausente/vazio = usa a área do próprio pavimento (nenhuma
  // interligação declarada).
  areaCompartimentacaoHorizontal: {},
  acessoViatura: {
    afastamentoMeioFio: '', isCondominio: false,
    larguraAdotada: '', alturaLivreAdotada: '',
    cargaConfirmada: false,
    desnivelLongAdotado: '', desnivelTransvAdotado: '',
    temPortao: false, portaoLargura: '', portaoAltura: '',
    extensaoVia: '', tipoRetorno: '', tipoRetornoOutroDesc: '',
    manobraRetornoOk: true, saidaIndepLargura: '', saidaIndepAltura: '',
  },
  // Classificação do Sistema de Hidrantes/Mangotinhos (NT 22 CBMMA) pro
  // memorial descritivo — registro único por projeto (a NT-22 não obriga
  // sistemas independentes por estrutura; ver hidrantes_calc.js). O
  // dimensionamento hidráulico (perda de carga, bomba etc.) continua vindo
  // do plugin Revit — aqui só a classificação que o site decide e envia
  // pra ele usar como entrada do cálculo.
  hidrantes: {
    // '' = ainda não classificado. tipo/rti podem vir da sugestão automática
    // (useMedidasObrigatorias-like, ver hidrantes_calc.sugerirClassificacao)
    // ou serem sobrescritos manualmente pelo RT.
    // Estruturas consideradas na classificação (área total + ocupação de
    // maior carga de incêndio) — nem toda edificação do projeto exige
    // hidrantes, então a área somada não pode ser a do projeto inteiro.
    // Vazio = ainda não ajustado manualmente, usa o default automático
    // (estruturas onde hidrantes é exigido/ativo) — ver FormularioSistema.
    estruturasSelecionadas: [],
    tipo: '', tipoVariante: 0, rti: '',
    reservatorioMaterial: '', reservatorioExclusivo: true, reservatorioVolumeTotal: '',
    // Posição em relação ao nível do solo (elevado/nível do solo/
    // semienterrado/subterrâneo, ver hidrantes_calc.js:POSICOES_RESERVATORIO)
    // — narrada no memorial descritivo, sem correspondência geométrica no
    // modelo Revit, por isso perguntada aqui.
    reservatorioPosicao: '',
    bombaExiste: true, bombaJockey: false,
    // Potência e vazão da bomba jockey — só fazem sentido com bombaJockey
    // ativo; sem correspondência no modelo Revit (a bomba jockey não entra
    // no dimensionamento hidráulico principal), por isso perguntadas aqui
    // e só narradas no memorial (ver memorial/hidrantes.js).
    bombaJockeyPotencia: '', bombaJockeyVazao: '', bombaJockeyPressao: '',
    // Tipo de acionamento da bomba PRINCIPAL — elétrico ou combustão
    // interna (mesmas opções de bombaReservaAcionamento, ver
    // normas/<UF>/hidrantes.js:ACIONAMENTOS_BOMBA). Perguntado na Etapa 3
    // (Dimensionamento da Bomba de Incêndio, ver BombaESuccaoForm.jsx).
    bombaAcionamento: '',
    bombaReserva: false, bombaReservaAcionamento: '',
    bombaAlimentaSprinklers: false,
    // Eficiência global (%) informada pelo RT — usada só aqui no site pra
    // dimensionar a potência mínima da bomba (P_cv = 1000·Qt·Ht/75·η), a
    // partir de Qt/Ht que vêm do plugin. Não depende de nada exclusivo do
    // modelo Revit, por isso deixou de ser perguntada por lá.
    bombaEficiencia: '',
    // Potência realmente adotada pro conjunto motobomba (catálogo do
    // fabricante só vem em potências padronizadas — raramente bate exato
    // com a potência mínima calculada) — informada na mesma etapa
    // "Dimensionamento da Bomba de Incêndio" que a eficiência, sincronizada
    // direto com o plugin via Supabase (sem passar pelo Project Information
    // do Revit).
    bombaPotenciaAdotada: '',
    // Método de cálculo (onde a norma exige verificar Q/Pmin do sistema —
    // "valvula" ou "esguicho") não é uma escolha do RT: é derivado da norma
    // do estado do projeto (REFERENCIA_PRESSAO_VAZAO) e mantido em sincronia
    // por FormularioSistema.jsx. Guardado aqui (em vez de calculado só na
    // hora de enviar) pra viajar junto no dado sincronizado com o plugin,
    // que não tem acesso à norma do site.
    metodoCalculo: '',
    // Entradas do NPSH disponível (Anexo C) — plugin usa pra decidir se a
    // sucção é negativa e, se for, calcular o NPSHd; sem correspondência
    // geométrica no modelo Revit, por isso perguntadas aqui. Defaults =
    // ALTITUDE_SUCCAO_PADRAO/TEMPERATURA_SUCCAO_PADRAO de normas/MA/hidrantes.js.
    succaoAltitude: 0, succaoTemperatura: 30,
    redeMaterial: '',
    recalqueTipo: '', recalqueJustificativaPasseio: '', recalqueEntradas: 1,
    valvulaHidranteDn: 65, valvulaBloqueioTipo: 'gaveta',
    // Lances (LANCES_INTERNOS/EXTERNOS — externos aceita 'nao_aplica') e
    // tipo de mangueira (NBR 11861), ver data/hidrantesMangueiras.js.
    lancesInternos: '', lancesExternos: '', mangueiraTipo: '',
    observacoes: '',
    // Resultado bruto do último "Dimensionar Hidrantes" no Revit — mesmo
    // payload sincronizado pelo plugin (chave 'hidrantes' de firedata.json,
    // ver Fire Utils.tab/lib/hidrantes/calc.py:salvar_cache/enviar_sync),
    // trazido pra cá via "Buscar do Revit"/importação de arquivo em
    // HidrantesPage.jsx. Alimenta tanto o dashboard de dimensionamento
    // quanto o memorial de cálculo (memorial/hidrantesCalculo.js, sempre a
    // última folha do memorial) — null enquanto nada foi importado ainda.
    dimensionamento: null,
  },
  // Complementa o Plano de Emergência (NT 16/2021 CBMMA, Anexo B) — só o que
  // não existe em nenhum outro lugar do state (endereço, sistemas, riscos
  // especiais, estrutura, população total etc. são reaproveitados de lá na
  // hora de montar o documento, ver utils/planoEmergencia.js). `telefoneCBM`
  // já nasce preenchido com o numero de emergencia nacional (193), e os 10
  // procedimentos (item B.2) nascem com o texto padrao de PROCEDIMENTOS_PADRAO
  // (adaptado de um exemplo pratico) — unicas excecoes a regra de nascer em
  // branco, por serem dados/texto de partida que o usuario so edita se
  // precisar, nunca preenche do zero.
  planoEmergencia: {
    localizacaoTipo: 'Urbana',
    caracteristicaVizinhanca: '', distanciaCBM: '', meiosAjudaExterna: 'Posto de Bombeiros',
    populacaoFlutuante: '',
    horarioFuncionamento: '',
    pneTemPessoas: false, pneDescricao: '',
    // Localizacao de cada risco especial marcado — chaveado por estrutura e,
    // dentro dela, pela chave do risco (mesmas chaves de RISCOS_ESPECIAIS em
    // utils/anexoB.js), ja que os riscos marcados na Configuracao tambem sao
    // por estrutura: riscosLocalizacaoPorEstrutura[estId][riscoKey] = texto.
    riscosLocalizacaoPorEstrutura: {},
    brigadistasProfissionaisQtd: '',
    telefoneCBM: '193', hospitalNome: '', hospitalDistancia: '', hospitalEndereco: '',
    ...PROCEDIMENTOS_PADRAO,
  },
  // Campos do formulário do Memorial Descritivo do CBMPB (ver
  // estados/PB/formulario.js) — o resto do formulário sai do que o projeto
  // já tem (configuração, classificação, dimensionamentos padrão). Editados
  // nas páginas de medida da PB e nas extensões da Configuração
  // (estados/PB/campos.jsx). Tudo nasce em branco: nenhuma opção é marcada
  // no documento sem o RT escolher.
  memorialPB: {
    obsNatureza: '',
    estagioConstrucao: '',   // ESTAGIOS_CONSTRUCAO; '' = deriva de state.situacao
    adaptacoes: '',          // adaptações da NT 16 / Resoluções Técnicas (3.6)
    glpClasse: '',           // CLASSES_GLP (3.4.1) — só com o risco especial GLP
    f3EstadioFutebol: false, // F-3 estádio de futebol: risco alto no Anexo B (3.4)
    // Compartimentação (8): elementos e características vêm das páginas
    // comuns (estrutura.elementosCompart* e estrutura.caracteristicasCompart).
    planoModelo: '',         // 'item6' | 'anexoB' (MODELOS_PLANO, 11.1)
    // Carga horária: da Tabela B.2 pelo nível exigido (não é campo).
    brigadaIntervaloSimulados: '12 meses', // padrão; o RT pode alterar
    iluFluxo: '',            // lm — fluxo luminoso exato das luminárias (13)
    iluAlturaInstalacao: '', // m — item 13 (distância máx. entre pontos = 4 × altura)
    alarmeCentralLocal: '',  // 14.1 e 14.2 (a mesma central)
    detectoresTipos: [],     // 'fumaca_pontual' | 'temperatura_pontual' | 'fumaca_linear' (14.2)
    deteccao: {},            // 14.2: { [tipo]: { raio, altura, distancia } } — vazio = o máximo do formulário
    // 6 — distanciaEdificacao, distanciaRecalque e dados da via (vazios =
    // padrão: largura 6 m, altura livre 4,5 m, portão 4 × 4,5 m); switches
    // sim/não (true = sim; desligado = não): cargaConfirmada, temPortao.
    // Faixa de estacionamento: obrigatória só com via abaixo de 6 m. Recalque = sistema de hidrantes
    // exigido. estados/PB/acessoViatura.js decide a linha do formulário.
    acessoViatura: {},
    // 17 — só o que a página de hidrantes comum não tem: nsth (o manancial é
    // uma posição do reservatório, state.hidrantes.reservatorioPosicao)
    // (lances e tipo de mangueira ficam em state.hidrantes; o diâmetro das
    // tubulações vem do dimensionamento do Revit).
    hidrantes: {},
    extintorNivelIII: '',    // 'nivel_III_4A' = RT adotou 4A/80BC; vazio = 3A/40BC (automático)
    // Itens de "atesto" do formulário (as escadas atendem ao item 5.7 da NT
    // 12 etc.) — { [chave do item]: true }. Nunca marcados automaticamente:
    // é declaração do RT, não resultado de cálculo.
    atestos: {},
  },
  sistemas: {
    // acesso_viatura, seg_estrutural e brigada NAO sao universais: a Tabela 5
    // (simplificado) nunca exige as duas primeiras, e brigada so e exigida
    // para alguns grupos/divisoes (ex: nao exigida para A/B/C/D no
    // simplificado). Por isso partem desmarcadas — quem decide se sao
    // obrigatorias e o motor de normas (useMedidasObrigatorias), nao o seed.
    acesso_viatura:      { obrigatorio: false, ativo: false },
    seg_estrutural:      { obrigatorio: false, ativo: false },
    compart_horizontal:  { obrigatorio: false, ativo: false },
    compart_vertical:    { obrigatorio: false, ativo: false },
    controle_acabamento: { obrigatorio: false, ativo: false },
    saida_emergencia:    { obrigatorio: true,  ativo: true  },
    gerenciamento_risco: { obrigatorio: false, ativo: false },
    brigada:             { obrigatorio: false, ativo: false },
    iluminacao:          { obrigatorio: true,  ativo: true  },
    sinalizacao:         { obrigatorio: true,  ativo: true  },
    extintores:          { obrigatorio: true,  ativo: true  },
    hidrantes:           { obrigatorio: false, ativo: false },
    alarme:              { obrigatorio: false, ativo: false },
    deteccao:            { obrigatorio: false, ativo: false },
    sprinklers:          { obrigatorio: false, ativo: false },
    controle_fumaca:     { obrigatorio: false, ativo: false },
    central_gas:         { obrigatorio: false, ativo: false },
    spda:                { obrigatorio: false, ativo: false },
    resfriamento:        { obrigatorio: false, ativo: false },
    espuma:              { obrigatorio: false, ativo: false },
    gases_fixos:         { obrigatorio: false, ativo: false },
    fontes_ignicao:      { obrigatorio: false, ativo: false },
  },
}

// Registra que os dados da medida nas estruturas recebidas vieram do Revit
// (estrutura.origemRevit[medida]). A tela decide se isso já vale como
// "concluída" (só quando não há pendências); o usuário pode reabrir/concluir.
function marcarOrigemRevit(estruturas, ids, medida) {
  return estruturas.map(e => ids.has(e.id) ? { ...e, origemRevit: { ...(e.origemRevit || {}), [medida]: true } } : e)
}

function reducer(state, action) {
  switch (action.type) {
    // `uf` é escolhido uma única vez, na criação do projeto (NEW_PROJECT —
    // ver EscolhaEstadoModal em ProjetosPage.jsx), e não muda mais: a norma,
    // o wizard e o modelo de documento (memorial em texto do MA x formulário
    // do CBMPB) dependem dele, e trocar no meio do projeto deixaria dados de
    // uma norma avaliados pela outra.
    case 'SET_FIELD':
      if (action.field === 'uf') return state
      return { ...state, [action.field]: action.value }
    // Varios campos de uma vez, como UMA alteracao — usado ao aplicar o
    // responsavel tecnico do perfil na Etapa 3 (ver hooks/usePerfil.js), que
    // senao viraria um dispatch por campo e, com isso, varios passos
    // separados de autosave.
    case 'SET_FIELDS': {
      const fields = { ...action.fields }
      delete fields.uf
      return { ...state, ...fields }
    }
    // Campos do formulário do memorial do CBMPB (state.memorialPB) — merge
    // raso: `changes` traz só os campos alterados.
    case 'SET_MEMORIAL_PB':
      return { ...state, memorialPB: { ...state.memorialPB, ...action.changes } }
    case 'ADD_ESTRUTURA': {
      const est = novaEstrutura(`Estrutura ${state.estruturas.length + 1}`, action.id)
      return { ...state, estruturas: [...state.estruturas, est], pavimentos: [...state.pavimentos, pavimentoTerreo(est.id)] }
    }
    case 'REMOVE_ESTRUTURA': {
      if (state.estruturas.length <= 1) return state
      return {
        ...state,
        estruturas: state.estruturas.filter(e => e.id !== action.id),
        pavimentos: state.pavimentos.filter(p => p.estruturaId !== action.id),
        extintores: state.extintores.filter(e => e.estruturaId !== action.id),
        iluminacao: state.iluminacao.filter(i => i.estruturaId !== action.id),
        sinalizacao: state.sinalizacao.filter(s => s.estruturaId !== action.id),
        acabamentos: state.acabamentos.filter(a => a.estruturaId !== action.id),
        acabamentoAmbientes: state.acabamentoAmbientes.filter(a => a.estruturaId !== action.id),
        cargaState: semChave(state.cargaState, action.id),
        sistemasPorEstrutura: semChave(state.sistemasPorEstrutura, action.id),
        motivosIsencaoPorEstrutura: semChave(state.motivosIsencaoPorEstrutura, action.id),
        semMotivoIsencaoPorEstrutura: semChave(state.semMotivoIsencaoPorEstrutura, action.id),
        riscosEspeciaisPorEstrutura: semChave(state.riscosEspeciaisPorEstrutura, action.id),
        riscosOutrosDescPorEstrutura: semChave(state.riscosOutrosDescPorEstrutura, action.id),
        iluminacaoSistemaPorEstrutura: semChave(state.iluminacaoSistemaPorEstrutura, action.id),
      }
    }
    case 'RENAME_ESTRUTURA':
      return { ...state, estruturas: state.estruturas.map(e => e.id === action.id ? { ...e, nome: action.nome } : e) }
    case 'SET_ESTRUTURA_FIELD':
      return { ...state, estruturas: state.estruturas.map(e => e.id === action.id ? { ...e, [action.field]: action.value } : e) }
    case 'REBUILD_PAVIMENTOS': {
      const { estruturaId, nPav, nSub } = action
      const own    = state.pavimentos.filter(p => p.estruturaId === estruturaId)
      const others = state.pavimentos.filter(p => p.estruturaId !== estruturaId)
      const find = (id) => own.find(p => p.id === id)
      const list = []
      for (let s = nSub; s >= 1; s--) {
        const id = `${estruturaId}-sub-${s}`
        list.push(find(id) || { id, estruturaId, tipo:'subsolo', label: `Subsolo ${s}`, grupo: 'G', divisao: 'G-1', cnae: '', cnaeDesc: '', area: '', populacaoFixa: '', acess: [], ambientes: [], acessos: acessosPadrao(false), pisoDescarga: false })
      }
      const terId = `${estruturaId}-P1`
      const ter = find(terId)
      list.push(ter || pavimentoTerreo(estruturaId))
      for (let p = 2; p <= nPav; p++) {
        const id = `${estruturaId}-P${p}`
        list.push(find(id) || { id, estruturaId, tipo:'pav', label: `Pavimento ${p}`, grupo: 'E', divisao: 'E-1', cnae: '', cnaeDesc: '', area: '', populacaoFixa: '', acess: [], ambientes: [], acessos: acessosPadrao(false), pisoDescarga: false })
      }
      const idsValidos = new Set(list.map(p => p.id))
      return {
        ...state,
        pavimentos: [...others, ...list],
        extintores: state.extintores.filter(e => e.estruturaId !== estruturaId || idsValidos.has(e.pavimentoId)),
        iluminacao: state.iluminacao.filter(i => i.estruturaId !== estruturaId || idsValidos.has(i.pavimentoId)),
      }
    }
    case 'UPDATE_PAV':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.id ? { ...p, ...action.changes } : p) }
    // Só pode haver um piso de descarga por estrutura — marcar um como
    // piso de descarga (valor:true) desmarca automaticamente qualquer
    // outro pavimento da MESMA estrutura. Desmarcar (valor:false) só afeta
    // o próprio pavimento (pode deixar a estrutura sem nenhum marcado
    // temporariamente, enquanto o usuário reconfigura).
    case 'SET_PISO_DESCARGA': {
      const { pavimentoId, estruturaId, valor } = action
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => {
          if (p.id === pavimentoId) return { ...p, pisoDescarga: valor }
          if (valor && p.estruturaId === estruturaId) return { ...p, pisoDescarga: false }
          return p
        }),
      }
    }
    case 'REPLICATE_TERREO': {
      const { estruturaId } = action
      const t = state.pavimentos.find(p => p.estruturaId === estruturaId && p.tipo === 'terreo')
      if (!t) return state
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => (p.estruturaId !== estruturaId || p.id === t.id)
          ? p
          : { ...p, grupo: t.grupo, divisao: t.divisao, cnae: t.cnae, cnaeDesc: t.cnaeDesc, acess: t.acess.map(a => ({...a})) }),
      }
    }
    case 'ADD_ACESS':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.id ? { ...p, acess: [...p.acess, { divisao: 'C-1', cnae: '', cnaeDesc: '', area: '' }] } : p) }
    case 'REMOVE_ACESS':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.id ? { ...p, acess: p.acess.filter((_, i) => i !== action.index) } : p) }
    case 'UPDATE_ACESS':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.id ? { ...p, acess: p.acess.map((a, i) => i === action.index ? { ...a, ...action.changes } : a) } : p) }
    case 'ADD_EXTINTOR':
      return { ...state, extintores: [...state.extintores, novoExtintor(action.estruturaId, action.pavimentoId, action.ambiente, action.id)] }
    case 'UPDATE_EXTINTOR':
      return { ...state, extintores: state.extintores.map(e => e.id === action.id ? { ...e, ...action.changes } : e) }
    case 'REMOVE_EXTINTOR':
      return { ...state, extintores: state.extintores.filter(e => e.id !== action.id) }
    case 'RENAME_AMBIENTE_EXTINTOR':
      return {
        ...state,
        extintores: state.extintores.map(e =>
          (e.estruturaId === action.estruturaId && e.pavimentoId === action.pavimentoId && e.ambiente === action.ambienteAntigo)
            ? { ...e, ambiente: action.ambienteNovo } : e),
      }
    case 'REMOVE_AMBIENTE_EXTINTOR':
      return {
        ...state,
        extintores: state.extintores.filter(e =>
          !(e.estruturaId === action.estruturaId && e.pavimentoId === action.pavimentoId && e.ambiente === action.ambiente)),
      }
    // Move unidades extintoras (por id) pra outro ambiente do MESMO
    // pavimento — filtra por estruturaId/pavimentoId pra que um id fora do
    // pavimento (ex.: seleção antiga) nunca troque de pavimento por engano.
    case 'MOVER_EXTINTORES': {
      const ids = new Set(action.ids)
      return {
        ...state,
        extintores: state.extintores.map(e =>
          (ids.has(e.id) && e.estruturaId === action.estruturaId && e.pavimentoId === action.pavimentoId)
            ? { ...e, ambiente: action.ambiente } : e),
      }
    }
    // Reordena os ambientes de um pavimento. `ordem` é a lista de nomes de
    // ambiente na nova sequência. Os ambientes não têm posição própria — a
    // ordem vem da 1ª ocorrência de cada nome em state.extintores (ver
    // agruparPorAmbiente em ExtintoresPage.jsx) —, então reordenar é
    // reordenar os itens do pavimento, preservando a ordem interna de cada
    // ambiente (sort estável).
    case 'ORDENAR_AMBIENTES_EXTINTOR': {
      const doPav = e => e.estruturaId === action.estruturaId && e.pavimentoId === action.pavimentoId
      const posicao = nome => { const i = action.ordem.indexOf(nome); return i < 0 ? action.ordem.length : i }
      const reordenados = state.extintores.filter(doPav).sort((a, b) => posicao(a.ambiente) - posicao(b.ambiente))
      return { ...state, extintores: [...state.extintores.filter(e => !doPav(e)), ...reordenados] }
    }
    // Substitui só o cadastro de extintores das estruturas presentes no
    // lote importado (ver resolverImportacao em ExtintoresPage.jsx) — os
    // itens já chegam com estruturaId/pavimentoId resolvidos contra o
    // projeto atual. Preserva o cadastro das demais estruturas, já que
    // cada arquivo Revit sincroniza uma estrutura por vez.
    case 'IMPORT_EXTINTORES': {
      const estruturasDoLote = new Set(action.itens.map(it => it.estruturaId))
      const preservados = state.extintores.filter(e => !estruturasDoLote.has(e.estruturaId))
      return { ...state, estruturas: marcarOrigemRevit(state.estruturas, estruturasDoLote, 'extintores'), extintores: [...preservados, ...action.itens.map(it => ({ ...it, id: it.id || idExtintor() }))] }
    }
    case 'ADD_ILUMINACAO':
      return { ...state, iluminacao: [...state.iluminacao, novoItemIluminacao(action.estruturaId, action.pavimentoId, action.categoria, action.overrides, action.id)] }
    case 'UPDATE_ILUMINACAO':
      return { ...state, iluminacao: state.iluminacao.map(i => i.id === action.id ? { ...i, ...action.changes } : i) }
    // Substitui só o cadastro de aclaramento das estruturas presentes no
    // lote importado (ver resolverImportacaoIluminacao em
    // IluminacaoPage.jsx) — mesmo padrão de IMPORT_EXTINTORES. Os itens já
    // chegam com estruturaId/pavimentoId/tipoBase/campos técnicos/quantidade
    // resolvidos contra o projeto atual.
    case 'IMPORT_ILUMINACAO': {
      const estruturasDoLote = new Set(action.itens.map(it => it.estruturaId))
      const preservados = state.iluminacao.filter(i => !estruturasDoLote.has(i.estruturaId))
      return { ...state, estruturas: marcarOrigemRevit(state.estruturas, estruturasDoLote, 'iluminacao'), iluminacao: [...preservados, ...action.itens.map(it => ({ ...it, id: it.id || idIluminacao() }))] }
    }
    case 'REMOVE_ILUMINACAO':
      return { ...state, iluminacao: state.iluminacao.filter(i => i.id !== action.id) }
    case 'SET_ILUMINACAO_SISTEMA':
      return { ...state, iluminacaoSistema: { ...state.iluminacaoSistema, ...action.changes } }
    // Se todas as edificações usam o mesmo sistema — pergunta no topo de
    // IluminacaoPage.jsx. Só liga/desliga a flag; os dados nos dois formatos
    // (iluminacaoSistema global, iluminacaoSistemaPorEstrutura) ficam
    // guardados independente de qual está em uso no momento, pra não perder
    // nada se o usuário mudar de ideia e voltar.
    case 'SET_ILUMINACAO_MESMO_SISTEMA':
      return { ...state, iluminacaoMesmoSistema: action.valor }
    case 'SET_ILUMINACAO_SISTEMA_ESTRUTURA':
      return {
        ...state,
        iluminacaoSistemaPorEstrutura: {
          ...state.iluminacaoSistemaPorEstrutura,
          [action.estruturaId]: { ...(state.iluminacaoSistemaPorEstrutura[action.estruturaId] || INITIAL_STATE.iluminacaoSistema), ...action.changes },
        },
      }
    case 'ADD_SINALIZACAO':
      return { ...state, sinalizacao: [...state.sinalizacao, novoItemSinalizacao(action.estruturaId, action.tipoPlaca, action.quantidade, action.id)] }
    case 'UPDATE_SINALIZACAO':
      return { ...state, sinalizacao: state.sinalizacao.map(s => s.id === action.id ? { ...s, ...action.changes } : s) }
    case 'REMOVE_SINALIZACAO':
      return { ...state, sinalizacao: state.sinalizacao.filter(s => s.id !== action.id) }
    case 'ADD_NOTA':
      return { ...state, notas: [...state.notas, novaNota(action.id, action.atualizadoEm)] }
    case 'SET_NOTA_HTML':
      return { ...state, notas: state.notas.map(n => n.id === action.id ? { ...n, html: action.html, atualizadoEm: action.atualizadoEm } : n) }
    case 'SET_NOTA_TITULO':
      return { ...state, notas: state.notas.map(n => n.id === action.id ? { ...n, titulo: action.titulo, atualizadoEm: action.atualizadoEm } : n) }
    case 'SET_NOTA_COR':
      return { ...state, notas: state.notas.map(n => n.id === action.id ? { ...n, cor: action.cor, atualizadoEm: action.atualizadoEm } : n) }
    case 'REMOVE_NOTA':
      return { ...state, notas: state.notas.filter(n => n.id !== action.id) }
    // `action.ids` já vem com a ordem final (calculada no arrastar-e-soltar
    // do card de Notas) — reconstrói o array nessa ordem. `.filter(Boolean)`
    // protege contra um id que não existe mais (nota removida em outra aba
    // entre o início do arrasto e o drop).
    case 'REORDER_NOTAS':
      return { ...state, notas: action.ids.map(id => state.notas.find(n => n.id === id)).filter(Boolean) }
    // Substitui só o cadastro de sinalização das estruturas presentes no
    // lote importado (ver resolverImportacaoSinalizacao em
    // SinalizacaoPage.jsx) — os itens já chegam com estruturaId resolvido
    // contra o projeto atual. Preserva o cadastro das demais estruturas,
    // já que cada arquivo Revit sincroniza uma estrutura por vez (mesmo
    // padrão de IMPORT_EXTINTORES).
    case 'IMPORT_SINALIZACAO': {
      const estruturasDoLote = new Set(action.itens.map(it => it.estruturaId))
      const preservados = state.sinalizacao.filter(s => !estruturasDoLote.has(s.estruturaId))
      return { ...state, estruturas: marcarOrigemRevit(state.estruturas, estruturasDoLote, 'sinalizacao'), sinalizacao: [...preservados, ...action.itens.map(it => ({ ...it, id: it.id || idSinalizacao() }))] }
    }
    // Upsert de uma linha do CMAR — identificada por estrutura+chave (não
    // por id), já que a tela deriva as linhas a partir das divisões da
    // estrutura (ver montarLinhas em cmar_calc.js) em vez de o usuário
    // criar cada linha manualmente.
    case 'SET_ACABAMENTO': {
      const { estruturaId, chave, changes } = action
      const idx = state.acabamentos.findIndex(a => a.estruturaId === estruturaId && a.chave === chave)
      if (idx === -1) {
        return { ...state, acabamentos: [...state.acabamentos, { ...novaLinhaAcabamento(estruturaId, chave), ...changes }] }
      }
      return { ...state, acabamentos: state.acabamentos.map((a, i) => i === idx ? { ...a, ...changes } : a) }
    }
    // Caixas "Edificação/Ambiente" do CMAR (ControleAcabamentoPage.jsx) —
    // totalmente geridas pelo usuário: adicionar, renomear, remover. Nascem
    // automaticamente (INIT_AMBIENTES_ACABAMENTO, idempotente — só roda se a
    // estrutura ainda não tiver nenhuma) a partir das divisões já
    // classificadas, mas o usuário pode renomear ou apagar livremente
    // depois; a semeadura nunca roda de novo nem reaparece sozinha.
    case 'ADD_AMBIENTE_ACABAMENTO':
      return { ...state, acabamentoAmbientes: [...state.acabamentoAmbientes, novoAmbienteAcabamento(action.estruturaId, action.nome, action.id)] }
    case 'RENAME_AMBIENTE_ACABAMENTO':
      return { ...state, acabamentoAmbientes: state.acabamentoAmbientes.map(a => a.id === action.id ? { ...a, nome: action.nome } : a) }
    // Remove a caixa e também as linhas do CMAR já preenchidas nela (chave
    // = `${ambienteId}|${elemento}`) — senão ficariam órfãs, nunca mais
    // visíveis mas ainda ocupando state.acabamentos.
    case 'REMOVE_AMBIENTE_ACABAMENTO':
      return {
        ...state,
        acabamentoAmbientes: state.acabamentoAmbientes.filter(a => a.id !== action.id),
        acabamentos: state.acabamentos.filter(a => !a.chave.startsWith(`${action.id}|`)),
      }
    case 'INIT_AMBIENTES_ACABAMENTO': {
      const { estruturaId, ambientes } = action
      if (state.acabamentoAmbientes.some(a => a.estruturaId === estruturaId)) return state
      return { ...state, acabamentoAmbientes: [...state.acabamentoAmbientes, ...ambientes] }
    }
    // Ambientes de Saída de Emergência (SaidaEmergenciaPage.jsx) — vivem
    // dentro do pavimento (population/dimensionamento é por pavimento, não
    // um cadastro à parte como extintor/iluminação/sinalização). Só são
    // despachadas ao clicar em "Adicionar"/"Salvar"/lixeira no modal — o
    // formulário em si (nome, divisão, área...) fica em useState local até
    // esse clique, então não gera broadcast a cada tecla digitada.
    case 'ADD_AMBIENTE_SE':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId ? { ...p, ambientes: [...(p.ambientes || []), { id: action.id, ...action.ambiente }] } : p) }
    case 'UPDATE_AMBIENTE_SE':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId ? { ...p, ambientes: (p.ambientes || []).map(a => a.id === action.ambienteId ? { ...a, ...action.changes } : a) } : p) }
    case 'REMOVE_AMBIENTE_SE':
      return { ...state, pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId ? { ...p, ambientes: (p.ambientes || []).filter(a => a.id !== action.ambienteId) } : p) }
    // Importação do Revit/firedata.json (ver resolverImportacaoSaidas em
    // SaidaEmergenciaPage.jsx) — substitui os ambientes só dos pavimentos
    // resolvidos no lote, preservando os demais.
    case 'IMPORT_AMBIENTES_SE': {
      const porPavimento = new Map(action.atualizacoes.map(a => [a.pavimentoId, a.ambientes]))
      const estruturasDoLote = new Set(state.pavimentos.filter(p => porPavimento.has(p.id)).map(p => p.estruturaId))
      return { ...state, estruturas: marcarOrigemRevit(state.estruturas, estruturasDoLote, 'saida_emergencia'), pavimentos: state.pavimentos.map(p => porPavimento.has(p.id) ? { ...p, ambientes: porPavimento.get(p.id) } : p) }
    }
    // ── Árvore de Acessos e Descargas (Ambiente -> Acesso -> Acesso/Saída) ──
    // Ver se_calc.js (calcNoAcesso/ambientesDoAcesso) pro motor de cálculo.
    // Um "Acesso" com alimentaEm=null é uma Saída (raiz da árvore daquele
    // pavimento) — não existe um tipo de nó separado pra Saída, só a posição
    // na árvore muda.
    case 'CRIAR_SAIDA':
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, acessos: [...(p.acessos || []), { id: action.id, nome: action.nome, alimentaEm: null, dims: dimsPadrao({ alimentaEm: null }, !!p.pisoDescarga) }] }
          : p),
      }
    case 'CRIAR_ACESSO':
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, acessos: [...(p.acessos || []), { id: action.id, nome: action.nome, alimentaEm: action.alimentaEm, dims: dimsPadrao({ alimentaEm: action.alimentaEm }, !!p.pisoDescarga) }] }
          : p),
      }
    // Liga/desliga um dimensionamento (AD/ER/PT) de um nó específico da
    // árvore — um nó pode precisar de mais de um ao mesmo tempo (ex.: o
    // ponto de descarga que é ao mesmo tempo corredor de saída e chegada
    // da escada que desce até ali). Ver dimsPadrao/calcDimsAcesso em
    // se_calc.js.
    case 'SET_ACESSO_DIM':
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, acessos: (p.acessos || []).map(ac => ac.id === action.acessoId
              ? { ...ac, dims: { ...(ac.dims || {}), [action.dim]: action.valor } }
              : ac) }
          : p),
      }
    case 'RENOMEAR_ACESSO':
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, acessos: (p.acessos || []).map(ac => ac.id === action.acessoId ? { ...ac, nome: action.nome } : ac) }
          : p),
      }
    // Move um ambiente pra outro Acesso — inclusive entre Saídas diferentes
    // do mesmo pavimento (arrastar o quadradinho do Ambiente).
    case 'MOVER_AMBIENTE_ACESSO':
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, ambientes: (p.ambientes || []).map(a => a.id === action.ambienteId ? { ...a, acessoId: action.novoAcessoId } : a) }
          : p),
      }
    // Mesma coisa que MOVER_AMBIENTE_ACESSO, mas pra vários ambientes de
    // uma vez (seleção em massa na tela de Acessos e Descargas) — um único
    // despacho em vez de um por ambiente, pra não gerar N re-renders/broadcasts.
    case 'MOVER_AMBIENTES_ACESSO': {
      const idsMovidos = new Set(action.ambienteIds)
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, ambientes: (p.ambientes || []).map(a => idsMovidos.has(a.id) ? { ...a, acessoId: action.novoAcessoId } : a) }
          : p),
      }
    }
    // "Apagar selecionados" na barra de seleção em massa: comportamento
    // igual ao botão individual de cada card — ambiente já órfão é
    // excluído de verdade; ambiente dentro de um Acesso/Saída só é
    // desvinculado (fica órfão), nunca apagado por engano numa seleção
    // que misturou os dois tipos.
    case 'APAGAR_AMBIENTES_SE': {
      const idsAlvo = new Set(action.ambienteIds)
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? {
              ...p,
              ambientes: (p.ambientes || []).reduce((acc, a) => {
                if (!idsAlvo.has(a.id)) { acc.push(a); return acc }
                if (a.acessoId) acc.push({ ...a, acessoId: null })
                return acc
              }, []),
            }
          : p),
      }
    }
    // Move um Acesso (e, por consequência do cálculo recursivo em
    // se_calc.js, todo o conjunto de ambientes/acessos que já alimentavam
    // ele) pra alimentar outro nó — ou pra null, virando uma Saída nova.
    // Validar ciclo (um acesso não pode alimentar seu próprio descendente)
    // é responsabilidade de quem despacha, não do reducer.
    case 'MOVER_ACESSO':
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => p.id === action.pavimentoId
          ? { ...p, acessos: (p.acessos || []).map(ac => ac.id === action.acessoId ? { ...ac, alimentaEm: action.novoAlimentaEm } : ac) }
          : p),
      }
    // Remove um nó de Acesso/Saída sem apagar em cascata: o que alimentava
    // ele (ambientes e/ou outros acessos) fica órfão (acessoId/alimentaEm
    // voltam a null) em vez de sumir — o usuário reposiciona depois, mas
    // não perde nenhum ambiente cadastrado.
    case 'REMOVER_ACESSO': {
      const { pavimentoId, acessoId } = action
      return {
        ...state,
        pavimentos: state.pavimentos.map(p => {
          if (p.id !== pavimentoId) return p
          return {
            ...p,
            acessos: (p.acessos || [])
              .filter(ac => ac.id !== acessoId)
              .map(ac => ac.alimentaEm === acessoId ? { ...ac, alimentaEm: null } : ac),
            ambientes: (p.ambientes || []).map(a => a.acessoId === acessoId ? { ...a, acessoId: null } : a),
          }
        }),
      }
    }
    case 'SET_AREA_COMPARTIMENTACAO':
      return { ...state, areaCompartimentacaoHorizontal: { ...state.areaCompartimentacaoHorizontal, [action.pavimentoId]: action.valor } }
    case 'SET_ACESSO_VIATURA':
      return { ...state, acessoViatura: { ...state.acessoViatura, ...action.changes } }
    case 'SET_PLANO_EMERGENCIA':
      return { ...state, planoEmergencia: { ...state.planoEmergencia, ...action.changes } }
    case 'SET_HIDRANTES':
      return { ...state, hidrantes: { ...state.hidrantes, ...action.changes } }
    case 'SET_WIZARD':
      return { ...state, configStep: action.step, configUnlocked: action.unlocked }
    case 'SET_CARGA': {
      const { estruturaId, code } = action
      const doEst = state.cargaState[estruturaId] || {}
      return {
        ...state,
        cargaState: {
          ...state.cargaState,
          [estruturaId]: { ...doEst, [code]: { ...(doEst[code] || {}), ...action.changes } },
        },
      }
    }
    case 'INIT_CARGA': {
      const { estruturaId } = action
      const next = { ...(state.cargaState[estruturaId] || {}) }
      action.divisoes.forEach(d => { if (!next[d]) next[d] = { cnae: '', descricao: '', cargaIncendio: null, metodo: 'tabela', valorManual: '' } })
      return { ...state, cargaState: { ...state.cargaState, [estruturaId]: next } }
    }
    // `action.value`, quando informado (ver resolverAcaoLocal), fixa o valor
    // final decidido no momento do dispatch original — sem isso, replicar o
    // toggle pra outra aba via broadcast inverteria o campo de novo em vez
    // de convergir pro mesmo estado (ver comentário em resolverAcaoLocal).
    case 'TOGGLE_SISTEMA_ESTRUTURA': {
      const { estruturaId, key } = action
      const atual = !!state.sistemasPorEstrutura[estruturaId]?.[key]
      const novo = action.value !== undefined ? action.value : !atual
      return {
        ...state,
        sistemasPorEstrutura: {
          ...state.sistemasPorEstrutura,
          [estruturaId]: { ...state.sistemasPorEstrutura[estruturaId], [key]: novo },
        },
      }
    }
    // Motivo que o RT digita ao desativar manualmente um sistema obrigatorio
    // (ver MedidasGrid em Step6.jsx) — so um texto livre por estrutura+sistema,
    // sem validacao aqui; quem decide se e obrigatorio preencher e a tela.
    case 'SET_MOTIVO_ISENCAO_SISTEMA': {
      const { estruturaId, key, value } = action
      return {
        ...state,
        motivosIsencaoPorEstrutura: {
          ...state.motivosIsencaoPorEstrutura,
          [estruturaId]: { ...state.motivosIsencaoPorEstrutura[estruturaId], [key]: value },
        },
      }
    }
    case 'SET_SEM_MOTIVO_ISENCAO': {
      const { estruturaId, key, value } = action
      return {
        ...state,
        semMotivoIsencaoPorEstrutura: {
          ...state.semMotivoIsencaoPorEstrutura,
          [estruturaId]: { ...state.semMotivoIsencaoPorEstrutura[estruturaId], [key]: !!value },
        },
      }
    }
    case 'TOGGLE_RISCO_ESTRUTURA': {
      const { estruturaId, key } = action
      const base = state.riscosEspeciaisPorEstrutura[estruturaId] || RISCOS_DEFAULT
      const novo = action.value !== undefined ? action.value : !base[key]
      return {
        ...state,
        riscosEspeciaisPorEstrutura: {
          ...state.riscosEspeciaisPorEstrutura,
          [estruturaId]: { ...base, [key]: novo },
        },
      }
    }
    case 'SET_RISCO_OUTROS_DESC':
      return { ...state, riscosOutrosDescPorEstrutura: { ...state.riscosOutrosDescPorEstrutura, [action.estruturaId]: action.value } }
    case 'LOAD':
      return { ...hydrateState(action.payload), saveReady: true }
    case 'NEW_PROJECT': {
      const est = novaEstrutura('Estrutura 1')
      return {
        ...INITIAL_STATE,
        id: action.id, createdAt: action.createdAt,
        tipoProjeto: action.tipo || 'completo',
        uf: action.uf || INITIAL_STATE.uf,
        estruturas: [est], pavimentos: [pavimentoTerreo(est.id)], saveReady: true,
      }
    }
    default: return state
  }
}

// Serialização do estado sem o que não é dado do projeto (etapa do wizard,
// carimbo de tempo, flag de boot) — base pra saber se o autosave tem algo de
// verdade pra gravar.
function serializarSemNavegacao(state) {
  // eslint-disable-next-line no-unused-vars
  const { updatedAt, configStep, configUnlocked, saveReady, ...dados } = state
  return JSON.stringify(dados)
}

// Ações puramente locais de navegação/boot — cada aba faz a sua conta, não
// faz sentido nem é desejável replicar pras outras sessões da mesma conta
// (LOAD/NEW_PROJECT são o próprio carregamento; SET_WIZARD é só a etapa do
// wizard que esta aba está olhando, não dado do projeto).
const NAO_BROADCAST = new Set(['LOAD', 'NEW_PROJECT', 'SET_WIZARD'])

// Resolve, a partir do estado local no momento do dispatch, tudo que a
// action precisa ter fixado ANTES de seguir pro reducer e pro broadcast —
// pra que a mesma action aplicada em outra aba (via canal Realtime) produza
// exatamente o mesmo resultado, em vez de divergir:
//  - ações que criam um item novo (ADD_EXTINTOR etc.) geram o id dentro do
//    reducer a partir de Date.now()/Math.random(); se cada aba gerasse o
//    seu, o mesmo "clique" viraria dois itens diferentes, um em cada lado.
//  - os toggles (TOGGLE_SISTEMA_ESTRUTURA/TOGGLE_RISCO_ESTRUTURA) invertem
//    o valor atual; replicando a inversão "cega" pra outra aba, um clique
//    perto o suficiente nos dois lados converge de volta pro valor errado
//    (A liga, B recebe e inverte nele; B liga, A recebe e inverte de volta).
//    Fixando o valor final aqui, replicar passa a dizer "fica assim", não
//    "inverte de novo".
function resolverAcaoLocal(action, state) {
  switch (action.type) {
    case 'ADD_EXTINTOR':
    case 'ADD_ILUMINACAO':
    case 'ADD_SINALIZACAO':
    case 'ADD_ESTRUTURA':
    case 'ADD_AMBIENTE_SE':
    case 'ADD_AMBIENTE_ACABAMENTO':
    case 'CRIAR_SAIDA':
    case 'CRIAR_ACESSO':
      return action.id ? action : { ...action, id: idParaTipo(action.type)() }
    // Além do id, precisa fixar `atualizadoEm` aqui também — senão cada
    // aba calcularia o próprio `new Date()` ao aplicar a action (local ou
    // vinda do broadcast), divergindo pela latência da rede.
    case 'ADD_NOTA':
      return { ...action, id: action.id || idNota(), atualizadoEm: action.atualizadoEm || new Date().toISOString() }
    case 'SET_NOTA_HTML':
    case 'SET_NOTA_TITULO':
    case 'SET_NOTA_COR':
      return action.atualizadoEm ? action : { ...action, atualizadoEm: new Date().toISOString() }
    case 'IMPORT_EXTINTORES':
      return { ...action, itens: action.itens.map(it => it.id ? it : { ...it, id: idExtintor() }) }
    case 'IMPORT_SINALIZACAO':
      return { ...action, itens: action.itens.map(it => it.id ? it : { ...it, id: idSinalizacao() }) }
    case 'IMPORT_ILUMINACAO':
      return { ...action, itens: action.itens.map(it => it.id ? it : { ...it, id: idIluminacao() }) }
    case 'IMPORT_AMBIENTES_SE':
      return { ...action, atualizacoes: action.atualizacoes.map(a => ({ ...a, ambientes: a.ambientes.map(it => it.id ? it : { ...it, id: idAmbienteSE() }) })) }
    case 'TOGGLE_SISTEMA_ESTRUTURA': {
      if (action.value !== undefined) return action
      const atual = !!state.sistemasPorEstrutura[action.estruturaId]?.[action.key]
      return { ...action, value: !atual }
    }
    case 'TOGGLE_RISCO_ESTRUTURA': {
      if (action.value !== undefined) return action
      const base = state.riscosEspeciaisPorEstrutura[action.estruturaId] || RISCOS_DEFAULT
      return { ...action, value: !base[action.key] }
    }
    default:
      return action
  }
}

function idParaTipo(tipo) {
  if (tipo === 'ADD_EXTINTOR')     return idExtintor
  if (tipo === 'ADD_ILUMINACAO')   return idIluminacao
  if (tipo === 'ADD_SINALIZACAO')  return idSinalizacao
  if (tipo === 'ADD_ESTRUTURA')    return idEstrutura
  if (tipo === 'ADD_AMBIENTE_SE')  return idAmbienteSE
  if (tipo === 'ADD_AMBIENTE_ACABAMENTO') return idAmbienteAcabamento
  return idAcesso // CRIAR_SAIDA / CRIAR_ACESSO
}

const Ctx = createContext(null)

export function ProjetoProvider({ children }) {
  const { user } = useAuth()
  const saveTimer = useRef(null)
  // Versão conhecida da linha no Postgres — fica FORA do state de propósito.
  // Se fosse parte do state, atualizá-la depois de cada save disparmissão
  // este próprio efeito de novo (state muda → efeito roda → salva de novo,
  // em loop). Quem carrega o projeto (ProjectLayout) informa a versão via
  // `definirVersaoConhecida`; enquanto for null, autosave fica pausado.
  const versaoRef = useRef(null)
  const [conflito, setConflito] = useState(false)
  // Status do sync com o Postgres pro indicador no header ('saving' | 'saved'
  // | 'error' | null). Fica null (nada exibido) ate a primeira sincronizacao
  // elegivel, e some de novo se entrar em conflito — o banner de conflito ja
  // comunica o problema, dois avisos ao mesmo tempo seria redundante.
  const [syncStatus, setSyncStatus] = useState(null)
  // Contador incrementado quando a base normativa central (normas_dados)
  // termina de carregar em background — os getters em data/normas/index.js
  // (getSE, etc.) são síncronos e já rodaram no primeiro render das
  // páginas de medida, antes do fetch completar. Como nada nesta árvore lê
  // o valor em si, só a mudança de referência do value do Provider já basta
  // pra re-renderizar os consumidores e eles pegarem o dado novo do cache.
  const [normasVersion, setNormasVersion] = useState(0)

  const [state, rawDispatch] = useReducer(reducer, INITIAL_STATE, (init) => {
    try {
      const s = localStorage.getItem('etos-projeto')
      if (s) {
        const saved = JSON.parse(s)
        // Migração: projetos salvos antes de ter id recebem um novo
        if (!saved.id) Object.assign(saved, newIds())
        return { ...hydrateState(saved), saveReady: true }
      }
    } catch {}
    // Placeholder em branco — sem cache local nenhum ainda pra confirmar
    // que este é de fato o projeto certo. `saveReady` fica false até um
    // LOAD ou NEW_PROJECT confirmar a identidade, pra nunca autosalvar
    // (e sujar o Postgres com) um "projeto fantasma" antes da hora — ver
    // Regra no autosave effect abaixo.
    return { ...init, ...newIds() }
  })

  const definirVersaoConhecida = v => { versaoRef.current = v; setConflito(false) }

  // Busca a base normativa central (normas_dados) para o UF do projeto —
  // dispara no boot e de novo se o UF mudar (endereço editado na Etapa 1).
  useEffect(() => {
    let cancelado = false
    carregarNormasRemotas(state.uf).then(() => { if (!cancelado) setNormasVersion(v => v + 1) })
    return () => { cancelado = true }
  }, [state.uf])

  // "Tentar de novo" das telas de erro de carregamento (normas do estado e
  // catálogo de estados) — sem base normativa nada funciona, e não há mais
  // fallback local (ver lib/normasRemote.js).
  const recarregarNormas = useCallback(() => {
    setNormasVersion(v => v + 1)
    Promise.all([carregarNormasRemotas(state.uf), carregarCatalogoNormas()])
      .then(() => setNormasVersion(v => v + 1))
  }, [state.uf])

  // Catálogo de quais (uf, sistema) existem no Supabase, pra TODOS os
  // estados — dispara 1x no boot, sem depender do UF do projeto (precisa
  // estar pronto ANTES de o UF ser escolhido, pro seletor de estado do
  // Step1/Step2 já habilitar/desabilitar corretamente — ver
  // normas/index.js:getEstadosDisponiveis).
  useEffect(() => {
    let cancelado = false
    carregarCatalogoNormas().then(() => { if (!cancelado) setNormasVersion(v => v + 1) })
    return () => { cancelado = true }
  }, [])

  // Estado sempre atual, pra ler dentro do `dispatch` (useCallback com deps
  // vazias, ver abaixo) sem precisar recriar a função a cada mudança —
  // mantém a identidade de `dispatch` estável, como era com o dispatch cru
  // do useReducer.
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Canal Realtime do projeto aberto — transmite cada ação do reducer pras
  // outras abas/dispositivos logados na mesma conta e no mesmo projeto, que
  // aplicam a mesma ação no próprio reducer (ver `dispatch` abaixo). Isso é
  // o que permite duas pessoas (ou a mesma pessoa em dois computadores)
  // editarem o mesmo projeto ao mesmo tempo sem se sobrescreverem: cada
  // ação já nasce granular (por estrutura, por item), então edições em
  // partes diferentes do projeto nunca colidem. `broadcast.self: false`
  // evita eco — o remetente não recebe a própria mensagem de volta.
  // `channelRef` só é preenchido depois que o canal confirma inscrição
  // ('SUBSCRIBED'); enquanto isso, `dispatch` funciona normalmente, só não
  // transmite (a ação ainda é salva no Postgres pelo autosave de sempre).
  const channelRef = useRef(null)
  useEffect(() => {
    if (!user || !state.id || !state.saveReady) return
    const channel = supabase.channel(`projeto:${state.id}`, { config: { broadcast: { self: false } } })
    channel
      .on('broadcast', { event: 'action' }, ({ payload }) => {
        if (payload?.action) rawDispatch(payload.action)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') channelRef.current = channel })
    return () => { channelRef.current = null; supabase.removeChannel(channel) }
  }, [user, state.id, state.saveReady])

  // `true` desde a última action local (disparada por esta aba) até o
  // autosave conseguir persistir — usado pro autosave abaixo saber se tem
  // algo desta aba pra salvar. Ações que chegam via broadcast (outra aba)
  // não mexem aqui: quem já mandou a ação também é responsável por
  // persistir, evitando as duas abas correndo pra salvar o mesmo conteúdo
  // (o que só aumentaria a chance de falso conflito de versão à toa).
  const pendingLocalRef = useRef(false)
  // Último estado em sincronia com o que já está salvo/recebido (e a versão
  // serializada dele, sob demanda) — o autosave só segue adiante se o estado
  // atual diferir disso, ignorando campos de navegação.
  const baselineRef = useRef(null)
  const baselineStrRef = useRef(null)

  const dispatch = useCallback((action) => {
    // LOAD (abrir o projeto) e SET_WIZARD (trocar de etapa) não são edição
    // de dado nenhum — são navegação/boot (ver comentário de NAO_BROADCAST
    // acima). Não marcar pendingLocalRef pra eles evita que só abrir a
    // página ou clicar entre etapas dispare um autosave (e conte como
    // atividade no heatmap) sem o usuário ter mudado nada de fato.
    if (action.type !== 'LOAD' && action.type !== 'SET_WIZARD') pendingLocalRef.current = true
    if (NAO_BROADCAST.has(action.type)) { rawDispatch(action); return }
    const resolvida = resolverAcaoLocal(action, stateRef.current)
    rawDispatch(resolvida)
    channelRef.current?.send({ type: 'broadcast', event: 'action', payload: { action: resolvida } })
  }, [])

  // Autosave: grava instantâneo no localStorage (cache local/offline) e, se
  // houver usuário logado, sincroniza com o Postgres em background — debounced
  // pra não disparar uma escrita remota a cada tecla digitada.
  //
  // A escrita é condicional à versão (compare-and-swap): só grava se a
  // versão que esta aba conhece ainda bate com a do banco. Se não bater,
  // outra sessão salvou por cima enquanto esta editava — em vez de
  // sobrescrever silenciosamente (perdendo a mudança da outra sessão),
  // marca `conflito` e para de tentar salvar até o usuário recarregar.
  useEffect(() => {
    const toSave = { ...state, updatedAt: new Date().toISOString() }
    localStorage.setItem('etos-projeto', JSON.stringify(toSave))
    if (state.id) {
      try {
        const raw = localStorage.getItem('etos-projetos')
        const list = raw ? JSON.parse(raw) : {}
        list[state.id] = toSave
        localStorage.setItem('etos-projetos', JSON.stringify(list))
      } catch {}
    }

    // Mudança só chegou via broadcast de outra aba (ver `dispatch` acima) —
    // essa outra aba já é responsável por persistir, nada a fazer aqui além
    // do cache local já gravado.
    if (!pendingLocalRef.current) {
      baselineRef.current = state
      baselineStrRef.current = null
      return
    }

    // Action local que não mudou dado nenhum (ex.: INIT_CARGA/seed de tela
    // ao abrir uma página, que dispara mesmo com tudo já criado) deixava
    // pending ligado e o próximo efeito — como trocar de etapa — salvava
    // "à toa". Se o estado (sem os campos de navegação) é igual ao último
    // sincronizado, não há nada pra salvar.
    const serial = serializarSemNavegacao(state)
    if (baselineStrRef.current === null && baselineRef.current) baselineStrRef.current = serializarSemNavegacao(baselineRef.current)
    if (baselineStrRef.current === serial) { pendingLocalRef.current = false; return }
    const marcarSalvo = () => { baselineRef.current = state; baselineStrRef.current = serial }

    if (!user || !state.id || !state.saveReady || conflito || versaoRef.current == null) return
    setSyncStatus('saving')
    clearTimeout(saveTimer.current)
    // Best-effort — não bloqueia nem falha o salvamento principal se der
    // erro (ex.: migration da tabela atividade_diaria ainda não aplicada).
    // Alimenta o heatmap de atividade do dashboard (Etapa/Dashboard →
    // "Atividade"), um incremento por salvamento bem-sucedido no dia.
    const registrarAtividade = () => {
      supabase.rpc('registrar_atividade', { p_projeto_id: state.id }).then(({ error: rpcError }) => {
        if (rpcError) console.error('Falha ao registrar atividade do projeto:', rpcError.message)
      })
    }
    saveTimer.current = setTimeout(async () => {
      pendingLocalRef.current = false
      const versaoLocal = versaoRef.current
      const { data, error } = await supabase
        .from('projetos')
        .update({ dados: toSave, nome: state.nome || 'Projeto sem nome', version: versaoLocal + 1, updated_at: toSave.updatedAt })
        .eq('id', state.id).eq('user_id', user.id).eq('version', versaoLocal)
        .select('version')

      if (error) {
        console.error('Falha ao sincronizar projeto com o Supabase:', error.message)
        setSyncStatus('error')
        return
      }

      if (!data || data.length === 0) {
        // Nenhuma linha afetada: ou a versão mudou (conflito) ou o projeto
        // ainda não existe no Postgres (primeiro save de um projeto novo).
        const { data: existente } = await supabase.from('projetos').select('version').eq('id', state.id).maybeSingle()
        if (existente) {
          // A versão que esta aba conhecia ficou pra trás — o caso comum
          // com o broadcast entre abas é: OUTRA aba desta mesma conta já
          // salvou uma mudança (talvez até uma que chegou aqui por
          // broadcast e nós já refletimos no nosso `state`), avançando a
          // versão sem esta aba saber. Como nosso `toSave` já é o estado
          // convergido (recebe as mudanças da outra aba ao vivo), tenta
          // salvar de novo com a versão atual antes de declarar conflito —
          // sem isso, essa aba entraria em conflito a cada alternância de
          // edição entre as abas e pararia de salvar pro resto da sessão.
          const versaoAtual = existente.version
          const { data: retry, error: retryError } = await supabase
            .from('projetos')
            .update({ dados: toSave, nome: state.nome || 'Projeto sem nome', version: versaoAtual + 1, updated_at: toSave.updatedAt })
            .eq('id', state.id).eq('user_id', user.id).eq('version', versaoAtual)
            .select('version')
          if (!retryError && retry && retry.length > 0) {
            versaoRef.current = retry[0].version
            marcarSalvo()
            setSyncStatus('saved')
            registrarAtividade()
            return
          }
          setConflito(true); setSyncStatus(null); return
        }
        const { error: insertErr } = await supabase.from('projetos').insert({
          id: state.id, user_id: user.id, nome: state.nome || 'Projeto sem nome', dados: toSave, version: 1,
        })
        if (insertErr) { console.error('Falha ao criar projeto no Supabase:', insertErr.message); setSyncStatus('error'); return }
        versaoRef.current = 1
        marcarSalvo()
        setSyncStatus('saved')
        registrarAtividade()
        return
      }
      versaoRef.current = data[0].version
      marcarSalvo()
      setSyncStatus('saved')
      registrarAtividade()
    }, 800)
    return () => clearTimeout(saveTimer.current)
  }, [state, user, conflito])

  return (
    <Ctx.Provider value={{ state, dispatch, conflito, definirVersaoConhecida, syncStatus, normasVersion, recarregarNormas }}>
      {children}
    </Ctx.Provider>
  )
}

export function useProjeto() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProjeto fora do ProjetoProvider')
  return ctx
}
