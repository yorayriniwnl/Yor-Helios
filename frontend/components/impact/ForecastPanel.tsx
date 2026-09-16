"use client"

import React, { useEffect, useState } from 'react'
import { get } from '../../lib/api'
import { getDemoAlerts, isDemoModeEnabled } from '../../lib/demo'
import Spinner from '../ui/Spinner'
import ErrorMessage from '../ui/ErrorMessage'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Point = { time: string; score: number }

export default function ForecastPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Point[]>([])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = isDemoModeEnabled() ? getDemoAlerts() : await get<any[]>('/alerts/', { params: { limit: 200 } })
        if (!mounted) return

        const now = Date.now()
        const H = 24
        const msHour = 1000 * 60 * 60

        // build hourly buckets for last H hours (0 oldest .. H-1 most recent)
        const buckets = new Array<number>(H).fill(0);
        (res || []).forEach((a) => {
          const ts = new Date(a.created_at || a.timestamp || now).getTime()
          const deltaHours = Math.floor((now - ts) / msHour)
          if (deltaHours >= 0 && deltaHours < H) {
            buckets[H - 1 - deltaHours]++
          }
        })

        // simple linear regression on buckets (x: 0..H-1)
        const N = H
        const xs = Array.from({ length: N }, (_, i) => i)
        const ys = buckets.slice()
        const sumX = xs.reduce((s, x) => s + x, 0)
        const sumY = ys.reduce((s, y) => s + y, 0)
        const sumXX = xs.reduce((s, x) => s + x * x, 0)
        const sumXY = xs.reduce((s, x) => s + x * ys[x], 0)
        const denom = N * sumXX - sumX * sumX
        let slope = 0
        let intercept = N > 0 ? sumY / N : 0
        if (denom !== 0) {
          slope = (N * sumXY - sumX * sumY) / denom
          intercept = (sumY - slope * sumX) / N
        }

        // Compute a bounded anomaly-score normalization (mean + 2*std).
        const mean = N > 0 ? sumY / N : 0
        const variance = N > 0 ? ys.reduce((s, y) => s + Math.pow(y - mean, 2), 0) / N : 0
        const std = Math.sqrt(Math.max(0, variance))
        const baseline = Math.max(1, mean + 2 * std)

        // predict next H hours
        const preds: Point[] = []
        for (let j = 0; j < H; j++) {
          const x = N + j
          let ypred = intercept + slope * x
          if (ypred < 0) ypred = 0
          const score = Math.min(0.99, ypred / baseline)
          const ts = new Date(now + (j + 1) * msHour)
          const label = ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          preds.push({ time: label, score: Math.round(score * 100) })
        }

        setData(preds)
      } catch (err: any) {
        if (!isDemoModeEnabled()) setError(err?.message || 'Failed to compute forecast')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) return <div className="card"><div className="py-6 flex justify-center"><Spinner /></div></div>
  if (error) return <div className="card"><ErrorMessage message={error} /></div>

  const peak = data.reduce((acc, p) => (p.score > acc.score ? p : acc), { time: '', score: 0 })
  const formatPercentTick = (value: number | string) => `${value}%`
  const formatPercentTooltip = (value: number | string | ReadonlyArray<number | string> | undefined) => {
    const raw = Array.isArray(value) ? value[0] : value
    return `${raw ?? 0}%`
  }

  return (
    <div className="card">
      <h3 className="font-medium mb-2">24h Anomaly Score Outlook</h3>
      <p className="text-sm text-[var(--muted)] mb-3">A lightweight demo projection from recent alert counts; it is not a calibrated probability.</p>

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.36} />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} interval={3} />
            <YAxis domain={[0, 100]} tickFormatter={formatPercentTick} />
            <Tooltip formatter={formatPercentTooltip} />
            <Line type="monotone" dataKey="score" stroke="#ff8a7f" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 text-sm text-[var(--muted)]">Peak projected score: <span className="font-semibold">{peak.score}/100</span> at <span className="font-semibold">{peak.time}</span></div>
    </div>
  )
}
