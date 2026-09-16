"use client"

import React, { useEffect, useState, useMemo } from 'react'
import { get } from '../../lib/api'
import { addWebSocketListener, connectWebSocket } from '../../lib/websocket'
import { getDemoAlerts, isDemoModeEnabled } from '../../lib/demo'
import Spinner from '../ui/Spinner'
import ErrorMessage from '../ui/ErrorMessage'

function capitalize(s: string) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function mapSignalScore(score?: number) {
  const sc = typeof score === 'number' ? Math.round(score * 100) : 65
  let level = 'Moderate'
  if (sc >= 85) level = 'High'
  else if (sc >= 60) level = 'Moderate'
  else level = 'Low'
  return { pct: sc, level }
}

function explain(alert: any) {
  const raw = (alert?.explanation || alert?.message || '').toString().toLowerCase()
  const { pct } = mapSignalScore(alert?.score)

  // Reasoning
  if (raw.includes('tamper') || raw.includes('tampering')) {
    return {
      reason: alert?.meter_id ? `Physical tampering detected on Meter ${alert.meter_id}. Device signals indicate possible removal or interference.` : 'Physical tampering detected on a meter. Device signals indicate possible removal or interference.',
      action: 'Dispatch a field crew for immediate inspection and seal or replace the meter. Flag the account for a targeted audit.',
      confidencePct: pct,
    }
  }

  if (raw.includes('voltage') || raw.includes('spike') || raw.includes('transformer') || raw.includes('overvoltage')) {
    return {
      reason: 'Voltage spike observed; signs point to transformer stress or an overloaded circuit in the area.',
      action: 'Schedule transformer inspection and temporary load balancing. Monitor voltage telemetry at higher frequency.',
      confidencePct: pct,
    }
  }

  if (raw.includes('disconnect') || raw.includes('disconnects') || raw.includes('frequent disconnect')) {
    return {
      reason: 'Frequent disconnects from a meter reduce data fidelity and can indicate physical tampering or communication issues.',
      action: 'Check connectivity logs, verify device health, and schedule a technician visit if problems persist.',
      confidencePct: pct,
    }
  }

  if (raw.includes('anomaly') || raw.includes('bypass') || raw.includes('unbilled') || raw.includes('loss')) {
    return {
      reason: 'Unexpected consumption patterns were detected, suggesting potential bypass or unbilled usage.',
      action: 'Run a targeted audit for the affected meters, compare against historical baselines, and increase sampling for the area.',
      confidencePct: pct,
    }
  }

  // fallback
  return {
    reason: alert?.explanation || 'An unusual pattern was flagged that requires operator review.',
    action: 'Open the detailed analytics view, review related meters and time windows; if repeated, dispatch a field inspection.',
    confidencePct: pct,
  }
}

function ExplanationPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<any | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (isDemoModeEnabled()) {
          if (mounted) setAlert(getDemoAlerts()[0])
          return
        }
        const res = await get<any[]>('/alerts/', undefined, { cacheMs: 10000 })
        if (!mounted) return
        const first = (res && res.length) ? res[0] : null
        setAlert(first)
      } catch (err: any) {
        if (!mounted) return
        if (!isDemoModeEnabled()) setError(err?.message || 'Failed to load explanation')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    // listen for demo/local websocket messages to update the explanation panel in real-time
    const remove = addWebSocketListener((msg: any) => {
      try {
        if (!msg || !msg.type) return
        if (msg.type === 'alert') {
          setAlert(msg.data)
        }
      } catch (e) {}
    })
    if (!isDemoModeEnabled()) {
      try { connectWebSocket() } catch (e) {}
    }
    return () => {
      mounted = false
      remove()
    }
  }, [])

  const ex = useMemo(() => explain(alert || {}), [alert])
  const conf = useMemo(() => mapSignalScore(alert?.score), [alert?.score])
  const barColor = conf.pct >= 85 ? 'bg-red-500' : conf.pct >= 60 ? 'bg-yellow-400' : 'bg-green-400'

  if (loading) return <div className="card"><div className="py-6 flex justify-center"><Spinner /></div></div>
  if (error) return <div className="card"><ErrorMessage message={error} /></div>

  return (
    <div className="card">
      <h3 className="font-medium mb-2">Insight & Next Steps</h3>
      <div className="text-sm text-[var(--muted)]">Clear reason, normalized anomaly score, and recommended actions for the latest detected event.</div>

      <div className="mt-3">
        <div className="text-sm font-semibold">Reason</div>
        <div className="text-sm mt-1">{capitalize(ex.reason)}</div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Signal band</div>
            <div className="text-sm text-[var(--muted)] mt-1">{conf.level} · normalized score {conf.pct}/100</div>
          </div>
          <div className="w-40 ml-4">
            <div className="h-3 bg-white/6 rounded overflow-hidden">
              <div className={`${barColor} h-3`} style={{ width: `${conf.pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-sm font-semibold">Recommended action</div>
        <div className="text-sm mt-1">{capitalize(ex.action)}</div>
      </div>

      <div className="mt-3 text-xs text-[var(--muted)]">Note: This is deterministic operator guidance. The score is not a calibrated probability.</div>
    </div>
  )
}

    export default React.memo(ExplanationPanel)
