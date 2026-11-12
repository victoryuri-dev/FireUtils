import LinkNorma from '../components/ui/LinkNorma'
import Icon from '../components/ui/Icon'
import InfoTip from '../components/ui/InfoTip'
import { SISTEMA_ICON } from '../data/sistemasIcons'

const SIST_LABELS = {
  acesso_viatura:      'Acesso de Viatura em Edificações',
  seg_estrutural:      'Segurança Estrutural Contra Incêndio',
  compart_horizontal:  'Compartimentação Horizontal',
  compart_vertical:    'Compartimentação Vertical',
  controle_acabamento: 'Controle de Materiais de Acabamento',
  saida_emergencia:    'Saída de Emergência',
  gerenciamento_risco: 'Gerenciamento de Risco de Incêndio',
  brigada:             'Brigada de Incêndio',
  iluminacao:          'Iluminação de Emergência',
  sinalizacao:         'Sinalização de Emergência',
  extintores:          'Proteção por Extintores',
  hidrantes:           'Hidrantes / Mangotinho',
  alarme:              'Alarme de Incêndio',
  deteccao:            'Detecção de Incêndio',
  sprinklers:          'Chuveiros Automáticos',
  controle_fumaca:     'Controle de Fumaça',
  central_gas:         'Central de Gás',
  spda:                'SPDA',
  resfriamento:        'Sistema de Resfriamento',
  espuma:              'Sistema de Espuma',
  gases_fixos:         'Sistema de Gases Fixos',
  fontes_ignicao:      'Controle de Fontes de Ignição',
}

export default function MedidaPage({ sistKey }) {
  const label = SIST_LABELS[sistKey] || sistKey

  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-[980px] mx-auto pt-8 px-10 pb-20">
      <div className="mb-[26px]">
        <div className="text-[11px] text-red uppercase tracking-[.08em] font-semibold mb-[5px]">
          Medidas de segurança
        </div>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-semibold text-ink mb-[5px]">
          <Icon name={SISTEMA_ICON[sistKey]} size={20} color="var(--color-red)" className="shrink-0"/>
          {label}
          <LinkNorma sistema={sistKey}/>
          <InfoTip side="bottom" align="start" text="Dimensionamento e especificações técnicas do sistema conforme NT 42/2019 CBMMA."/>
        </h2>
      </div>

      <div className="ibox amber">
        <Icon name="warn" size={14} color="var(--color-amber)" className="shrink-0"/>
        <span>
          Esta página está em construção. O módulo de dimensionamento para{' '}
          <strong className="text-ink-muted">{label}</strong> estará disponível em breve.
        </span>
      </div>

      <div className="bg-surface-2 border border-solid border-border rounded-lg py-16 px-5 text-center">
        {/* Clock icon */}
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
          className="mx-auto mb-[18px] block text-ink-faint opacity-30">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>

        <div className="text-[15px] font-medium text-ink-muted mb-1.5">
          Página em construção
        </div>
        <div className="text-[13px] text-ink-faint leading-[1.7] max-w-[400px] mx-auto">
          O dimensionamento será realizado pelo plugin Revit.<br/>
          Após executar o plugin, os resultados e o memorial<br/>
          descritivo aparecerão aqui automaticamente.
        </div>
      </div>
    </div></div>
  )
}
