/**
 * useAnomalies — fetches recent anomaly events with optional meter filter,
 * and prepends real-time anomaly events pushed via WebSocket.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '../lib/api'
import { addWebSocketListener } from '../lib/websocket'
import type { ApiAnomaly } from '../types/api'

export interface UseAnomaliesOptions {
  meterId?: number | null
  limit?: number
  skip?: number
  liveUpdates?: boolean
}

export interface UseAnomaliesResult {
  anomalies: ApiAnomaly[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useAnomalies(opts: UseAnomaliesOptions = {}): UseAnomaliesResult {
  const { meterId = null, limit = 50, skip = 0, liveUpdates = true } = opts

  const [anomalies, setAnomalies] = useState<ApiAnomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const fetchAnomalies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = { limit, skip }
      if (meterId != null) params.meter_id = meterId

      const data = await get<ApiAnomaly[]>('/anomalies/', { params })
      if (isMounted.current) setAnomalies(Array.isArray(data) ? data : [])
    } catch (e: any) {
      if (isMounted.current) setError(e?.message ?? 'Failed to load anomalies')
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [meterId, limit, skip])

  useEffect(() => {
    fetchAnomalies()
  }, [fetchAnomalies])

  // Live prepend from WebSocket
  useEffect(() => {
    if (!liveUpdates) return

    const remove = addWebSocketListener((raw: any) => {
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (msg?.type === 'anomaly' && msg.data) {
          const incoming: ApiAnomaly = msg.data
          if (meterId != null && incoming.meter_id !== meterId) return
          if (!isMounted.current) return
          setAnomalies((prev) => {
            if (prev.some((a) => a.id === incoming.id)) return prev
            return [incoming, ...prev].slice(0, limit * 2)
          })
        }
      } catch {
        // ignore
      }
    })

    return remove
  }, [liveUpdates, meterId, limit])

  return { anomalies, loading, error, refetch: fetchAnomalies }
}

export default useAnomalies
