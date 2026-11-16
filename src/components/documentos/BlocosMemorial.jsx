// Componentes de bloco do memorial (títulos numerados e os blocos
// paragrafo/tabela/lista/organograma/fórmula devolvidos pelos geradores de
// data/memorial/*) — compartilhados entre MemorialDescritivoPage.jsx e os
// anexos do formulário da PB (MemorialPBPage.jsx).

import { TABELA, TABELA_THEAD, TABELA_TH, TABELA_TD, zebra, TEXTO, TEXTO_PEQUENO, tituloCase } from '../../utils/memorialEstilo'

// Titulo numerado do memorial. `nivel` (1-3) define a tag (h1-h3); `numero`
// ("4", "4.1", "4.1.1") entra antes do texto com um unico espaco. Titulos com
// numero ganham data-toc/data-toc-num, que o Sumario usa (montarSumario).
// Espaçamento antes E depois do próprio título/subtítulo (não uma linha em
// branco inteira — só o respiro visual de separação); `first:mt-0` zera a
// margem de cima quando é o primeiro elemento da folha, já separado pela
// quebra de página/seção.
export function Titulo({ nivel, numero, children }) {
  const Tag = `h${nivel}`
  return (
    <Tag
      className="font-heading text-black leading-[1.5] mt-4 mb-2 first:mt-0"
      data-toc={numero ? nivel : undefined}
      data-toc-num={numero || undefined}
    >
      {numero ? `${numero} ` : ''}{children}
    </Tag>
  )
}

// Texto de um item de bloco 'lista' (ver abaixo) — string simples (ex.: os
// avisos "estilo: alerta" de extintores.js/seg_estrutural.js) renderiza como
// está; { label, valor } (ex.: gerenciamento_risco.js) renderiza com o rotulo
// em negrito e o valor normal, igual ao bloco 'campo'.
function ListaItemTexto({ item }) {
  if (!item || typeof item !== 'object') return item
  if (!item.label) return item.texto ?? null
  return <><strong>{item.label}:&nbsp;</strong><span className="whitespace-pre-line">{item.valor}</span></>
}

// Um nó do bloco 'organograma' (ver memorial/saida_emergencia.js) — raiz e
// Circulação em negrito/maiúsculo, ambiente em texto normal; filhos ficam
// recuados dentro de uma faixa com borda à esquerda, imitando o colchete
// que agrupa visualmente "o que esse nó alimenta" (sem limite de
// profundidade — Circulação pode ter outra Circulação dentro).
function OrganogramaNo({ no }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className={no.bold
        ? 'font-heading text-[12.5px] font-bold text-black uppercase tracking-[.02em]'
        : 'text-[12px] text-black'
      }>
        {no.texto}
      </div>
      {no.sub?.length > 0 && (
        <div className="pl-4 ml-1 mt-1 pb-0.5 border-l border-solid border-[#999]">
          {no.sub.map((s, i) => <OrganogramaNo key={i} no={s}/>)}
        </div>
      )}
    </div>
  )
}

// Um <li> de bloco 'lista', com sub-lista recursiva (item.sub pode ter seus
// próprios itens com sub, sem limite de profundidade — ex.: riscos especiais
// com mais de uma estrutura viram Riscos > Estrutura > risco, 3 níveis).
function ListaLi({ item, estilo }) {
  return (
    <li className={
      estilo === 'alerta'
        ? 'text-[12px] text-black leading-[1.5] pl-2.5 border-l-2 border-solid border-black font-medium'
        // 'lettered': o próprio texto já traz o prefixo ("a) ..." — ver
        // memorial/saida_emergencia.js), então sem marcador "•" duplicado.
        : estilo === 'lettered'
        ? 'text-[12px] text-black leading-[1.5] pl-4'
        : "text-[12px] text-black leading-[1.5] pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#8a8a8c]"
    }>
      <ListaItemTexto item={item}/>
      {item?.sub?.length > 0 && (
        <ul className="list-none ml-2">
          {item.sub.map((s, j) => <ListaLi key={j} item={s} estilo={estilo}/>)}
        </ul>
      )}
    </li>
  )
}

function escaparHtml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Converte a notação de engenharia em texto simples (memorial/hidrantesCalculo.js,
// ex.: "Q^1,85", "P_hd01") em sobrescrito/subscrito de verdade — mesma
// conversão que o memorial.py do antigo plugin fazia (_sup/_sub) antes de
// virar HTML, só que aqui direto no bloco 'formula' do memorial do site.
function formatarFormula(texto) {
  let t = escaparHtml(texto)
  // Expoentes: "^1,85" ou "^−4,87" (inclui o sinal de menos unicode "−",
  // usado nos coeficientes de Hazen-Williams) -> <sup>1,85</sup>
  t = t.replace(/\^(−?-?[0-9]+(?:,[0-9]+)?)/g, (_, exp) => `<sup>${exp}</sup>`)
  // Subscritos: "P_hd01", "Q_hd02", "P_valv", "P_PA,alvo" -> P<sub>hd01</sub>
  // etc. — só letras/dígitos/vírgula depois do "_", pra não confundir com
  // separador de milhar nem cortar no meio de outra pontuação.
  t = t.replace(/\b([A-Za-zΔ∆]+)_([A-Za-z0-9,]+)\b/g, (_, base, sub) => `${base}<sub>${sub}</sub>`)
  return t
}

// Blocos de conteudo (opcionais, ver memorial/seg_estrutural.js) — permitem
// que uma secao troque paragrafo corrido por tabela/lista/campo quando isso
// deixa os valores mais faceis de achar (ex.: TRRF por pavimento). Secoes
// que so retornam `paragrafos` (ex.: acesso_viatura.js) continuam iguais.
export function BlocoMedida({ bloco }) {
  switch (bloco.tipo) {
    // O numero ja vem calculado em `bloco.numero` (ver numerarBlocos).
    case 'titulo2':
      return <Titulo nivel={2} numero={bloco.numero}>{tituloCase(bloco.texto)}</Titulo>
    case 'titulo3':
      return <Titulo nivel={3} numero={bloco.numero}>{bloco.texto}</Titulo>
    case 'paragrafo':
      return <p className={`${TEXTO} indent-8 mb-3`}>{bloco.texto}</p>
    // Equação em destaque (memorial/hidrantesCalculo.js) — texto em notação
    // de engenharia (Q^1,85, P_hd01 etc.), convertido pra sobrescrito/
    // subscrito de verdade (formatarFormula) — sem fração renderizada
    // (numerador/denominador em vez de "A / B" numa linha só), única
    // simplificação que o resto do memorial descritivo também não faz.
    case 'formula':
      return (
        <div
          className="text-[12px] text-black tabular-nums leading-[1.5] pl-3 border-l-2 border-solid border-[#c9c9cb] whitespace-pre-line"
          dangerouslySetInnerHTML={{ __html: formatarFormula(bloco.texto) }}
        />
      )
    case 'campo':
      return <div className={`${TEXTO_PEQUENO} mb-3 ${bloco.recuo ? 'indent-8' : ''}`}><strong>{bloco.label}:&nbsp;</strong><span className="whitespace-pre-line">{bloco.valor}</span></div>
    case 'tabela': {
      // th/td alinhados ao centro quando a tabela é majoritariamente
      // numérica (ex.: dimensionamento de Acesso/Saída) — colunas de
      // texto livre continuam usando `colunas`/alinhamento à esquerda.
      // `alinhas` (opcional, ex.: memorial/hidrantesCalculo.js) dá o
      // alinhamento POR COLUNA quando uma tabela mistura texto (rótulo à
      // esquerda) com números (valor à direita) — tem prioridade sobre
      // `centralizado` quando presente.
      const alinhamento = bloco.centralizado ? 'text-center' : 'text-left'
      const alinhaCol = i => (bloco.alinhas ? `text-${bloco.alinhas[i] || 'left'}` : alinhamento)
      return (
        // A tabela pode quebrar entre folhas, mas o cabeçalho nunca fica sozinho no
        // fim de uma folha (break-after-avoid no thead, break-before-avoid na 1ª linha).
        <table className={TABELA} style={bloco.larguras ? { tableLayout: 'fixed' } : undefined}>
          {bloco.larguras && (
            <colgroup>
              {bloco.larguras.map((w, i) => <col key={i} style={{ width: w }}/>)}
            </colgroup>
          )}
          <thead>
            {/* `linhasCabecalho` (opcional) permite um cabeçalho com mais de
                uma linha e células mescladas horizontalmente (colSpan) — ex.:
                "POPULAÇÃO" | "ACESSO/DESCARGA" (3 colunas) | "PORTAS" (3
                colunas) numa linha, com CAPACIDADE/UP/LARGURA MÍNIMA embaixo
                de cada bloco na linha seguinte (ver memorial/saida_emergencia.js).
                Sem isso, cai no `colunas` de sempre (uma linha só). */}
            {bloco.linhasCabecalho
              ? bloco.linhasCabecalho.map((linha, i) => (
                  <tr key={i} className={`${TABELA_THEAD} break-after-avoid`}>
                    {linha.map((c, j) => (
                      <th key={j} colSpan={c.colSpan} rowSpan={c.rowSpan} className={`${TABELA_TH} ${alinhamento}`}>{c.texto}</th>
                    ))}
                  </tr>
                ))
              : (
                <tr className={`${TABELA_THEAD} break-after-avoid`}>
                  {bloco.colunas.map((c, i) => <th key={i} className={`${TABELA_TH} ${alinhaCol(i)}`}>{c}</th>)}
                </tr>
              )}
          </thead>
          <tbody>
            {/* Célula `null` = já coberta por um rowSpan de uma linha
                anterior (ver DIVISÃO na tabela de distâncias máximas em
                memorial/saida_emergencia.js) — não gera <td> nenhum pra
                não duplicar a coluna. Objeto `{ texto, rowSpan }` é uma
                célula normal que mescla verticalmente com as próximas
                `n-1` linhas nessa mesma posição. */}
            {bloco.linhas.map((linha, i) => (
              <tr key={i} className={`${zebra(i)} ${i === 0 ? 'break-before-avoid' : ''}`}>
                {linha.map((cel, j) => {
                  if (cel === null) return null
                  const temRowSpan = cel && typeof cel === 'object' && 'texto' in cel
                  const conteudo = temRowSpan ? cel.texto : cel
                  return (
                    <td key={j} rowSpan={temRowSpan ? cel.rowSpan : undefined} className={`${TABELA_TD} ${alinhaCol(j)}`}>
                      {conteudo && typeof conteudo === 'object' && conteudo.tipo === 'imagem'
                        ? <img src={conteudo.src} alt={conteudo.alt || ''} className="w-9 h-9 object-contain block"/>
                        : conteudo}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'lista':
      return (
        <ul className={`list-none ${bloco.recuo ? 'ml-8 mb-3' : ''}`}>
          {bloco.itens.map((item, i) => <ListaLi key={i} item={item} estilo={bloco.estilo}/>)}
        </ul>
      )
    case 'organograma':
      return (
        <div>
          {/* mb-5 aqui (em vez de deixar só o mb-1 do próprio OrganogramaNo)
              separa uma árvore (Saída/Escada-Rampa raiz) da próxima com uma
              linha em branco — sem isso, a última Circulação de uma árvore
              encosta direto na raiz seguinte. Exceção deliberada à regra de
              "sem margem": aqui não é texto corrido, é separador visual
              entre diagramas de árvore distintos. */}
          {bloco.nos.map((no, i) => (
            <div key={i} className="mb-5 last:mb-0">
              <OrganogramaNo no={no}/>
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}
