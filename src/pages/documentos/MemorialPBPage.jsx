import { useRef } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { buildFormularioPB } from '../../estados/PB/formulario'
import { textoMemorialSaidaEmergencia } from '../../data/memorial/saida_emergencia'
import { textoMemorialHidrantes } from '../../data/memorial/hidrantes'
import { textoMemorialCalculoHidrantes } from '../../data/memorial/hidrantesCalculo'
import { getSE, getHidrantes, getExtintores } from '../../data/normas/index'
import { numerarBlocos } from '../../utils/memorialEstilo'
import { BlocoMedida } from '../../components/documentos/BlocosMemorial'
import PreviewPaginado from '../../components/documentos/PreviewPaginado'
import Icon from '../../components/ui/Icon'
import { imprimirComNome, nomeDocumentoMemorial } from '../../utils/exportarWord'
import { baixarBlob } from '../../utils/docx/ooxml'
import { gerarDocxPB } from '../../estados/PB/formularioDocx'
import logoCbmpb from '../../assets/logos/cbmpb.png'
import { usePerfil } from '../../hooks/usePerfil'
import CampoRubrica from '../../components/perfil/CampoRubrica'
import { useZoomDocumento } from '../../hooks/useZoomDocumento'
import { BarraZoom, JanelaDocumento } from '../../components/documentos/ZoomDocumento'
import { Secao } from '../../estados/PB/SecaoFormulario'
import { siglaConselho } from '../../utils/conselho'

// Memorial Descritivo da Paraíba: o formulário oficial do CBMPB (DSPCI),
// preenchido a partir do projeto (data/memorial/PB/formulario.js), seguido
// dos Anexos A–D pedidos no fim do formulário. Paginação pelo Paged.js, como
// o memorial do MA (PreviewPaginado) — as tabelas das seções quebram entre
// folhas linha a linha, e toda folha leva o quadro de "Rubrica" do modelo.
const CSS_BASE = `
@page {
  size: A4 portrait;
  margin: 15mm 15mm 22mm 20mm;
  @bottom-right {
    content: "Rubrica";
    /* rubrica do perfil: ver cssPagina */
    width: 32mm; height: 10mm;
    border: 1px solid #538135;
    text-align: center; vertical-align: middle;
    font-size: 9pt;
    margin-bottom: 6mm;
  }
}
tr { break-inside: avoid; }
.pbf-anexo-bloco { break-before: page; }
`

// Com rubrica no perfil, o quadro de cada folha leva a imagem no lugar do texto.
const cssPagina = rubrica => (rubrica
  ? CSS_BASE.replace('content: "Rubrica";\n    /* rubrica do perfil: ver cssPagina */', `content: "";\n    background: url("${rubrica}") center / contain no-repeat;`)
  : CSS_BASE)

function Cabecalho({ norma }) {
  return (
    <div className="pbf-cabecalho">
      <img src={logoCbmpb} alt="Brasão do Corpo de Bombeiros Militar da Paraíba" className="pbf-logo"/>
      <div>ESTADO DA PARAÍBA</div>
      <div>Secretária de Estado da Segurança e da Defesa Social</div>
      <div>{norma.orgao.replace(' — ', '- ')}</div>
      <div>{norma.diretoria}</div>
      <div>{norma.secao}</div>
      <div className="pbf-titulo-doc" style={{ marginTop: '10pt' }}>MEMORIAL DESCRITIVO DO PROJETO DE SEGURANÇA CONTRA INCÊNDIO</div>
    </div>
  )
}

// Anexo do formulário: blocos do memorial (tabela/parágrafos) da medida
// ativa. Só entram os anexos com conteúdo, cada um em folha nova; as letras
// seguem as do formulário (A saídas, B hidrantes, C chuveiros, D SPDA).
const blocosDe = s => s.blocos || (s.paragrafos || []).map(texto => ({ tipo: 'paragrafo', texto }))

function Anexo({ letra, secoes, numerar = true }) {
  if (!secoes?.length) return null
  return (
    <div className="pbf-anexo-bloco">
      <div className="pbf-anexo">
        <div className="pbf-anexo-titulo">ANEXO {letra}</div>
      </div>
      {secoes.map((s, i) => (
        <div key={i} className="mt-3">
          {(numerar ? numerarBlocos(blocosDe(s), letra) : blocosDe(s)).map((b, j) => <BlocoMedida key={j} bloco={b}/>)}
        </div>
      ))}
    </div>
  )
}

export default function MemorialPBPage({ onBack }) {
  const { state } = useProjeto()
  const { sistemas, porEstrutura } = useMedidasObrigatorias()
  const formulario = buildFormularioPB(state, sistemas, porEstrutura)
  const { perfil } = usePerfil()
  const rolagemRef = useRef(null)
  const zoomDoc = useZoomDocumento(rolagemRef)
  const { zoom, maximizado, setMaximizado } = zoomDoc

  if (!formulario) return null
  // A e B: os dimensionamentos das páginas comuns de Saída de Emergência e
  // de Hidrantes, com a norma da PB.
  const anexoA = sistemas.saida_emergencia?.ativo && getSE(state.uf) ? [textoMemorialSaidaEmergencia(state, sistemas, porEstrutura, { soDimensionamento: true })] : []
  const anexoB = sistemas.hidrantes?.ativo && getHidrantes(state.uf) && getExtintores(state.uf)
    ? [textoMemorialHidrantes(state, sistemas, porEstrutura), textoMemorialCalculoHidrantes(state)].filter(Boolean)
    : []

  // Word: o brasão vai embutido no .docx (bytes do asset).
  const salvarWord = async () => {
    let logo = null
    try { logo = new Uint8Array(await (await fetch(logoCbmpb)).arrayBuffer()) } catch { /* sem o brasão, segue o documento */ }
    const titulo = nomeDocumentoMemorial(state.nome)
    baixarBlob(gerarDocxPB({ state, formulario, anexoA, anexoB, rubrica: perfil?.rubrica, titulo, logo }), `${titulo}.docx`)
  }

  return (
    <JanelaDocumento maximizado={maximizado} onFechar={() => setMaximizado(false)} className="flex flex-col flex-1 overflow-hidden">
      <div className="no-print shrink-0 flex items-center justify-between gap-3 py-3 px-8 border-b border-solid border-border">
        <button className="btn-ghost" onClick={onBack}><Icon name="left" size={13}/> Voltar</button>
        <BarraZoom {...zoomDoc}/>
        <div className="flex items-center gap-2">
          <CampoRubrica compacto/>
          <button className="btn-ghost" onClick={salvarWord} title="Baixar o memorial como documento do Word (.docx)">
            <Icon name="download" size={13}/> Salvar Word
          </button>
          <button className="btn-primary" onClick={() => imprimirComNome(nomeDocumentoMemorial(state.nome))}>
            <Icon name="file" size={13}/> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div className="relative print:static flex-1 min-h-0 flex">
        <div ref={rolagemRef} className="flex-1 min-w-0 overflow-auto py-8 flex flex-col" style={{ '--memorial-zoom': zoom }}>
          {/* Os campos do formulário são preenchidos nas páginas de medida da
              PB (estados/PB/paginas) — aqui o documento só é exibido. */}
          {!formulario.temTabelaExigencias && (
            <div className="no-print ibox amber mx-auto mb-6 max-w-[760px]">
              <Icon name="warn" size={13} color="var(--color-amber)" className="shrink-0"/>
              <span>A tabela de exigências da NT 04/2023 CBMPB não foi encontrada (Supabase, normas_dados: uf &apos;PB&apos;, sistema &apos;medidas_seguranca&apos;): só as medidas do mínimo de referência saem como &quot;Exigível&quot;; as demais ficam sem marcação.</span>
            </div>
          )}
          <PreviewPaginado css={cssPagina(perfil?.rubrica)}>
            <div className="pbf">
              <Cabecalho norma={formulario.norma}/>
              {formulario.secoes.map((s, i) => <Secao key={i} secao={s}/>)}
              <div className="pbf-anexos">
                <Anexo letra="A" secoes={anexoA} numerar={false}/>
                <Anexo letra="B" secoes={anexoB}/>
                <div className="pbf-assinatura assinatura-no-fim">
                  <div>{state.rtNome || 'Nome do projetista'}</div>
                  <div>{state.rtEspecialidade || 'Graduação'}</div>
                  <div>{`Nº ${siglaConselho(state)}${state.rtConselho ? ` ${state.rtConselho}` : ''}`}</div>
                </div>
              </div>
            </div>
          </PreviewPaginado>
        </div>
      </div>
    </JanelaDocumento>
  )
}
