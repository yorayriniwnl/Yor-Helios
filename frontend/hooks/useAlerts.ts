/**
 * useAlerts — paginated alert list with optional severity/status filtering,
 * real-time prepending of WebSocket alert events, and helpers for
 * assigning / resolving individual alerts.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { get, patch, post } from '../lib/api'
import { addWebSocketListener } from '../lib/websocket'
import { getDemoAlerts, isDemoModeEnabled } from '../lib/demo'
import type { ApiAlert, AlertSeverity, AlertStatus, WsMessage } from '../types/api'

export interface AlertFilters {
  severity?: AlertSeverity | ''
  status?: AlertStatus | ''
  limit?: number
  skip?: number
}

export interface UseAlertsResult {
  alerts: ApiAlert[]
  loading: boolean
  error: string | null
  total: number
  refetch: () => void
  assign: (alertId: number, userId: number) => Promise<void>
  resolve: (alertId: number, notes?: string) => Promise<void>
}

function matchesAlertFilters(alert: ApiAlert, severity: AlertSeverity | '', status: AlertStatus | ''): boolean {
  if (severity && alert.severity !== severity) return false
  if (status && alert.status !== status) return false
  return true
}

export function useAlerts(filters: AlertFilters = {}): UseAlertsResult {
  const { severity = '', status = '', limit = 50, skip = 0 } = filters

  const [alerts, setAlerts] = useState<ApiAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const isMounted = useRef(true)
  const knownAlertIds = useRef<Set<number>>(new Set())
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const fetchAlerts = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current

    setLoading(true)
    setError(null)
    if (isDemoModeEnabled()) {
      const demoAlerts = getDemoAlerts().filter((alert) => {
        if (severity && alert.severity !== severity) return false
        if (status && alert.status !== status) return false
        return true
      }).slice(skip, skip + limit)
      if (isMounted.current && requestId === requestIdRef.current) {
        knownAlertIds.current = new Set(demoAlerts.map((alert) => alert.id))
        setAlerts(demoAlerts)
        setTotal(demoAlerts.length)
        setLoading(false)
      }
      return
    }
    try {
      const params: Record<string, string | number> = { limit, skip }
      if (severity) params.severity = severity
      if (status) params.status = status

      const data = await get<ApiAlert[] | { items: ApiAlert[]; total: number }>('/alerts/', { params }, { signal: controller.signal })

      if (!isMounted.current || requestId !== requestIdRef.current) return

      if (Array.isArray(data)) {
        knownAlertIds.current = new Set(data.map((alert) => alert.id))
        setAlerts(data)
        setTotal(data.length)
      } else if (data && 'items' in data) {
        knownAlertIds.current = new Set(data.items.map((alert) => alert.id))
        setAlerts(data.items)
        setTotal(data.total ?? data.items.length)
      }
    } catch (e: any) {
      if (
        isMounted.current &&
        requestId === requestIdRef.current &&
        e?.name !== 'AbortError' &&
        e?.name !== 'CanceledError' &&
        !isDemoModeEnabled()
      ) {
        setError(e?.message ?? 'Failed to load alerts')
      }
    } finally {
      if (isMounted.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [severity, status, limit, skip])

  const applyAlertUpdate = useCallback((updated: ApiAlert) => {
    const wasVisible = knownAlertIds.current.has(updated.id)
    const remainsVisible = matchesAlertFilters(updated, severity, status)
    if (wasVisible && !remainsVisible) {
      knownAlertIds.current.delete(updated.id)
      setTotal((count) => Math.max(0, count - 1))
    } else if (remainsVisible) {
      knownAlertIds.current.add(updated.id)
    }
    setAlerts((prev) => prev.flatMap((alert) => {
      if (alert.id !== updated.id) return [alert]
      const merged = { ...alert, ...updated }
      return matchesAlertFilters(merged, severity, status) ? [merged] : []
    }))
  }, [severity, status])

  // Initial + dependency-change fetch
  useEffect(() => {
    fetchAlerts()
    return () => abortRef.current?.abort()
  }, [fetchAlerts])

  // Prepend real-time alerts from WebSocket
  useEffect(() => {
    const remove = addWebSocketListener((raw: string | WsMessage) => {
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (msg.type === 'alert' && msg.data) {
          const incoming: ApiAlert = msg.data
          if (!isMounted.current) return
          if (severity && incoming.severity !== severity) return
          if (status && incoming.status !== status) return
          if (knownAlertIds.current.has(incoming.id)) return
          knownAlertIds.current.add(incoming.id)
          setAlerts((prev) => {
            return [incoming, ...prev]
          })
          setTotal((t) => t + 1)
        }
      } catch {
        // ignore parse errors
      }
    })
    return remove
  }, [severity, status])

  // Assign an alert to a user
  const assign = useCallback(async (alertId: number, userId: number) => {
    if (isDemoModeEnabled()) {
      if (isMounted.current) applyAlertUpdate({ id: alertId, status: 'assigned', assigned_to: userId, responded_at: new Date().toISOString() } as ApiAlert)
      return
    }
    const updated = await post<ApiAlert>(`/alerts/${alertId}/assign`, { user_id: userId })
    if (updated && isMounted.current) applyAlertUpdate(updated)
  }, [applyAlertUpdate])

  // Resolve an alert with optional notes
  const resolve = useCallback(async (alertId: number, notes?: string) => {
    if (isDemoModeEnabled()) {
      if (isMounted.current) applyAlertUpdate({ id: alertId, status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: notes ?? null } as ApiAlert)
      return
    }
    const updated = await patch<ApiAlert>(`/alerts/${alertId}/resolve`, { notes })
    if (updated && isMounted.current) applyAlertUpdate(updated)
  }, [applyAlertUpdate])

  return { alerts, loading, error, total, refetch: fetchAlerts, assign, resolve }
}

export default useAlerts
