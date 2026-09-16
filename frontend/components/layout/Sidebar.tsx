"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { addWebSocketStatusListener, addWebSocketListener } from '../../lib/websocket'
import { BoltIcon, DASHBOARD_NAV_ITEMS } from '../../lib/navigation'
import { isDemoModeEnabled } from '../../lib/demo'

type ConnStatus = 'connected' | 'disconnected' | 'demo'

export default function Sidebar() {
  const pathname = usePathname() || ''
  const [connStatus, setConnStatus] = useState<ConnStatus>('disconnected')
  const [lastEventTime, setLastEventTime] = useState<string | null>(null)

  useEffect(() => {
    const isDemoMode = isDemoModeEnabled()
    if (isDemoMode) {
      setConnStatus('demo')
      return
    }

    const removeStatus = addWebSocketStatusListener((status) => {
      setConnStatus(status === 'open' ? 'connected' : 'disconnected')
    })
    const removeEvent = addWebSocketListener(() => setLastEventTime(new Date().toLocaleTimeString()))
    return () => {
      removeStatus()
      removeEvent()
    }
  }, [])

  const dotClass = {
    connected: 'ws-dot ws-dot--open',
    disconnected: 'ws-dot ws-dot--closed',
    demo: 'ws-dot ws-dot--demo',
  }[connStatus]

  const dotLabel = {
    connected: 'Live',
    disconnected: 'Offline',
    demo: 'Demo',
  }[connStatus]

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[linear-gradient(180deg,rgba(22,3,3,0.82),rgba(0,0,0,0.98))] px-4 py-5 md:flex md:flex-col md:gap-6">
      <Link
        href="/"
        aria-label="Helios home"
        className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_36px_rgba(2,6,23,0.28)] transition-transform hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10"
            style={{ background: 'linear-gradient(135deg, rgba(103,21,21,0.72), rgba(232,75,75,0.18))', color: 'var(--fg)' }}
          >
            <BoltIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
              Helios
            </div>
            <div className="text-base font-semibold text-[var(--fg)]">Operator Command Center</div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Stay inside one workspace while you monitor assets, prioritize anomalies, and route field response.
        </p>
      </Link>

      <div className="flex-1">
        <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
          Command Routes
        </div>

        <nav className="mt-3 space-y-2">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const active =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-start gap-3 rounded-2xl border px-3 py-3 transition-all duration-150 ${
                  active
                    ? 'border-white/15 bg-white/[0.08] text-[var(--fg)] shadow-[0_12px_30px_rgba(15,23,42,0.18)]'
                    : 'border-transparent text-[var(--muted)] hover:border-white/10 hover:bg-white/[0.04] hover:text-[var(--fg)]'
                }`}
              >
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10"
                  style={{ background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)', color: item.accent }}
                >
                  <Icon className="h-5 w-5" />
                </span>

                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.shortTitle}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                    {item.description}
                  </span>
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
              Connection
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--fg)]">Telemetry status</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--muted)]">
            {dotLabel}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className={dotClass} />
          <span className="text-sm text-[var(--muted)]">
            {connStatus === 'connected'
              ? 'Streaming updates are flowing into the dashboard.'
              : connStatus === 'demo'
                ? 'Demo mode is active with local sample data.'
                : 'Waiting for live events or backend connectivity.'}
          </span>
        </div>

        {lastEventTime && connStatus === 'connected' && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Last event received at {lastEventTime}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href="/" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-sm text-[var(--muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--fg)]">
            Home
          </Link>
          <Link href="/dashboard/alerts" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-sm text-[var(--muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--fg)]">
            Triage
          </Link>
        </div>
      </div>
    </aside>
  )
}
