"use client"

const NODES = [
  { x: 80, y: 168, r: 5, color: '#e84b4b' },
  { x: 145, y: 82, r: 4, color: '#ff8a7f' },
  { x: 232, y: 126, r: 7, color: '#671515' },
  { x: 318, y: 66, r: 4, color: '#ff8a7f' },
  { x: 405, y: 150, r: 6, color: '#e84b4b' },
  { x: 492, y: 92, r: 4, color: '#671515' },
  { x: 575, y: 182, r: 7, color: '#ff8a7f' },
  { x: 646, y: 106, r: 4, color: '#e84b4b' },
  { x: 260, y: 246, r: 4, color: '#ff8a7f' },
  { x: 480, y: 248, r: 5, color: '#e84b4b' },
] as const

const LINKS = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [2, 4], [2, 8], [3, 4],
  [3, 5], [4, 5], [4, 6], [4, 9], [5, 6], [5, 7], [6, 7], [8, 9],
] as const

export default function ThreeHero() {
  return (
    <div className="helios-network-visual" role="img" aria-label="Helios network of connected solar meter signals">
      <svg viewBox="0 0 720 330" className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="helios-network-bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#160808" />
            <stop offset="52%" stopColor="#050505" />
            <stop offset="100%" stopColor="#1b0909" />
          </linearGradient>
          <radialGradient id="helios-network-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff8a7f" stopOpacity=".24" />
            <stop offset="100%" stopColor="#ff8a7f" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="720" height="330" rx="18" fill="url(#helios-network-bg)" />
        <circle cx="360" cy="164" r="132" fill="url(#helios-network-core)" className="helios-network-pulse" />
        <g stroke="#ff8a7f" strokeOpacity=".3" strokeWidth="1.2">
          {LINKS.map(([from, to]) => (
            <line key={`${from}-${to}`} x1={NODES[from].x} y1={NODES[from].y} x2={NODES[to].x} y2={NODES[to].y} />
          ))}
        </g>
        <g>
          {NODES.map((node, index) => (
            <g key={`${node.x}-${node.y}`}>
              <circle cx={node.x} cy={node.y} r={node.r * 3.5} fill={node.color} opacity=".1" />
              <circle cx={node.x} cy={node.y} r={node.r} fill={node.color} className={index % 3 === 0 ? 'helios-network-pulse' : undefined} />
            </g>
          ))}
        </g>
        <g fill="#fff" fillOpacity=".6" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10">
          <text x="28" y="30">SIGNAL NETWORK / LIVE MODEL</text>
          <text x="28" y="306">HELIOS / GRID INTELLIGENCE</text>
          <text x="584" y="306">10 NODES · 16 LINKS</text>
        </g>
      </svg>
    </div>
  )
}
