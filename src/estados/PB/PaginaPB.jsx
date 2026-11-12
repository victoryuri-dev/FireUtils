import { useProjeto } from '../../context/ProjetoContext'
import InfoTip from '../../components/ui/InfoTip'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { buildFormularioPB } from './formulario'
import FormSection from '../../components/ui/FormSection'
import ObservacoesComplementares from '../../components/ui/ObservacoesComplementares'

// Página de medida da PB: o que o formulário do CBMPB pede para a medida —
// Exigível/Não exigível (automático) e os campos a preencher (children); a
// prévia da seção fica no botão flutuante da página (components/previa).
// Sem Revit, quantitativo ou distribuição por pavimento: os valores
// calculados vêm da Configuração e dos dimensionamentos padrão da norma
// (estados/PB/formulario.js).
//
// `secoes`: prefixos dos títulos das seções do formulário desta página
// (ex.: ['14.']); `observacoes`: medida(s) das Observações complementares
// por estrutura (listadas juntas no campo de observação da seção).
function StatusExigivel({ secoes }) {
  const exigivel = secoes.flatMap(s => s.linhas).find(l => l.tipo === 'exigivel')?.exigivel
  if (exigivel === undefined) return null
  const [rotulo, cor] = exigivel === true ? ['Exigível', 'text-red border-red-border bg-red-dim']
    : exigivel === false ? ['Não exigível', 'text-green border-green bg-green-dim']
    : ['Exigência não definida', 'text-ink-faint border-border']
  return <span className={`inline-flex items-center h-6 px-2.5 rounded-full border border-solid text-[11px] font-semibold ${cor}`}>{rotulo}</span>
}

export default function PaginaPB({ titulo, secoes: prefixos, observacoes, aviso, children }) {
  const { state } = useProjeto()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const formulario = buildFormularioPB(state, sistemas, porEstrutura)
  const secoes = (formulario?.secoes || []).filter(s => prefixos.some(p => s.titulo.startsWith(p)))
  // `observacoes`: chave da medida, ou [[chave, título], …] quando a seção tem
  // mais de um campo de observação (ex.: 14.1 alarme e 14.2 detecção).
  const listaObs = !observacoes ? [] : Array.isArray(observacoes) ? observacoes : [[observacoes, 'Observações complementares']]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[880px] mx-auto pt-8 px-10 pb-20 max-[720px]:px-4">
        <div className="mb-7">
          <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Formulário do Memorial Descritivo — CBMPB</div>
          <h2 className="flex flex-wrap items-center gap-3 font-heading text-[22px] font-bold text-ink mb-1.5">
            {titulo}
            <StatusExigivel secoes={secoes}/>
            <InfoTip side="bottom" align="start" text={<>Preencha só o que o formulário pede. Exigência, valores calculados e marcações automáticas saem da Configuração e da norma; o botão de prévia mostra a seção como ela vai no documento.</>}/>
          </h2>
        </div>

        {aviso && <div className="ibox amber mb-6"><span className="text-xs">{aviso}</span></div>}

        {children}

        {(state.estruturas || []).length > 0 && listaObs.map(([medida, rotulo]) => (
          <FormSection key={medida} title={rotulo} description="Por estrutura — no formulário saem todas juntas, no campo de observações da seção.">
            {(state.estruturas || []).map(est => (
              <ObservacoesComplementares key={est.id} estrutura={est} medida={medida} comNome/>
            ))}
          </FormSection>
        ))}

      </div>
    </div>
  )
}
