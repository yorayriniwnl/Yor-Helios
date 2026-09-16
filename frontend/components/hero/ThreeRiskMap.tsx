"use client"

import { useState } from 'react'

export type Zone = { id: number; x: number; y: number; radius: number; risk: number; label?: string }

const ZONES: Zone[] = [
  { id: 1, x: 150, y: 140, radius: 32, risk: 0.8, label: 'Zone A' },
  { id: 2, x: 330, y: 108, radius: 44, risk: 0.4, label: 'Zone B' },
  { id: 3, x: 530, y: 150, radius: 35, risk: 0.2, label: 'Zone C' },
  { id: 4, x: 250, y: 292, radius: 41, risk: 0.65, label: 'Zone D' },
  { id: 5, x: 500, y: 292, radius: 27, risk: 0.95, label: 'Zone E' },
]

function zoneColor(risk: number) {
  return risk > 0.6 ? '#e84b4b' : risk > 0.3 ? '#ff8a7f' : '#671515'
}

export default function ThreeRiskMap({ onZoneClick }: { onZoneClick?: (zone: Zone) => void }) {
  const [selected, setSelected] = useState<number | null>(null)

  const selectZone = (zone: Zone) => {
    setSelected(zone.id)
    onZoneClick?.(zone)
  }

  return (
    <div className="helios-risk-map" role="group" aria-label="Interactive zone risk map">
      <svg viewBox="0 0 680 420" className="h-full w-full" aria-label="Solar meter zone risk map">
        <defs>
          <linearGradient id="helios-risk-bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#160808" />
            <stop offset="100%" stopColor="#030303" />
          </linearGradient>
          <pattern id="helios-risk-grid" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M34 0H0V34" fill="none" stroke="#fff" strokeOpacity=".06" />
          </pattern>
        </defs>
        <rect width="680" height="420" rx="20" fill="url(#helios-risk-bg)" />
        <rect width="680" height="420" rx="20" fill="url(#helios-risk-grid)" />
        <path d="M82 220h518M340 48v324" stroke="#ff8a7f" strokeOpacity=".12" strokeDasharray="4 8" />
        {ZONES.map((zone) => {
          const color = zoneColor(zone.risk)
          const active = selected === zone.id
          return (
            <g key={zone.id}>
              <circle cx={zone.x} cy={zone.y} r={zone.radius * 1.55} fill={color} opacity={active ? '.18' : '.1'} className="helios-network-pulse" />
              <circle
                cx={zone.x}
                cy={zone.y}
                r={zone.radius}
                fill="#050505"
                fillOpacity=".8"
                stroke={color}
                strokeWidth={active ? 3 : 2}
                tabIndex={0}
                role="button"
                aria-label={`${zone.label ?? `Zone ${zone.id}`}, ${Math.round(zone.risk * 100)} percent risk`}
                onClick={() => selectZone(zone)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectZone(zone)
                  }
                }}
              />
              <circle cx={zone.x} cy={zone.y} r={Math.max(4, zone.radius * 0.22)} fill={color} />
              <text x={zone.x} y={zone.y + zone.radius + 23} fill="#fff" fillOpacity=".82" fontSize="13" textAnchor="middle">
                {zone.label}
              </text>
              <text x={zone.x} y={zone.y + 5} fill="#fff" fontSize="12" fontWeight="700" textAnchor="middle">
                {Math.round(zone.risk * 100)}%
              </text>
            </g>
          )
        })}
        <text x="28" y="34" fill="#fff" fillOpacity=".68" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10">
          ZONE EXPOSURE / SELECT A NODE
        </text>
        <text x="28" y="394" fill="#fff" fillOpacity=".44" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10">
          LOW &lt; 33 · WATCH 33–60 · HIGH &gt; 60
        </text>
      </svg>
    </div>
  )
}
