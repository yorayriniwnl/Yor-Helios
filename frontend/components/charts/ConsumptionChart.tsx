"use client"

import React, { useEffect, useState } from 'react'
import Spinner from '../ui/Spinner'
import ErrorMessage from '../ui/ErrorMessage'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { get } from '../../lib/api'
import { isDemoModeEnabled } from '../../lib/demo'

const mockData = [
  { time: '00:00', power: 95 },
  { time: '02:00', power: 110 },
  { time: '04:00', power: 125 },
  { time: '06:00', power: 140 },
  { time: '08:00', power: 200 },
  { time: '10:00', power: 240 },
  { time: '12:00', power: 260 },
  { time: '14:00', power: 230 },
  { time: '16:00', power: 210 },
  { time: '18:00', power: 170 },
  { time: '20:00', power: 140 },
  { time: '22:00', power: 110 },
]

type ConsumptionPoint = {
  time: string
  power: number
}

export default function ConsumptionChart({
  meterId,
  data,
}: {
  meterId?: number
  data?: ConsumptionPoint[]
}) {
  const [chartData, setChartData] = useState<ConsumptionPoint[]>(data ?? mockData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchReadings() {
      if (!meterId) return
      if (isDemoModeEnabled()) {
        setChartData(data ?? mockData)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await get<any[]>(`/readings/by-meter/${meterId}`)
        // Map backend readings to chart points
        const pts = (res || [])
          .map((r) => {
            const ts = r.timestamp ? new Date(r.timestamp) : null
            const time = ts ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            return { time, power: Number(r.power_consumption ?? 0) }
          })
          .sort((a, b) => (a.time > b.time ? 1 : -1))
        if (mounted) setChartData(pts.length ? pts : mockData)
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Failed to load readings')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchReadings()
    return () => {
      mounted = false
    }
  }, [data, meterId])

  return (
    <div className="card">
      <h3 className="text-lg font-medium mb-2">Consumption (kW)</h3>
      {loading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : error ? (
        <div className="py-12"><ErrorMessage message={error} /></div>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fill: 'var(--muted)' }} />
              <YAxis tick={{ fill: 'var(--muted)' }} />
              <Tooltip wrapperStyle={{ background: 'var(--bg)', color: 'var(--fg)' }} />
              <Line type="monotone" dataKey="power" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
