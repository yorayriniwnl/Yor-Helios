'use client'

import React, { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from '../../components/layout/Sidebar'
import Header from '../../components/layout/Header'
import connectWebSocket, { addWebSocketListener, disconnectWebSocket } from '../../lib/websocket'
import useAlertStore from '../../store/alertStore'
import { useAuthStore } from '../../store/authStore'
import { isDemoModeEnabled, startDemo, stopDemo } from '../../lib/demo'
import type { ApiAlert } from '../../types/api'
import CommandPalette from '../../components/ui/CommandPalette'

/**
 * DashboardLayout — wraps all dashboard pages.
 *
 * Responsibilities:
 * 1. Renders the persistent Sidebar + Header chrome.
 * 2. Opens (and keeps alive) the WebSocket connection for the entire
 *    dashboard session — child pages just subscribe via hooks.
 * 3. Pushes incoming WS alert events into the global alertStore so the
 *    unread badge in the Header updates in real time.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pushAlert = useAlertStore((s) => s.pushAlert)
  const { token, hydrated } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (hydrated || typeof window === 'undefined') return
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      useAuthStore.setState({ hydrated: true })
    }
    const fallbackTimer = window.setTimeout(finish, 1000)
    void Promise.resolve(useAuthStore.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(fallbackTimer)
        finish()
      })
    return () => {
      finished = true
      window.clearTimeout(fallbackTimer)
    }
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return

    const isDemoMode = isDemoModeEnabled()
    if (!token && !isDemoMode) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/dashboard')}`)
      return
    }

    // Connect WS (reuses existing socket if already open), or start the
    // deterministic local stream for the explicitly selected demo surface.
    if (isDemoMode) {
      // A silent-demo URL is an explicit local-mode entry point. Persist that
      // choice so normal in-app navigation does not drop the query parameter
      // and unexpectedly redirect the operator to login.
      try { localStorage.setItem('helios.demo', '1') } catch {}
      startDemo()
    } else connectWebSocket()

    // Route incoming alert messages to the global store
    const remove = addWebSocketListener((raw: any) => {
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (msg?.type === 'alert' && msg.data) {
          pushAlert(msg.data as ApiAlert)
        }
      } catch {
        // ignore malformed messages
      }
    })

    return () => {
      remove()
      if (isDemoMode) stopDemo()
      else disconnectWebSocket()
    }
  }, [hydrated, token, pathname, router, pushAlert])

  if (!hydrated) {
    return <div className="min-h-screen bg-[var(--bg)] text-[var(--muted)] grid place-items-center">Loading operator session…</div>
  }

  if (!token && !isDemoModeEnabled()) return null

  return (
    <div className="min-h-screen flex bg-[var(--bg)] text-[var(--fg)]">
      <CommandPalette />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
