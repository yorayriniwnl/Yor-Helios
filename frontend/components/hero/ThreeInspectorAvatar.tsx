"use client"

type AlertLike = {
  score?: number
}

type Props = { alert?: AlertLike; size?: number }

function severityColor(score: number) {
  if (score >= 0.8) return '#ff6b6b'
  if (score >= 0.66) return '#ff8a65'
  if (score >= 0.33) return '#f6c84c'
  return '#ff8a7f'
}

export default function ThreeInspectorAvatar({ alert, size = 120 }: Props) {
  const score = Math.max(0, Math.min(1, Number(alert?.score ?? 0.45)))
  const accent = severityColor(score)
  const height = Math.round(size * 0.8)

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ width: size, height }}
      role="img"
      aria-label={`Inspector status, normalized anomaly score ${Math.round(score * 100)} out of 100`}
    >
      <div className="helios-avatar-orbit" aria-hidden="true" />
      <svg viewBox="0 0 120 96" className="relative h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="helios-avatar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity=".42" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="helios-avatar-body" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#171717" />
            <stop offset="100%" stopColor="#030303" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="47" r="41" fill="url(#helios-avatar-glow)" />
        <path d="M40 87c2-16 11-23 20-23s18 7 20 23" fill="url(#helios-avatar-body)" stroke="#5d2424" strokeWidth="1.5" />
        <circle cx="60" cy="42" r="18" fill="#f5eaea" stroke="#fff" strokeOpacity=".32" />
        <path d="M44 39c3-12 27-15 32 0-8-4-20-5-32 0Z" fill="#160808" />
        <circle cx="54" cy="44" r="2.8" fill="#080808" />
        <circle cx="66" cy="44" r="2.8" fill="#080808" />
        <path d="M55 53c3 2 7 2 10 0" fill="none" stroke="#8e4545" strokeLinecap="round" strokeWidth="1.5" />
        <circle cx="60" cy="15" r="6" fill={accent} opacity=".24" className="helios-network-pulse" />
        <circle cx="60" cy="15" r="3.5" fill={accent} />
        <path d="M26 83h68" stroke="#ff8a7f" strokeOpacity=".2" />
      </svg>
    </div>
  )
}
