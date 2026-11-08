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
import { Field, Nota, Pill, Resultado } from '../components/hidrantes/formUi'
import { CnaeBusca, CargaCnaeBox } from '../components/steps/Step4'
import InfoTip from '../components/ui/InfoTip'
import LinkNorma from '../components/ui/LinkNorma'
import { getEstadosDisponiveis } from '../data/normas/index'
import { fmtNum } from '../utils/numero'
import { cargaDaDivisao, classificarRisco } from '../data/extintores_calc'
import { OPCOES_CHUVEIROS, analisarHidrantesRapido } from '../data/hidrantesRapido'
import { dadosDoTipo, exigeRecalqueDuplo } from '../data/hidrantes_calc'

const S = {
  section: 'max-w-[980px] mx-auto pt-8 px-10 pb-20',
  stepLbl: 'text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]',
  title: 'text-[22px] font-semibold text-ink mb-[5px]',
  desc: 'text-[13px] text-ink-faint leading-[1.6]',
}

const RISCO_NOME = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

const AREA_TIP = 'Área construída total da edificação — é a área usada para escolher a faixa da Tabela 3 (RTI).'
const REQ = <span className="req shrink-0" title="Campo obrigatório" aria-label="obrigatório"> *</span>

const RISCO_TOM = { baixo: 'text-green', medio: 'text-amber', alto: 'text-red' }

// Risco de incêndio da carga (limiares da norma de extintores do estado —
// os mesmos do resto do site), no mesmo formato da caixa de carga.
function RiscoBox({ carga, limiares }) {
  const risco = carga != null && limiares ? classificarRisco(carga, limiares) : null
  return (
    <div className="fg">
      <label>Risco de incêndio</label>
      <div className={`h-10 flex items-center border border-solid border-border rounded-md bg-surface px-3 text-[13px] font-medium ${risco ? RISCO_TOM[risco] : 'text-ink-faint'}`}>
        {risco ? RISCO_NOME[risco] : '—'}
      </div>
    </div>
  )
}

// ── Identificação: nome do projeto (igual ao formulário principal) ─────
function Identificacao() {
  const { state, dispatch } = useProjeto()
  const { uf } = useNorma()
  const estado = getEstadosDisponiveis().find(e => e.uf === uf)?.nome || uf
  return (
    <FormSection title="Identificação">
      <div className="g2">
        <div className="fg">
          <label>Nome do projeto {REQ}</label>
          <input value={state.nome} placeholder="Ex: Edificio Comercial Centro"
            onChange={e => dispatch({ type: 'SET_FIELD', field: 'nome', value: e.target.value })}/>
        </div>
        <div className="fg">
          <label>Estado</label>
          <input value={estado} disabled title="Definido na criação do projeto — não pode ser alterado"/>
        </div>
      </div>
    </FormSection>
  )
}

// ── Classificação da edificação: mesmo bloco da Etapa 4 do formulário
// principal (Grupo / Divisão / Área, CNAE + carga de incêndio). Uma só
// ocupação, uma só edificação (estrutura única por baixo, no formato do
// projeto completo). A carga vem do CNAE; divisão sem CNAE na norma
// (ex.: J-1) pede a carga por levantamento.
function ClassificacaoEdificacao({ est }) {
  const { state, dispatch } = useProjeto()
  const { ocupacoes, grupos, cnaesDiv, extintores } = useNorma()
  const pav = state.pavimentos.find(p => p.estruturaId === est.id)
  const grupo = pav?.grupo || ''
  const divisao = pav?.divisao || ''
  const divisoesGrp = ocupacoes[grupo]?.divisoes || {}
  const st = state.cargaState[est.id]?.[divisao]
  const carga = divisao ? cargaDaDivisao(divisao, state.cargaState[est.id]) : null
  const temCnae = Object.keys(cnaesDiv(divisao)).length > 0

  const setPav = changes => pav && dispatch({ type: 'UPDATE_PAV', id: pav.id, changes })
  const setCarga = (code, changes) => dispatch({ type: 'SET_CARGA', estruturaId: est.id, code, changes })

  const setGrupo = g => setPav({ grupo: g, divisao: '', cnae: '', cnaeDesc: '', acess: [] })
  const setDivisao = d => {
    setPav({ divisao: d, cnae: '', cnaeDesc: '', acess: [] })
    setCarga(d, { cnae: '', descricao: '', cargaIncendio: null, valorManual: '', metodo: Object.keys(cnaesDiv(d)).length > 0 ? 'tabela' : 'levantamento' })
  }
  const setCNAE = item => {
    setPav({ cnae: item.cnae, cnaeDesc: item.descricao })
    setCarga(divisao, { cnae: item.cnae, descricao: item.descricao, cargaIncendio: item.cargaIncendio ?? null, metodo: 'tabela', valorManual: '' })
  }
  const autoPreencher = f => {
    setPav({ grupo: f.grupo, divisao: f.divisao, cnae: f.cnae, cnaeDesc: f.descricao, acess: [] })
    setCarga(f.divisao, { cnae: f.cnae, descricao: f.descricao, cargaIncendio: f.cargaIncendio ?? null, metodo: 'tabela', valorManual: '' })
  }
  const setArea = v => {
    dispatch({ type: 'SET_ESTRUTURA_FIELD', id: est.id, field: 'areaTotal', value: v })
    setPav({ area: v })
  }

  return (
    <FormSection title="Classificação da edificação" description="Ocupação e área da edificação — definem a coluna e a faixa da Tabela 3.">
      <div className="border border-solid border-border rounded-lg p-4 bg-bg [&_input]:h-10 [&_select]:h-10 [&_input]:bg-surface [&_select]:bg-surface">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_140px] gap-3 mb-3.5">
          <div className="fg">
            <label>Grupo {REQ}</label>
            <select value={grupo} onChange={e => setGrupo(e.target.value)}>
              <option value="">Selecione…</option>
              {Object.keys(ocupacoes).map(g => <option key={g} value={g}>{g} — {grupos[g] || g}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Divisão {REQ}</label>
            <select value={divisao} onChange={e => setDivisao(e.target.value)} disabled={!grupo}
              title={divisoesGrp[divisao] ? `${divisao} — ${divisoesGrp[divisao]}` : undefined}>
              <option value="">Selecione…</option>
              {Object.entries(divisoesGrp).map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Área (m²) {REQ}<InfoTip text={AREA_TIP}/></label>
            <input type="number" min="0" value={est.areaTotal} onChange={e => setArea(e.target.value)} placeholder="0"/>
          </div>
        </div>

        {/* CNAE sempre visível: sem divisão, digitar o CNAE completo já preenche
            grupo e divisão; com divisão, lista/filtra os CNAEs dela. */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-3 items-start">
            {temCnae || !divisao ? (
              <>
                <CnaeBusca auditPrefix="hidrantes" divisao={divisao} value={pav?.cnae || ''} descValue={pav?.cnaeDesc || ''}
                  onSelect={setCNAE} onDescChange={v => setPav({ cnaeDesc: v })} onAutoFill={autoPreencher}/>
                <CargaCnaeBox divisao={divisao} cnae={pav?.cnae}/>
                <RiscoBox carga={carga} limiares={extintores?.LIMIARES_RISCO}/>
              </>
            ) : (
              <>
                <div className="text-[12px] text-ink-faint self-center">Esta divisão não tem CNAE na norma — informe a carga de incêndio por levantamento.</div>
                <div className="fg">
                  <label>Carga de incêndio (MJ/m²) {REQ}</label>
                  <input type="number" min="0" placeholder="0" value={st?.valorManual ?? ''}
                    onChange={e => setCarga(divisao, { metodo: 'levantamento', valorManual: e.target.value })}/>
                </div>
                <RiscoBox carga={carga} limiares={extintores?.LIMIARES_RISCO}/>
              </>
            )}
          </div>
      </div>
    </FormSection>
  )
}

export default function HidrantesRapidoPage() {
  const { state, dispatch } = useProjeto()
  const navigate = useNavigate()
  const { hidrantes: norma, extintores: extNorma } = useNorma()
  const h = state.hidrantes
  const setH = changes => dispatch({ type: 'SET_HIDRANTES', changes })

  const analise = useMemo(
    () => analisarHidrantesRapido(state, norma, extNorma),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.nome, state.estruturas, state.pavimentos, state.cargaState, h.chuveiros, norma, extNorma],
  )
  const { pendencias, sugestao, semClassificacao } = analise
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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={S.section}>
        <div className="mb-8">
          <div className={S.stepLbl}>Dimensionamento de hidrantes · {state.uf}</div>
          <h1 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-bold text-ink mb-1.5">
            <Icon name="hidranteMedida" size={20} color="var(--color-red)" className="shrink-0"/>
            Classificação do sistema de hidrantes
            <LinkNorma sistema="hidrantes"/>
          </h1>
        </div>

        <Identificacao/>

        <ClassificacaoEdificacao est={state.estruturas[0]}/>

        <FormSection title="Chuveiros automáticos">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {OPCOES_CHUVEIROS.map(o => (
              <Pill key={o.key} active={(h.chuveiros || 'nao') === o.key} onClick={() => setH({ chuveiros: o.key })}>
                <div className="font-semibold">{o.label}</div>
                <div className="text-[11px] text-ink-faint font-normal mt-0.5">{o.desc}</div>
              </Pill>
            ))}
          </div>
        </FormSection>

        <FormSection title="Classificação do sistema">
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
              {opcoes.length > 1 && (
                <div className="mb-4">
                  <Field label="A norma permite dois sistemas para esta ocupação — escolha qual adotar"/>
                  <div className="grid grid-cols-2 gap-2 mt-1 max-[600px]:grid-cols-1">
                    {opcoes.map(o => (
                      <Pill key={o.tipo} centro active={h.tipo === o.tipo} onClick={() => setH({ tipo: o.tipo, rti: o.rti, tipoVariante: 0 })}>
                        Tipo {o.tipo} — RTI {fmtNum(o.rti)} m³
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              {/* Nota de rebaixamento (Tabela 3, Nota 1 ou 2): só permite, nunca impõe. */}
              {opcoes.some(o => o.nota) && <Nota>{opcoes.find(o => o.nota).nota}</Nota>}

              {dadosTipo && variantes.length > 1 && (
                <div className="mb-4">
                  <Field label={`Mangueira do Tipo ${h.tipo}`}/>
                  <div className="grid grid-cols-2 gap-2 mt-1 max-[600px]:grid-cols-1">
                    {variantes.map((v, i) => (
                      <Pill key={i} centro active={(h.tipoVariante || 0) === i} onClick={() => setH({ tipoVariante: i })}>
                        Esguicho DN{v.esguicho} — mangueira DN{v.mangueiraDn} — {v.pressaoMin} mca
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              {/* Colunas na largura do conteúdo, igualmente espaçadas (mesmo bloco do formulário padrão). */}
              <div className="flex flex-wrap justify-between gap-x-8 gap-y-3 bg-surface-2 border border-solid border-border rounded-lg p-4 mt-4">
                <Resultado label="Tipo" value={h.tipo ? `Tipo ${h.tipo}` : '—'}/>
                {dadosTipo && (
                  <>
                    <Resultado label="Esguicho" value={`DN${dadosTipo.esguicho}`}/>
                    <Resultado label="Mangueira" value={`DN${dadosTipo.mangueiraDn}`}/>
                    <Resultado label="RTI" value={h.rti ? `${fmtNum(h.rti, 2, h.rti)} m³` : '—'}/>
                    <Resultado label="Expedições" value={dadosTipo.expedicoes} className="capitalize"/>
                    <Resultado label="Vazão mín." value={`${dadosTipo.vazaoMin} L/min`}/>
                    <Resultado label="Pressão mín." value={`${dadosTipo.pressaoMin} mca`}/>
                  </>
                )}
              </div>
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
