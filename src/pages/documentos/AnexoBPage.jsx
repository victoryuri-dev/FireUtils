import { useLayoutEffect, useRef } from 'react'
import { useProjeto } from '../../context/ProjetoContext'
import { useMedidasObrigatorias } from '../../hooks/useMedidasObrigatorias'
import { buildAnexoBData } from '../../utils/anexoB'
import Icon from '../../components/ui/Icon'
import { exportarWordElemento, nomeDocumentoAnexoB } from '../../utils/exportarWord'

// Grade e mesclagens extraídas do formulário CBMMA de 2024.
const COLUNAS = [391, 3372, 543, 783, 420, 1275, 133, 266, 73, 1751, 906]
const LARGURA_TOTAL = COLUNAS.reduce((a, b) => a + b, 0)

function Campo({ label, value, accent = false }) {
  return <><span className={accent ? 'anexob-label anexob-accent' : 'anexob-label'}>{label}</span>{value && <> <span className="anexob-value">{value}</span></>}</>
}
function SectionBar({ children }) {
  return <tr><th colSpan={11} className="anexob-section">{children}</th></tr>
}
function Check({ estado, rowSpan }) {
  return <td className="anexob-check" rowSpan={rowSpan}>{estado === 'x' ? 'X' : ''}</td>
}
function MedidaRow({ a, b }) {
  return <tr><Check estado={a.estado}/><td colSpan={3}>{a.label}</td><Check estado={b.estado}/><td colSpan={6}>{b.label}</td></tr>
}

export default function AnexoBPage({ onBack }) {
  const { state } = useProjeto()
  const { sistemas } = useMedidasObrigatorias()
  const d = buildAnexoBData(state, sistemas)
  const contentRef = useRef(null)
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    let mounted = true
    const ajustar = () => {
      if (!mounted) return
      // Área útil A4 de 170 × 257 mm. Condensa sem cortar conteúdo.
      const limite = 257 * 96 / 25.4 - 2
      let escala = 1
      content.style.setProperty('--anexob-fit', escala)
      content.style.setProperty('--anexob-row-extra', '0px')
      for (let i = 0; i < 8 && content.getBoundingClientRect().height > limite; i++) {
        escala *= limite / content.getBoundingClientRect().height * 0.99
        content.style.setProperty('--anexob-fit', escala)
      }
      // Distribui o espaço restante entre as linhas, preservando a área
      // de assinatura e as margens da folha.
      const linhas = content.querySelectorAll('tr').length
      let extra = 0
      for (let i = 0; i < 6 && limite - content.getBoundingClientRect().height > 1; i++) {
        extra += (limite - content.getBoundingClientRect().height) / linhas
        content.style.setProperty('--anexob-row-extra', `${extra}px`)
      }
    }
    ajustar()
    document.fonts.ready.then(ajustar)
    window.addEventListener('beforeprint', ajustar)
    return () => { mounted = false; window.removeEventListener('beforeprint', ajustar) }
  }, [state, sistemas])

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-bg">
      <div className="no-print shrink-0 flex items-center justify-between py-3 px-8 border-b border-solid border-border bg-surface">
        <button className="btn-ghost" onClick={onBack}><Icon name="left" size={13}/> Voltar</button>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => exportarWordElemento(contentRef.current, nomeDocumentoAnexoB(state.nome))} title="Baixar o Anexo B como documento do Word (.doc)">
            <Icon name="download" size={13}/> Salvar Word
          </button>
          <button className="btn-primary" onClick={() => window.print()}><Icon name="file" size={13}/> Imprimir / Salvar PDF</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-8 px-4">
        <article className="print-area print-area-anexob">
          <div className="anexob-content" ref={contentRef}>
            <header className="anexob-heading">
              <div>ANEXO B</div>
              <div>FORMULÁRIO DE SEGURANÇA CONTRA INCÊNDIO PARA PROCESSO TÉCNICO</div>
            </header>
            <table className="anexob-table" aria-label="Formulário de Segurança Contra Incêndio para Processo Técnico">
              <colgroup>{COLUNAS.map((w, i) => <col key={i} style={{ width: `${w / LARGURA_TOTAL * 100}%` }}/>)}</colgroup>
              <tbody>
                <SectionBar>IDENTIFICAÇÃO DA EDIFICAÇÃO E/OU ÁREA DE RISCO</SectionBar>
                <tr><td colSpan={7}><Campo label="LOGRADOURO PÚBLICO:" value={d.endereco}/></td><td colSpan={3}><Campo label="CEP:" value={d.cep}/></td><td><Campo label="Nº" value={d.numero}/></td></tr>
                <tr><td colSpan={4}><Campo label="BAIRRO:" value={d.bairro}/></td><td colSpan={7}><Campo label="MUNICÍPIO:" value={d.municipio}/></td></tr>
                <tr><td colSpan={6}><Campo label="COMPLEMENTO:" value={d.complemento}/></td><td colSpan={5}><Campo label="UF:" value={d.uf === 'MA' ? 'MARANHÃO' : d.uf}/></td></tr>
                <tr><td colSpan={6}><Campo label="PROPRIETÁRIO:" value={d.proprietario}/></td><td colSpan={5}><Campo label="CPF/CNPJ:" value={d.proprietarioDocumento}/></td></tr>
                <tr><td colSpan={6}><Campo label="RESPONSÁVEL PELO USO:" value={d.responsavelUso}/></td><td colSpan={5}><Campo label="CPF:" value={d.responsavelDocumento}/></td></tr>
                <tr><td colSpan={6}><Campo label="E-MAIL:" value={d.responsavelEmail}/></td><td colSpan={5}><Campo label="FONE:" value={d.responsavelFone}/></td></tr>
                <tr><td colSpan={9}><Campo label="RAZÃO SOCIAL:" value={d.razaoSocial}/></td><td colSpan={2}><Campo label="CNPJ:" value={d.cnpj}/></td></tr>
                <tr><td colSpan={11}><Campo label="NOME FANTASIA:" value={d.nomeFantasia}/></td></tr>
                <tr><td colSpan={11}><Campo label="CNAE PRINCIPAL:" value={d.cnaePrincipal}/></td></tr>
                <tr><td colSpan={11}><Campo label="CLASSIFICAÇÃO DA OCUPAÇÃO (Tabela 1, Anexo A, NT_01):" value={d.classificacaoOcupacao} accent/></td></tr>
                <tr><td colSpan={6}><Campo label="ÁREA TOTAL CONSTRUÍDA:" value={d.areaTotalConstruida}/></td><td colSpan={5}><Campo label="PAVIMENTOS SUBSOLO:" value={d.pavimentosSubsolo}/></td></tr>
                <tr><td colSpan={6}><Campo label="ÁREA DO TERRENO:" value={d.areaTerreno}/></td><td colSpan={5} rowSpan={3} className="anexob-carga"><div className="anexob-label">CARGA DE INCÊNDIO</div><div className="anexob-value">{d.cargaIncendio && `${d.cargaIncendio} - Risco ${d.riscoCargaIncendio}`}</div></td></tr>
                <tr><td colSpan={6}><Campo label="ÁREA COMPLEMENTAR:" value={d.areaComplementar}/></td></tr>
                <tr><td colSpan={6}><Campo label="ALTURA (PARA FINS DE MEDIDAS DE SEGURANÇA):" value={d.altura}/></td></tr>
                <SectionBar>FORMA DE APRESENTAÇÃO</SectionBar>
                <tr><Check estado={d.processoTecnico ? 'x' : 'none'}/><td colSpan={4} className="anexob-label">PROCESSO TÉCNICO</td><td colSpan={6} className="anexob-label anexob-accent anexob-center">PARA USO DO CBMMA</td></tr>
                <tr><Check rowSpan={2}/><td colSpan={4} className="anexob-label">PROCESSO TÉCNICO COMPLEMENTAR</td><td colSpan={3} rowSpan={2} className="anexob-label anexob-center">PROTOCOLO</td><td colSpan={3} rowSpan={2} className="anexob-label anexob-center">OBSERVAÇÕES</td></tr>
                <tr><td colSpan={4}><Campo label="Nº DO CAP PRINCIPAL:" accent/></td></tr>
                <tr><td colSpan={8}><Campo label="RESPONSÁVEL TÉCNICO:" value={d.responsavelTecnico}/></td><td colSpan={3} rowSpan={3}/></tr>
                <tr><td colSpan={2}><Campo label="CPF:" value={d.rtCpf}/></td><td colSpan={6}><Campo label="Nº DO CONSELHO:" value={d.rtConselho}/></td></tr>
                <tr><td colSpan={3}><Campo label="e-mail:" value={d.rtEmail}/></td><td colSpan={5}><Campo label="FONE:" value={d.rtFone}/></td></tr>
                <SectionBar>CARACTERÍSTICAS CONSTRUTIVAS</SectionBar>
                <tr><td colSpan={2} className="anexob-label">ESTRUTURA (CONCRETO, AÇO, MADEIRA, OUTROS.):</td><td colSpan={9}>{d.estrutura}</td></tr>
                <tr><td colSpan={2} className="anexob-label">ELEMENTOS DE COBERTURA:</td><td colSpan={9}>{d.cobertura}</td></tr>
                <tr><td colSpan={2} className="anexob-label">ELEMENTOS DE VEDAÇÃO:</td><td colSpan={9}>{d.vedacao}</td></tr>
                <SectionBar>MEDIDAS DE SEGURANÇA CONTRA INCÊNDIO</SectionBar>
                {d.medidasCol1.map((a, i) => <MedidaRow key={a.label} a={a} b={d.medidasCol2[i]}/>)}
                <SectionBar>RISCOS ESPECIAIS</SectionBar>
                {[0, 2, 4].map(i => <MedidaRow key={i} a={d.riscosEspeciais[i]} b={d.riscosEspeciais[i + 1]}/>)}
              </tbody>
            </table>
            <div className="anexob-signatures">
              <div><div className="anexob-signature-line"/>Responsável Técnico</div>
              <div><div className="anexob-signature-line"/>Responsável pelo uso</div>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
