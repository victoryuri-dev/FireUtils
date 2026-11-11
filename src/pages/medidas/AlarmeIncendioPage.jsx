import LinkNorma from '../../components/ui/LinkNorma'
import Obrigatorio from '../../components/ui/Obrigatorio'
import { useState } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useNorma } from '../../hooks/useNorma'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import Icon from '../../components/ui/Icon'
import InfoTip from '../../components/ui/InfoTip'
import EstruturaSection from '../../components/ui/EstruturaSection'
import EstruturaHeaderInfo from '../../components/ui/EstruturaHeaderInfo'
import { SISTEMA_ICON } from '../../data/sistemasIcons'
import { statusEstrutura } from '../../utils/statusEstrutura'
import {
  alarmeDaEstrutura, alarmePav, resumoAlarmePavimento, notasAplicaveis, fmtNum, TIPOS_AVISADOR, avisadoresAtivos,
} from '../../data/deteccao_alarme_calc'
import { Card, CampoNum, CampoComSugestoes, BotaoOpcao, LinhaChave, Erro, NotasDaNorma, QuadroParametros, TH, TD, inputBase } from '../../components/deteccao/DaUi'
import ObservacoesComplementares from '../../components/ui/ObservacoesComplementares'

// Conceitos de circuito da central endereçável (NBR 17240) — não variam por UF,
// por isso ficam fixos aqui em vez de na base normativa.
const CIRCUITO_TIP = {
  A: 'Circuito supervisionado no qual existe fiação de retorno à central, partindo do último elemento. O anel formado é alimentado pelos dois extremos a partir da central, de modo que uma interrupção da continuidade da fiação não interrompa o funcionamento. O retorno deve ter trajeto distinto da fiação de ida.',
  B: 'Circuito supervisionado no qual não existe fiação de retorno à central, de forma que uma eventual interrupção do circuito implica paralisação parcial ou total de seu funcionamento.',
}

// ── Alarme de Incêndio ──────────────────────────────────────────────────
// Central, alimentação, acionadores manuais e avisadores (NT 19 — mesma norma
// da Detecção, ver DeteccaoIncendioPage). Um card por estrutura; o que vem da
// norma (mínimos, alturas, prazos) aparece como referência e pode ser
// substituído — valores abaixo do mínimo normativo são corrigidos ao sair do campo.

function EstruturaAlarme({ estrutura, pavimentos, norma, exigido }) {
  const { dispatch } = useProjeto()
  const [avisos, setAvisos] = useState({})
  const cfg = alarmeDaEstrutura(estrutura)
  const { ALIMENTACAO: alim, CENTRAL: central, ACIONADOR: acion, AVISADOR: avis, ITENS: itens, NORMA: nrm, SEM_FIO: semFio } = norma

  const setCfg = changes => dispatch({ type: 'SET_ESTRUTURA_FIELD', id: estrutura.id, field: 'alarme', value: { ...cfg, ...changes } })
  const setPav = (pav, changes) => dispatch({ type: 'UPDATE_PAV', id: pav.id, changes: { alarme: { ...alarmePav(pav), ...changes } } })
  const aviso = (chave, texto) => setAvisos(a => ({ ...a, [chave]: texto }))

  // ── Pavimentos ──
  const tiposAvisadorAtivos = avisadoresAtivos(cfg)
  const alternarAvisador = key => {
    const atuais = tiposAvisadorAtivos.map(t => t.key)
    setCfg({ avisadores: atuais.includes(key) ? atuais.filter(k => k !== key) : [...atuais, key], tipoAvisador: '' })
  }
  const linhas = pavimentos.map(pav => ({ pav, r: resumoAlarmePavimento(pav, acion, avis, cfg) }))
  const totalAcion = linhas.reduce((s, l) => s + l.r.acionadores, 0)
  const totalAvisador = key => linhas.reduce((s, l) => s + (l.r.avisadores.find(a => a.key === key)?.qtd || 0), 0)
  const validarAcionadores = (pav, r) => () => {
    if (alarmePav(pav).acionadores !== '' && r.abaixoDoMinimo) {
      setPav(pav, { acionadores: String(r.minAcionadores) })
      aviso(`acion-${pav.id}`, `Em ${pav.label}, o mínimo é ${r.minAcionadores} acionador(es) para respeitar a distância máxima de ${acion.distancia_max_m} m (item ${itens.acionador_distancia}). O valor foi ajustado automaticamente.`)
    }
  }

  const divisoes = pavimentos.map(p => p.divisao)
  const { especificas, gerais } = notasAplicaveis(norma, divisoes)

  const local = cfg.centralLocal ? { label: cfg.centralLocal } : null

  const status = !exigido
    ? statusEstrutura('concluido', 'Não exigida')
    : !cfg.central || !cfg.centralLocal || !cfg.fonteAuxiliar
    ? (cfg.central || cfg.centralLocal || cfg.fonteAuxiliar ? statusEstrutura('andamento', 'Em andamento') : statusEstrutura('pendente', 'Configuração pendente'))
    : statusEstrutura('andamento', 'Revisar e concluir')

  return (
    <EstruturaSection
      titulo={estrutura.nome}
      extra={<EstruturaHeaderInfo estrutura={estrutura} semArea/>}
      status={status}
      conclusao={exigido && pavimentos.length > 0 ? { estruturaId: estrutura.id, medida: 'alarme' } : null}
      defaultOpen={false}
    >
      {!exigido ? (
        <div className="ibox green">
          <Icon name="check" size={13} color="var(--color-green)" className="shrink-0"/>
          <span className="text-xs"><strong className="font-semibold text-green">Não exigida —</strong>{' '}a ocupação e a altura atuais desta estrutura dispensam o sistema de alarme, conforme NT 01 CBMMA.</span>
        </div>
      ) : (
      <>
      <div className="flex flex-col gap-3">
        {/* Central */}
        <Card titulo="Central de Alarme" icone={SISTEMA_ICON.alarme}>
          <div className="grid grid-cols-2 gap-3 mb-3.5 items-start">
            <div className="py-3 px-3.5 border border-solid border-border rounded-md bg-surface-2">
              <div className="text-[13px] text-ink font-medium mb-2.5">Tipo de Central de Alarme <Obrigatorio id={`${estrutura.id}.alarme.central`}/></div>
              <div className="flex gap-2">
                {central.tipos.map(t => (
                  <BotaoOpcao key={t.key} ativo={cfg.central === t.key} onClick={() => setCfg({ central: t.key })}>{t.label}</BotaoOpcao>
                ))}
              </div>
              {cfg.central === 'enderecavel' && (
                <div className="mt-3">
                  <div className="text-[13px] text-ink font-medium mb-2.5">Tipo de Circuito <Obrigatorio id={`${estrutura.id}.alarme.circuito`}/></div>
                  <div className="flex gap-2">
                    <BotaoOpcao ativo={cfg.circuito === 'A'} onClick={() => setCfg({ circuito: 'A' })} tip={CIRCUITO_TIP.A}>Classe A</BotaoOpcao>
                    <BotaoOpcao ativo={cfg.circuito === 'B'} onClick={() => setCfg({ circuito: 'B' })} tip={CIRCUITO_TIP.B}>Classe B</BotaoOpcao>
                  </div>
                </div>
              )}
            </div>

            <div className="py-3 px-3.5 border border-solid border-border rounded-md bg-surface-2">
              <div className="text-[13px] text-ink font-medium mb-2.5">Localização da Central de Alarme <Obrigatorio id={`${estrutura.id}.alarme.centralLocal`}/></div>
              <CampoComSugestoes id={`central-local-${estrutura.id}`} valor={cfg.centralLocal}
                onChange={v => setCfg({ centralLocal: v })} opcoes={central.locais}
                placeholder="Ex.: salas de controle, salas de segurança, portaria principal, entrada do edifício..."/>
              <div className="flex items-start gap-2.5 mt-2.5">
                <Icon name="check" size={13} color="var(--color-green)" className="shrink-0 mt-0.5"/>
                <div className="text-[11px] text-ink-faint leading-[1.5]">
                  A Central de Alarme deve ser localizada em áreas de fácil acesso e com vigilância humana constante e fácil visualização.
                </div>
              </div>
            </div>
          </div>
          <LinhaChave titulo="Possui vigilância fora do período de ocupação da edificação?" descricao="Monitoramento local ou remoto da central fora do horário de vigilância humana."
            checked={cfg.monitoramentoRemoto} onChange={v => setCfg({ monitoramentoRemoto: v })}/>
          <LinhaChave titulo="Possui painel repetidor?" descricao="Repete as sinalizações da central em outro ponto de vigilância."
            checked={cfg.painelRepetidor} onChange={v => setCfg({ painelRepetidor: v })}/>
          <LinhaChave titulo="Possui painel sinóptico?" item={itens.painel_esquema}
            descricao="Esquema ilustrativo com a localização dos acionadores e detectores (pode ser substituído por display da central que indique a localização do acionamento)."
            checked={cfg.painelSinoptico} onChange={v => setCfg({ painelSinoptico: v })}/>
          <LinhaChave titulo="Possui pré-alarme?" item={itens.pre_alarme}
            descricao={`Para locais de grande concentração de pessoas; exige brigada de incêndio e retardo de no máximo ${central.pre_alarme_retardo_max_min} min. O alarme geral segue obrigatório.`}
            checked={cfg.preAlarme} onChange={v => setCfg({ preAlarme: v })}/>
          {central.subcentral_retardo_max_min != null && (
            <>
              <LinhaChave titulo="Existem subcentral(is) ligadas à central supervisionadora?" item={itens.subcentral}
                descricao={`Sinal simultâneo de alarme na supervisora; o alarme geral soa em ${central.subcentral_retardo_max_min} min se não houver ação junto à central.`}
                checked={cfg.subcentral} onChange={v => setCfg({ subcentral: v })}/>
              {cfg.subcentral && (
                <div className="pb-2.5 max-w-[240px]">
                  <CampoNum rotulo={<>Quantidade de subcentrais <Obrigatorio id={`${estrutura.id}.alarme.subcentralQtd`}/></>} valor={cfg.subcentralQtd} placeholder="1" min={1} step="1"
                    onChange={v => setCfg({ subcentralQtd: v })}/>
                </div>
              )}
            </>
          )}
          {local && <div className="text-[11px] text-ink-faint mt-2">Central em: {local.label}.</div>}
        </Card>

        {/* Alimentação */}
        <Card titulo={<>Fonte de alimentação auxiliar <Obrigatorio id={`${estrutura.id}.alarme.fonteAuxiliar`}/></>} icone="warn">
          <div className="flex gap-2">
            {alim.auxiliar.map(a => (
              <BotaoOpcao key={a} ativo={cfg.fonteAuxiliar === a} onClick={() => setCfg({ fonteAuxiliar: a })}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </BotaoOpcao>
            ))}
          </div>
          <div className="mt-3.5">
            <div className="text-[13px] text-ink font-medium mb-2">Localização da fonte auxiliar <Obrigatorio id={`${estrutura.id}.alarme.fonteAuxiliarLocal`}/></div>
            <input className={inputBase} value={cfg.fonteAuxiliarLocal || ''}
              placeholder="Ex.: junto à central, sala técnica, casa de máquinas..."
              onChange={e => setCfg({ fonteAuxiliarLocal: e.target.value })}/>
          </div>
        </Card>

        {/* Acionadores e avisadores */}
        <Card titulo="Acionadores manuais e avisadores" icone="alarmeMedida">
          <div className="text-[13px] text-ink font-medium mb-1">Tipos de avisador utilizados <Obrigatorio id={`${estrutura.id}.alarme.avisadores`}/></div>
          <div className="text-[11px] text-ink-faint mb-2.5">Selecione um ou mais — cada tipo ativo libera a sua coluna de quantidade por pavimento.</div>
          <div className="flex gap-2 mb-3.5">
            {TIPOS_AVISADOR.map(t => (
              <BotaoOpcao key={t.key} ativo={tiposAvisadorAtivos.some(a => a.key === t.key)} onClick={() => alternarAvisador(t.key)}>{t.label}</BotaoOpcao>
            ))}
          </div>
          <LinhaChave titulo="Tecnologia sem fio (wireless)" pontoDeAtencao
            descricao={semFio.anexos?.length ? `Exige os atestados dos Anexos ${semFio.anexos.join(' e ')} da norma.` : (semFio.certificacao_laboratorio ? 'Exige certificação em laboratório reconhecido, com laudo de ensaio.' : null)}
            checked={cfg.semFio} onChange={v => setCfg({ semFio: v })}/>

          <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mt-4 mb-2">Quantidades por pavimento</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-solid border-border">
                  <th className={TH}>Pavimento</th>
                  <th className={TH}>Acionadores</th>
                  {tiposAvisadorAtivos.map(t => <th key={t.key} className={TH}>{t.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-solid divide-border">
                {linhas.map(({ pav, r }) => {
                  const p = alarmePav(pav)
                  return (
                    <tr key={pav.id}>
                      <td className={`${TD} text-ink whitespace-nowrap`}>{pav.label}</td>
                      <td className={TD}>
                        <div className="w-28"><CampoNum valor={p.acionadores} placeholder={String(r.minAcionadores)}
                          onChange={v => { aviso(`acion-${pav.id}`, ''); setPav(pav, { acionadores: v }) }} onBlur={validarAcionadores(pav, r)}/></div>
                      </td>
                      {r.avisadores.map(a => (
                        <td key={a.key} className={TD}>
                          <div className="w-28"><CampoNum valor={p[a.campo]} placeholder={String(a.minimo)}
                            onChange={v => setPav(pav, { [a.campo]: v })}/></div>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-solid border-border">
                  <td className={`${TD} font-semibold text-ink`}>Total da estrutura</td>
                  <td className={`${TD} font-bold text-ink`}>{fmtNum(totalAcion, 0)}</td>
                  {tiposAvisadorAtivos.map(t => <td key={t.key} className={`${TD} font-bold text-ink`}>{fmtNum(totalAvisador(t.key), 0)}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
          {tiposAvisadorAtivos.length === 0 && (
            <div className="text-[11px] text-amber mt-2">Selecione acima os tipos de avisador utilizados para informar as quantidades.</div>
          )}
          {Object.entries(avisos).filter(([k, v]) => v && k.startsWith('acion-')).map(([k, v]) => <Erro key={k}>{v}</Erro>)}
          <div className="text-[11px] text-ink-faint leading-[1.6] mt-3">
            Em branco vale o mínimo: ao menos um avisador de cada tipo e um acionador por pavimento (item {itens.acionador_pavimento}), e acionadores suficientes para que nenhum ponto passe de {acion.distancia_max_m} m do acionador mais próximo (item {itens.acionador_distancia});
            instalados de {fmtNum(acion.altura_min_m)} m a {fmtNum(acion.altura_max_m)} m do piso acabado (item {itens.acionador_altura}).
          </div>
        </Card>
      </div>

      <NotasDaNorma especificas={especificas} gerais={gerais} sigla={nrm.sigla}/>
      </>
      )}
      <ObservacoesComplementares estrutura={estrutura} medida="alarme"/>
    </EstruturaSection>
  )
}

export default function AlarmeIncendioPage() {
  const { state } = useProjeto()
  const { deteccaoAlarme: norma } = useNorma()
  const { porEstrutura } = useMedidasObrigatorias()
  const { NORMA: nrm, ALIMENTACAO: alim, ACIONADOR: acion, AVISADOR: avis, CENTRAL: central, ITENS: itens } = norma

  const linhasNorma = [
    ['Fontes de alimentação', `${alim.fontes_min} (principal + auxiliar)`, itens.alimentacao],
    ['Autonomia em supervisão (bateria/nobreak)', `${alim.autonomia_supervisao_h} h`, itens.alimentacao],
    ['Autonomia em alarme', `${alim.autonomia_alarme_min} min`, itens.alimentacao],
    ['Distância máxima ao acionador', `${acion.distancia_max_m} m`, itens.acionador_distancia],
    ['Altura do acionador (piso acabado)', `${fmtNum(acion.altura_min_m)} a ${fmtNum(acion.altura_max_m)} m`, itens.acionador_altura],
    ['Retardo máximo do pré-alarme', `${central.pre_alarme_retardo_max_min} min`, itens.pre_alarme],
    ...(avis.limite_dba ? [['Ruído que exige avisador visual', `${avis.limite_dba} dBA`, itens.avisador_visual], ['Altura do avisador', `${fmtNum(avis.altura_min_m, 1)} a ${fmtNum(avis.altura_max_m, 1)} m`, itens.avisador_visual]] : []),
    ...(central.interface_altura_recomendada_m ? [['Interface da central (recomendada)', `${fmtNum(central.interface_altura_recomendada_m.em_pe[0])} a ${fmtNum(central.interface_altura_recomendada_m.em_pe[1])} m em pé`, itens.central_altura]] : []),
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">
        <div className="mb-7">
          <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-1">Medidas de Segurança</div>
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
            <Icon name={SISTEMA_ICON.alarme} size={20} color="var(--color-red)" className="shrink-0"/>
            Alarme de Incêndio
          <LinkNorma sistema="alarme"/>
            <InfoTip side="bottom" align="start" text={<>Central, alimentação, acionadores manuais e avisadores conforme a {nrm.sigla} ({nrm.base_tecnica}). Os mínimos da norma já vêm preenchidos como referência e podem ser substituídos; valores abaixo do mínimo são corrigidos.</>}/>
          </h2>
        </div>

        <QuadroParametros titulo={`Parâmetros normativos (${nrm.sigla})`} sigla={nrm.orgao} linhas={linhasNorma}/>

        {state.estruturas.map(est => {
          const pavimentos = state.pavimentos.filter(p => p.estruturaId === est.id)
          const pe = porEstrutura.find(p => p.estrutura.id === est.id)
          return (
            <EstruturaAlarme key={est.id} estrutura={est} pavimentos={pavimentos} norma={norma}
              exigido={!!pe?.sistemas?.alarme?.ativo}/>
          )
        })}

      </div>
    </div>
  )
}
