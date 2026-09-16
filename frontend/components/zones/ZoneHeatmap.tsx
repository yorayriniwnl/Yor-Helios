"use client"

import React, { useEffect, useState } from 'react'
import { get } from '../../lib/api'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'
import { useRouter } from 'next/navigation'
import { getDemoMeters, getDemoZones, isDemoModeEnabled } from '../../lib/demo'

type ZoneOverview = {
  id: number
  name: string
  city?: string
  state?: string
  meter_count: number
  alert_count: number
  anomaly_count: number
  anomaly_density: number
  risk: string
}

type Meter = {
  id: number
  meter_number: string
  household_name?: string
  status: string
}

function zoneRiskLabel(risk: string) {
  if (!risk) return 'Unknown'
  if (risk === 'critical') return 'Critical — Act now'
  if (risk === 'high') return 'High — Prioritize'
  if (risk === 'medium') return 'Elevated — Review'
  return 'Normal — Monitor'
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const bigint = parseInt(h, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return [r, g, b]
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const s = Math.round(x).toString(16)
        return s.length === 1 ? '0' + s : s
      })
      .join('')
  )
}

function gradientColor(greenHex: string, redHex: string, t: number) {
  const g = Math.max(0, Math.min(1, t))
  const [r1, g1, b1] = hexToRgb(greenHex)
  const [r2, g2, b2] = hexToRgb(redHex)
  const r = lerp(r1, r2, g)
  const gg = lerp(g1, g2, g)
  const b = lerp(b1, b2, g)
  return rgbToHex(r, gg, b)
}

export default function ZoneHeatmap({ columns = 4 }: { columns?: number }) {
  const [zones, setZones] = useState<ZoneOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedZone, setSelectedZone] = useState<ZoneOverview | null>(null)
  const [zoneMeters, setZoneMeters] = useState<Meter[] | null>(null)
  const [loadingMeters, setLoadingMeters] = useState(false)

  const router = useRouter()

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res: ZoneOverview[] = isDemoModeEnabled()
          ? getDemoZones().map((zone) => ({
              id: zone.id,
              name: zone.name,
              city: zone.city,
              state: zone.state,
              meter_count: zone.meter_count ?? 0,
              alert_count: zone.alert_count ?? 0,
              anomaly_count: zone.anomaly_count ?? 0,
              anomaly_density: zone.anomaly_density ?? 0,
              risk: zone.risk ?? 'low',
            }))
          : await get<ZoneOverview[]>('/zones/overview')
        if (!mounted) return
        setZones(res || [])
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Failed to load zones')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const maxDensity = Math.max(0, ...zones.map((z) => z.anomaly_density || 0))
  const columnClass = columns === 2
    ? 'lg:grid-cols-2'
    : columns === 3
    ? 'lg:grid-cols-3'
    : columns === 5
    ? 'lg:grid-cols-5'
    : 'lg:grid-cols-4'

  async function openZone(z: ZoneOverview) {
    setSelectedZone(z)
    setZoneMeters(null)
    setLoadingMeters(true)
    try {
      const res: Meter[] = isDemoModeEnabled()
        ? getDemoMeters()
            .filter((meter) => meter.zone_id === z.id)
            .map((meter) => ({ ...meter, status: meter.status ?? 'unknown' }))
        : await get<Meter[]>(`/meters/by-zone/${z.id}`)
      setZoneMeters(res || [])
    } catch (e) {
      setZoneMeters([])
    } finally {
      setLoadingMeters(false)
    }
  }

  function closeZone() {
    setSelectedZone(null)
    setZoneMeters(null)
  }

  return (
    <div>
      <h2 className="text-lg font-medium mb-3">Zone Priority Map</h2>

      {loading ? (
        <div className="card py-8 flex justify-center"><Skeleton height={140} width="100%" /></div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-400">{error}</div>
      ) : zones.length === 0 ? (
        <div className="card p-6"><EmptyState title="No zones" description="No zones available to display." /></div>
      ) : (
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${columnClass} gap-4`}>
          {zones.map((z) => {
            const norm = maxDensity > 0 ? Math.min(1, z.anomaly_density / maxDensity) : 0
            const color = gradientColor('#671515', '#e84b4b', norm)
            const textColor = norm > 0.6 ? 'text-white' : 'text-black'
            return (
              <button key={z.id} onClick={() => openZone(z)} className="rounded-lg p-4 shadow-sm transform hover:-translate-y-1 transition-transform" style={{ background: color }}>
                <div className={`flex items-center justify-between ${textColor}`}>
                  <div>
                    <div className="font-semibold">{z.name}</div>
                    <div className="text-xs opacity-80">{z.city ?? ''} {z.state ? `· ${z.state}` : ''}</div>
                    {z.risk === 'high' && <div className="text-xs font-semibold text-red-100 mt-1">{zoneRiskLabel(z.risk)}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{(z.anomaly_density || 0).toFixed(2)}</div>
                      <div className="text-xs opacity-80">{z.anomaly_count} detected issues</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Drawer / modal for zone details */}
      {selectedZone && (
        <div className="fixed inset-0 z-50" role="presentation">
          <button type="button" aria-label="Close zone details" className="absolute inset-0 h-full w-full cursor-default bg-black/40" onClick={closeZone} />
          <div
            className="absolute left-1/2 top-1/2 max-h-[calc(100vh-2rem)] w-[calc(100%-1rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-[var(--bg)] p-4 shadow-2xl transition-transform sm:w-[calc(100%-2rem)] sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zone-details-title"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 id="zone-details-title" className="text-xl font-semibold">{selectedZone.name}</h3>
                <div className="text-sm text-[var(--muted)]">Status: {zoneRiskLabel(selectedZone.risk)}</div>
              </div>
              <div>
                <button onClick={closeZone} className="px-3 py-1 rounded bg-white/6">Close</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card">
                <h4 className="font-medium mb-2">Metrics</h4>
                  <div className="text-sm text-[var(--muted)]">
                  <div>Meters: {selectedZone.meter_count}</div>
                  <div>Alerts: {selectedZone.alert_count}</div>
                  <div>Detected issues: {selectedZone.anomaly_count}</div>
                  <div>Priority score: {selectedZone.anomaly_density}</div>
                </div>
              </div>

              <div className="card">
                <h4 className="font-medium mb-2">Top Meters</h4>
                {loadingMeters ? (
                  <div className="py-6 flex justify-center"><Spinner /></div>
                ) : (
                  <div className="space-y-2">
                    {zoneMeters && zoneMeters.length ? (
                      zoneMeters.slice(0, 10).map((m) => (
                        <div key={m.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{m.household_name ?? `Meter ${m.meter_number}`}</div>
                            <div className="text-xs text-[var(--muted)]">{m.meter_number}</div>
                          </div>
                          <div>
                            <button onClick={() => router.push(`/dashboard/meters/${m.id}`)} className="px-2 py-1 rounded bg-white/6">View</button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-[var(--muted)]">No meters found.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
