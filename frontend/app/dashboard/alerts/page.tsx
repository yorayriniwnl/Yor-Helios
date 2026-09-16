"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAlerts } from '../../../hooks'
import useAlertStore from '../../../store/alertStore'
import Skeleton from '../../../components/ui/Skeleton'
import ErrorMessage from '../../../components/ui/ErrorMessage'
import EmptyState from '../../../components/ui/EmptyState'
import AlertTimeline from '../../../components/alerts/AlertTimeline'
import { severityBadgeClass, formatAlertType, alertAge, sortAlertsByPriority } from '../../../features/alerts'
import type { AlertSeverity, AlertStatus } from '../../../types/api'

type Tab = 'all' | 'open' | 'assigned' | 'resolved'

const TAB_STATUS: Record<Tab, AlertStatus | ''> = {
  all: '',
  open: 'open',
  assigned: 'assigned',
  resolved: 'resolved',
}

export default function AlertsPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | ''>('')
  const searchParams = useSearchParams()
  const querySeverity = searchParams.get('severity')

  const clearUnread = useAlertStore((s) => s.clearUnread)

  // Clear badge whenever the page mounts
  React.useEffect(() => { clearUnread() }, [clearUnread])

  React.useEffect(() => {
    if (querySeverity && ['critical', 'high', 'medium', 'low'].includes(querySeverity)) {
      setSeverityFilter(querySeverity as AlertSeverity)
    }
  }, [querySeverity])

  const { alerts, loading, error, refetch, assign, resolve } = useAlerts({
    status: TAB_STATUS[tab],
    severity: severityFilter,
    limit: 100,
  })

  const sorted = sortAlertsByPriority(alerts)
  const featuredAlert = sorted[0]

  const [pending, setPending] = useState<Set<number>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const addPending = (id: number) => setPending((s) => new Set(s).add(id))
  const removePending = (id: number) => setPending((s) => { const n = new Set(s); n.delete(id); return n })

  const handleResolve = async (id: number) => {
    addPending(id)
    setActionError(null)
    try { await resolve(id, 'Resolved via dashboard') }
    catch (err: any) { setActionError(err?.message ?? 'Could not resolve the alert') }
    finally { removePending(id) }
  }

  const handleAssign = async (id: number) => {
    addPending(id)
    setActionError(null)
    try { await assign(id, 1) }   // assign to user 1 (admin) as demo
    catch (err: any) { setActionError(err?.message ?? 'Could not assign the alert') }
    finally { removePending(id) }
  }

  const tabs: Tab[] = ['all', 'open', 'assigned', 'resolved']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Alerts</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Severity filter */}
          <select
            aria-label="Filter alerts by severity"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | '')}
            className="text-sm rounded-lg px-3 py-1.5"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--fg)',
            }}
          >
            <option value="">All Severities</option>
            {(['critical', 'high', 'medium', 'low'] as AlertSeverity[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <button
            onClick={refetch}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {tabs.map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t
                ? 'bg-[var(--accent)] text-black'
                : 'text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <ErrorMessage message={error} />}
      {actionError && <ErrorMessage message={actionError} />}

      {/* Alert timeline (for visual context) */}
      {!loading && alerts.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <AlertTimeline
            created_at={featuredAlert?.created_at}
            responded_at={featuredAlert?.responded_at}
            resolved_at={featuredAlert?.resolved_at}
            status={featuredAlert?.status}
          />
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        {loading ? (
          <div className="p-6 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} height={44} />)}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState message="No alerts match the selected filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wider border-b border-white/6"
                  style={{ color: 'var(--muted)' }}
                >
                  {['ID', 'Type', 'Severity', 'Status', 'Score', 'Age', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => {
                  const isPending = pending.has(a.id)
                  return (
                    <tr
                      key={a.id}
                      className="border-t border-white/4 hover:bg-white/3 transition-colors animate-fade-in"
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>
                        <Link
                          href={`/dashboard/alerts/${a.id}`}
                          className="text-[var(--accent)] hover:underline"
                          aria-label={`Open investigation for alert ${a.id}`}
                        >
                          #{a.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[180px] truncate">
                        {formatAlertType(a.type)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${severityBadgeClass(a.severity)}`}>
                          {a.severity.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs capitalize"
                          style={{
                            background: a.status === 'resolved' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                            color: a.status === 'resolved' ? '#86efac' : 'var(--muted)',
                          }}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                        {a.score != null ? a.score.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                        {alertAge(a.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {a.status === 'open' && (
                            <button
                              disabled={isPending}
                              onClick={() => handleAssign(a.id)}
                              className="px-2 py-1 text-xs rounded font-medium disabled:opacity-40 transition-opacity"
                              style={{ background: 'rgba(94,234,212,0.15)', color: 'var(--accent)' }}
                            >
                              Assign
                            </button>
                          )}
                          {a.status !== 'resolved' && (
                            <button
                              disabled={isPending}
                              onClick={() => handleResolve(a.id)}
                              className="px-2 py-1 text-xs rounded font-medium disabled:opacity-40 transition-opacity"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac' }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
