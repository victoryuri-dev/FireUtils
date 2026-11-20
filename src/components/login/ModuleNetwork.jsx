import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Icon from '../ui/Icon'
import Loader from '../ui/Loader'
import './ModuleNetwork.css'

// Rede de módulos animada da tela de login. Veio da landing (agora no repositório
// do site); fica aqui porque o login da plataforma é o único consumidor.
const modules = [
  { icon: 'documentosMedida', name: 'Memorial descritivo automático', description: 'Gera a documentação técnica a partir dos dados consolidados do projeto e prepara o memorial para revisão.' },
  { icon: 'settings', name: 'Ferramentas de produtividade BIM', description: 'Acelera tarefas de modelagem, organização e atualização das informações do PPCI no ambiente Revit.' },
  { icon: 'saidaEmergenciaMedida', name: 'Dimensionamento de saídas', description: 'Verifica as exigências de abandono usando ocupação, população e características reais da edificação.' },
  { icon: 'hidranteMedida', name: 'Dimensionamento de hidrantes', description: 'Processa vazões, pressões e perdas de carga com os dados do sistema modelado no Revit.' },
  { icon: 'sprinklerMedida', name: 'Dimensionamento de sprinklers', description: 'Levará a rede modelada ao cálculo hidráulico dentro do mesmo fluxo FireUtils.', soon: true },
  { icon: 'flame', name: 'Ember', description: 'Audita o memorial descritivo, identifica inconsistências e sugere soluções normativas.', ember: true },
]

const networkPaths = [
  'M 580 315 L 155 125',
  'M 580 315 L 445 65',
  'M 580 315 L 165 435',
  'M 580 315 L 1005 145',
  'M 580 315 L 995 440',
  'M 580 315 L 460 561',
]

const networkMeshPaths = [
  'M 155 125 L 445 65',
  'M 155 125 L 165 435',
  'M 445 65 L 1005 145',
  'M 1005 145 L 995 440',
  'M 995 440 L 460 561',
  'M 460 561 L 165 435',
  'M 445 65 L 460 561',
  'M 165 435 L 995 440',
]

const networkMeshLinks = [[0, 1], [0, 2], [1, 3], [3, 4], [4, 5], [5, 2], [1, 5], [2, 4]]

const networkNodePoints = [
  { x: 155, y: 125 }, { x: 445, y: 65 }, { x: 165, y: 435 },
  { x: 1005, y: 145 }, { x: 995, y: 440 }, { x: 460, y: 561 },
]

// Pontos distribuídos pelo comprimento real da elipse. Em uma elipse, dividir
// apenas o ângulo aproxima os módulos nas laterais; estes ângulos preservam um
// intervalo visual mais constante sem transformar a órbita em um círculo.
const networkOrbitAngles = [0, 1.135089, 2.006535, Math.PI, 4.276681, 5.148128]
const networkHighlightSequence = [0, 3, 1, 4, 2, 5]

const networkAuxNodes = [
  { kind: 'label', text: 'PRODUTIVIDADE', x: 290, y: 175, link: 1 },
  { kind: 'label', text: 'NT 11', x: 275, y: 345, link: 2 },
  { kind: 'label', text: 'NT 22', x: 835, y: 235, link: 3 },
  { kind: 'label', text: 'PRESSÃO', x: 790, y: 320, link: 3 },
  { kind: 'label', text: 'VAZÃO', x: 875, y: 340, link: 3 },
  { kind: 'label', text: 'POPULAÇÃO', x: 285, y: 470, link: 2 },
  { kind: 'label', text: 'AUDITORIA', x: 700, y: 565, link: 5 },
  { kind: 'label', text: 'DOCUMENTAÇÃO', x: 250, y: 250, link: 0 },
  { kind: 'particle', x: 110, y: 45, size: 6, link: 0 },
  { kind: 'particle', x: 260, y: 70, size: 5, link: 1 },
  { kind: 'particle', x: 610, y: 65, size: 7, link: 1 },
  { kind: 'particle', x: 770, y: 90, size: 5, link: 3 },
  { kind: 'particle', x: 1090, y: 250, size: 7, link: 3 },
  { kind: 'particle', x: 1080, y: 540, size: 5, link: 4 },
  { kind: 'particle', x: 820, y: 625, size: 6, link: 4 },
  { kind: 'particle', x: 610, y: 655, size: 5, link: 5 },
  { kind: 'particle', x: 225, y: 625, size: 7, link: 2 },
  { kind: 'particle', x: 85, y: 560, size: 5, link: 2 },
  { kind: 'particle', x: 620, y: 185, size: 6, link: 1 },
  { kind: 'particle', x: 745, y: 470, size: 7, link: 5 },
]

const networkAuxPaths = networkAuxNodes.map(node => {
  const source = networkNodePoints[node.link]
  return `M ${source.x} ${source.y} L ${node.x} ${node.y}`
})


export function ModuleNetwork() {
  const boardRef = useRef(null)
  const userInteractionRef = useRef(false)
  const automaticModuleIndexRef = useRef(0)
  const [activeModule, setActiveModule] = useState(null)
  const [decodedDescription, setDecodedDescription] = useState('')
  const activateModule = index => {
    userInteractionRef.current = true
    setDecodedDescription('')
    setActiveModule(index)
  }
  const deactivateModules = () => {
    userInteractionRef.current = false
    setDecodedDescription('')
    setActiveModule(null)
  }

  useEffect(() => {
    const board = boardRef.current
    if (!board || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const nodes = [...board.querySelectorAll('.fl-network-node')]
    const items = [...board.querySelectorAll('.fl-network-item')]
    const auxNodes = [...board.querySelectorAll('.fl-network-aux')]
    const auxAnchors = [...board.querySelectorAll('.fl-network-aux-anchor')]
    const core = board.querySelector('.fl-network-core')
    const coreTraces = [...board.querySelectorAll('.fl-network-trace')]
    const coreSignals = [...board.querySelectorAll('.fl-network-signal')]
    const meshTraces = [...board.querySelectorAll('.fl-network-mesh')]
    const meshSignals = [...board.querySelectorAll('.fl-network-mesh-signal')]
    const auxTraces = [...board.querySelectorAll('.fl-network-aux-trace')]
    const movers = nodes.map(element => ({
      element,
      moveX: gsap.quickTo(element, 'x', { duration: .45, ease: 'power3.out' }),
      moveY: gsap.quickTo(element, 'y', { duration: .45, ease: 'power3.out' }),
      strength: 7,
    }))
    let orbitActive = false
    const pointFor = (element, boardBounds) => {
      const bounds = element.getBoundingClientRect()
      return {
        x: (bounds.left + bounds.width / 2 - boardBounds.left) / boardBounds.width * 1160,
        y: (bounds.top + bounds.height / 2 - boardBounds.top) / boardBounds.height * 720,
      }
    }
    const updateOrbit = (time = 0) => {
      const useOrbit = window.innerWidth > 900 || Boolean(board.closest('.login-network'))
      if (!useOrbit) {
        if (orbitActive) {
          gsap.set(items, { clearProps: 'left,top' })
          gsap.set(auxAnchors, { clearProps: 'left,top' })
          orbitActive = false
        }
        return false
      }
      orbitActive = true
      const motionTime = time * .15
      const modulePoints = items.map((item, index) => {
        const baseAngle = networkOrbitAngles[index] - Math.PI * .72
        const angle = baseAngle + motionTime * .105 + Math.sin(motionTime * .16 + index * 1.13) * .045
        const radiusX = 408 + Math.sin(motionTime * .11 + index * 1.47) * 18
        const radiusY = 248 + Math.cos(motionTime * .14 + index * 1.21) * 14
        const x = 580 + Math.cos(angle) * radiusX
        const y = 350 + Math.sin(angle) * radiusY
        gsap.set(item, { left: `${(x - 115) / 11.6}%`, top: `${(y - 36) / 7.2}%` })
        return { x, y }
      })
      auxAnchors.forEach((anchor, index) => {
        const config = networkAuxNodes[index]
        const source = modulePoints[config.link]
        const phase = index * 1.73 + motionTime * (.34 + index % 4 * .045)
        const radius = config.kind === 'particle' ? 130 + index % 5 * 10 : 176 + index % 3 * 17
        const flatten = config.kind === 'particle' ? .78 : .66
        const x = source.x + Math.cos(phase) * radius
        const y = source.y + Math.sin(phase) * radius * flatten
        gsap.set(anchor, { left: `${x / 11.6}%`, top: `${y / 7.2}%` })
      })
      return true
    }
    const updateConnections = (time = 0) => {
      if (!core || !board.offsetParent) return
      if (!updateOrbit(time)) return
      const boardBounds = board.getBoundingClientRect()
      const corePoint = pointFor(core, boardBounds)
      const nodePoints = nodes.map(node => pointFor(node, boardBounds))
      nodes.forEach((_, index) => {
        const nodePoint = nodePoints[index]
        const path = `M ${corePoint.x} ${corePoint.y} L ${nodePoint.x} ${nodePoint.y}`
        coreTraces[index]?.setAttribute('d', path)
        coreSignals[index]?.setAttribute('d', path)
      })
      networkMeshLinks.forEach(([from, to], index) => {
        const fromPoint = nodePoints[from]
        const toPoint = nodePoints[to]
        const path = `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`
        meshTraces[index]?.setAttribute('d', path)
        meshSignals[index]?.setAttribute('d', path)
      })
      auxNodes.forEach((auxiliary, index) => {
        const sourcePoint = nodePoints[networkAuxNodes[index].link]
        const auxiliaryPoint = pointFor(auxiliary, boardBounds)
        auxTraces[index]?.setAttribute('d', `M ${sourcePoint.x} ${sourcePoint.y} L ${auxiliaryPoint.x} ${auxiliaryPoint.y}`)
      })
    }
    const repel = event => {
      movers.forEach(({ element, moveX, moveY, strength }) => {
        const bounds = element.getBoundingClientRect()
        const dx = bounds.left + bounds.width / 2 - event.clientX
        const dy = bounds.top + bounds.height / 2 - event.clientY
        const distance = Math.hypot(dx, dy)
        const radius = 190
        const force = distance < radius ? (1 - distance / radius) * strength : 0
        moveX(distance ? dx / distance * force : 0)
        moveY(distance ? dy / distance * force : 0)
      })
    }
    const reset = () => movers.forEach(({ moveX, moveY }) => { moveX(0); moveY(0) })
    board.addEventListener('pointermove', repel)
    board.addEventListener('pointerleave', reset)
    gsap.ticker.add(updateConnections)
    updateConnections()
    return () => {
      board.removeEventListener('pointermove', repel)
      board.removeEventListener('pointerleave', reset)
      gsap.ticker.remove(updateConnections)
      gsap.killTweensOf([...nodes, ...auxNodes])
    }
  }, [])

  useEffect(() => {
    if (window.innerWidth <= 700 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cycleTimer
    let closeTimer
    let cancelled = false
    const queueNext = () => {
      if (cancelled) return
      const delay = 2500
      cycleTimer = window.setTimeout(() => {
        if (userInteractionRef.current) {
          queueNext()
          return
        }
        const next = networkHighlightSequence[automaticModuleIndexRef.current]
        automaticModuleIndexRef.current = (automaticModuleIndexRef.current + 1) % networkHighlightSequence.length
        setDecodedDescription('')
        setActiveModule(next)
        closeTimer = window.setTimeout(() => {
          if (!userInteractionRef.current) {
            setDecodedDescription('')
            setActiveModule(null)
          }
          queueNext()
        }, 6000)
      }, delay)
    }
    queueNext()
    return () => {
      cancelled = true
      window.clearTimeout(cycleTimer)
      window.clearTimeout(closeTimer)
    }
  }, [])

  useEffect(() => {
    if (activeModule === null) return
    const source = modules[activeModule].description
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>[]{}'
    let revealed = 0
    const timer = window.setInterval(() => {
      revealed += 1.7
      setDecodedDescription([...source].map((character, index) => {
        if (character === ' ') return ' '
        if (index < revealed) return character
        return glyphs[Math.floor(Math.random() * glyphs.length)]
      }).join(''))
      if (revealed >= source.length) window.clearInterval(timer)
    }, 28)
    const detail = boardRef.current?.querySelector('.fl-network-item-detail')
    if (detail) gsap.fromTo(detail, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' })
    return () => window.clearInterval(timer)
  }, [activeModule])

  return <div ref={boardRef} className="fl-network-board" onPointerLeave={deactivateModules}>
    <svg className="fl-network-lines" viewBox="0 0 1160 720" preserveAspectRatio="none" aria-hidden="true">{networkAuxPaths.map((path,index) => <path className={`fl-network-aux-trace ${activeModule === networkAuxNodes[index].link ? 'is-active' : ''}`} d={path} key={`aux-${index}`}/>)}{networkMeshPaths.map((path,index) => <g key={path}><path className="fl-network-mesh" d={path}/><path className={`fl-network-mesh-signal mesh-signal-${index + 1} ${activeModule !== null && networkMeshLinks[index].includes(activeModule) ? 'is-active' : ''}`} d={path} pathLength="100"/></g>)}{networkPaths.map((path,index) => <g key={path}><path className={`fl-network-trace ${activeModule === index ? 'is-active' : ''}`} d={path}/><path className={`fl-network-signal signal-${index + 1} ${activeModule === index ? 'is-active' : ''}`} d={path} pathLength="100"/></g>)}</svg>
    <div className="fl-network-core"><Loader size={62} className="fl-network-core-loader" label="FireUtils"/></div>
    {networkAuxNodes.map((node,index) => <span className="fl-network-aux-anchor" style={{ left: `${node.x / 11.6}%`, top: `${node.y / 7.2}%` }} key={`${node.kind}-${index}`} aria-hidden="true"><span className={`fl-network-aux is-${node.kind} ${activeModule === node.link ? 'is-related' : ''}`} style={node.kind === 'particle' ? { width: node.size, height: node.size } : undefined}>{node.text}</span></span>)}
    {modules.map((module,index) => <div className={`fl-network-item item-${index + 1}`} key={module.name} onPointerEnter={() => activateModule(index)} onPointerLeave={deactivateModules}><div className="fl-network-float"><button type="button" className={`fl-network-node ${activeModule === index ? 'is-active' : ''} ${module.soon ? 'is-soon' : ''}`} onFocus={() => activateModule(index)} onBlur={deactivateModules} onClick={() => activateModule(index)}><span><Icon name={module.icon} size={23}/></span><h3>{module.name}</h3>{module.soon && <small>EM BREVE</small>}</button>{activeModule === index && <div className="fl-network-item-detail" aria-live="polite"><span>0{index + 1} / MÓDULO</span><p>{decodedDescription}</p></div>}</div></div>)}
  </div>
}

