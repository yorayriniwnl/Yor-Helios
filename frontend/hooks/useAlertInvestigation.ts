import { useCallback, useEffect, useRef, useState } from 'react'
import { get, patch, post } from '../lib/api'
import { getDemoAlertInvestigation, isDemoModeEnabled } from '../lib/demo'
import type { ApiAlert, ApiAlertInvestigation } from '../types/api'

export interface UseAlertInvestigationResult {
  investigation: ApiAlertInvestigation | null
  loading: boolean
  error: string | null
  refetch: () => void
  assign: (userId?: number) => Promise<void>
  resolve: (notes?: string) => Promise<void>
}

export function useAlertInvestigation(alertId: number | null): UseAlertInvestigationResult {
  const [investigation, setInvestigation] = useState<ApiAlertInvestigation | null>(null)
  const [loading, setLoading] = useState(Boolean(alertId))
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const fetchInvestigation = useCallback(async (signal?: AbortSignal) => {
    if (!alertId) {
      setInvestigation(null)
      setLoading(false)
      return
    }

    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)

    if (isDemoModeEnabled()) {
      const demoInvestigation = getDemoAlertInvestigation(alertId)
      if (currentRequest !== requestId.current) return
      if (demoInvestigation) setInvestigation(demoInvestigation)
      else setError('Incident not found in the selected demo scenario.')
      setLoading(false)
      return
    }

    try {
      const data = await get<ApiAlertInvestigation>(`/alerts/${alertId}`, undefined, {
        signal,
        timeoutMs: 15_000,
      })
      if (currentRequest === requestId.current) setInvestigation(data)
    } catch (err: any) {
      if (currentRequest !== requestId.current || err?.name === 'AbortError') return
      setError(err?.message ?? 'Failed to load the incident workspace')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [alertId])

  useEffect(() => {
    const controller = new AbortController()
    void fetchInvestigation(controller.signal)
    return () => {
      requestId.current += 1
      controller.abort()
    }
  }, [fetchInvestigation])

  const applyAlert = useCallback((updated: ApiAlert) => {
    setInvestigation((current) => {
      if (!current) return current
      const nextAlert = { ...current.alert, ...updated }
      const nextTimeline = [...current.timeline]
      if (nextAlert.responded_at && !nextTimeline.some((item) => item.event === 'assigned')) {
        nextTimeline.push({
          event: 'assigned',
          at: nextAlert.responded_at,
          actor_id: nextAlert.assigned_to ?? null,
          detail: 'Alert assigned for field investigation',
          source: 'operator_action',
        })
      }
      if (nextAlert.resolved_at && !nextTimeline.some((item) => item.event === 'resolved')) {
        nextTimeline.push({
          event: 'resolved',
          at: nextAlert.resolved_at,
          actor_id: nextAlert.assigned_to ?? null,
          detail: nextAlert.resolution_notes || 'Alert marked resolved',
          source: 'operator_action',
        })
      }
      nextTimeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      return { ...current, alert: nextAlert, timeline: nextTimeline }
    })
  }, [])

  const assign = useCallback(async (userId = 1) => {
    if (!alertId) return
    if (isDemoModeEnabled()) {
      applyAlert({
        id: alertId,
        status: 'assigned',
        assigned_to: userId,
        responded_at: new Date().toISOString(),
      } as ApiAlert)
      return
    }
    const updated = await post<ApiAlert>(`/alerts/${alertId}/assign`, { user_id: userId })
    applyAlert(updated)
  }, [alertId, applyAlert])

  const resolve = useCallback(async (notes?: string) => {
    if (!alertId) return
    if (isDemoModeEnabled()) {
      applyAlert({
        id: alertId,
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: notes ?? null,
      } as ApiAlert)
      return
    }
    const updated = await patch<ApiAlert>(`/alerts/${alertId}/resolve`, { notes })
    applyAlert(updated)
  }, [alertId, applyAlert])

  return { investigation, loading, error, refetch: fetchInvestigation, assign, resolve }
}

export default useAlertInvestigation
