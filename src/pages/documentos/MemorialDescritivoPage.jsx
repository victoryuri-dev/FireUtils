import { Fragment, useRef, useState } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { buildMemorial, PRIMEIRA_SECAO_MEDIDA } from '../../data/memorial/registry'
import { MEDIDAS_ANEXO_B_COL1, MEDIDAS_ANEXO_B_COL2, RISCOS_ESPECIAIS, estadoMedidaSistema } from '../../utils/anexoB'
import { getCNAEsDivisao, getNts, getCompartimentacao } from '../../data/normas/index'
import { classificarTipoEdificacao } from '../../data/compart_calc'
import { classificarPavimentos } from '../../utils/classificacao'
import { fmtNum, fmtUn } from '../../utils/numero'
import { enquadrarTipoProjeto, rotuloTipoProjeto } from '../../data/tipoProjeto'
import { useZoomDocumento } from '../../hooks/useZoomDocumento'
import { BarraZoom, JanelaDocumento } from '../../components/documentos/ZoomDocumento'
import Icon from '../../components/ui/Icon'
import { exportarWord, imprimirComNome, nomeDocumentoMemorial } from '../../utils/exportarWord'
import PreviewPaginado from '../../components/documentos/PreviewPaginado'
import MenuSecoes from '../../components/documentos/MenuSecoes'
import { Titulo, BlocoMedida } from '../../components/documentos/BlocosMemorial'
import { TABELA, TABELA_THEAD, TABELA_TH, TABELA_TD, zebra, TEXTO, TEXTO_PEQUENO, tituloCase, numerarBlocos } from '../../utils/memorialEstilo'
import { registroComConselho } from '../../utils/conselho'
import { usaArtNoProjeto } from '../../estados/fluxos'

// Memorial descritivo: um documento para impressão, uma pagina A4 por medida
// de seguranca (secao vinda de buildMemorial). Medidas ainda sem builder
// registrado (ver memorial/registry.js) simplesmente nao aparecem aqui.
//
// Numeracao progressiva (ABNT NBR 6024): comeca em 1 no Objetivo e segue ate a
// ultima secao; capa e Sumario nao sao numerados. O numero vem antes do
// titulo, separado por um unico espaco e sem ponto final ("1 OBJETIVO",
// "4.1 Refeitorio"). Gradacao: secao primaria (h1) em MAIUSCULAS e negrito;
// secundaria (h2) e terciaria (h3) em negrito, com maiusculas so nas iniciais.
// O Sumario e montado a partir dos titulos numerados (data-toc), e os numeros
// de pagina vem do Paged.js (target-counter) — ver montarSumario.
const SECAO_OBJETIVO = 1
const SECAO_LEGISLACAO = 2
const SECAO_SOBRE_EDIFICACAO = 3
const SECAO_CARACTERIZACAO = 4
const SECAO_MEDIDAS_APLICADAS = 5

// Ate que nivel de titulo o Sumario lista (1 = so secoes primarias, 2 = ate as
// secundarias, 3 = ate as terciarias).
const NIVEL_MAXIMO_SUMARIO = 1

// Cada secao do memorial comeca numa pagina nova; o Paged.js (ver
// PreviewPaginado) divide o documento em folhas A4 reais, com margem de 25mm,
// e parte as secoes longas entre paginas — na tela e na impressao. Aqui a
// secao e so um bloco de conteudo, sem largura, sombra ou margem de folha.
const FOLHA = 'memorial-secao relative flex flex-col w-full bg-white text-black'

// CSS processado pelo Paged.js: pagina A4 com margem de 25mm, quebra de
// pagina por secao (inclusive entre uma medida de seguranca e a seguinte —
// cada uma fica sozinha na propria folha, mesmo com pouco conteudo) e numero
// da pagina no canto inferior direito. Capa e Sumario (pagina nomeada
// "pretextual") contam na numeracao, mas nao exibem o numero.
//
// A margem inferior do ultimo elemento da secao e zerada de proposito: a secao
// e flex-col (margens nao colapsam), entao a margem de uma tabela que termina
// rente ao fim da folha estourava a pagina em poucos px invisiveis. O Paged.js
// tratava isso como transbordo e, ao corrigir, descartava as ultimas celulas
// da ultima linha da tabela.
const CSS_PAGINA = `
@page { size: A4 portrait; margin: 25mm; @bottom-right { content: counter(page); } }
@page pretextual { @bottom-right { content: none; } }
.memorial-pretextual { page: pretextual; }
.memorial-secao { break-after: page; min-height: 246mm; }
.memorial-secao:last-child { break-after: auto; }
tr, td, th { break-inside: avoid; }
.memorial-secao > :last-child,
.memorial-secao > :last-child > :last-child,
.memorial-secao > :last-child > :last-child > :last-child { margin-bottom: 0 !important; }
`


// Mesmos limiares de classificacao de risco usados no dashboard do projeto
// (DashboardPage.jsx: getCargaCls/getCargaLbl) — mantidos aqui com a
// redacao curta que o memorial usa ("Baixo Risco" em vez de "Risco baixo · Classe I").
function classificarCarga(q) {
  return q <= 300 ? 'Baixo Risco' : q <= 1200 ? 'Médio Risco' : 'Alto Risco'
}

function enderecoCompletoDe(state, fallback = '[Rua, Número, Bairro, Cidade – UF, CEP]') {
  const linha = [state.endereco, state.numero].filter(Boolean).join(', ')
  return [linha, state.complemento, state.bairro, [state.cidade, state.uf].filter(Boolean).join(' – '), state.cep]
    .filter(Boolean).join(', ') || fallback
}

// Carga de incendio de uma ocupacao (divisao + CNAE) numa estrutura — mesma
// logica do getCarga() do Step5.jsx: com metodo "tabela" o valor vem do
// catalogo de CNAEs da divisao (state.cargaState[estruturaId][divisao]
// .cargaIncendio so e preenchido quando o usuario troca de metodo
// manualmente, entao nao da pra confiar só nele — teria ficado null e a
// carga sumiria da tabela).
function cargaDaOcupacao(state, estruturaId, divisao, cnae) {
  const c = state.cargaState?.[estruturaId]?.[divisao]
  if (c?.metodo === 'levantamento') return parseFloat(c.valorManual) || 0
  const daCatalogo = cnae ? getCNAEsDivisao(state.uf, divisao)[cnae]?.cargaIncendio : null
  return daCatalogo || c?.cargaIncendio || 0
}



// Preenche o Sumario (container [data-sumario]) numa COPIA do documento, antes
// do Paged.js paginar: uma linha por titulo numerado (ate NIVEL_MAXIMO_SUMARIO),
// com link pro titulo. O numero da pagina nasce como um espaco reservado (mesma
// largura do numero final, pra a paginacao nao mudar) e e preenchido depois de
// paginar, por preencherPaginasSumario.
function montarSumario(raiz) {
  const alvo = raiz.querySelector('[data-sumario]')
  if (!alvo) return
  const titulos = [...raiz.querySelectorAll('[data-toc]')].filter(h => Number(h.dataset.toc) <= NIVEL_MAXIMO_SUMARIO)
  alvo.replaceChildren(...titulos.map((h, i) => {
    const id = `sumario-${i}`
    h.id = id
    const numero = h.dataset.tocNum
    const texto = h.textContent.trim().slice(numero.length).trim()
    const a = document.createElement('a')
    a.href = `#${id}`
    a.className = `sumario-item sumario-n${h.dataset.toc}`
    const titulo = document.createElement('span')
    titulo.className = 'sumario-titulo'
    titulo.textContent = `${numero} ${texto}`
    const pontos = document.createElement('span')
    pontos.className = 'sumario-pontos'
    const pagina = document.createElement('span')
    pagina.className = 'sumario-pagina'
    pagina.textContent = '00'
    a.append(titulo, pontos, pagina)
    return a
  }))
}

// Titulos primarios ja paginados (nos elementos que estao na tela), pro menu
// flutuante de navegacao.
function coletarSecoes(destino) {
  return [...destino.querySelectorAll('h1[data-toc="1"]')].map(h => {
    const numero = h.dataset.tocNum
    return { id: h.id, numero, texto: h.textContent.trim().slice(numero.length).trim(), el: h }
  })
}

// Depois que o Paged.js paginou: cada linha do Sumario recebe o numero da
// pagina (contando a capa como 1) em que o titulo dela realmente caiu.
function preencherPaginasSumario(destino) {
  const paginas = [...destino.querySelectorAll('.pagedjs_page')]
  destino.querySelectorAll('.sumario-item').forEach(item => {
    const alvo = destino.querySelector(item.getAttribute('href'))
    const indice = alvo ? paginas.findIndex(p => p.contains(alvo)) : -1
    const campo = item.querySelector('.sumario-pagina')
    if (campo) campo.textContent = indice >= 0 ? String(indice + 1) : ''
  })
}

function Capa({ state }) {
  // Nome do projeto é o único campo garantido em qualquer modo de projeto
  // (ver ProjetoContext.jsx tipoProjeto) — os demais só aparecem se
  // preenchidos, sem placeholder entre colchetes no documento final.
  const edificacao = state.respFantasia || state.respRazaoSocial || state.nome || ''
  const enderecoCompleto = enderecoCompletoDe(state, '')

  return (
    <div className={`${FOLHA} memorial-pretextual`}>
      <div className="text-center my-auto py-16">
        <h1 className="capa-titulo font-heading font-bold text-black uppercase">
          Memorial Descritivo de Projeto de Prevenção e Combate a Incêndio
        </h1>
      </div>

      <div className="text-center text-[12px] text-black flex flex-col gap-1.5 pb-8">
        {edificacao && <div>{edificacao}</div>}
        {enderecoCompleto && <div>{enderecoCompleto}</div>}
      </div>
    </div>
  )
}

function Sumario() {
  return (
    <div className={`${FOLHA} memorial-pretextual`}>
      <h1 className="font-heading text-black text-center mb-8">Sumário</h1>
      <div data-sumario/>
    </div>
  )
}

function Introducao({ sistemas, uf }) {
  // Sem a lista de NTs do estado na base central: seção sem a lista, nunca a de outro estado.
  const { NTS_PADRAO_MA = [], NT_CARGA_INCENDIO = null, NTS_POR_SISTEMA = {} } = getNts(uf) || {}
  const nts = Object.entries(sistemas || {})
    .filter(([, s]) => s.ativo || s.obrigatorio)
    .map(([key]) => NTS_POR_SISTEMA[key])
    .filter(Boolean)
    .concat([NT_CARGA_INCENDIO])
    .filter(Boolean)
    .filter((nt, i, arr) => arr.findIndex(n => n.numero === nt.numero) === i)
    .sort((a, b) => parseInt(a.numero.replace(/\D/g, ''), 10) - parseInt(b.numero.replace(/\D/g, ''), 10))

  return (
    <div className={FOLHA}>
      <Titulo nivel={1} numero={String(SECAO_OBJETIVO)}>Objetivo</Titulo>
      <p className={TEXTO}>
        Memorial Técnico Descritivo apresentado ao Corpo de Bombeiros Militar do Estado do Maranhão (CBMMA), como
        requisito legal para análise, aprovação e regularização do Projeto de Segurança Contra Incêndio e Pânico da
        edificação.
      </p>

      <Titulo nivel={1} numero={String(SECAO_LEGISLACAO)}>Sobre a Legislação</Titulo>
      <p className={TEXTO}>
        O projeto foi desenvolvido atendendo as determinações do Decreto Estadual, que regulamenta a Lei, e que, por
        sua vez, dispõe sobre a segurança contra incêndio e pânico e dá outras providências. O projeto atende também
        as Normas Brasileiras (NBR&apos;s) da Associação Brasileira de Normas Técnicas (ABNT), assim como as
        seguintes instruções técnicas:
      </p>
      <ul className={`${TEXTO_PEQUENO} list-none pl-2`}>
        {NTS_PADRAO_MA.map(nt => (
          <li key={nt.numero}><strong>{nt.numero}</strong> — {nt.nome}</li>
        ))}
        {nts.map(nt => (
          <li key={nt.numero}><strong>{nt.numero}</strong> — {nt.nome}</li>
        ))}
      </ul>
    </div>
  )
}

// Sem valor, o campo nem aparece — evita linhas tipo "Endereço: " em
// branco num documento que projetos "apenas dimensionamento" nunca
// preenchem (ver ProjetoContext.jsx tipoProjeto). `whitespace-pre-line`
// preserva quebra de linha digitada pelo usuário (ex.: Observações
// complementares) — sem isso o HTML colapsa "\n" num espaço e o texto sai
// corrido no memorial, mesmo que o campo de origem seja um textarea.
function CampoDiscriminado({ label, value }) {
  if (!value) return null
  return <div><strong>{label}:&nbsp;</strong><span className="whitespace-pre-line">{value}</span></div>
}

function SobreEdificacao({ state }) {
  const endereco = enderecoCompletoDe(state, '')

  // Situação da edificação (Etapa 2): nova ou existente. Os dados legais só
  // entram quando o usuário optou por informá-los (mesma regra da Etapa 2 —
  // projeto com algum desses dados preenchido conta como "sim"); ano de
  // construção e AVCB só fazem sentido pra existente — observações
  // complementares (state.condicoesAtuais) valem pras duas situações.
  const existente = state.situacao === 'existente'
  const situacaoTxt = existente ? 'Edificação existente'
    : state.situacao === 'nova' ? 'Edificação nova' : ''
  const jaTemDadosLegais = !!(state.numeroAlvara || state.anoConstrucao || state.numeroAVCB || state.validadeAVCB)
  const legais = (state.informarDadosLegais || (jaTemDadosLegais ? 'sim' : '')) === 'sim'
  const fmtData = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '')
  }

  // Subitem só entra na numeração se tiver ao menos um campo preenchido —
  // assim "3.1, 3.2, 3.3" nunca pula um número quando um bloco some (ver
  // ProjetoContext.jsx tipoProjeto).
  const blocos = [
    { titulo: 'Responsável Técnico', campos: [
      ['Responsável Técnico', state.rtNome],
      ['Especialidade', state.rtEspecialidade],
      ['Registro Profissional', registroComConselho(state)],
      ['Número da ART / RRT', usaArtNoProjeto(state) ? state.artNumero : ''],
    ] },
    { titulo: 'Responsável pelo Uso', campos: [
      ['Razão Social', state.respRazaoSocial],
      ['Nome Fantasia', state.respFantasia],
      ['CNPJ', state.respCNPJ],
      ['Telefone', state.respTelefone],
      ['E-mail', state.respEmail],
    ] },
    { titulo: 'Proprietário do Imóvel', campos: [
      ['Nome / Razão Social', state.propNome],
      ['CPF / CNPJ', state.propDocumento],
      ['Telefone', state.propTelefone],
      ['E-mail', state.propEmail],
    ] },
    { titulo: 'Dados do Imóvel', campos: [
      // Enquadramento automático (área/altura × limiares da norma — data/tipoProjeto.js).
      ['Tipo de projeto', rotuloTipoProjeto(state.uf, enquadrarTipoProjeto(state.uf, state.estruturas).tipo)],
      ['Situação', situacaoTxt],
      ['Endereço', endereco],
      ['Área construída total', state.areaConstruidaTotal ? fmtUn(state.areaConstruidaTotal, 'm²', 2, `${state.areaConstruidaTotal} m²`) : ''],
      ['Área do terreno', state.areaTerreno ? fmtUn(state.areaTerreno, 'm²', 2, `${state.areaTerreno} m²`) : ''],
      ['Número do alvará', legais ? state.numeroAlvara : ''],
      ['Ano de construção', legais && existente ? state.anoConstrucao : ''],
      ['Situação perante o CBMMA', legais && existente ? state.situacaoCBM : ''],
      ['Nº do AVCB anterior', legais && existente ? state.numeroAVCB : ''],
      ['Validade do AVCB', legais && existente ? fmtData(state.validadeAVCB) : ''],
      ['Observações complementares', state.condicoesAtuais?.trim()],
    ] },
  ].filter(b => b.campos.some(([, v]) => v))

  return (
    <div className={FOLHA}>
      <Titulo nivel={1} numero={String(SECAO_SOBRE_EDIFICACAO)}>Sobre a Edificação</Titulo>

      {blocos.map((bloco, i) => (
        <Fragment key={bloco.titulo}>
          <Titulo nivel={2} numero={`${SECAO_SOBRE_EDIFICACAO}.${i + 1}`}>{tituloCase(bloco.titulo)}</Titulo>
          <div className={`${TEXTO_PEQUENO} pl-6`}>
            {bloco.campos.map(([label, value]) => (
              <CampoDiscriminado key={label} label={label} value={value}/>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function Caracterizacao({ state, porEstrutura }) {
  const { CLASSES_TIPO_EDIFICACAO } = getCompartimentacao(state.uf) || {}
  return (
    <div className={FOLHA}>
      <Titulo nivel={1} numero={String(SECAO_CARACTERIZACAO)}>Caracterização da Edificação e do Risco</Titulo>

      {porEstrutura.map(({ estrutura: est }, estIdx) => {
        const pavsEst = state.pavimentos.filter(p => p.estruturaId === est.id)
        const classificacao = classificarPavimentos(pavsEst, est.areaTotal)

        // Apenas ocupações principais e secundárias; subsidiárias não
        // entram nesta tabela de caracterização.
        const linhas = []
        pavsEst.forEach(p => {
          const inicio = linhas.length
          if (p.divisao) linhas.push({ pavimento: p.label, divisao: p.divisao, cnae: p.cnae, cnaeDesc: p.cnaeDesc })
          p.acess?.forEach(a => {
            if (a.divisao && classificacao.subsidiariasRaw.some(c => c.divisao === a.divisao && c.isMista)) linhas.push({ pavimento: p.label, divisao: a.divisao, cnae: a.cnae, cnaeDesc: a.cnaeDesc })
          })
          for (let i = inicio; i < linhas.length; i++) linhas[i].pavimentoSpan = i === inicio ? linhas.length - inicio : 0
        })

        // Altura e tipo de edificação são apresentados em linhas separadas.
        const tipoEst = CLASSES_TIPO_EDIFICACAO ? classificarTipoEdificacao(est.alturaPisoPiso, CLASSES_TIPO_EDIFICACAO) : null
        const alturaClassifTxt = est.alturaPisoPiso === '' || est.alturaPisoPiso == null ? '' :
          fmtUn(est.alturaPisoPiso, 'm')
        const subsolos = parseInt(est.nSubsolos) || 0
        const pavimentos = (parseInt(est.nPavimentos) || 1) + subsolos

        return (
          <Fragment key={est.id}>
            <Titulo nivel={2} numero={`${SECAO_CARACTERIZACAO}.${estIdx + 1}`}>{tituloCase(est.nome)}</Titulo>

            <div className={TEXTO_PEQUENO}>
              <div><strong>Quantidade de pavimentos:&nbsp;</strong>{fmtNum(pavimentos, 0)}</div>
              <div><strong>Área construída:&nbsp;</strong>{est.areaTotal ? fmtUn(est.areaTotal, 'm²', 2, `${est.areaTotal} m²`) : '—'}</div>
              <div><strong>Altura para fins de classificação das medidas de segurança:&nbsp;</strong>{alturaClassifTxt || '—'}</div>
              <div><strong>Classificação quanto à altura:&nbsp;</strong>{tipoEst ? `Tipo ${tipoEst.classe} - ${tipoEst.nome}` : '—'}</div>
              <div><strong>Altura total:&nbsp;</strong>{est.altura ? fmtUn(est.altura, 'm', 2, `${est.altura} m`) : '—'}</div>
              {subsolos > 0 && <div><strong>Profundidade do subsolo:&nbsp;</strong>{est.profundidadeSubsolo !== '' && est.profundidadeSubsolo != null ? fmtUn(est.profundidadeSubsolo, 'm') : '—'}</div>}
            </div>

            <p className="titulo-tabela">Ocupações por pavimento</p>
            <table className={`${TABELA} table-fixed`}>
              <colgroup>
                <col style={{ width: '30mm' }}/>
                <col style={{ width: '20mm' }}/>
                <col/>
                <col style={{ width: '28mm' }}/>
              </colgroup>
              <thead>
                <tr className={TABELA_THEAD}>
                  <th className={`${TABELA_TH} text-left`}>Pavimento</th>
                  <th className={`${TABELA_TH} text-left`}>Divisão</th>
                  <th className={`${TABELA_TH} text-left`}>CNAE / Atividade</th>
                  <th className={`${TABELA_TH} text-center`}>Carga de Incêndio</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 ? (
                  <tr><td colSpan={4} className={`${TABELA_TD} text-center text-[#9ca3af]`}>Nenhuma ocupação classificada</td></tr>
                ) : linhas.map((l, i) => {
                  const cargaQ = cargaDaOcupacao(state, est.id, l.divisao, l.cnae)
                  return (
                    <tr key={i} className={zebra(i)}>
                      {l.pavimentoSpan > 0 && <td rowSpan={l.pavimentoSpan} className={TABELA_TD}>{l.pavimento}</td>}
                      <td className={TABELA_TD}>{l.divisao}</td>
                      <td className={TABELA_TD}>{[l.cnae, l.cnaeDesc].filter(Boolean).join(' — ')}</td>
                      <td className={`${TABELA_TD} text-center`}>{cargaQ ? <>{fmtUn(cargaQ, 'MJ/m²')}<br/>{classificarCarga(cargaQ)}</> : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Fragment>
        )
      })}
    </div>
  )
}

function MedidasAplicadas({ state, sistemas, porEstrutura }) {
  const medidas = [...MEDIDAS_ANEXO_B_COL1, ...MEDIDAS_ANEXO_B_COL2]
    .filter(m => m.key && (sistemas[m.key]?.ativo || sistemas[m.key]?.obrigatorio))
    .map(m => m.key === 'central_gas' ? { ...m, label: 'Central GLP' } : m)
  const riscosPorEstrutura = state.riscosEspeciaisPorEstrutura || {}
  const outrosDescPorEstrutura = state.riscosOutrosDescPorEstrutura || {}
  const riscosAtivosGlobal = RISCOS_ESPECIAIS
    .filter(r => porEstrutura.some(pe => !!riscosPorEstrutura[pe.estrutura.id]?.[r.key]))
  const multiplasEstruturas = porEstrutura.length > 1
  // Isenta por desativação manual SEM justificativa (opção do RT em
  // Configuração): a célula fica vazia, nem "X" nem "-".
  const semMotivo = (estId, key) => !!state.semMotivoIsencaoPorEstrutura?.[estId]?.[key] && state.sistemasPorEstrutura?.[estId]?.[key] === false
  const estadoCelula = (pe, key) => {
    const e = estadoMedidaSistema(pe.sistemas, key)
    return e === 'isenta' && semMotivo(pe.estrutura.id, key) ? 'none' : e
  }
  const temIsenta = multiplasEstruturas
    ? medidas.some(m => porEstrutura.some(pe => estadoCelula(pe, m.key) === 'isenta'))
    : medidas.some(m => estadoMedidaSistema(sistemas, m.key) === 'isenta' && !semMotivo(porEstrutura[0]?.estrutura.id, m.key))
  // Estrutura unica: reaproveita o riscos dessa unica estrutura pra manter o
  // rotulo "Outros: <descricao>" embutido, como antes.
  const unicaEst = porEstrutura[0]?.estrutura
  const riscosAtivosUnica = multiplasEstruturas ? [] : RISCOS_ESPECIAIS
    .filter(r => unicaEst && !!riscosPorEstrutura[unicaEst.id]?.[r.key])
    .map(r => (r.key === 'outros' && outrosDescPorEstrutura[unicaEst.id]) ? `${r.label}: ${outrosDescPorEstrutura[unicaEst.id]}` : r.label)
  const outrosDescsMultiplas = multiplasEstruturas
    ? porEstrutura
        .filter(pe => riscosPorEstrutura[pe.estrutura.id]?.outros && outrosDescPorEstrutura[pe.estrutura.id])
        .map(pe => `${pe.estrutura.nome}: ${outrosDescPorEstrutura[pe.estrutura.id]}`)
    : []

  return (
    <div className={FOLHA}>
      <Titulo nivel={1} numero={String(SECAO_MEDIDAS_APLICADAS)}>Medidas de Segurança Contra Incêndio e Emergência do Projeto</Titulo>

      {multiplasEstruturas ? (
        <table className={TABELA}>
          <thead>
            <tr className={TABELA_THEAD}>
              <th className={`${TABELA_TH} text-left`}>Medidas de Segurança Aplicadas</th>
              {porEstrutura.map(({ estrutura: est }) => (
                <th key={est.id} className={`${TABELA_TH} w-[70px]`}>{est.nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {medidas.map((m, i) => (
              <tr key={m.key} className={zebra(i)}>
                <td className={TABELA_TD}>{m.label}</td>
                {porEstrutura.map(pe => {
                  const estado = estadoCelula(pe, m.key)
                  return (
                    <td key={pe.estrutura.id} className={`${TABELA_TD} text-center text-[16px] font-bold leading-none`}>
                      {estado === 'x' ? 'X' : estado === 'isenta' ? '-' : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className={TABELA}>
          <thead>
            <tr className={TABELA_THEAD}>
              <th className={`${TABELA_TH} text-left`}>Medidas de Segurança Aplicadas</th>
              <th className={`${TABELA_TH} w-[70px]`}></th>
            </tr>
          </thead>
          <tbody>
            {medidas.map((m, i) => (
              <tr key={m.key} className={zebra(i)}>
                <td className={TABELA_TD}>{m.label}</td>
                <td className={`${TABELA_TD} text-center text-[16px] font-bold leading-none`}>
                  {estadoMedidaSistema(sistemas, m.key) === 'isenta' ? (semMotivo(porEstrutura[0]?.estrutura.id, m.key) ? '' : '-') : 'X'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {temIsenta && (
        <p className="text-[10px] text-black/60">
          <strong>-</strong>: Medida de segurança isenta. Ver motivo na seção dedicada.
        </p>
      )}

      {riscosAtivosGlobal.length > 0 && (
        <>
          <Titulo nivel={2} numero={`${SECAO_MEDIDAS_APLICADAS}.1`}>Riscos Especiais</Titulo>
          {multiplasEstruturas ? (
            <table className={TABELA}>
              <thead>
                <tr className={TABELA_THEAD}>
                  <th className={`${TABELA_TH} text-left`}>Risco Especial</th>
                  {porEstrutura.map(({ estrutura: est }) => (
                    <th key={est.id} className={`${TABELA_TH} w-[70px]`}>{est.nome}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riscosAtivosGlobal.map((r, i) => (
                  <tr key={r.key} className={zebra(i)}>
                    <td className={TABELA_TD}>{r.label}</td>
                    {porEstrutura.map(pe => (
                      <td key={pe.estrutura.id} className={`${TABELA_TD} text-center text-[16px] font-bold leading-none`}>
                        {riscosPorEstrutura[pe.estrutura.id]?.[r.key] ? 'X' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={TABELA}>
              <thead>
                <tr className={TABELA_THEAD}>
                  <th className={`${TABELA_TH} text-left`}>Risco Especial</th>
                </tr>
              </thead>
              <tbody>
                {riscosAtivosUnica.map((label, i) => (
                  <tr key={i} className={zebra(i)}>
                    <td className={TABELA_TD}>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {outrosDescsMultiplas.length > 0 && (
            <p className="text-[10.5px] text-black leading-[1.5]">
              <strong>Outros (por estrutura):&nbsp;</strong>{outrosDescsMultiplas.join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}


// Bloco de assinatura ao final do documento — sem título numerado (não
// entra no Sumário) e sem a classe `memorial-secao`, pra não forçar página
// própria: continua no fluxo, ficando na última folha do memorial.
function Assinatura({ state }) {
  return (
    <div className="assinatura-no-fim flex flex-col items-center mt-16 pt-6">
      <div className="w-[340px] text-center">
        <div className="border-t border-solid border-black pt-2">
          <div className="text-[12.5px] text-black font-semibold">{state.rtNome || ' '}</div>
        </div>
        <div className="text-[11px] text-black mt-1">{state.rtEspecialidade || ' '}</div>
        <div className="text-[11px] text-black">{state.rtConselho ? `Registro Profissional: ${registroComConselho(state)}` : ' '}</div>
      </div>
    </div>
  )
}

function SecaoMedida({ secao, numeroSecao, state, ultima }) {
  return (
    <div className={FOLHA}>
      <Titulo nivel={1} numero={String(numeroSecao)}>{secao.titulo}</Titulo>

      {secao.blocos
        ? numerarBlocos(secao.blocos, numeroSecao).map((b, i) => <BlocoMedida key={i} bloco={b}/>)
        : secao.paragrafos.map((p, i) => (
            <p key={i} className={`${TEXTO} indent-8 pl-2 mb-3`}>{p}</p>
          ))}

      {/* Assinatura dentro da última seção (não depois dela) — assim o
          `.memorial-secao:last-child` continua sendo literalmente esta div,
          e a regra que dispensa a quebra de página no fim do documento
          (ver CSS_PAGINA) ainda se aplica: a assinatura fica no fim do
          fluxo, na mesma última folha, em vez de abrir página nova. */}
      {ultima && <Assinatura state={state}/>}
    </div>
  )
}

export default function MemorialDescritivoPage({ onBack }) {
  const { state }    = useProjeto()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const secoes = buildMemorial(state, sistemas, porEstrutura)
  const rolagemRef = useRef(null)
  const [indice, setIndice] = useState([])
  const aposPaginar = destino => {
    preencherPaginasSumario(destino)
    setIndice(coletarSecoes(destino))
  }

  // Zoom do preview (reduzindo, as folhas passam a caber lado a lado, como
  // no Word/Docs) e documento maximizado — components/documentos/ZoomDocumento.
  const zoomDoc = useZoomDocumento(rolagemRef)
  const { zoom, maximizado, setMaximizado } = zoomDoc

  return (
    <JanelaDocumento maximizado={maximizado} onFechar={() => setMaximizado(false)} className="flex flex-col flex-1 overflow-hidden bg-none">
      <div className="no-print shrink-0 flex items-center justify-between py-3 px-8 border-b border-solid border-border bg-none">
        <button className="btn-ghost" onClick={onBack}>
          <Icon name="left" size={13}/> Voltar
        </button>
        <BarraZoom {...zoomDoc}/>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => exportarWord(rolagemRef.current, nomeDocumentoMemorial(state.nome))} disabled={!secoes.length} title="Baixar o memorial como documento do Word (.doc)">
            <Icon name="download" size={13}/> Salvar Word
          </button>
          <button className="btn-primary" onClick={() => imprimirComNome(nomeDocumentoMemorial(state.nome))} disabled={!secoes.length}>
            <Icon name="file" size={13}/> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* `relative` ancora o MenuSecoes na tela; na impressão vira `static`,
          senão a .print-area (absoluta) passa a ser recortada pelos
          overflow-hidden dos ancestrais e só sai a 1ª folha. */}
      <div className="relative print:static flex-1 min-h-0 flex flex-col">
      <MenuSecoes secoes={indice} rolagemRef={rolagemRef}/>
      <div ref={rolagemRef} className="flex-1 overflow-auto py-8 flex flex-col" style={{ '--memorial-zoom': zoom }}>
        {!secoes.length ? (
          <div className="max-w-[600px] mx-auto py-16 px-10 text-center border border-dashed border-border rounded-lg text-ink-faint text-[13px]">
            Nenhuma medida com memorial disponível ainda. Preencha o dimensionamento de uma medida (ex.: Acesso de Viatura) para gerar as páginas aqui.
          </div>
        ) : (
          <PreviewPaginado css={CSS_PAGINA} prepararConteudo={montarSumario} aposPaginar={aposPaginar}>
            <Capa state={state}/>
            <Sumario/>
            <Introducao sistemas={sistemas} uf={state.uf}/>
            <SobreEdificacao state={state}/>
            <Caracterizacao state={state} porEstrutura={porEstrutura}/>
            <MedidasAplicadas state={state} sistemas={sistemas} porEstrutura={porEstrutura}/>
            {secoes.map((secao, i) => (
              <SecaoMedida key={i} secao={secao} numeroSecao={PRIMEIRA_SECAO_MEDIDA + i} state={state} ultima={i === secoes.length - 1}/>
            ))}
          </PreviewPaginado>
        )}
      </div>
      </div>
    </JanelaDocumento>
  )
}
