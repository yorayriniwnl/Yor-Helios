"use client"

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HOME_HIGHLIGHTS, HOME_PAGE_GROUPS, HOME_WORKFLOWS, getZoneRiskLabel } from '../lib/navigation'

const ThreeHero = dynamic(() => import('../components/hero/ThreeHero'), { ssr: false })
const ThreeRiskMap = dynamic(() => import('../components/hero/ThreeRiskMap'), { ssr: false })

const DEFAULT_ZONE = { id: 5, label: 'Zone E', risk: 0.95 }

function zoneRecommendation(risk: number) {
  if (risk >= 0.8) return 'Dispatch an inspection team and review the alert stack immediately.'
  if (risk >= 0.6) return 'Review the zone workload, then assign preventive checks during the next field window.'
  if (risk >= 0.35) return 'Monitor the zone closely and compare with neighboring assets for drift.'
  return 'Continue monitoring. No urgent field response is recommended right now.'
}

export default function Home() {
  const [selectedZone, setSelectedZone] = useState(DEFAULT_ZONE)
  const router = useRouter()

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('demo') === 'silent') {
        router.replace('/dashboard?demo=silent')
      }
    } catch {
      // ignore — falls through to the normal landing page
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="relative overflow-hidden px-4 py-6 md:px-8 md:py-8">
      <div className="pointer-events-none absolute inset-0 telemetry-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(232,75,75,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(103,21,21,0.22),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_45%)]" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(22,3,3,0.96),rgba(5,5,5,0.94))] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:p-8 lg:p-10">
          <div className="grid items-center gap-10 xl:grid-cols-[1.05fr,0.95fr]">
            <div className="min-w-0 space-y-7">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                Energy intelligence for live operations
              </div>

              <div className="space-y-4">
                <h1 className="display-serif max-w-3xl text-4xl font-semibold leading-tight text-[var(--fg)] md:text-5xl lg:text-6xl">
                  Spot grid instability before it becomes downtime.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
                  Helios brings meter anomalies, zone risk, and response workflows into one command surface so operators can move from signal to action without losing context.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard" className="btn btn-primary rounded-full px-5 py-3 text-sm">
                  Open Dashboard
                </Link>
                <Link href="/login" className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-white/10">
                  Sign In
                </Link>
                <Link href="/dashboard/alerts" className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:border-white/20 hover:bg-white/5 hover:text-[var(--fg)]">
                  Review Alerts
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {HOME_HIGHLIGHTS.map((highlight) => (
                  <div key={highlight.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{highlight.value}</div>
                    <div className="mt-1 text-sm leading-6 text-[var(--muted)]">{highlight.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(103,21,21,0.28),rgba(255,255,255,0.02))] p-4">
                <ThreeHero />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] leading-none text-[var(--muted)]">
                      Response cadence
                    </div>
                    <div className="mt-2 text-lg font-semibold text-[var(--fg)]">Realtime signal flow</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Alerts, live feed updates, and guided explanations stay in sync as the system changes.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] leading-none text-[var(--muted)]">
                      Operator focus
                    </div>
                    <div className="mt-2 text-lg font-semibold text-[var(--fg)]">One surface, many angles</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Shift between zone heat, meter detail, and analytics without breaking your workflow.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,3,3,0.7),rgba(5,5,5,0.88))] shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                    Risk map
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--fg)]">Work the grid by highest-risk zone</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                    Click any zone to see the recommended response path. The map turns the landing page into a practical jump-off point, not just a splash screen.
                  </p>
                </div>
                <Link href="/dashboard/zones" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-white/10">
                  Open Zone Dashboard
                </Link>
              </div>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr),260px]">
              <ThreeRiskMap
                onZoneClick={(zone) =>
                  setSelectedZone({
                    id: zone.id,
                    label: zone.label ?? `Zone ${zone.id}`,
                    risk: zone.risk,
                  })
                }
              />

              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                    Selected zone
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--fg)]">{selectedZone.label}</div>
                  <div className="mt-3 inline-flex rounded-full bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: selectedZone.risk >= 0.8 ? 'var(--accent)' : selectedZone.risk >= 0.6 ? 'var(--status-warn)' : 'var(--accent-2)' }}>
                    {getZoneRiskLabel(selectedZone.risk)} risk
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                    {zoneRecommendation(selectedZone.risk)}
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                    Dynamic detail routes
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    Meter detail views need a live meter ID from the list screens before they can open.
                  </p>
                  <div className="mt-4 space-y-2">
                    <code className="block rounded-2xl bg-black/20 px-3 py-2 text-sm text-[var(--fg)]">/dashboard/meters/[id]</code>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                    Fastest route in
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                    Start with <span className="font-semibold text-[var(--fg)]">/login</span> for the authenticated operator path, then open <span className="font-semibold text-[var(--fg)]">/dashboard</span> when you need the workspace.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {HOME_PAGE_GROUPS.map((group) => (
              <section key={group.title} className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(103,21,21,0.16),rgba(255,255,255,0.015))] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.38)]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                    Route group
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--fg)]">{group.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{group.description}</p>
                </div>

                <div className="mt-5 grid gap-3">
                  {group.links.map((link) => {
                    const Icon = link.icon
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10"
                            style={{ background: 'rgba(255,255,255,0.04)', color: link.accent }}
                          >
                            <Icon className="h-5 w-5" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-base font-semibold text-[var(--fg)]">{link.title}</div>
                              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                                {link.href}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{link.description}</p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {HOME_WORKFLOWS.map((workflow) => {
            const Icon = workflow.icon
            return (
              <Link
                key={workflow.title}
                href={workflow.href}
                className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(103,21,21,0.14),rgba(255,255,255,0.015))] p-6 transition-transform hover:-translate-y-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[var(--accent)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-[var(--fg)]">{workflow.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{workflow.description}</p>
              </Link>
            )
          })}
        </section>
      </div>
    </main>
  )
}
