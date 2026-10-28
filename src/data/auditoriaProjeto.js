import { getCNAEsDivisao, getOcupacoes, getIluminacao, getBrigada, getAV } from './normas/index'
import { detectoresAtivos, deteccaoPav, alarmeDaEstrutura, avisadoresAtivos } from './deteccao_alarme_calc'
import { montarLinhas } from './cmar_calc'
import { calcGatilho } from './av_calc'
import { alturaEdificacaoBase } from './trrf_calc'
import { linhaTabelaA1 } from './brigada_calc'
import { ESTADOS_COM_FLUXO_PROPRIO, campoOculto, campoOpcionalNoEstado, usaArtNoProjeto } from '../estados/fluxos'

export const campoId = (...partes) => partes.join('.')
export const preenchido = v => Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''
const numero = v => Number(String(v ?? '').trim().replace(',', '.'))
const positivo = v => preenchido(v) && Number.isFinite(numero(v)) && numero(v) > 0
const inteiro = v => positivo(v) && Number.isInteger(numero(v))
const naoNegativo = v => preenchido(v) && Number.isFinite(numero(v)) && numero(v) >= 0
export { positivo as numeroPositivo, inteiro as inteiroPositivo }

// Registro único: os rótulos, a navegação do assistente e o relatório leem
// exatamente os mesmos campos. Dados calculados e opcionais ficam de fora.
export function camposObrigatorios(state, porEstrutura = []) {
  const campos = []
  let estruturaId
  const dim = state.tipoProjeto === 'dimensionamento'
  const config = (etapa, contexto = '') => ({ secao: ({ 1:'Identificação', 2:'Edificação', 3:'Responsável técnico', 4:'Classificação', 5:'Carga de incêndio', 6:'Medidas de segurança' })[etapa], etapa, rota:'config', contexto })
  const medida = (key, secao, contexto = '') => ({ rota:`medida/${key}`, secao, contexto })
  // Estado com fluxo próprio (PB): as páginas de medida são as do formulário
  // do estado — não cobra os campos das páginas detalhadas do MA (Revit,
  // quantitativos); só os marcados `fluxoProprio` (ex.: população fixa da
  // brigada, que a página da PB também pede).
  const fluxoProprio = ESTADOS_COM_FLUXO_PROPRIO.has(state.uf)
  const add = (id, rotulo, valor, destino, validar = preenchido) => {
    if (fluxoProprio && destino.rota?.startsWith('medida/') && !destino.fluxoProprio) return
    // Campos que o estado não usa ou deixa opcionais (estados/fluxos.js).
    if (campoOculto(state.uf, id) || campoOpcionalNoEstado(state.uf, id)) return
    campos.push({ id, rotulo, estruturaId, ...destino, pendente:!validar(valor) })
  }
  const root = (keys, destino) => keys.forEach(([key, label, validar]) => add(key, label, state[key], destino, validar))
  root([['nome','Nome do projeto'], ['uf','Estado']], config(dim ? 2 : 1))
  if (!dim) {
    root([['respCNPJ','CNPJ'], ['respRazaoSocial','Razão social'], ['endereco','Logradouro'], ['cidade','Cidade'], ['propNome','Nome / razão social do proprietário'], ['propDocumento','CPF / CNPJ do proprietário']], config(1))
    root([['rtNome','Nome completo'], ['rtConselho','CREA / CAU'], ['rtEspecialidade','Especialidade']], config(3))
    if (usaArtNoProjeto(state)) root([['artNumero','Número da ART']], config(3))
  }
  root([['areaConstruidaTotal','Área construída total',positivo]], config(2))
  if (!dim) root([['caracteristicasEstrutura','Características construtivas · Estrutura'], ['cobertura','Elementos de cobertura'], ['fachada','Elementos de vedação']], config(2))
  add('estruturas', 'Cadastrar uma estrutura', state.estruturas, config(2))
  for (const est of state.estruturas || []) {
    estruturaId = est.id
    const destino = config(2, est.nome)
    for (const [key, label, validar] of [['nome','Nome da estrutura'], ['areaTotal','Área construída da estrutura',positivo], ['altura','Altura total',positivo], ['nPavimentos','Número de pavimentos acima do solo',inteiro]]) add(campoId(est.id,key),label,est[key],destino,validar)
    if (numero(est.nPavimentos) > 1) add(campoId(est.id,'alturaEdificacao'),'Altura piso a piso',est.alturaEdificacao,destino,positivo)
    if (numero(est.nSubsolos) > 0) add(campoId(est.id,'profundidadeSubsolo'),'Profundidade do subsolo',est.profundidadeSubsolo,destino,positivo)
    const pavs = (state.pavimentos || []).filter(p => p.estruturaId === est.id)
    add(campoId(est.id,'pavimentos'),'Cadastrar pavimentos',pavs,config(4,est.nome))
    const divisoes = new Map()
    for (const pav of pavs) {
      const ocupacoes = [{ ...pav, prefix:pav.id, label:pav.label }, ...(pav.acess || []).map((a,i) => ({ ...a, prefix:campoId(pav.id,'acess',i), label:`${pav.label} · Ocupação subsidiária ${i+1}` }))]
      for (const oc of ocupacoes) {
        const dest = config(4,`${est.nome} · ${oc.label}`)
        add(campoId(oc.prefix,'grupo'),'Grupo',oc.grupo || oc.divisao?.charAt(0),dest)
        // Grupos sem subdivisões não pedem uma divisão inexistente.
        if (Object.keys(getOcupacoes(state.uf)[oc.grupo || oc.divisao?.charAt(0)]?.divisoes || {}).length) add(campoId(oc.prefix,'divisao'),'Divisão',oc.divisao,dest)
        if (oc.divisao) {
          const carga = state.cargaState?.[est.id]?.[oc.divisao]
          const cnaes = getCNAEsDivisao(state.uf,oc.divisao)
          if (Object.keys(cnaes).length && carga?.metodo !== 'levantamento') add(campoId(oc.prefix,'cnae'),'CNAE',oc.cnae,dest)
          if (oc.cnae && !cnaes[oc.cnae]) add(campoId(oc.prefix,'cnaeDesc'),'Descrição da atividade',oc.cnaeDesc,dest)
          if (!divisoes.has(oc.divisao)) divisoes.set(oc.divisao,oc.cnae)
        }
      }
    }
    for (const [div,cnae] of divisoes) {
      const carga = state.cargaState?.[est.id]?.[div] || {}
      const q = carga.metodo === 'levantamento' ? carga.valorManual : getCNAEsDivisao(state.uf,div)[cnae]?.cargaIncendio ?? carga.cargaIncendio
      add(campoId(est.id,'carga',div),`Carga de incêndio · ${div}`,q,config(5,est.nome),positivo)
    }
    const pe = porEstrutura.find(p => p.estrutura.id === est.id)
    const ativo = key => !!pe?.sistemas?.[key]?.ativo
    if (state.riscosEspeciaisPorEstrutura?.[est.id]?.outros) add(campoId(est.id,'riscoOutros'),'Descrição do risco especial',state.riscosOutrosDescPorEstrutura?.[est.id],config(6,est.nome))
    for (const [key, sistema] of Object.entries(pe?.sistemas || {})) {
      if (sistema.obrigatorio && state.sistemasPorEstrutura?.[est.id]?.[key] === false && !state.semMotivoIsencaoPorEstrutura?.[est.id]?.[key]) add(campoId(est.id,'isencao',key),`Motivo da isenção · ${key}`,state.motivosIsencaoPorEstrutura?.[est.id]?.[key],config(6,est.nome))
    }
    for (const [key,label,field] of [['compart_horizontal','Compartimentação horizontal','elementosCompartHorizontal'],['compart_vertical','Compartimentação vertical','elementosCompartVertical']]) {
      if (ativo(key)) add(campoId(est.id,field),'Elementos de proteção adotados',est[field],medida(key,label,est.nome))
    }
    if (ativo('brigada')) for (const pav of pavs) {
      const linha = linhaTabelaA1(pav.divisao,null,getBrigada(state.uf)?.TABELA_A1 || [])
      if (!linha?.isento) add(campoId(pav.id,'populacaoFixa'),'População fixa',pav.populacaoFixa,{ ...medida('brigada','Brigada de incêndio',`${est.nome} · ${pav.label}`), fluxoProprio:true },naoNegativo)
    }
    if (ativo('alarme')) {
      const cfg = alarmeDaEstrutura(est)
      const dest = medida('alarme','Alarme de incêndio',est.nome)
      for (const [key,label] of [['central','Tipo de central'], ['centralLocal','Localização da central'], ['fonteAuxiliar','Fonte de alimentação auxiliar'], ['fonteAuxiliarLocal','Localização da fonte auxiliar']]) add(campoId(est.id,'alarme',key),label,cfg[key],dest)
      if (cfg.central === 'enderecavel') add(campoId(est.id,'alarme','circuito'),'Tipo de circuito',cfg.circuito,dest)
      if (cfg.subcentral) add(campoId(est.id,'alarme','subcentralQtd'),'Quantidade de subcentrais',cfg.subcentralQtd,dest,inteiro)
      add(campoId(est.id,'alarme','avisadores'),'Tipos de avisador',avisadoresAtivos(cfg),dest)
      // Quantidades em branco adotam o mínimo normativo no cálculo existente.
    }
    if (ativo('deteccao')) {
      const dest = medida('deteccao','Detecção de incêndio',est.nome)
      const tipos = detectoresAtivos(est,pavs)
      add(campoId(est.id,'deteccao','tiposDetector'),'Tipos de detector',tipos,dest)
      for (const t of tipos) add(campoId(est.id,'deteccao',t.key),`Quantidade total · ${t.label}`,pavs.reduce((s,p) => s + (numero(deteccaoPav(p).tipos[t.key]) || 0),0),dest,inteiro)
      if (est.deteccao?.entreforros) add(campoId(est.id,'deteccao','entreforrosDescricao'),'Localização da detecção em entreforros',est.deteccao.entreforrosDescricao,dest)
    }
    if (ativo('saida_emergencia')) for (const pav of pavs) {
      const dest = medida('saida_emergencia','Saída de emergência',`${est.nome} · ${pav.label}`)
      add(campoId(pav.id,'ambientes'),'Cadastrar ambientes para a população',pav.ambientes,dest)
      for (const amb of pav.ambientes || []) {
        const d = { ...dest, contexto:`${dest.contexto} · ${amb.nome || 'Ambiente'}` }
        add(campoId(amb.id,'divisao'),'Divisão',amb.divisao,d)
        const key = amb.popTipo === 'fixo' ? 'assentos' : amb.popTipo === 'manual' ? 'popManual' : 'area'
        add(campoId(amb.id,key),({ assentos:'Assentos',popManual:'Número de pessoas',area:'Área do ambiente' })[key],amb[key],d,key === 'area' ? positivo : inteiro)
      }
    }
    if (ativo('extintores')) for (const pav of pavs) {
      const dest = medida('extintores','Extintores',`${est.nome} · ${pav.label}`)
      const itens = (state.extintores || []).filter(i => i.estruturaId === est.id && i.pavimentoId === pav.id)
      add(campoId(pav.id,'extintores'),'Cadastrar extintores',itens,dest)
      for (const i of itens) for (const [key,label,validar] of [['tipo','Tipo'],['capacidade','Capacidade extintora'],['quantidade','Quantidade',inteiro]]) add(campoId(i.id,key),label,i[key],dest,validar)
    }
    if (ativo('sinalizacao')) {
      const dest = medida('sinalizacao','Sinalização de emergência',est.nome)
      const itens = (state.sinalizacao || []).filter(i => i.estruturaId === est.id)
      add(campoId(est.id,'sinalizacao'),'Cadastrar placas',itens,dest)
      for (const i of itens) for (const [key,label,validar] of [['tipoPlaca','Tipo de placa'],['quantidade','Quantidade',inteiro]]) add(campoId(i.id,key),label,i[key],dest,validar)
    }
    if (ativo('iluminacao')) {
      const dest = medida('iluminacao','Iluminação de emergência',est.nome)
      const prefix = state.iluminacaoMesmoSistema !== false ? 'iluminacao' : est.id
      const sistema = prefix === 'iluminacao' ? state.iluminacaoSistema : state.iluminacaoSistemaPorEstrutura?.[est.id]
      const destSistema = prefix === 'iluminacao' ? { ...dest, estruturaId:undefined, contexto:'Todas as estruturas' } : dest
      if (!campos.some(c => c.id === campoId(prefix,'sistema','tipo'))) {
        add(campoId(prefix,'sistema','tipo'),'Sistema de iluminação',sistema?.tipo,destSistema)
        if (['central','ups','motogerador'].includes(sistema?.tipo)) add(campoId(prefix,'sistema','localizacaoFonte'),'Localização da fonte',sistema.localizacaoFonte,destSistema)
      }
      for (const pav of pavs) {
        const itens = (state.iluminacao || []).filter(i => i.estruturaId === est.id && i.pavimentoId === pav.id)
        const d = { ...dest, contexto:`${est.nome} · ${pav.label}` }
        add(campoId(pav.id,'iluminacao'),'Cadastrar equipamentos',itens,d)
        for (const i of itens) {
          add(campoId(i.id,'quantidade'),'Quantidade',i.quantidade,d,inteiro)
          for (const c of getIluminacao(state.uf)?.CAMPOS_EQUIPAMENTO || []) add(campoId(i.id,c.key),c.label,i[c.key],d)
        }
      }
    }
    if (ativo('controle_acabamento')) {
      const dest = medida('controle_acabamento','Controle de acabamento',est.nome)
      const ambientes = (state.acabamentoAmbientes || []).filter(a => a.estruturaId === est.id)
      add(campoId(est.id,'acabamentoAmbientes'),'Cadastrar ambientes',ambientes,dest)
      for (const amb of ambientes) for (const l of montarLinhas(amb,(state.acabamentos || []).filter(i => i.estruturaId === est.id))) {
        const d = { ...dest, contexto:`${est.nome} · ${amb.nome} · ${l.elementoLabel}` }
        const prefix = campoId(est.id,l.chave)
        add(campoId(prefix,'origem'),'Material / não possui',l.item?.origem,d)
        if (l.item?.origem === 'manual') for (const [key,label] of [['materialNome','Nome do material'],['classeAdotada','Classe'],['fabricante','Fabricante / modelo'],['laudoNumero','Número do laudo']]) add(campoId(prefix,key),label,l.item[key],d)
      }
    }
  }
  estruturaId = undefined
  if (porEstrutura.some(pe => pe.sistemas?.acesso_viatura?.ativo)) {
    const dest = medida('acesso_viatura','Acesso de viatura')
    const av = state.acessoViatura || {}
    add('acessoViatura.afastamentoMeioFio','Afastamento até o meio-fio',av.afastamentoMeioFio,dest,naoNegativo)
    const norma = getAV(state.uf)
    const altura = Math.max(0,...(state.estruturas || []).map(alturaEdificacaoBase))
    if (norma && calcGatilho(altura,av.afastamentoMeioFio,av.isCondominio,norma.GATILHO).exigido) {
      add('acessoViatura.extensaoVia','Extensão da via',av.extensaoVia,dest,positivo)
      if (numero(av.extensaoVia) > norma.VIA_ACESSO.retorno.extensaoGatilho) {
        add('acessoViatura.tipoRetorno','Tipo de retorno',av.tipoRetorno,dest)
        if (av.tipoRetorno === 'outro') add('acessoViatura.tipoRetornoOutroDesc','Descrição do retorno',av.tipoRetornoOutroDesc,dest)
      }
    }
  }
  if (porEstrutura.some(pe => pe.sistemas?.hidrantes?.ativo)) {
    const h = state.hidrantes || {}
    const dest = medida('hidrantes','Hidrantes')
    for (const [key,label] of [['reservatorioMaterial','Material do reservatório'],['reservatorioPosicao','Posição do reservatório'],['redeMaterial','Material da tubulação'],['recalqueTipo','Tipo de recalque']]) add(campoId('hidrantes',key),label,h[key],dest)
    if (!h.reservatorioExclusivo) add('hidrantes.reservatorioVolumeTotal','Volume total do reservatório',h.reservatorioVolumeTotal,dest,positivo)
    if (h.recalqueTipo === 'passeio') add('hidrantes.recalqueJustificativaPasseio','Justificativa técnica do recalque no passeio',h.recalqueJustificativaPasseio,dest)
    // Etapa de bombas só aparece após o dimensionamento importado do Revit.
    if (h.bombaExiste && h.dimensionamento) {
      for (const [key,label,validar] of [['bombaAcionamento','Acionamento da bomba principal'],['bombaEficiencia','Eficiência global',positivo],['bombaPotenciaAdotada','Potência adotada',positivo]]) add(campoId('hidrantes',key),label,h[key],{ ...dest, subetapa:3 },validar)
      if (h.bombaReserva) add('hidrantes.bombaReservaAcionamento','Acionamento da bomba reserva',h.bombaReservaAcionamento,{ ...dest, subetapa:3 })
      if (h.bombaJockey) for (const [key,label] of [['bombaJockeyPotencia','Potência da jockey'],['bombaJockeyVazao','Vazão da jockey'],['bombaJockeyPressao','Pressão da jockey']]) add(campoId('hidrantes',key),label,h[key],{ ...dest, subetapa:3 },positivo)
    }
  }
  return campos
}

export function etapaExibida(etapa, dimensionamento) {
  return (dimensionamento ? [2,4,5,6] : [1,3,2,4,5,6]).indexOf(etapa) + 1
}

// Campos vazios que podem complementar o projeto, sem bloquear o avanço.
export function camposOpcionais(state, porEstrutura = []) {
  const campos = []
  const add = (id, rotulo, valor, destino) => {
    if (campoOculto(state.uf, id)) return
    campos.push({ id, rotulo, ...destino, obrigatorio:false, pendente:!preenchido(valor) })
  }
  const config = (etapa, secao, contexto = '') => ({ etapa, secao, contexto, rota:'config' })
  const root = (itens, destino) => itens.forEach(([id, rotulo]) => add(id, rotulo, state[id], destino))
  if (state.tipoProjeto !== 'dimensionamento') {
    root([['respCNPJ','CNPJ']].filter(([id]) => campoOpcionalNoEstado(state.uf, id)), config(1,'Identificação'))
    root([['respFantasia','Nome fantasia'], ['respTelefone','Telefone do responsável pelo uso'], ['respEmail','E-mail do responsável pelo uso'], ['numero','Número do endereço'], ['complemento','Complemento'], ['bairro','Bairro'], ['cep','CEP'], ['propTelefone','Telefone do proprietário'], ['propEmail','E-mail do proprietário']], config(1,'Identificação'))
    root([['rtCpf','CPF do responsável técnico'], ['rtEmpresa','Empresa / escritório'], ['rtEmail','E-mail do responsável técnico'], ['rtTelefone','Telefone do responsável técnico']], config(3,'Responsável técnico'))
    root([['areaTerreno','Área do terreno'], ['areaComplementar','Área complementar'], ['condicoesAtuais','Observações complementares']],config(2,'Edificação'))
    if (state.informarDadosLegais === 'sim' || state.numeroAlvara || state.anoConstrucao || state.numeroAVCB || state.validadeAVCB) {
      root([['numeroAlvara','Número do alvará']],config(2,'Edificação'))
      if (state.situacao === 'existente') root([['anoConstrucao','Ano de construção'], ['numeroAVCB','Nº do AVCB anterior'], ['validadeAVCB','Validade do AVCB']],config(2,'Edificação'))
    }
  }
  for (const est of state.estruturas || []) {
    for (const pav of (state.pavimentos || []).filter(p => p.estruturaId === est.id)) {
      add(campoId(pav.id,'area'),'Área dedicada à ocupação principal',pav.area,config(4,'Classificação',`${est.nome} · ${pav.label}`))
      ;(pav.acess || []).forEach((a,i) => add(campoId(pav.id,'acess',i,'area'),`Área dedicada à ocupação ${i+2}`,a.area,config(4,'Classificação',`${est.nome} · ${pav.label}`)))
    }
    const sistemas = porEstrutura.find(pe => pe.estrutura.id === est.id)?.sistemas || {}
    if (sistemas.seg_estrutural?.ativo) add(campoId(est.id,'obsSegEstrutural'),'Observações complementares',est.obsSegEstrutural,{rota:'medida/seg_estrutural',secao:'Segurança estrutural',contexto:est.nome,estruturaId:est.id})
    if (sistemas.compart_horizontal?.ativo || sistemas.compart_vertical?.ativo) add(campoId(est.id,'obsCompartimentacao'),'Observações complementares',est.obsCompartimentacao,{rota:`medida/${sistemas.compart_horizontal?.ativo ? 'compart_horizontal' : 'compart_vertical'}`,secao:'Compartimentação',contexto:est.nome,estruturaId:est.id})
    if (sistemas.iluminacao?.ativo && !ESTADOS_COM_FLUXO_PROPRIO.has(state.uf)) for (const item of (state.iluminacao || []).filter(i => i.estruturaId === est.id)) add(campoId(item.id,'identificacao'),'Identificação do equipamento',item.identificacao,{rota:'medida/iluminacao',secao:'Iluminação',contexto:est.nome,estruturaId:est.id})
  }
  return campos
}
