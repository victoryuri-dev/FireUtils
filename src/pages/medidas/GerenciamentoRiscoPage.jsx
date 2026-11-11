import LinkNorma from '../../components/ui/LinkNorma'
import { useNavigate, useParams } from 'react-router-dom'
import { useProjeto } from '../../context/ProjetoContext'
import FormSection from '../../components/ui/FormSection'
import EstruturaSection from '../../components/ui/EstruturaSection'
import Icon from '../../components/ui/Icon'
import InfoTip from '../../components/ui/InfoTip'
import SwitchToggle from '../../components/ui/SwitchToggle'
import { riscosEspeciaisDoEstado } from '../../utils/anexoB'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { statusPorProgresso } from '../../utils/statusEstrutura'
import ObservacoesComplementares from '../../components/ui/ObservacoesComplementares'

// Complementa o Plano de Emergência (NT 16/2021 CBMMA, Anexo B) com os poucos
// dados que ainda não existem em outro lugar do projeto — endereço, área,
// altura, população total, sistemas instalados e riscos especiais já vêm da
// Configuração e são usados direto na hora de montar o documento (ver
// utils/planoEmergencia.js). Nenhum campo aqui é obrigatório: em branco, o
// documento usa um papel/procedimento padrão condizente com o modelo oficial.
const PROCEDIMENTOS = [
  { key: 'meioAlerta',            label: 'Alerta' },
  { key: 'respAnaliseSituacao',   label: 'Análise da situação' },
  { key: 'respApoioExterno',      label: 'Apoio externo' },
  { key: 'respPrimeirosSocorros', label: 'Primeiros socorros' },
  { key: 'respEliminarRiscos',    label: 'Eliminar riscos' },
  { key: 'respAbandono',          label: 'Abandono de área' },
  { key: 'respIsolamento',        label: 'Isolamento de área' },
  { key: 'respConfinamento',      label: 'Confinamento do incêndio' },
  { key: 'respCombate',           label: 'Combate ao incêndio' },
  { key: 'respInvestigacao',      label: 'Investigação' },
]

export default function GerenciamentoRiscoPage() {
  const { state, dispatch } = useProjeto()
  const navigate = useNavigate()
  const { id } = useParams()
  const pe = state.planoEmergencia
  const set = changes => dispatch({ type: 'SET_PLANO_EMERGENCIA', changes })

  // Riscos especiais sao marcados por estrutura na Configuracao — cada risco
  // marcado ganha seu proprio campo de localizacao (ex.: "vasos sob pressao"
  // no 1o subsolo, "GLP" na cobertura), em vez de um texto unico por estrutura.
  const estruturasComRisco = state.estruturas.filter(est =>
    Object.values(state.riscosEspeciaisPorEstrutura[est.id] || {}).some(Boolean))
  const setLocalizacaoRisco = (estId, riscoKey, valor) => set({
    riscosLocalizacaoPorEstrutura: {
      ...pe.riscosLocalizacaoPorEstrutura,
      [estId]: { ...pe.riscosLocalizacaoPorEstrutura[estId], [riscoKey]: valor },
    },
  })

  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">

      <div className="mb-[26px]">
        <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]">
          Medidas de segurança
        </div>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-semibold text-ink mb-[5px]">
          <Icon name={SISTEMA_ICON.gerenciamento_risco} size={20} color="var(--color-red)" className="shrink-0"/>
          Gerenciamento de Risco de Incêndio
        <LinkNorma sistema="gerenciamento_risco"/>
            <InfoTip side="bottom" align="start" text={<>Plano de Emergência Contra Incêndio conforme NT 16/2021 CBMMA (Anexo B) — vira um capítulo do Memorial Descritivo.</>}/>
          </h2>
      </div>

      <div className="ibox blue">
        <Icon name="info" size={14} color="var(--color-blue)" className="shrink-0"/>
        <span>
          Endereço, estrutura, área, altura, ocupação, sistemas de segurança e riscos especiais já cadastrados na
          Configuração do projeto entram automaticamente no capítulo do Plano de Emergência dentro do Memorial
          Descritivo. Complete aqui só o que falta.
        </span>
      </div>

      <FormSection title="Edificação e funcionamento" description="Vizinhança, apoio externo e características de uso — item B.1 do Anexo B. A população fixa é calculada automaticamente a partir da população fixa informada na Brigada de Incêndio.">
        <div className="g2 mb-3">
          <div className="fg">
            <label>Tipo de localização</label>
            <select value={pe.localizacaoTipo} onChange={e => set({ localizacaoTipo: e.target.value })}>
              <option>Urbana</option>
              <option>Rural</option>
            </select>
          </div>
          <div className="fg">
            <label>Distância do Corpo de Bombeiros (km)</label>
            <input type="number" value={pe.distanciaCBM} onChange={e => set({ distanciaCBM: e.target.value })}/>
          </div>
        </div>
        <div className="fg mb-3">
          <label>Característica da vizinhança</label>
          <input value={pe.caracteristicaVizinhanca} onChange={e => set({ caracteristicaVizinhanca: e.target.value })}
            placeholder="Ex.: alta concentração de edificações comerciais"/>
        </div>
        <div className="fg mb-3">
          <label>Meios de ajuda externa</label>
          <input value={pe.meiosAjudaExterna} onChange={e => set({ meiosAjudaExterna: e.target.value })}
            placeholder="Ex.: Posto de Bombeiros do Centro, Brigada de empresa vizinha"/>
        </div>
        <div className="fg mb-3">
          <label>População flutuante <InfoTip text="Número de pessoas que não se enquadra no conceito de população fixa, devendo ser calculado pelo número máximo diário ou simultâneo de pessoas que frequentam casualmente uma edificação."/></label>
          <input type="number" value={pe.populacaoFlutuante} onChange={e => set({ populacaoFlutuante: e.target.value })}/>
        </div>
        <div className="fg mb-3">
          <label>Características de funcionamento</label>
          <input value={pe.horarioFuncionamento} onChange={e => set({ horarioFuncionamento: e.target.value })}
            placeholder="Ex.: horário comercial, 08h às 18h, segunda a sexta"/>
        </div>
        <div className="fg">
          <label>
            Existem pessoas com necessidades especiais?
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-ink-faint normal-case font-normal whitespace-nowrap">{pe.pneTemPessoas ? 'Sim' : 'Não'}</span>
              <SwitchToggle checked={pe.pneTemPessoas} onChange={v => set({ pneTemPessoas: v })}/>
            </span>
          </label>
        </div>
        {pe.pneTemPessoas && (
          <div className="fg mt-3">
            <label>
              Onde estão localizadas
              <span className="ml-auto text-[10px] text-ink-faint normal-case font-normal whitespace-nowrap">campo opcional</span>
            </label>
            <input value={pe.pneDescricao} onChange={e => set({ pneDescricao: e.target.value })}
              placeholder="Ex.: 3 pessoas no térreo, uma gestante no 15º andar"/>
          </div>
        )}
      </FormSection>

      {estruturasComRisco.length > 0 && (
        <FormSection title="Localização dos riscos especiais" description="Os riscos marcados na Configuração já entram no documento — se quiser, informe onde cada um fica localizado.">
          {estruturasComRisco.map(est => {
            const marcados = state.riscosEspeciaisPorEstrutura[est.id] || {}
            const riscosDaEst = riscosEspeciaisDoEstado(state.uf).filter(r => marcados[r.key])
            const localizacoes = pe.riscosLocalizacaoPorEstrutura[est.id] || {}
            const status = statusPorProgresso(riscosDaEst.filter(r => localizacoes[r.key]).length, riscosDaEst.length, {
              pendente: 'Opcional', concluido: 'Localizados',
            })
            return (
              <EstruturaSection key={est.id} titulo={est.nome} status={status} conclusao={{ estruturaId: est.id, medida: 'gerenciamento_risco' }} defaultOpen={false}>
                <div className="border border-solid border-border rounded-lg overflow-hidden">
                  {riscosDaEst.map((r, i) => (
                    <div key={r.key} className={`py-3 px-4 ${i < riscosDaEst.length - 1 ? 'border-b border-solid border-border-2' : ''}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[13px] text-ink font-semibold">{r.label}</span>
                        <span className="text-[10px] text-ink-faint whitespace-nowrap">campo opcional</span>
                      </div>
                      <input value={localizacoes[r.key] || ''} onChange={e => setLocalizacaoRisco(est.id, r.key, e.target.value)}
                        placeholder="Ex.: 1º subsolo"/>
                    </div>
                  ))}
                </div>
              </EstruturaSection>
            )
          })}
        </FormSection>
      )}

      <FormSection title="Recursos humanos e apoio externo" description="Brigadistas profissionais, hospital de referência e telefone de emergência — item B.1.10 do Anexo B. O número total de brigadistas é calculado automaticamente a partir do dimensionamento da Brigada de Incêndio.">
        <div className="g2">
          <div className="fg">
            <label>Brigadistas profissionais</label>
            <input type="number" value={pe.brigadistasProfissionaisQtd} onChange={e => set({ brigadistasProfissionaisQtd: e.target.value })}/>
          </div>
          <div className="fg">
            <label>Telefone do Corpo de Bombeiros</label>
            <input value={pe.telefoneCBM} onChange={e => set({ telefoneCBM: e.target.value })}/>
          </div>
        </div>
        <div className="fg mt-3">
          <label>Hospital de referência</label>
          <input value={pe.hospitalNome} onChange={e => set({ hospitalNome: e.target.value })}
            placeholder="Ex.: Hospital Municipal Djalma Marques"/>
        </div>
        <div className="g2 mt-3">
          <div className="fg">
            <label>Distância do hospital</label>
            <input value={pe.hospitalDistancia} onChange={e => set({ hospitalDistancia: e.target.value })}
              placeholder="Ex.: 2 km"/>
          </div>
          <div className="fg">
            <label>Endereço do hospital</label>
            <input value={pe.hospitalEndereco} onChange={e => set({ hospitalEndereco: e.target.value })}
              placeholder="Ex.: Av. Example, 123 — Centro"/>
          </div>
        </div>
      </FormSection>

      <FormSection title="Procedimentos básicos de emergência" description="Item B.2 do Anexo B — cada campo já vem com um texto padrão pronto para uso; edite à vontade para refletir a realidade da edificação.">
        <div className="flex flex-col gap-4">
          {PROCEDIMENTOS.map(p => (
            <div key={p.key} className="fg">
              <label>{p.label}</label>
              <textarea rows={3} value={pe[p.key]} onChange={e => set({ [p.key]: e.target.value })}/>
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection title="Observações complementares" description="Por estrutura — entram no memorial junto ao plano de emergência.">
        {state.estruturas.map(est => (
          <ObservacoesComplementares key={est.id} estrutura={est} medida="gerenciamento_risco" comNome={state.estruturas.length > 1}/>
        ))}
      </FormSection>


      <button className="btn-primary" onClick={() => navigate(`/projeto/${id}/documentos`, { state: { abrir: 'memorial-descritivo' } })}>
        <Icon name="file" size={13}/> Ver no Memorial Descritivo
      </button>

    </div></div>
  )
}
