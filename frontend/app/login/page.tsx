"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useAuthStore from '../../store/authStore'
import { BoltIcon } from '../../lib/navigation'

const TRUST_POINTS = [
  'Jump from alert severity to meter-level evidence in one workspace.',
  'Review zone risk, analytics, and field readiness without changing tools.',
  'Use the local walkthrough when you need to verify the interface without operational telemetry.',
] as const

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const login  = useAuthStore((s) => s.login)
  const router = useRouter()

  function safeNextPath() {
    const requested = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null
    return requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      router.push(safeNextPath())
    } catch (err: any) {
      setError(err?.message ?? 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)]">
      <div className="pointer-events-none absolute inset-0 telemetry-grid opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(232,75,75,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(103,21,21,0.22),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl gap-10 px-4 py-8 lg:grid-cols-[1.05fr,440px] lg:items-center">
        <section className="space-y-8">
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] leading-none text-[var(--muted)] transition-colors hover:bg-white/10">
              Back to home
            </Link>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
              Operator access
            </div>

            <h1 className="display-serif max-w-3xl text-4xl font-semibold leading-tight text-[var(--fg)] md:text-5xl lg:text-6xl">
              Sign in to the Helios command center.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
              Review live anomalies, zone risk, and response guidance from one workspace built for fast operational decisions.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div key={point} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm leading-6 text-[var(--muted)]">{point}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                  Demo credentials
                </div>
                <div className="mt-2 text-lg font-semibold text-[var(--fg)]">
                  admin@example.com / adminpass123
                </div>
              </div>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('helios.demo', '1')
                    router.push(safeNextPath())
                  }
                }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-white/10"
              >
                Enter Demo Mode
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Use demo mode when the backend is unavailable and you still want to verify layout, navigation, and dashboard behavior locally.
            </p>
          </div>
        </section>

        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,18,32,0.96),rgba(12,20,36,0.9))] p-6 shadow-[0_24px_64px_rgba(2,6,23,0.35)] md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10"
              style={{ background: 'linear-gradient(135deg, rgba(103,21,21,0.72), rgba(232,75,75,0.18))', color: 'var(--fg)' }}
            >
              <BoltIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">Helios</h2>
              <p className="text-sm text-[var(--muted)]">Intelligent energy monitoring</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-[var(--fg)]">Welcome back</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Authenticate to access the dashboard and your active monitoring workspace.
              </p>
            </div>

            {error && (
              <div
                className="rounded-2xl px-4 py-3 text-sm animate-fade-in"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[var(--fg)] outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[var(--fg)] outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: loading ? 'rgba(232,75,75,0.5)' : 'var(--accent)',
                  color: '#000000',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="helios-spinner" style={{ borderTopColor: '#000000', width: '14px', height: '14px' }} />
                    Signing in...
                  </span>
                ) : 'Sign in'}
              </button>
            </form>

            <p className="text-center text-xs leading-6 text-[var(--muted)]">
              Need a fast local check? Enter demo mode for a backend-free walkthrough; it is clearly synthetic and never represents live telemetry.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
