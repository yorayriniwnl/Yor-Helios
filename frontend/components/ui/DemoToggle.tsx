"use client"

import React, { useEffect, useState } from 'react'
import { startDemo, stopDemo, isDemoModeEnabled } from '../../lib/demo'

export default function DemoToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    try {
      const on = isDemoModeEnabled()
      setEnabled(on)
      if (on) startDemo()
    } catch (e) {}
  }, [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    try {
      if (next) {
        localStorage.setItem('helios.demo', '1')
        startDemo()
      } else {
        localStorage.removeItem('helios.demo')
        stopDemo()
      }
    } catch (e) {}

    if (!next) {
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.has('demo')) {
          url.searchParams.delete('demo')
          window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
        }
      } catch (e) {}
    }

    // Reload to ensure components fetch demo-backed API responses
    try {
      setTimeout(() => window.location.reload(), 350)
    } catch (e) {}
  }

  return (
    <div className="inline-flex items-center gap-3">
      <div className="text-sm text-[var(--muted)]">Demo</div>
      <button
        aria-pressed={enabled}
        aria-label={enabled ? 'Disable demo mode' : 'Enable demo mode'}
        onClick={toggle}
        className={`relative inline-flex items-center h-8 w-16 rounded-full p-1 transition-all ${enabled ? 'bg-gradient-to-r from-[#671515] to-[#e84b4b] shadow-lg' : 'bg-white/6'}`}
      >
        <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${enabled ? 'translate-x-8 shadow' : 'translate-x-0'}`} />
      </button>
      <div className={`text-xs font-semibold ${enabled ? 'text-[var(--accent-2)]' : 'text-[var(--muted)]'}`}>{enabled ? 'Live demo' : 'Off'}</div>
    </div>
  )
}
