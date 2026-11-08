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
import { OPCOES_CHUVEIROS, analisarHidrantesRapido, divisoesDaEstruturaRapido } from '../data/hidrantesRapido'
import { dadosDoTipo, exigeRecalqueDuplo } from '../data/hidrantes_calc'
import { fmtNum } from '../utils/numero'

const S = {
  section: 'max-w-[980px] mx-auto pt-8 px-10 pb-20',
  stepLbl: 'text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]',
  title: 'text-[22px] font-semibold text-ink mb-[5px]',
  desc: 'text-[13px] text-ink-faint leading-[1.6]',
}

const RISCO_NOME = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

// ── Seletor de divisão (agrupado por grupo de ocupação) ────────────────
function SeletorDivisao({ value, onChange, ocupacoes, usadas }) {
  return (
    <select className={inputClass} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">Selecione a ocupação…</option>
      {Object.entries(ocupacoes).map(([grupo, g]) => (
        <optgroup key={grupo} label={`${grupo} — ${g.descricao || grupo}`}>
          {Object.entries(g.divisoes || {}).map(([code, label]) => (
            <option key={code} value={code} disabled={usadas.has(code) && code !== value}>
              {code} — {label}{usadas.has(code) && code !== value ? ' (já utilizada)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ── Carga de incêndio de uma divisão (MJ/m²) ───────────────────────────
// Digitada, ou preenchida pelo CNAE (tabela da norma). Sempre guardada como
// "levantamento" — o valor vira o dado, editável depois.
function CampoCarga({ estruturaId, divisao, cargaState, cnaes, dispatch }) {
  const st = cargaState?.[divisao]
  const valor = st?.metodo === 'levantamento' ? (st.valorManual ?? '') : (st?.cargaIncendio ?? '')
  const set = changes => dispatch({ type: 'SET_CARGA', estruturaId, code: divisao, changes: { metodo: 'levantamento', ...changes } })
  const listaCnae = Object.entries(cnaes)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label={`Carga de incêndio ${divisao} (MJ/m²)`}>
        <input className={inputClass} type="number" min="0" value={valor}
          onChange={e => set({ valorManual: e.target.value, cargaIncendio: null })} placeholder="Ex.: 300"/>
      </Field>
      {listaCnae.length > 0 && (
        <Field label="Ou preencher pela atividade (CNAE)">
          <select className={inputClass} value={st?.cnae || ''}
            onChange={e => {
              const item = cnaes[e.target.value]
              if (!item) return
              set({ cnae: e.target.value, descricao: item.descricao || '', valorManual: String(item.cargaIncendio ?? ''), cargaIncendio: item.cargaIncendio ?? null })
            }}>
            <option value="">Selecione para preencher a carga…</option>
            {listaCnae.map(([cnae, d]) => (
              <option key={cnae} value={cnae}>{cnae} — {d.descricao} ({d.cargaIncendio} MJ/m²)</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  )
}

// ── Uma estrutura (torre/bloco): área + ocupações + cargas ─────────────
function EstruturaCard({ est, index, podeRemover }) {
  const { state, dispatch } = useProjeto()
  const { ocupacoes, cnaesDiv } = useNorma()
  const pav = state.pavimentos.find(p => p.estruturaId === est.id)
  const divisoes = divisoesDaEstruturaRapido(state, est.id)
  const usadas = new Set(divisoes)
  const cargaState = state.cargaState[est.id] || {}

  const setPav = changes => pav && dispatch({ type: 'UPDATE_PAV', id: pav.id, changes })
  const setPrincipal = divisao => setPav({ divisao, grupo: divisao.charAt(0), cnae: '', cnaeDesc: '' })
  const setSubsidiaria = (i, divisao) => setPav({ acess: pav.acess.map((a, j) => j === i ? { ...a, divisao } : a) })
  const addSubsidiaria = () => setPav({ acess: [...(pav.acess || []), { divisao: '', cnae: '', cnaeDesc: '', area: '' }] })
  const removeSubsidiaria = i => setPav({ acess: pav.acess.filter((_, j) => j !== i) })

  return (
    <FormSection
      title={est.nome || `Estrutura ${index + 1}`}
      extra={podeRemover && (
        <button type="button" className="btn-ghost text-xs" onClick={() => dispatch({ type: 'REMOVE_ESTRUTURA', id: est.id })}>
          <Icon name="trash" size={13}/> Remover
        </button>
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Field label="Nome da estrutura">
          <input className={inputClass} value={est.nome}
            onChange={e => dispatch({ type: 'RENAME_ESTRUTURA', id: est.id, nome: e.target.value })}/>
        </Field>
        <Field label="Área construída total (m²)">
          <input className={inputClass} type="number" min="0" value={est.areaTotal}
            onChange={e => dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: 'areaTotal', value: e.target.value })}/>
        </Field>
      </div>

      <div className="mb-4">
        <Field label="Ocupação principal">
          <SeletorDivisao value={pav?.divisao} onChange={setPrincipal} ocupacoes={ocupacoes} usadas={usadas}/>
        </Field>
      </div>

      {(pav?.acess || []).map((a, i) => (
        <div key={i} className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <Field label={`Ocupação subsidiária ${i + 1}`}>
              <SeletorDivisao value={a.divisao} onChange={d => setSubsidiaria(i, d)} ocupacoes={ocupacoes} usadas={usadas}/>
            </Field>
          </div>
          <button type="button" className="btn-ghost p-2" title="Remover ocupação subsidiária" onClick={() => removeSubsidiaria(i)}>
            <Icon name="x" size={13}/>
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-xs mb-4" onClick={addSubsidiaria}>
        <Icon name="plus" size={13}/> Ocupação subsidiária
      </button>

      {divisoes.map(d => (
        <div key={d} className="mb-3">
          <CampoCarga estruturaId={est.id} divisao={d} cargaState={cargaState} cnaes={cnaesDiv(d)} dispatch={dispatch}/>
        </div>
      ))}
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

  // Chuveiros → toggle manual de sprinklers por estrutura (é o que o plugin
  // lê em sistemasPorEstrutura pra saber se há chuveiros).
  const comChuveiros = (h.chuveiros || 'nao') !== 'nao'
  useEffect(() => {
    state.estruturas.forEach(est => {
      if (!!state.sistemasPorEstrutura[est.id]?.sprinklers !== comChuveiros) {
        dispatch({ type: 'TOGGLE_SISTEMA_ESTRUTURA', estruturaId: est.id, key: 'sprinklers', value: comChuveiros })
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

  const addEstrutura = () => {
    const id = `est-${Date.now().toString(36)}`
    dispatch({ type: 'ADD_ESTRUTURA', id })
    // O térreo novo nasce com E-1 — zera pra o RT escolher a ocupação.
    dispatch({ type: 'UPDATE_PAV', id: `${id}-P1`, changes: { grupo: '', divisao: '' } })
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

        <FormSection title="Projeto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome do projeto">
              <input className={inputClass} value={state.nome} placeholder="Ex.: Edifício Aurora"
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'nome', value: e.target.value })}/>
            </Field>
            <Resultado label="Estado" value={state.uf}/>
          </div>
        </FormSection>

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

        {state.estruturas.map((est, i) => (
          <EstruturaCard key={est.id} est={est} index={i} podeRemover={state.estruturas.length > 1}/>
        ))}
        <button type="button" className="btn-ghost mb-6" onClick={addEstrutura}>
          <Icon name="plus" size={13}/> Adicionar estrutura
        </button>

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
