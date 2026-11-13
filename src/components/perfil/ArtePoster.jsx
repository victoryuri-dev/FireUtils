// Arte de cada pôster do hub: SVG puro (sem imagens), na identidade FireUtils —
// preto, vermelho de marca e "osso", com linhas finas de prancha técnica.
// Cada ferramenta tem composição própria; a área útil fica entre y≈100 e y≈240,
// porque o título ocupa o topo e a chamada, o rodapé do cartão (viewBox 240×340).

const RED = '#EA1330'
const BONE = '#E9E4D6'
const INK = '#0E0F13'

function Grade({ id, cor, passo = 20 }) {
  return (
    <>
      <defs>
        <pattern id={id} width={passo} height={passo} patternUnits="userSpaceOnUse">
          <path d={`M ${passo} 0 H 0 V ${passo}`} fill="none" stroke={cor} strokeWidth=".6"/>
        </pattern>
      </defs>
      <rect width="240" height="340" fill={`url(#${id})`}/>
    </>
  )
}

// Quadradinhos de seleção, como numa caixa de edição de design.
function Alcas({ x, y, w, h, cor = RED }) {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy], i) => (
    <rect key={i} x={cx - 4} y={cy - 4} width="8" height="8" fill="#fff" stroke={cor} strokeWidth="1.5"/>
  ))
}

function Memorial() {
  return (
    <svg viewBox="0 0 240 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="240" height="170" fill={RED}/>
      <rect y="170" width="240" height="170" fill={BONE}/>
      <Grade id="g-mem" cor="rgba(14,15,19,.09)"/>
      <g transform="rotate(7 120 175)">
        <rect x="64" y="104" width="104" height="132" fill="#CFC9B8" stroke={INK} strokeWidth="1.5"/>
      </g>
      <g transform="rotate(-6 120 175)">
        <rect x="68" y="100" width="104" height="136" fill="#F7F4EB" stroke={INK} strokeWidth="1.5"/>
        <rect x="80" y="114" width="46" height="8" fill={RED}/>
        {[134, 146, 158, 170, 182].map(y => <rect key={y} x="80" y={y} width={y === 182 ? 48 : 80} height="3" fill={INK} opacity=".75"/>)}
        <rect x="80" y="198" width="80" height="26" fill="none" stroke={INK} strokeWidth="1" strokeDasharray="3 3"/>
        <Alcas x={68} y={100} w={104} h={136} cor={INK}/>
      </g>
    </svg>
  )
}

function Hidrantes() {
  return (
    <svg viewBox="0 0 240 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="240" height="340" fill="#121824"/>
      <Grade id="g-hid" cor="rgba(255,255,255,.07)"/>
      <path d="M-10 226 H78 V176 H150 V128" fill="none" stroke={RED} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round"/>
      <path d="M78 226 V250 H170" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3" strokeLinejoin="round" strokeDasharray="2 6" strokeLinecap="round"/>
      {[[78, 226], [78, 176], [150, 176]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="6" fill="#121824" stroke="#fff" strokeWidth="2"/>)}
      {/* hidrante no fim da rede */}
      <g transform="translate(150 118)">
        <rect x="-11" y="-6" width="22" height="26" rx="4" fill={RED} stroke="#fff" strokeWidth="2"/>
        <rect x="-15" y="-14" width="30" height="9" rx="3" fill="#fff"/>
        <circle cx="-15" cy="8" r="4" fill="#fff"/><circle cx="15" cy="8" r="4" fill="#fff"/>
      </g>
      {/* manômetro */}
      <g transform="translate(184 232)">
        <circle r="26" fill="#121824" stroke="#fff" strokeWidth="2"/>
        <path d="M-18 8 A20 20 0 1 1 18 8" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="3" strokeLinecap="round"/>
        <path d="M-18 8 A20 20 0 0 1 6 -19" fill="none" stroke={RED} strokeWidth="3" strokeLinecap="round"/>
        <line x1="0" y1="0" x2="10" y2="-12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
        <circle r="3" fill="#fff"/>
      </g>
    </svg>
  )
}

function Saidas() {
  return (
    <svg viewBox="0 0 240 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="g-sai" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F01836"/><stop offset="1" stopColor="#A50E22"/>
        </linearGradient>
      </defs>
      <rect width="240" height="340" fill="url(#g-sai)"/>
      <Grade id="g-sai-g" cor="rgba(0,0,0,.12)"/>
      {/* porta */}
      <rect x="148" y="112" width="68" height="124" fill={INK}/>
      <rect x="156" y="120" width="52" height="116" fill="#F7F4EB" opacity=".95"/>
      <path d="M148 236 L216 236" stroke="#fff" strokeWidth="2"/>
      {/* trajeto */}
      <path d="M22 232 H146" stroke="#fff" strokeWidth="2.5" strokeDasharray="7 7" fill="none"/>
      {[40, 62, 84].map(x => <path key={x} d={`M${x} 216 l12 16 l-12 16`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity={0.4 + (x - 40) / 70}/>)}
      {/* figura em fuga */}
      <g stroke={INK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" transform="translate(120 0)">
        <circle cx="0" cy="150" r="7" fill={INK} stroke="none"/>
        <path d="M-2 162 L-8 188 L-22 200 M-8 188 L6 202 L6 222"/>
        <path d="M-2 164 L10 172 L20 164 M-4 170 L-18 164"/>
      </g>
    </svg>
  )
}

function Assinaturas() {
  return (
    <svg viewBox="0 0 240 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="240" height="340" fill={BONE}/>
      <Grade id="g-ass" cor="rgba(14,15,19,.08)"/>
      <rect x="28" y="116" width="184" height="110" fill="none" stroke={RED} strokeWidth="1.5"/>
      <Alcas x={28} y={116} w={184} h={110}/>
      <path d="M44 190 C58 124 78 120 76 160 C74 200 94 150 104 164 C114 178 124 140 138 150 C150 158 134 190 152 180 C170 170 176 136 196 150" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M40 206 H200" stroke={INK} strokeWidth="1.2" strokeDasharray="4 4"/>
      <text x="40" y="220" fontSize="9" fontFamily="Space Grotesk, sans-serif" fill={INK} opacity=".6" letterSpacing="1.5">RESPONSÁVEL TÉCNICO</text>
      <g transform="translate(180 244) rotate(-35)">
        <rect x="-4" y="-34" width="8" height="34" fill={INK}/>
        <path d="M-4 0 L0 12 L4 0 Z" fill={RED}/>
      </g>
    </svg>
  )
}

function Plugin() {
  return (
    <svg viewBox="0 0 240 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="240" height="340" fill="#0B0C10"/>
      <Grade id="g-plg" cor="rgba(255,255,255,.06)"/>
      {/* cubo isométrico */}
      <g fill="none" strokeLinejoin="round" strokeWidth="2">
        <path d="M120 96 L176 128 V192 L120 224 L64 192 V128 Z" stroke="rgba(255,255,255,.55)"/>
        <path d="M64 128 L120 160 L176 128 M120 160 V224" stroke="rgba(255,255,255,.28)"/>
        <path d="M120 96 L176 128 L120 160 L64 128 Z" fill="rgba(234,19,48,.22)" stroke={RED}/>
      </g>
      {/* seta de download */}
      <g transform="translate(120 190)">
        <circle r="26" fill={RED}/>
        <path d="M0 -11 V8 M-9 0 L0 9 L9 0" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
      <text x="22" y="238" fontSize="11" fontFamily="Space Grotesk, sans-serif" fill="rgba(255,255,255,.5)" letterSpacing="2">.RVT · .ADDIN</text>
    </svg>
  )
}

const PROVISORIAS = { memorial: Memorial, hidrantes: Hidrantes, saidas: Saidas, assinaturas: Assinaturas, plugin: Plugin }

// Artes finais dos pôsteres. Para trocar a arte provisória, coloque o arquivo em
// public/ferramentas/ (proporção 240:340, ex.: 960×1360 px) e preencha aqui:
//   memorial: '/ferramentas/memorial.webp'
// Ferramenta sem entrada continua com o SVG provisório.
const IMAGENS = {
  memorial: null,
  hidrantes: null,
  saidas: null,
  assinaturas: null,
  plugin: null,
}

export default function ArtePoster({ id }) {
  const src = IMAGENS[id]
  if (src) return <img src={src} alt="" loading="lazy" draggable="false"/>
  const Provisoria = PROVISORIAS[id]
  return <Provisoria/>
}
