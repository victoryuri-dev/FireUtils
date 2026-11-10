import PaginaPB from './PaginaPB'
import SaidaEmergenciaPage from '../../pages/medidas/SaidaEmergenciaPage'
import HidrantesPage from '../../pages/medidas/HidrantesPage'
import BrigadaIncendioPage from '../../pages/medidas/BrigadaIncendioPage'
import {
  CamposSaidasPB, CamposPlanoPB, CamposBrigadaPB, CamposIluminacaoPB,
  CamposAlarmePB, CamposDeteccaoPB, CamposSinalizacaoPB, CamposExtintoresPB, CamposHidrantesPB, DeclaracoesHidrantesPB, CamposAcessoViaturaPB, CamposSpdaPB,
} from './campos'

// Página da PB de cada medida (chave = sistema, a mesma das rotas
// /medida/:sistKey e do menu lateral). Ver estados/registro.js.
const semSecao = titulo => (
  <PaginaPB titulo={titulo} secoes={['4.']}
    aviso="Esta medida não tem seção própria no formulário do CBMPB: ela só é marcada no item 4 (Medidas de proteção da edificação)."/>
)

export const PAGINAS_PB = {
  acesso_viatura: (
    <PaginaPB titulo="Acesso de Viatura" secoes={['6.']}><CamposAcessoViaturaPB/></PaginaPB>
  ),
  // seg_estrutural: sem página própria — a do MA (SegurancaEstruturalPage) só
  // mostra o resultado do TRRF, com a norma do estado; vale para os dois.
  // Compartimentação: as páginas comuns (horizontal e vertical separadas),
  // com a NT 36/2024 da PB — elementos e características vão para o item 8.
  // CMAR: a página comum (quadro por ambiente e classes exigidas por
  // estrutura) com a NT 09/2024 da PB.
  // Saídas: a página comum (dimensionamento completo, base do Anexo A) com a
  // NT 12/2025 da PB, mais as declarações do formulário no fim.
  saida_emergencia: <SaidaEmergenciaPage extra={<CamposSaidasPB/>}/>,
  gerenciamento_risco: <PaginaPB titulo="Gerenciamento de Risco de Incêndio" secoes={['11']} observacoes="gerenciamento_risco"><CamposPlanoPB/></PaginaPB>,
  // Brigada: a página comum (Tabela A.1 e item 4.11.2 da PB) com os campos
  // do item 12 que ela não tem.
  brigada: <BrigadaIncendioPage extra={<CamposBrigadaPB/>}/>,
  iluminacao: <PaginaPB titulo="Iluminação de Emergência" secoes={['13.']} observacoes="iluminacao"><CamposIluminacaoPB/></PaginaPB>,
  alarme: <PaginaPB titulo="Alarme de Incêndio" secoes={['14.']} observacoes="alarme"><CamposAlarmePB/></PaginaPB>,
  deteccao: <PaginaPB titulo="Detecção de Incêndio" secoes={['14.']} observacoes="deteccao"><CamposDeteccaoPB/></PaginaPB>,
  sinalizacao: <PaginaPB titulo="Sinalização de Emergência" secoes={['15.']} observacoes="sinalizacao"><CamposSinalizacaoPB/></PaginaPB>,
  extintores: <PaginaPB titulo="Extintores de Incêndio" secoes={['16.']} observacoes="extintores"><CamposExtintoresPB/></PaginaPB>,
  // Hidrantes: a página comum (dimensionamento, bombas, base do Anexo B)
  // com a norma da PB, mais os campos do item 17 que ela não tem.
  hidrantes: <HidrantesPage extra={{ 1: <CamposHidrantesPB/>, 3: <DeclaracoesHidrantesPB/> }}/>,
  sprinklers: <PaginaPB titulo="Chuveiros Automáticos" secoes={['18.']}/>,
  spda: <PaginaPB titulo="SPDA" secoes={['19.']} observacoes="spda"><CamposSpdaPB/></PaginaPB>,
  controle_fumaca: semSecao('Controle de Fumaça'),
  central_gas: semSecao('Central de Gás'),
}
