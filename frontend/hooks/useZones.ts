/**
 * useZones — fetches the zone list with risk levels and overview analytics.
 *
 * Provides `fetchZoneDetail(id)` for drilling into a single zone's full
 * analytics including meter count, alert count and loss percentage.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { get } from '../lib/api'
import { getDemoZones, isDemoModeEnabled } from '../lib/demo'
import type { ApiZone, ZoneOverview } from '../types/api'

export interface UseZonesOptions {
  skip?: number
  limit?: number
}

export interface UseZonesResult {
  zones: ZoneOverview[]
  loading: boolean
  error: string | null
  refetch: () => void
  fetchZoneDetail: (id: number) => Promise<ZoneOverview | null>
}

export function useZones(opts: UseZonesOptions = {}): UseZonesResult {
  const { skip = 0, limit = 100 } = opts

  const [zones, setZones] = useState<ZoneOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const fetchZones = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (isDemoModeEnabled()) {
      if (isMounted.current) {
        setZones(getDemoZones().slice(skip, skip + limit))
        setLoading(false)
      }
      return
    }
    try {
      // Try the enriched overview endpoint first; fall back to plain list
      let data: ZoneOverview[] = []
      try {
        data = await get<ZoneOverview[]>('/zones/overview', { params: { skip, limit } })
      } catch {
        const plain = await get<ApiZone[]>('/zones/', { params: { skip, limit } })
        data = Array.isArray(plain) ? plain : []
      }
      if (isMounted.current) setZones(data)
    } catch (e: any) {
      if (isMounted.current && !isDemoModeEnabled()) setError(e?.message ?? 'Failed to load zones')
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [skip, limit])

  useEffect(() => {
    fetchZones()
  }, [fetchZones])

  const fetchZoneDetail = useCallback(async (id: number): Promise<ZoneOverview | null> => {
    if (isDemoModeEnabled()) return getDemoZones().find((zone) => zone.id === id) ?? null
    try {
      return await get<ZoneOverview>(`/zones/${id}`)
    } catch {
      return null
    }
  }, [])

  return { zones, loading, error, refetch: fetchZones, fetchZoneDetail }
}

export default useZones
