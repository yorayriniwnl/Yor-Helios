/**
 * useDashboard — fetches the dashboard summary KPIs and recovery metrics.
 *
 * Automatically polls every `pollMs` milliseconds (default 30 s) so the
 * dashboard stays fresh without a full page reload.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '../lib/api'
import { getDemoRecovery, getDemoSummary, isDemoModeEnabled } from '../lib/demo'
import type { DashboardSummary, RecoveryMetrics } from '../types/api'

export interface UseDashboardOptions {
  /** Re-fetch interval in ms. Set to 0 to disable polling. Default: 30 000 */
  pollMs?: number
}

export interface UseDashboardResult {
  summary: DashboardSummary | null
  recovery: RecoveryMetrics | null
  loading: boolean
  error: string | null
  refetch: () => void
}

const DEFAULT_SUMMARY: DashboardSummary = {
  total_meters: 0,
  total_readings: 0,
  total_alerts: 0,
  zone_loss_percentage: 0,
}

export function useDashboard(opts: UseDashboardOptions = {}): UseDashboardResult {
  const { pollMs = 30_000 } = opts

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [recovery, setRecovery] = useState<RecoveryMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchAll = useCallback(async () => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    const requestId = ++requestIdRef.current

    setLoading(true)
    setError(null)

    if (isDemoModeEnabled()) {
      if (mountedRef.current) {
        setSummary(getDemoSummary())
        setRecovery(getDemoRecovery())
        setLoading(false)
      }
      return
    }

    try {
      const [sum, rec] = await Promise.allSettled([
        get<DashboardSummary>('/dashboard/summary', undefined, { signal: abortRef.current.signal }),
        get<RecoveryMetrics>('/dashboard/recovery', undefined, { signal: abortRef.current.signal }),
      ])

      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (sum.status === 'fulfilled') setSummary(sum.value ?? DEFAULT_SUMMARY)
      if (rec.status === 'fulfilled') setRecovery(rec.value ?? null)

      const bothAborted = [sum, rec].every((result) => (
        result.status === 'rejected' &&
        (result.reason?.name === 'AbortError' || result.reason?.name === 'CanceledError')
      ))
      if (sum.status === 'rejected' && rec.status === 'rejected' && !bothAborted && !isDemoModeEnabled()) {
        setError('Failed to load dashboard data')
      }
    } catch (e: any) {
      if (
        mountedRef.current &&
        requestId === requestIdRef.current &&
        e?.name !== 'CanceledError' &&
        e?.name !== 'AbortError'
      ) {
        setError(e?.message ?? 'Unknown error')
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchAll()
    return () => abortRef.current?.abort()
  }, [fetchAll])

  // Polling
  useEffect(() => {
    if (!pollMs) return
    const id = setInterval(fetchAll, pollMs)
    return () => clearInterval(id)
  }, [fetchAll, pollMs])

  return { summary, recovery, loading, error, refetch: fetchAll }
}

export default useDashboard
