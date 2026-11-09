import {
  ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Check, Plus, Minus,
  Trash2, Info, AlertTriangle, Save, Settings, LayoutDashboard, Droplet, DoorOpen,
  Flame, Bell, Sun, Moon, File, SprayCan, Signpost, Radar, FireExtinguisher, Layers,
  Building2, Building, Search, X, Upload, Pencil, User, SquareDashed, PanelLeft,
  BrickWallFire, AlarmSmoke, BellElectric, Van, ShieldAlert, Loader2, CircleCheck,
  SeparatorHorizontal, GripVertical, Copy, MoreVertical, SquareArrowRightExit,
  Bold, Italic, Underline, Strikethrough, List, Palette, Lock, ExternalLink,
  NotebookPen, MessageCircle, Download, Maximize2, Minimize2, Pin, PinOff, FileSignature,
} from 'lucide-react'
import hidranteIconSvg from '../../assets/icons/hidrante-icon.svg?raw'
import extintorIconSvg from '../../assets/icons/extintor-icon.svg?raw'
import saidaEmergenciaIconSvg from '../../assets/icons/saidaemergencia-icon.svg?raw'
import detectorIconSvg from '../../assets/icons/detector-icon.svg?raw'
import segEstruturalIconSvg from '../../assets/icons/seg-estrutural-icon.svg?raw'
import alarmeIconSvg from '../../assets/icons/alarme-icon.svg?raw'
import viaturaIconSvg from '../../assets/icons/viatura-icon.svg?raw'
import compartHorizontalIconSvg from '../../assets/icons/compart-horizontal-icon.svg?raw'
import compartVerticalIconSvg from '../../assets/icons/compart-vertical-icon.svg?raw'
import sinalizacaoIconSvg from '../../assets/icons/sinalizacao-icon.svg?raw'
import brigadaIconSvg from '../../assets/icons/brigada-icon.svg?raw'
import controleAcabamentoIconSvg from '../../assets/icons/controle-acabamento-icon.svg?raw'
import documentosIconSvg from '../../assets/icons/documentos-icon.svg?raw'
import iluminacaoIconSvg from '../../assets/icons/iluminacao-icon.svg?raw'
import gerenciamentoRiscoIconSvg from '../../assets/icons/gerenciamento-risco-icon.svg?raw'
import sprinklerIconSvg from '../../assets/icons/sprinkler-icon.svg?raw'

const ICONS = {
  left: ArrowLeft, right: ArrowRight, chevD: ChevronDown, chevL: ChevronLeft, chevR: ChevronRight,
  check: Check, plus: Plus, minus: Minus, trash: Trash2, info: Info, warn: AlertTriangle,
  save: Save, settings: Settings, dash: LayoutDashboard, drop: Droplet, exit: DoorOpen,
  flame: Flame, bell: Bell, sun: Sun, moon: Moon, file: File, spray: SprayCan, sign: Signpost,
  sensor: Radar, ext: FireExtinguisher, stair: Layers, newbld: Building2, oldbld: Building,
  search: Search, x: X, upload: Upload, edit: Pencil, user: User, area: SquareDashed,
  panelLeft: PanelLeft, wallFire: BrickWallFire, alarmSmoke: AlarmSmoke, bellElectric: BellElectric,
  van: Van, shieldAlert: ShieldAlert, spinner: Loader2, checkCircle: CircleCheck,
  wallCompart: SeparatorHorizontal,
  maximize: Maximize2, minimize: Minimize2, pin: Pin, pinOff: PinOff,
  grip: GripVertical, copy: Copy, moreVert: MoreVertical, exitBox: SquareArrowRightExit,
  bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough, list: List, palette: Palette,
  lock: Lock, externalLink: ExternalLink,
  notebookPen: NotebookPen, feedback: MessageCircle, download: Download,
  signature: FileSignature,
}

// Ícones próprios (SVG entregue pelo design, path fill="currentColor") em vez
// de um ícone genérico do lucide — usados nas medidas de segurança que já
// têm identidade visual própria (menu lateral + título da página). Renderizados
// inline (não <img>) justamente pra herdar `color` via CSS — é isso que faz o
// ícone mudar de cor sozinho no hover/ativo da sidebar, sem herdar de <img>.
const CUSTOM_ICONS = {
  hidranteMedida: hidranteIconSvg,
  extintorMedida: extintorIconSvg,
  saidaEmergenciaMedida: saidaEmergenciaIconSvg,
  detectorMedida: detectorIconSvg,
  segEstruturalMedida: segEstruturalIconSvg,
  alarmeMedida: alarmeIconSvg,
  viaturaMedida: viaturaIconSvg,
  compartHorizontalMedida: compartHorizontalIconSvg,
  compartVerticalMedida: compartVerticalIconSvg,
  sinalizacaoMedida: sinalizacaoIconSvg,
  brigadaMedida: brigadaIconSvg,
  controleAcabamentoMedida: controleAcabamentoIconSvg,
  documentosMedida: documentosIconSvg,
  iluminacaoMedida: iluminacaoIconSvg,
  gerenciamentoRiscoMedida: gerenciamentoRiscoIconSvg,
  sprinklerMedida: sprinklerIconSvg,
}

export default function Icon({ name, size=16, color, strokeWidth, className='' }) {
  const customSvg = CUSTOM_ICONS[name]
  if (customSvg) {
    return (
      <span
        className={`inline-block align-middle shrink-0 ${className}`}
        style={{ width: size, height: size, color: color || 'currentColor' }}
        dangerouslySetInnerHTML={{ __html: customSvg }}
      />
    )
  }
  const Cmp = ICONS[name]
  if (!Cmp) return null
  return <Cmp size={size} color={color || 'currentColor'} strokeWidth={strokeWidth} className={`inline-block align-middle shrink-0 ${className}`}/>
}
