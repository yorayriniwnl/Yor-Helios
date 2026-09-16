/**
 * useMeters — fetches and manages the meter list, with optional zone filtering.
 *
 * Also exposes `fetchMeter(id)` for drilling into a single meter's details.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '../lib/api'
import { getDemoMeters, isDemoModeEnabled } from '../lib/demo'
import type { ApiMeter } from '../types/api'

export interface UseMetersOptions {
  zoneId?: number | null
  skip?: number
  limit?: number
}

export interface UseMetersResult {
  meters: ApiMeter[]
  loading: boolean
  error: string | null
  refetch: () => void
  fetchMeter: (id: number) => Promise<ApiMeter | null>
}

export function useMeters(opts: UseMetersOptions = {}): UseMetersResult {
  const { zoneId = null, skip = 0, limit = 100 } = opts

  const [meters, setMeters] = useState<ApiMeter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const fetchMeters = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (isDemoModeEnabled()) {
      const demoMeters = getDemoMeters().filter((meter) => zoneId == null || meter.zone_id === zoneId)
      if (isMounted.current) {
        setMeters(demoMeters.slice(skip, skip + limit))
        setLoading(false)
      }
      return
    }
    try {
      let data: ApiMeter[]
      if (zoneId != null) {
        data = await get<ApiMeter[]>(`/meters/by-zone/${zoneId}`, { params: { skip, limit } })
      } else {
        data = await get<ApiMeter[]>('/meters/', { params: { skip, limit } })
      }
      if (isMounted.current) setMeters(Array.isArray(data) ? data : [])
    } catch (e: any) {
      if (isMounted.current) setError(e?.message ?? 'Failed to load meters')
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [zoneId, skip, limit])

  useEffect(() => {
    fetchMeters()
  }, [fetchMeters])

  const fetchMeter = useCallback(async (id: number): Promise<ApiMeter | null> => {
    if (isDemoModeEnabled()) return getDemoMeters().find((meter) => meter.id === id) ?? null
    try {
      return await get<ApiMeter>(`/meters/${id}`)
    } catch {
      return null
    }
  }, [])

  return { meters, loading, error, refetch: fetchMeters, fetchMeter }
}

export default useMeters
