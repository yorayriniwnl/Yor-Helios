"use client"

import React, { useEffect, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { get } from '../../lib/api'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import ErrorMessage from '../ui/ErrorMessage'
import { getDemoZones, isDemoModeEnabled } from '../../lib/demo'

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

export default function ZoneComparison() {
  const [zones, setZones] = useState<ZoneOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'chart'>('table')

  const AVG_KWH = 250
  const TARIFF = 10
  const LOSS_FACTOR = 0.03

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        if (isDemoModeEnabled()) {
          if (mounted) setZones(getDemoZones().map((zone) => ({
            id: zone.id,
            name: zone.name,
            city: zone.city,
            state: zone.state,
            meter_count: zone.meter_count || 0,
            alert_count: zone.alert_count || 0,
            anomaly_count: zone.anomaly_count || 0,
            anomaly_density: zone.anomaly_density || 0,
            risk: zone.risk || 'low',
          })))
          return
        }
        const res = await get<ZoneOverview[]>('/zones/overview')
        if (!mounted) return

        setZones(
          (res || []).map((zone: any) => ({
            id: zone.id,
            name: zone.name,
            city: zone.city,
            state: zone.state,
            meter_count: zone.meter_count || 0,
            alert_count: zone.alert_count || 0,
            anomaly_count: zone.anomaly_count || 0,
            anomaly_density: zone.anomaly_density || 0,
            risk: zone.risk || 'low',
          }))
        )
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || 'Failed to load zones')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [])

  function estimateLoss(zone: ZoneOverview) {
    const totalKwh = zone.meter_count * AVG_KWH
    const impactedKwh = totalKwh * (zone.anomaly_density || 0)
    const lostKwh = impactedKwh * LOSS_FACTOR
    return Math.round(lostKwh * TARIFF)
  }

  const chartData = zones.map((zone) => ({
    name: zone.name,
    loss: estimateLoss(zone),
    alerts: zone.alert_count || 0,
    density: Math.round((zone.anomaly_density || 0) * 100),
  }))

  const formatLossTick = (value: number | string) => {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0)
    return `Rs ${Math.round(numeric / 1000)}k`
  }

  const formatTooltipValue = (
    value: number | string | ReadonlyArray<number | string> | undefined,
    name?: number | string
  ) => {
    const raw = Array.isArray(value) ? value[0] : value
    return name === 'loss' ? `Rs ${Number(raw ?? 0).toLocaleString()}` : `${raw ?? ''}`
  }

  const table = (
    <div className="overflow-auto">
      <table className="min-w-full text-left">
        <thead>
          <tr className="text-xs text-[var(--muted)]">
            <th className="px-3 py-2">Zone</th>
            <th className="px-3 py-2">Risk</th>
            <th className="px-3 py-2">Meters</th>
            <th className="px-3 py-2">Alerts</th>
            <th className="px-3 py-2">Priority Score</th>
            <th className="px-3 py-2">Est. Loss (monthly)</th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => (
            <tr key={zone.id} className="border-t border-white/6">
              <td className="px-3 py-2 align-top">{zone.name}</td>
              <td className="px-3 py-2 align-top">{zone.risk.toUpperCase()}</td>
              <td className="px-3 py-2 align-top">{zone.meter_count}</td>
              <td className="px-3 py-2 align-top">{zone.alert_count}</td>
              <td className="px-3 py-2 align-top">{zone.anomaly_density.toFixed(2)}</td>
              <td className="px-3 py-2 align-top">
                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(estimateLoss(zone))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const chart = (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.36} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" tickFormatter={formatLossTick} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}`} />
          <Tooltip formatter={formatTooltipValue} />
          <Legend />
          <Bar yAxisId="left" dataKey="loss" name="Est. Loss (INR)" fill="#ff8a7f" />
          <Bar yAxisId="right" dataKey="alerts" name="# Alerts" fill="#c4c4c4" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  if (loading) {
    return <div className="card py-6 flex justify-center"><Spinner /></div>
  }

  if (error) {
    return <div className="card p-4"><ErrorMessage message={error} /></div>
  }

  if (!zones.length) {
    return <div className="card p-6"><EmptyState title="No zones" description="No zones available to compare - verify data ingestion." /></div>
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-medium">Zone Comparison</h3>
          <div className="text-sm text-[var(--muted)]">
            Compare priority, estimated recoverable losses and recommended actions across zones.
          </div>
        </div>
        <div>
          <button
            onClick={() => setView('table')}
            className={`mr-2 rounded px-3 py-1 ${view === 'table' ? 'bg-[var(--accent)] text-white' : 'bg-white/6'}`}
          >
            Table
          </button>
          <button
            onClick={() => setView('chart')}
            className={`rounded px-3 py-1 ${view === 'chart' ? 'bg-[var(--accent)] text-white' : 'bg-white/6'}`}
          >
            Chart
          </button>
        </div>
      </div>

      {view === 'table' ? table : chart}
    </div>
  )
}
