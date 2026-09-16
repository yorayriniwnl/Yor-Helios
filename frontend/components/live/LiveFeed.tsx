"use client"

import React, { useEffect, useState } from 'react'
import { get } from '../../lib/api'
import connectWebSocket, { addWebSocketListener } from '../../lib/websocket'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import { getDemoAlerts, isDemoModeEnabled } from '../../lib/demo'

type FeedType = 'reading' | 'alert' | 'anomaly'

type FeedItem = {
  id: string
  type: FeedType
  timestamp?: string
  title: string
  subtitle?: string
  severity?: string
  raw?: any
  isNew?: boolean
}

function mapSeverityFromScore(score?: number) {
  if (score == null) return 'medium'
  if (score >= 0.8) return 'critical'
  if (score >= 0.66) return 'high'
  if (score >= 0.33) return 'medium'
  return 'low'
}

function normalizeSeverity(severity?: string, score?: number): string {
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') {
    return severity
  }
  return mapSeverityFromScore(score)
}

function severityLabel(s: string | undefined) {
  switch (s) {
    case 'critical':
      return 'CRITICAL'
    case 'high':
      return 'HIGH RISK'
    case 'medium':
      return 'ELEVATED'
    case 'low':
    default:
      return 'NORMAL'
  }
}

function severityColor(s: string | undefined) {
  switch (s) {
    case 'critical':
      return '#e84b4b'
    case 'high':
      return '#ff8a7f'
    case 'medium':
      return '#e7bd78'
    case 'low':
    default:
      return '#c4c4c4'
  }
}

function formatFeedTitle(a: any) {
  const raw = (a.explanation || a.type || `Alert ${a.id}`) as string
  const txt = raw.toLowerCase()
  const sev = normalizeSeverity(a.severity, a.score)

  if (txt.includes('tamper') || txt.includes('tampering')) return 'Potential Theft Detected'
  if (txt.includes('spike') || txt.includes('voltage') || txt.includes('overvoltage')) return 'Transformer Stress Alert'
  if ((txt.includes('anomaly') || txt.includes('critical')) && (sev === 'high' || sev === 'critical')) return 'High Risk Zone'

  return raw
}

export default function LiveFeed({ maxItems = 100 }: { maxItems?: number }) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function seed() {
      setLoading(true)
      setError(null)
      try {
        const [alerts, anomalies] = isDemoModeEnabled()
          ? [getDemoAlerts(), []]
          : await Promise.all([
              get<any[]>('/alerts/', undefined, { cacheMs: 10000 }).catch(() => []),
              get<any[]>('/anomalies/', undefined, { cacheMs: 10000 }).catch(() => []),
            ])

        const mappedAlerts: FeedItem[] = (alerts || []).map((a) => ({
          id: `alert-${a.id}`,
          type: 'alert',
          timestamp: a.created_at || a.timestamp,
          title: formatFeedTitle(a),
          subtitle: a.meter_id ? `Meter ${a.meter_id}` : undefined,
          severity: normalizeSeverity(a.severity, a.score),
          raw: a,
        }))

        const mappedAnoms: FeedItem[] = (anomalies || []).map((a) => ({
          id: `anomaly-${a.id}`,
          type: 'anomaly',
          timestamp: a.created_at || a.timestamp,
          title: formatFeedTitle(a),
          subtitle: a.meter_id ? `Meter ${a.meter_id}` : undefined,
          severity: a.severity || mapSeverityFromScore(a.score),
          raw: a,
        }))

        const combined = [...mappedAlerts, ...mappedAnoms].sort((x, y) => {
          const tx = x.timestamp ? new Date(x.timestamp).getTime() : 0
          const ty = y.timestamp ? new Date(y.timestamp).getTime() : 0
          return ty - tx
        })

        if (mounted) setItems(combined.slice(0, maxItems))
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Failed to load live feed')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    seed()

    // WebSocket listener
    function listener(msg: any) {
      if (!msg || !msg.type) return
      let it: FeedItem | null = null
      try {
        if (msg.type === 'alert') {
          const a = msg.data || {}
          it = {
            id: `alert-${a.id ?? Math.random().toString(36).slice(2, 9)}`,
            type: 'alert',
            timestamp: a.created_at || a.timestamp || new Date().toISOString(),
            title: a.explanation || a.type || `Alert ${a.id}`,
            subtitle: a.meter_id ? `Meter ${a.meter_id}` : undefined,
            severity: normalizeSeverity(a.severity, a.score),
            raw: a,
            isNew: true,
          }
        } else if (msg.type === 'reading') {
          const r = msg.data || {}
          it = {
            id: `reading-${r.id ?? Math.random().toString(36).slice(2, 9)}`,
            type: 'reading',
            timestamp: r.timestamp || new Date().toISOString(),
            title: `Meter ${r.meter_id ?? '–'}: ${Number(r.power_consumption ?? 0).toFixed(1)} W`,
            subtitle: r.meter_id ? `Meter ${r.meter_id}` : undefined,
            raw: r,
            isNew: true,
          }
        } else if (msg.type === 'anomaly') {
          const a = msg.data || {}
          it = {
            id: `anomaly-${a.id ?? Math.random().toString(36).slice(2, 9)}`,
            type: 'anomaly',
            timestamp: a.created_at || a.timestamp || new Date().toISOString(),
            title: a.explanation || a.type || `Anomaly ${a.id}`,
            subtitle: a.meter_id ? `Meter ${a.meter_id}` : undefined,
            severity: normalizeSeverity(a.severity, a.score),
            raw: a,
            isNew: true,
          }
        }
      } catch (e) {
        // ignore
      }

      if (it) {
        setItems((prev) => {
          const next = [it!, ...prev].slice(0, maxItems)
          return next
        })

        // clear isNew flag after a short highlight period
        setTimeout(() => {
          setItems((prev) => prev.map((x) => (x.id === it!.id ? { ...x, isNew: false } : x)))
        }, 3500)
      }
    }

    const remove = addWebSocketListener(listener)
    if (!isDemoModeEnabled()) {
      try {
        connectWebSocket()
      } catch (e) {
        // ignore
      }
    }

    return () => {
      mounted = false
      try {
        remove()
      } catch (e) {
        // ignore
      }
    }
  }, [maxItems])

  return (
    <div className="card">
      <h3 className="text-lg font-medium mb-3">Live Feed</h3>
      {loading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : error ? (
        <div className="py-4 text-sm text-red-400">{error}</div>
      ) : items.length === 0 ? (
        <EmptyState title="No activity" description="No recent readings or alerts." />
      ) : (
        <ul className="space-y-2 max-h-[480px] overflow-auto">
          {items.map((it) => {
            const color = severityColor(it.severity)
            const zoneLabel = it.raw?.zone_name || it.raw?.zone?.name || (it.raw?.zone_id ? `Zone ${it.raw.zone_id}` : undefined)
            return (
              <li
                key={it.id}
                data-alert-id={it.type === 'alert' ? it.raw?.id : undefined}
                className={`interactive-item flex items-start gap-3 p-3 rounded-md pop-in ${it.isNew ? 'ring-2 ring-offset-1 ring-white/8' : ''}`}
                style={{ transition: 'transform .28s cubic-bezier(.16,.84,.2,1), boxShadow .28s, background .2s' }}
              >
                <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 44 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: color, boxShadow: `0 6px 14px ${color}55` }} />
                </div>

                <div className="flex-1">
                  <div className={`font-medium ${it.type === 'alert' && it.severity === 'critical' ? 'text-white' : ''}`}>{it.title}</div>
                  <div className="mt-1 flex items-center gap-3">
                    {it.subtitle && <div className="text-xs text-[var(--muted)]">{it.subtitle}</div>}
                    {zoneLabel && <div className="text-xs uppercase" style={{ color }}><strong>{zoneLabel}</strong></div>}
                    <div className="text-xs text-[var(--muted)]">{it.timestamp ? new Date(it.timestamp).toLocaleString() : ''}</div>
                  </div>
                </div>

                <div className="text-xs text-[var(--muted)] self-start">
                  <div style={{ background: color, color: '#000000', padding: '6px 8px', borderRadius: 6, fontWeight: 700, minWidth: 72, textAlign: 'center' }}>{severityLabel(it.severity)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
