// HidrantesRapidoPage.jsx — "Dimensionamento de hidrantes": um formulário
// único (uma etapa, sem dashboard) com só o que a classificação do Sistema de
// Hidrantes/Mangotinhos precisa — área, ocupação, carga de incêndio e
// chuveiros automáticos. O resultado (Tipo + RTI) aparece na própria página e
// o projeto é salvo sozinho; daí o RT conecta o projeto no plugin Revit.
// Regras de negócio em data/hidrantesRapido.js e data/hidrantes_calc.js.
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjeto } from '../context/ProjetoContext'
import { useNorma } from '../hooks/useNorma'
import Icon from '../components/ui/Icon'
import FormSection from '../components/ui/FormSection'
import { Field, Pill, Resultado, inputClass } from '../components/hidrantes/formUi'
import { CnaeBusca } from '../components/steps/Step4'
import { cargaDaDivisao } from '../data/extintores_calc'
import { OPCOES_CHUVEIROS, analisarHidrantesRapido } from '../data/hidrantesRapido'
import { dadosDoTipo, exigeRecalqueDuplo } from '../data/hidrantes_calc'
import { fmtNum } from '../utils/numero'

const S = {
  section: 'max-w-[980px] mx-auto pt-8 px-10 pb-20',
  stepLbl: 'text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]',
  title: 'text-[22px] font-semibold text-ink mb-[5px]',
  desc: 'text-[13px] text-ink-faint leading-[1.6]',
}

const RISCO_NOME = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

const getCls = q => q <= 300 ? 'low' : q <= 1200 ? 'med' : 'high'
const getLbl = q => q <= 300 ? 'Baixo — Classe I' : q <= 1200 ? 'Médio — Classe II' : 'Alto — Classe III/IV'

// ── Edificação: área + ocupação (grupo → divisão → CNAE) + carga ───────
// Mesma escolha de ocupação do formulário completo (Etapa 4) e mesma carga
// de incêndio (Etapa 5: pela tabela do CNAE ou por levantamento). Uma só
// edificação (estrutura única por baixo, no formato do projeto completo).
function DadosEdificacao({ est }) {
  const { state, dispatch } = useProjeto()
  const { ocupacoes, grupos, cnaesDiv } = useNorma()
  const pav = state.pavimentos.find(p => p.estruturaId === est.id)
  const grupo = pav?.grupo || ''
  const divisao = pav?.divisao || ''
  const divisoesGrp = ocupacoes[grupo]?.divisoes || {}
  const st = state.cargaState[est.id]?.[divisao]
  const temCnae = Object.keys(cnaesDiv(divisao)).length > 0
  // Divisão sem CNAE na norma (ex.: J-1) só admite levantamento.
  const metodo = !temCnae ? 'levantamento' : (st?.metodo || 'tabela')

  const setPav = changes => pav && dispatch({ type: 'UPDATE_PAV', id: pav.id, changes })
  const setCarga = (code, changes) => dispatch({ type: 'SET_CARGA', estruturaId: est.id, code, changes })
  const cargaVazia = d => ({ cnae: '', descricao: '', cargaIncendio: null, valorManual: '', metodo: Object.keys(cnaesDiv(d)).length > 0 ? 'tabela' : 'levantamento' })

  const setGrupo = g => {
    setPav({ grupo: g, divisao: '', cnae: '', cnaeDesc: '', acess: [] })
  }
  const setDivisao = d => {
    setPav({ divisao: d, cnae: '', cnaeDesc: '', acess: [] })
    setCarga(d, cargaVazia(d))
  }
  const setCNAE = item => {
    setPav({ cnae: item.cnae, cnaeDesc: item.descricao })
    setCarga(divisao, { cnae: item.cnae, descricao: item.descricao, cargaIncendio: item.cargaIncendio ?? null, metodo: 'tabela', valorManual: '' })
  }
  const autoPreencher = f => {
    setPav({ grupo: f.grupo, divisao: f.divisao, cnae: f.cnae, cnaeDesc: f.descricao, acess: [] })
    setCarga(f.divisao, { cnae: f.cnae, descricao: f.descricao, cargaIncendio: f.cargaIncendio ?? null, metodo: 'tabela', valorManual: '' })
  }

  const carga = cargaDaDivisao(divisao, state.cargaState[est.id])
  const cls = carga ? getCls(carga) : null

  return (
    <FormSection title="Edificação">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_72px_minmax(0,1fr)] gap-3 mb-5">
        <Field label="Nome do projeto">
          <input className={inputClass} value={state.nome} placeholder="Ex.: Edifício Aurora"
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'nome', value: e.target.value })}/>
        </Field>
        <Resultado label="Estado" value={state.uf}/>
        <Field label="Área construída total (m²)">
          <input className={inputClass} type="number" min="0" value={est.areaTotal}
            onChange={e => dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: 'areaTotal', value: e.target.value })}/>
        </Field>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-8 gap-y-6">
        {/* Ocupação */}
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-ink-faint uppercase tracking-[.08em] mb-3 pb-2 border-b border-solid border-border">Ocupação</div>
          <div className="g2 mb-3">
            <div className="fg">
              <label>Grupo</label>
              <select value={grupo} onChange={e => setGrupo(e.target.value)}>
                <option value="">Selecione o grupo…</option>
                {Object.keys(ocupacoes).map(g => <option key={g} value={g}>{g} — {grupos[g] || g}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Divisão</label>
              <select value={divisao} onChange={e => setDivisao(e.target.value)} disabled={!grupo}
                title={divisoesGrp[divisao] ? `${divisao} — ${divisoesGrp[divisao]}` : undefined}>
                <option value="">Selecione a divisão…</option>
                {Object.entries(divisoesGrp).map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
              </select>
            </div>
          </div>
          {divisao && temCnae && (
            <CnaeBusca auditPrefix="hidrantes" divisao={divisao} value={pav?.cnae || ''} descValue={pav?.cnaeDesc || ''}
              onSelect={setCNAE} onDescChange={v => setPav({ cnaeDesc: v })} onAutoFill={autoPreencher}/>
          )}
        </div>

        {/* Carga de incêndio */}
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-ink-faint uppercase tracking-[.08em] mb-3 pb-2 border-b border-solid border-border">Carga de incêndio</div>
          {!divisao ? (
            <div className="text-[12px] text-ink-faint">Escolha a ocupação para definir a carga de incêndio.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {temCnae ? (
                <div className="inline-flex self-start p-0.5 rounded-md bg-surface-2 border border-solid border-border" role="group" aria-label="Método de determinação da carga">
                  {[['tabela', 'Tabela', 'Por tabela normativa (CNAE)'], ['levantamento', 'Levantamento', 'Por levantamento']].map(([valor, rotulo, dica]) => (
                    <button key={valor} type="button" title={dica} aria-pressed={metodo === valor}
                      onClick={() => setCarga(divisao, valor === 'tabela'
                        ? { metodo: 'tabela', valorManual: '', cargaIncendio: pav?.cnae ? (cnaesDiv(divisao)[pav.cnae]?.cargaIncendio ?? null) : null }
                        : { metodo: 'levantamento' })}
                      className={`py-1 px-3 rounded text-[11px] font-medium border-0 cursor-pointer transition-colors duration-150 ${metodo === valor ? 'bg-surface text-ink' : 'bg-transparent text-ink-faint hover:text-ink-muted'}`}>{rotulo}</button>
                  ))}
                </div>
              ) : <span className="text-[12px] text-ink-faint">Esta divisão não tem CNAE na norma — informe a carga por levantamento.</span>}

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-baseline gap-1.5">
                  {metodo === 'levantamento' ? (
                    <input type="number" min="0" className="w-[96px] text-right" placeholder="0" aria-label={`Carga de incêndio de ${divisao}`}
                      value={st?.valorManual ?? ''} onChange={e => setCarga(divisao, { metodo: 'levantamento', valorManual: e.target.value })}/>
                  ) : (
                    <span className={`text-[22px] font-bold leading-none tabular-nums ${!cls ? 'text-ink-faint' : cls === 'low' ? 'text-green' : cls === 'med' ? 'text-amber' : 'text-red'}`}>{carga != null ? fmtNum(carga, 2, carga) : '—'}</span>
                  )}
                  <span className="text-[11px] text-ink-faint whitespace-nowrap">MJ/m²</span>
                </div>
                {cls && <span className={`carga-class ${cls}`}>{getLbl(carga)}</span>}
              </div>
              {metodo === 'tabela' && !pav?.cnae && <div className="text-[12px] text-amber">Escolha o CNAE para trazer a carga de incêndio.</div>}
            </div>
          )}
        </div>
      </div>
    </FormSection>
  )
}

export default function HidrantesRapidoPage() {
  const { state, dispatch } = useProjeto()
  const navigate = useNavigate()
  const { hidrantes: norma, extintores: extNorma, info } = useNorma()
  const h = state.hidrantes
  const setH = changes => dispatch({ type: 'SET_HIDRANTES', changes })

  const analise = useMemo(
    () => analisarHidrantesRapido(state, norma, extNorma),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.nome, state.estruturas, state.pavimentos, state.cargaState, h.chuveiros, norma, extNorma],
  )
  const { pendencias, areaTotal, sugestao, maiorCarga, risco, semClassificacao } = analise
  const opcoes = sugestao.opcoes

  // Chuveiros e hidrantes → toggles manuais de sistema por estrutura: é o que
  // o plugin (sprinklers) e as telas de dimensionamento/bomba (hidrantes
  // "ativo" → estruturas consideradas na classificação) leem.
  const comChuveiros = (h.chuveiros || 'nao') !== 'nao'
  useEffect(() => {
    state.estruturas.forEach(est => {
      const manual = state.sistemasPorEstrutura[est.id] || {}
      if (!!manual.sprinklers !== comChuveiros) {
        dispatch({ type: 'TOGGLE_SISTEMA_ESTRUTURA', estruturaId: est.id, key: 'sprinklers', value: comChuveiros })
      }
      if (manual.hidrantes !== true) {
        dispatch({ type: 'TOGGLE_SISTEMA_ESTRUTURA', estruturaId: est.id, key: 'hidrantes', value: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comChuveiros, state.estruturas, state.sistemasPorEstrutura])

  // Tipo/RTI em sincronia com a Tabela 3 — mesma regra de
  // useClassificacaoHidrantes: uma única opção vira a classificação; com duas
  // (coluna 1, ou rebaixamento pelas Notas 1/2) o RT escolhe e a escolha só
  // é preservada enquanto continuar válida. Sem opção, limpa.
  useEffect(() => {
    if (opcoes.length === 0) {
      if (h.tipo || h.rti) setH({ tipo: '', rti: '', tipoVariante: 0 })
      return
    }
    if (opcoes.length === 1) {
      const unica = opcoes[0]
      if (h.tipo !== unica.tipo || Number(h.rti) !== Number(unica.rti)) {
        setH({ tipo: unica.tipo, rti: unica.rti, tipoVariante: h.tipo === unica.tipo ? h.tipoVariante : 0 })
      }
      return
    }
    const atual = opcoes.find(o => o.tipo === h.tipo)
    if (!atual) { if (h.tipo || h.rti) setH({ tipo: '', rti: '', tipoVariante: 0 }) }
    else if (Number(h.rti) !== Number(atual.rti)) setH({ rti: atual.rti })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes, h.tipo, h.rti, h.tipoVariante])

  // Campos que o plugin lê e que são derivados da norma/classificação
  // (método de cálculo e nº de entradas do recalque), como no projeto completo.
  const dadosTipo = h.tipo && norma ? dadosDoTipo(h.tipo, h.tipoVariante || 0, norma) : null
  const entradas = dadosTipo && exigeRecalqueDuplo(dadosTipo.vazaoMin * norma.HIDRANTES_SIMULTANEOS, norma) ? 2 : 1
  useEffect(() => {
    if (!norma) return
    const changes = {}
    if (h.metodoCalculo !== norma.REFERENCIA_PRESSAO_VAZAO) changes.metodoCalculo = norma.REFERENCIA_PRESSAO_VAZAO
    if (dadosTipo && h.recalqueEntradas !== entradas) changes.recalqueEntradas = entradas
    if (Object.keys(changes).length) setH(changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [norma, dadosTipo, entradas, h.metodoCalculo, h.recalqueEntradas])

  if (!norma) {
    return (
      <div className="flex-1 overflow-y-auto"><div className="max-w-[720px] mx-auto pt-12 px-10 pb-20">
        <div className="ibox amber">
          <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/>
          <span>A classificação de hidrantes ainda não está cadastrada para {state.uf} na base normativa (normas_dados, sistema 'hidrantes').</span>
        </div>
      </div></div>
    )
  }

  const variantes = h.tipo ? (norma.TIPOS_SISTEMA[h.tipo]?.variantes || []) : []
  const escolhida = opcoes.find(o => o.tipo === h.tipo)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={S.section}>
        <div className="mb-8">
          <div className={S.stepLbl}>Dimensionamento de hidrantes · {state.uf}</div>
          <h1 className={S.title}>Classificação do sistema de hidrantes</h1>
          <p className={S.desc}>
            Informe só o que a classificação precisa ({info?.nome || 'norma do estado'}): área, ocupação,
            carga de incêndio e chuveiros automáticos. O Tipo do sistema e a RTI saem no fim da página e o
            projeto fica salvo para ser conectado no plugin Revit.
          </p>
        </div>

        <DadosEdificacao est={state.estruturas[0]}/>

        <FormSection title="Chuveiros automáticos" description="Mudam a classificação nas colunas 3 e 4 da Tabela 3 (rebaixamento permitido pelas Notas 1 e 2).">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {OPCOES_CHUVEIROS.map(o => (
              <Pill key={o.key} active={(h.chuveiros || 'nao') === o.key} onClick={() => setH({ chuveiros: o.key })}>
                <div className="font-semibold">{o.label}</div>
                <div className="text-[11px] text-ink-faint font-normal mt-0.5">{o.desc}</div>
              </Pill>
            ))}
          </div>
        </FormSection>

        <FormSection title="Classificação do sistema" description="Resultado da Tabela 3 para a área total e a ocupação de maior carga de incêndio.">
          {pendencias.length > 0 && (
            <div className="ibox amber">
              <Icon name="info" size={14} color="var(--color-amber)" className="shrink-0"/>
              <span className="text-xs">Falta preencher: {pendencias.join('; ')}.</span>
            </div>
          )}

          {semClassificacao && (
            <div className="ibox red">
              <Icon name="warn" size={14} color="var(--color-red)" className="shrink-0"/>
              <span className="text-xs">
                Nenhuma das ocupações informadas consta na Tabela 3 de {state.uf} (ou a área está fora das faixas) — a classificação
                automática não se aplica; confira a norma do estado.
              </span>
            </div>
          )}

          {opcoes.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <Resultado label="Área total" value={`${fmtNum(areaTotal)} m²`}/>
                <Resultado label="Ocupação de referência" value={sugestao.divisao}/>
                <Resultado label="Carga máxima" value={maiorCarga != null ? `${fmtNum(maiorCarga)} MJ/m²` : '—'}/>
                <Resultado label="Risco" value={risco ? RISCO_NOME[risco] : '—'}/>
              </div>

              {opcoes.length > 1 && (
                <div className="mb-4">
                  <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">
                    Escolha o Tipo do sistema
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {opcoes.map(o => (
                      <Pill key={o.tipo} active={h.tipo === o.tipo} onClick={() => setH({ tipo: o.tipo, rti: o.rti, tipoVariante: 0 })}>
                        <div className="font-semibold">Tipo {o.tipo} — RTI {o.rti} m³</div>
                        {o.origem !== 'normal' && <div className="text-[11px] text-ink-faint font-normal mt-0.5">Rebaixamento permitido pela {o.origem === 'nota1' ? 'Nota 1' : 'Nota 2'} da Tabela 3</div>}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              {escolhida?.nota && (
                <div className="ibox amber mb-4">
                  <Icon name="info" size={13} color="var(--color-amber)" className="shrink-0"/>
                  <span className="text-xs">{escolhida.nota}</span>
                </div>
              )}

              {dadosTipo && (
                <div className="border border-solid border-border rounded-md p-4 bg-bg">
                  <div className="text-[15px] font-bold text-ink mb-3">{dadosTipo.label} · RTI {h.rti} m³</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Resultado label="Vazão mínima" value={`${dadosTipo.vazaoMin} L/min`}/>
                    <Resultado label="Pressão mínima" value={`${dadosTipo.pressaoMin} mca`}/>
                    <Resultado label="Esguicho / mangueira" value={`DN${dadosTipo.esguicho} / DN${dadosTipo.mangueiraDn} × ${dadosTipo.mangueiraComprimento} m`}/>
                    <Resultado label="Expedições" value={dadosTipo.expedicoes === 'duplo' ? 'Duplo' : 'Simples'}/>
                  </div>
                  {variantes.length > 1 && (
                    <div className="mt-4">
                      <div className="text-[10px] text-ink-faint uppercase tracking-[.06em] mb-1.5">Variante do Tipo {h.tipo}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {variantes.map((v, i) => (
                          <Pill key={i} active={(h.tipoVariante || 0) === i} onClick={() => setH({ tipoVariante: i })}>
                            Esguicho DN{v.esguicho} · mangueira DN{v.mangueiraDn} · {v.pressaoMin} mca
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </FormSection>

        <div className="flex items-center justify-between gap-3 border-t border-solid border-border pt-6">
          <div className="text-xs text-ink-faint flex items-center gap-1.5">
            <Icon name="info" size={13}/>
            Salvo automaticamente. Abra o plugin Fire Utils no Revit e conecte este projeto para dimensionar a rede.
          </div>
          <button type="button" className="btn-primary" onClick={() => navigate('/projetos')}>
            <Icon name="check" size={13}/> Concluir
          </button>
        </div>
      </div>
    </div>
  )
}
