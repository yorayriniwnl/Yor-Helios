'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useAlertInvestigation } from '../../hooks'
import { isDemoModeEnabled } from '../../lib/demo'
import { alertAge, formatAlertType, severityBadgeClass } from '../../features/alerts'
import ErrorMessage from '../ui/ErrorMessage'
import Skeleton from '../ui/Skeleton'

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function panelClass(): string {
  return 'rounded-2xl border border-white/10 bg-white/[0.03] p-5'
}

function scoreBandClass(band: string): string {
  if (band === 'HIGH') return 'border-rose-400/30 bg-rose-500/10 text-rose-200'
  if (band === 'MEDIUM') return 'border-amber-300/30 bg-amber-400/10 text-amber-100'
  return 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
}

export default function IncidentWorkspace({ alertId }: { alertId: number }) {
  const { investigation, loading, error, refetch, assign, resolve } = useAlertInvestigation(alertId)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')

  if (loading && !investigation) {
    return (
      <div className="space-y-5" aria-label="Loading incident workspace">
        <Skeleton height={132} />
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Skeleton height={330} />
          <Skeleton height={330} />
        </div>
      </div>
    )
  }

  if (error || !investigation) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/alerts" className="text-sm text-[var(--accent)] hover:underline">← Back to alerts</Link>
        <ErrorMessage message={error ?? 'Incident workspace unavailable'} />
      </div>
    )
  }

  const { alert, meter, zone, reading, anomalies, evidence, timeline, investigation: context } = investigation
  const canAssign = alert.status !== 'resolved' && !alert.assigned_to
  const canResolve = alert.status !== 'resolved'

  async function runAction(action: () => Promise<void>) {
    setActionBusy(true)
    setActionError(null)
    try {
      await action()
      if (!isDemoModeEnabled()) await refetch()
    } catch (err: any) {
      setActionError(err?.message ?? 'The action could not be completed')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/alerts" className="text-sm text-[var(--accent)] hover:underline">← Back to alerts</Link>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
          {context.evidence_state === 'MEASURED_READING' ? 'Measured telemetry linked' : 'Telemetry link incomplete'}
        </div>
      </div>

      <section className={`${panelClass()} relative overflow-hidden`} aria-labelledby="incident-title">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(232,75,75,0.14),transparent_68%)]" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">Incident #{alert.id}</p>
            <h1 id="incident-title" className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl">
              {formatAlertType(alert.type)}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {alert.explanation || 'No detector explanation was stored for this alert.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className={`rounded-full px-2.5 py-1 font-bold ${severityBadgeClass(alert.severity)}`}>{alert.severity.toUpperCase()}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 capitalize">{alert.status}</span>
              <span>Detected {alertAge(alert.created_at)}</span>
              {alert.sla_breached && <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-rose-200">SLA breached</span>}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canAssign && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => runAction(() => assign(1))}
                className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 disabled:opacity-50"
              >
                {actionBusy ? 'Working…' : 'Assign to me'}
              </button>
            )}
            {canResolve && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => runAction(() => resolve(resolutionNotes || 'Resolved from incident workspace'))}
                className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
              >
                {actionBusy ? 'Working…' : 'Resolve incident'}
              </button>
            )}
          </div>
        </div>
        {actionError && <div className="relative mt-4"><ErrorMessage message={actionError} /></div>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className={panelClass()} aria-labelledby="signal-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">Signal readout</p>
              <h2 id="signal-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">What the system observed</h2>
            </div>
            <div className={`rounded-xl border px-3 py-2 text-right ${scoreBandClass(context.score_band)}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">Score band</div>
              <div className="mt-0.5 text-lg font-bold">{context.score_band}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Detector score</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--fg)]">{alert.score != null ? alert.score.toFixed(2) : '—'}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Not a probability</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Detector path</div>
              <div className="mt-2 text-sm font-medium text-[var(--fg)]">{context.detector}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">Calibration status: unverified until labeled field data is available.</div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--fg)]">Measured signals</h3>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{context.evidence_state.replace(/_/g, ' ')}</span>
            </div>
            {context.observed_signals.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {context.observed_signals.map((signal) => <li key={signal} className="text-sm text-[var(--muted)]">• {signal}</li>)}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">No linked telemetry values are available. Treat this case as incomplete evidence.</p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.06] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Recommended response</div>
            <p className="mt-2 text-sm leading-6 text-[var(--fg)]">{context.recommended_response}</p>
          </div>
        </section>

        <section className={panelClass()} aria-labelledby="context-title">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">Asset context</p>
          <h2 id="context-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">Where it happened</h2>
          <dl className="mt-5 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-sm text-[var(--muted)]">Meter</dt>
              <dd className="text-right text-sm font-medium text-[var(--fg)]">
                {meter ? <Link href={`/dashboard/meters/${meter.id}`} className="text-[var(--accent)] hover:underline">{meter.meter_number}</Link> : 'Not linked'}
                {meter?.household_name && <span className="block text-xs font-normal text-[var(--muted)]">{meter.household_name}</span>}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-sm text-[var(--muted)]">Zone</dt>
              <dd className="text-right text-sm font-medium text-[var(--fg)]">
                {zone ? <Link href="/dashboard/zones" className="text-[var(--accent)] hover:underline">{zone.name}</Link> : 'Not linked'}
                {zone?.city && <span className="block text-xs font-normal text-[var(--muted)]">{zone.city}{zone.state ? `, ${zone.state}` : ''}</span>}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-3">
              <dt className="text-sm text-[var(--muted)]">Reading</dt>
              <dd className="text-right text-sm font-medium text-[var(--fg)]">{reading ? `#${reading.id}` : 'No linked reading'}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-[var(--muted)]">Assigned operator</dt>
              <dd className="text-right text-sm font-medium text-[var(--fg)]">{alert.assigned_to ? `User ${alert.assigned_to}` : 'Unassigned'}</dd>
            </div>
          </dl>

          <div className="mt-6">
            <label htmlFor="resolution-notes" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Operator note</label>
            <textarea
              id="resolution-notes"
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Record the field outcome before resolving…"
              className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60"
            />
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={panelClass()} aria-labelledby="explain-title">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">Explainability</p>
              <h2 id="explain-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">Possible causes</h2>
            </div>
            <span className="text-xs text-[var(--muted)]">Ranked hypotheses</span>
          </div>
          <ol className="mt-4 space-y-3">
            {context.possible_causes.map((cause, index) => (
              <li key={cause} className="flex gap-3 rounded-xl border border-white/8 bg-black/15 p-3 text-sm text-[var(--muted)]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs font-semibold text-[var(--fg)]">{index + 1}</span>
                <span>{cause}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-white/8 pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">Uncertainty to carry forward</div>
            <ul className="mt-2 space-y-2 text-sm leading-5 text-[var(--muted)]">
              {context.uncertainty.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        </section>

        <section className={panelClass()} aria-labelledby="timeline-title">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">Chain of custody</p>
              <h2 id="timeline-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">Investigation timeline</h2>
            </div>
            <span className="text-xs text-[var(--muted)]">{timeline.length} event{timeline.length === 1 ? '' : 's'}</span>
          </div>
          <ol className="mt-4 space-y-4">
            {timeline.map((item, index) => (
              <li key={`${item.at}-${item.event}-${index}`} className="relative flex gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_rgba(94,234,212,0.08)]" aria-hidden />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold capitalize text-[var(--fg)]">{item.event.replace(/_/g, ' ')}</span>
                    <time className="text-xs text-[var(--muted)]" dateTime={item.at}>{formatDate(item.at)}</time>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{item.detail || 'Recorded event'}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className={panelClass()} aria-labelledby="evidence-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">Evidence ledger</p>
            <h2 id="evidence-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">Field attachments</h2>
          </div>
          <span className="text-xs text-[var(--muted)]">{evidence.length} attachment{evidence.length === 1 ? '' : 's'}</span>
        </div>
        {evidence.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {evidence.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/8 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-[var(--fg)]">{item.original_filename || `Evidence ${item.id}`}</span>
                  {item.before_after && <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">{item.before_after}</span>}
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">Added {formatDate(item.created_at)}</p>
                {item.notes && <p className="mt-2 text-sm text-[var(--muted)]">{item.notes}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-sm leading-6 text-[var(--muted)]">
            No field attachment is stored. Treat the incident as unresolved evidence until an inspection note or attachment is added.
          </p>
        )}
      </section>
    </div>
  )
}
