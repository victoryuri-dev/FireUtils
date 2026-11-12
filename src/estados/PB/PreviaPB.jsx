import { useProjeto } from '../../context/ProjetoContext'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { buildFormularioPB } from './formulario'
import { Secao } from './SecaoFormulario'

// Seção(ões) do formulário do CBMPB de cada medida (prefixo do título).
// Controle de fumaça e central de gás não têm seção própria: só o item 4.
const SECOES_DA_MEDIDA_PB = {
  acesso_viatura: ['6.'],
  seg_estrutural: ['7.'],
  compart_horizontal: ['8.'],
  compart_vertical: ['8.'],
  controle_acabamento: ['9.'],
  saida_emergencia: ['10.'],
  gerenciamento_risco: ['11'],
  brigada: ['12.'],
  iluminacao: ['13.'],
  alarme: ['14.'],
  deteccao: ['14.'],
  sinalizacao: ['15.'],
  extintores: ['16.'],
  hidrantes: ['17.'],
  sprinklers: ['18.'],
  spda: ['19.'],
  isolamento_risco: ['20.'],
  controle_fumaca: ['4.'],
  central_gas: ['4.'],
}

/** Prévia da medida na PB: a(s) seção(ões) do formulário, como no documento. */
export default function PreviaPB({ sistKey }) {
  const { state } = useProjeto()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const prefixos = SECOES_DA_MEDIDA_PB[sistKey] || []
  const secoes = (buildFormularioPB(state, sistemas, porEstrutura)?.secoes || [])
    .filter(s => prefixos.some(p => s.titulo.startsWith(p)))
  if (secoes.length === 0) return <p className="text-[12px] text-[#555] m-0">Esta medida não tem seção no formulário do CBMPB.</p>
  return <div className="pbf">{secoes.map((s, i) => <Secao key={i} secao={s}/>)}</div>
}
