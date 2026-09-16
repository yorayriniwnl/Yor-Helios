"use client"

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup } from 'react-leaflet'
import HeatmapLayer from './HeatmapLayer'
import { get } from '../../lib/api'
import { getDemoAlerts, getDemoMeters, getDemoZones, isDemoModeEnabled } from '../../lib/demo'

type LatLng = [number, number]

type ZoneOverview = {
  id: number
  name: string
  meter_count?: number
  alert_count?: number
  anomaly_density?: number
}

type Meter = {
  id: number
  meter_number: string
  zone_id?: number
  latitude?: number
  longitude?: number
}

type Alert = {
  id: number
  meter_id?: number
  type: string
  severity?: string
  score?: number
  created_at?: string
}

type ZoneShape = {
  id: number
  name: string
  polygon: LatLng[]
  anomaly_density: number
  meter_count: number
  alert_count: number
}

type Hotspot = {
  id: number
  name: string
  lat: number
  lng: number
  severity: number
}

const FALLBACK_CENTER: LatLng = [12.9716, 77.5946] // Bengaluru — matches the rest of the app's demo data

function densityColor(v: number) {
  const t = Math.max(0, Math.min(1, v))
  if (t >= 0.8) return '#e84b4b'
  if (t >= 0.66) return '#ff8a7f'
  if (t >= 0.33) return '#e7bd78'
  return '#671515'
}

function severityToNumber(a: Alert): number {
  if (typeof a.score === 'number') return Math.max(0, Math.min(1, a.score))
  switch (a.severity) {
    case 'critical':
      return 0.95
    case 'high':
      return 0.75
    case 'medium':
      return 0.5
    default:
      return 0.3
  }
}

/** A simple padded bounding box around a set of points — good enough to sketch a zone's footprint without a full convex-hull implementation. */
function boundingBoxPolygon(points: LatLng[], fallbackCenter: LatLng): LatLng[] {
  if (points.length === 0) {
    const [lat, lng] = fallbackCenter
    const d = 0.01
    return [
      [lat + d, lng - d],
      [lat + d, lng + d],
      [lat - d, lng + d],
      [lat - d, lng - d],
    ]
  }
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
  }
  const padLat = Math.max(0.004, (maxLat - minLat) * 0.25)
  const padLng = Math.max(0.004, (maxLng - minLng) * 0.25)
  return [
    [maxLat + padLat, minLng - padLng],
    [maxLat + padLat, maxLng + padLng],
    [minLat - padLat, maxLng + padLng],
    [minLat - padLat, minLng - padLng],
  ]
}

export default function MapLayer() {
  const [zones, setZones] = useState<ZoneOverview[]>([])
  const [meters, setMeters] = useState<Meter[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [z, m, a] = isDemoModeEnabled()
          ? [getDemoZones(), getDemoMeters(), getDemoAlerts()]
          : await Promise.all([
              get<ZoneOverview[]>('/zones/overview').catch(() => []),
              get<Meter[]>('/meters/').catch(() => []),
              get<Alert[]>('/alerts/', { params: { limit: 30 } }).catch(() => []),
            ])
        if (cancelled) return
        setZones(Array.isArray(z) ? z : [])
        setMeters(Array.isArray(m) ? m : [])
        setAlerts(Array.isArray(a) ? a : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const metersByZone = useMemo(() => {
    const map = new Map<number, Meter[]>()
    for (const m of meters) {
      if (m.zone_id == null) continue
      const list = map.get(m.zone_id) || []
      list.push(m)
      map.set(m.zone_id, list)
    }
    return map
  }, [meters])

  const meterById = useMemo(() => {
    const map = new Map<number, Meter>()
    for (const m of meters) map.set(m.id, m)
    return map
  }, [meters])

  const center = useMemo<LatLng>(() => {
    const withCoords = meters.filter((m) => typeof m.latitude === 'number' && typeof m.longitude === 'number')
    if (withCoords.length === 0) return FALLBACK_CENTER
    const lat = withCoords.reduce((sum, m) => sum + (m.latitude as number), 0) / withCoords.length
    const lng = withCoords.reduce((sum, m) => sum + (m.longitude as number), 0) / withCoords.length
    return [lat, lng]
  }, [meters])

  const zoneShapes = useMemo<ZoneShape[]>(() => {
    return zones.map((z) => {
      const zoneMeters = (metersByZone.get(z.id) || []).filter(
        (m) => typeof m.latitude === 'number' && typeof m.longitude === 'number'
      )
      const points: LatLng[] = zoneMeters.map((m) => [m.latitude as number, m.longitude as number])
      return {
        id: z.id,
        name: z.name,
        polygon: boundingBoxPolygon(points, center),
        anomaly_density: z.anomaly_density ?? 0,
        meter_count: z.meter_count ?? zoneMeters.length,
        alert_count: z.alert_count ?? 0,
      }
    })
  }, [zones, metersByZone, center])

  const hotspots = useMemo<Hotspot[]>(() => {
    const out: Hotspot[] = []
    for (const a of alerts) {
      if (a.meter_id == null) continue
      const meter = meterById.get(a.meter_id)
      if (!meter || typeof meter.latitude !== 'number' || typeof meter.longitude !== 'number') continue
      out.push({
        id: a.id,
        name: meter.meter_number,
        lat: meter.latitude,
        lng: meter.longitude,
        severity: severityToNumber(a),
      })
    }
    return out
  }, [alerts, meterById])

  const heatPoints = useMemo<[number, number, number][]>(() => {
    const pts: [number, number, number][] = hotspots.map((h) => [h.lat, h.lng, h.severity])
    zoneShapes.forEach((z) => {
      if (!z.polygon.length) return
      const latSum = z.polygon.reduce((s, [lat]) => s + lat, 0)
      const lngSum = z.polygon.reduce((s, [, lng]) => s + lng, 0)
      pts.push([latSum / z.polygon.length, lngSum / z.polygon.length, z.anomaly_density])
    })
    return pts
  }, [hotspots, zoneShapes])

  const selectedZone = zoneShapes.find((z) => z.id === selectedZoneId) || null
  const selectedZoneAlerts = useMemo(() => {
    if (!selectedZone) return []
    const zoneMeterIds = new Set((metersByZone.get(selectedZone.id) || []).map((m) => m.id))
    return alerts
      .filter((a) => a.meter_id != null && zoneMeterIds.has(a.meter_id))
      .sort((a, b) => severityToNumber(b) - severityToNumber(a))
      .slice(0, 5)
  }, [selectedZone, metersByZone, alerts])

  const handleZoneClick = useCallback((zoneId: number) => {
    setSelectedZoneId(zoneId)
  }, [])

  const closePanel = useCallback(() => {
    setSelectedZoneId(null)
  }, [])

  if (loading) {
    return (
      <div className="relative flex items-center justify-center" style={{ height: '360px' }}>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          Loading zone map…
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      <MapContainer center={center} zoom={12} style={{ height: '360px', width: '100%' }}>
        <HeatmapLayer points={heatPoints} radius={35} blur={20} max={1} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {zoneShapes.map((z) => (
          <Polygon
            key={z.id}
            positions={z.polygon}
            pathOptions={{ color: densityColor(z.anomaly_density), weight: 2, fillOpacity: 0.18 }}
            eventHandlers={{ click: () => handleZoneClick(z.id) }}
          />
        ))}
        {hotspots.map((h) => (
          <CircleMarker
            key={h.id}
            center={[h.lat, h.lng]}
            radius={6 + h.severity * 8}
            pathOptions={{ color: densityColor(h.severity), fillOpacity: 1 }}
          >
            <Popup>
              <div className="text-sm font-medium">{h.name}</div>
              <div className="text-xs text-[var(--muted)]">Severity: {h.severity.toFixed(2)}</div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {selectedZone && (
        <div className="absolute right-0 top-0 z-50 h-full panel max-w-[calc(100%-1rem)] overflow-auto p-4" role="dialog" aria-modal="true" aria-labelledby="map-zone-title">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 id="map-zone-title" className="text-lg font-semibold">{selectedZone.name}</h3>
              <div className="text-sm text-[var(--muted)]">
                Anomaly density: {(selectedZone.anomaly_density * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <button onClick={closePanel} className="px-2 py-1 rounded bg-white/6">
                Close
              </button>
            </div>
          </div>

          <div className="mb-3">
            <div className="text-sm text-[var(--muted)] mb-2">
              {selectedZone.meter_count} meters &middot; {selectedZone.alert_count} alerts
            </div>
            <div className="space-y-2">
              {selectedZoneAlerts.length === 0 && (
                <div className="text-xs text-[var(--muted)]">No recent alerts in this zone.</div>
              )}
              {selectedZoneAlerts.map((a) => {
                const severity = severityToNumber(a)
                return (
                  <div key={a.id} className="p-2 rounded bg-[rgba(255,255,255,0.02)] border border-white/6">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{a.type}</div>
                      <div
                        className={`text-xs font-semibold px-2 py-1 rounded ${
                          severity >= 0.8
                            ? 'bg-red-500 text-white'
                            : severity >= 0.66
                            ? 'bg-pink-400 text-black'
                            : severity >= 0.33
                            ? 'bg-yellow-400 text-black'
                            : 'bg-green-400 text-black'
                        }`}
                      >
                        {(severity * 100).toFixed(0)}%
                      </div>
                    </div>
                    {a.created_at && (
                      <div className="text-xs text-[var(--muted)]">{new Date(a.created_at).toLocaleString()}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
