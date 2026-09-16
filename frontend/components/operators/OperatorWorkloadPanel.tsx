"use client"

import React, { useEffect, useState, useMemo } from 'react'
import { get, post, patch } from '../../lib/api'
import Spinner from '../ui/Spinner'
import ErrorMessage from '../ui/ErrorMessage'
import useAuthStore from '../../store/authStore'
import { getDemoAlerts, isDemoModeEnabled } from '../../lib/demo'

type AlertItem = {
  id: number
  type: string
  severity?: string
  status?: string
  created_at?: string
  assigned_to?: number | null
}

function OperatorWorkloadPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [priorityIds, setPriorityIds] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const auth = useAuthStore((s) => s.user)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [aRes, pRes] = isDemoModeEnabled()
          ? [getDemoAlerts(), getDemoAlerts().filter((alert) => (alert.score ?? 0) >= 0.8)]
          : await Promise.all([get<any[]>('/alerts/', undefined, { cacheMs: 10000 }), get<any[]>('/alerts/priority', undefined, { cacheMs: 10000 }).catch(() => [])])
        if (!mounted) return

        const mapped: AlertItem[] = (aRes || []).map((a) => ({
          id: Number(a.id) || Date.now(),
          type: a.type || a.message || a.explanation || `Alert ${a.id}`,
          severity: a.severity,
          status: a.status || (a.resolved ? 'resolved' : 'open'),
          created_at: a.created_at || a.timestamp,
          assigned_to: a.assigned_to ?? null,
        }))

        const pIds = new Set<number>((pRes || []).map((p: any) => Number(p.id)).filter(Boolean))

        setAlerts(mapped)
        setPriorityIds(pIds)
      } catch (err: any) {
        if (!mounted) return
        if (!isDemoModeEnabled()) setError(err?.message || 'Failed to load operator workload')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  // Group by assigned_to (null -> unassigned) — memoized to avoid recalculation
  const groups = useMemo(() => {
    const g: Record<string, AlertItem[]> = {}
    for (const a of alerts) {
      const key = a.assigned_to == null ? 'unassigned' : String(a.assigned_to)
      if (!g[key]) g[key] = []
      g[key].push(a)
    }
    return g
  }, [alerts])

  const operators = useMemo(() => {
    const keys = Object.keys(groups)
    const pArr = Array.from(priorityIds || [])
    return keys.map((key) => {
      const list = groups[key]
      const assigned = list.length
      const pending = list.filter((x) => (x.status || 'open') !== 'resolved').length
      const priority = list.filter((x) => pArr.includes(x.id)).length
      const id = key === 'unassigned' ? null : Number(key)
      const name = id == null ? 'Unassigned' : `Operator ${id}`
      return { id, name, assigned, pending, priority, alerts: list }
    }).sort((a, b) => b.priority - a.priority || b.pending - a.pending)
  }, [groups, priorityIds])

  if (loading) return <div className="card"><div className="py-6 flex justify-center"><Spinner /></div></div>
  if (error) return <div className="card"><ErrorMessage message={error} /></div>

  async function handleAssign(alertId: number, toId?: number | null) {
    try {
      const userId = toId ?? Number(window.prompt('Assign to user id (numeric):') || '')
      if (!userId) return
      const res = await post<AlertItem>(`/alerts/${alertId}/assign`, { user_id: Number(userId) })
      setAlerts((prev) => prev.map((x) => (x.id === alertId ? { ...x, status: res.status || 'assigned', assigned_to: res.assigned_to ?? Number(userId) } : x)))
    } catch (e) {
      console.error('assign failed', e)
      alert('Assign failed')
    }
  }

  async function handleResolve(alertId: number) {
    try {
      const res = await patch<AlertItem>(`/alerts/${alertId}/resolve`, { notes: 'Resolved via workload panel' })
      setAlerts((prev) => prev.map((x) => (x.id === alertId ? { ...x, status: res.status || 'resolved' } : x)))
    } catch (e) {
      console.error('resolve failed', e)
      alert('Resolve failed')
    }
  }

  return (
    <div className="card">
      <h3 className="font-medium">Operator Workload</h3>
      <div className="text-sm text-[var(--muted)]">Assigned, pending, and priority alerts grouped by operator.</div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="text-xs text-[var(--muted)]">
              <th className="px-3 py-2">Operator</th>
              <th className="px-3 py-2">Assigned</th>
              <th className="px-3 py-2">Pending</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <React.Fragment key={String(op.id ?? 'unassigned')}>
                <tr className="border-t border-white/6">
                  <td className="px-3 py-3 align-top font-medium">{op.name}</td>
                  <td className="px-3 py-3 align-top">{op.assigned}</td>
                  <td className="px-3 py-3 align-top">{op.pending}</td>
                  <td className="px-3 py-3 align-top">{op.priority}</td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setOpen((s) => ({ ...s, [String(op.id ?? 'unassigned')]: !s[String(op.id ?? 'unassigned')] }))} className="px-2 py-1 text-xs rounded bg-white/6">{open[String(op.id ?? 'unassigned')] ? 'Hide tasks' : 'View tasks'}</button>
                      {op.id != null && (
                        <button onClick={async () => {
                          // claim all unassigned priority alerts for this operator
                          const unassignedPriority = (groups['unassigned'] || []).filter((a) => priorityIds.has(a.id))
                          for (const a of unassignedPriority) {
                            await handleAssign(a.id, op.id)
                          }
                        }} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">Claim priority</button>
                      )}
                    </div>
                  </td>
                </tr>

                {open[String(op.id ?? 'unassigned')] && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 bg-[rgba(255,255,255,0.01)]">
                      <div className="space-y-2">
                        {(op.alerts || []).map((a) => (
                          <div key={a.id} className="flex items-center justify-between p-2 border rounded bg-[rgba(255,255,255,0.02)]">
                            <div>
                              <div className="text-sm font-medium">{a.type}</div>
                              <div className="text-xs text-[var(--muted)]">{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</div>
                              <div className="text-xs text-[var(--muted)]">{a.status}</div>
                              {a.assigned_to == null && op.id != null && (
                                <button onClick={() => handleAssign(a.id, op.id)} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">Assign to {op.name}</button>
                              )}
                              <button onClick={() => handleAssign(a.id)} className="px-2 py-1 text-xs rounded bg-white/6">Assign...</button>
                              <button onClick={() => handleResolve(a.id)} className="px-2 py-1 text-xs rounded bg-green-600 text-white">Resolve</button>
                            </div>
                          </div>
                        ))}
                        {(!op.alerts || op.alerts.length === 0) && <div className="text-sm text-[var(--muted)]">No tasks</div>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default React.memo(OperatorWorkloadPanel)
