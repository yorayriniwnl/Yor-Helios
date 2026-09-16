"use client"

import React, { useMemo } from 'react'
import dynamic from 'next/dynamic'
import KpiCards from '../../components/dashboard/KpiCards'
import LiveFeed from '../../components/live/LiveFeed'
import SeverityBarChart from '../../components/charts/SeverityBarChart'
import DemoToggle from '../../components/ui/DemoToggle'
import GuidedDemo from '../../components/ui/GuidedDemo'
import ShockAlertButton from '../../components/ui/ShockAlertButton'
import ExplanationPanel from '../../components/impact/ExplanationPanel'
import ErrorMessage from '../../components/ui/ErrorMessage'
import { useDashboard, useAlerts } from '../../hooks'
import { isDemoModeEnabled } from '../../lib/demo'
import { severityFromScore } from '../../features/alerts'
import type { AlertSeverity } from '../../types/api'

const ConsumptionChart   = dynamic(() => import('../../components/charts/ConsumptionChart'),           { ssr: false })
const TrendLineChart     = dynamic(() => import('../../components/charts/TrendLineChart'),              { ssr: false })
const ForecastPanel      = dynamic(() => import('../../components/impact/ForecastPanel'),               { ssr: false })
const MapLayer           = dynamic(() => import('../../components/maps/MapLayer'),                      { ssr: false })
const ImpactComparison   = dynamic(() => import('../../components/impact/ImpactComparison'),            { ssr: false })
const CostSavingsCalc    = dynamic(() => import('../../components/impact/CostSavingsCalculator'),       { ssr: false })
const ZoneComparison     = dynamic(() => import('../../components/zones/ZoneComparison'),               { ssr: false })
const OperatorWorkload   = dynamic(() => import('../../components/operators/OperatorWorkloadPanel'),    { ssr: false })
const ThreeInspectorAvatar = dynamic(() => import('../../components/hero/ThreeInspectorAvatar'),       { ssr: false })

type SeverityBucket = {
  name: string
} & Record<AlertSeverity, number>

export default function DashboardPage() {
  const { summary, loading: loadingSummary, error: errorSummary } = useDashboard({ pollMs: 30_000 })
  const { alerts, loading: loadingAlerts, error: errorAlerts }    = useAlerts({ limit: 100 })

  // Build last-7-days severity buckets for bar chart
  const severityData = useMemo<SeverityBucket[]>(() => {
    const now = new Date()
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now)
      d.setDate(now.getDate() - (6 - i))
      const label = d.toLocaleDateString(undefined, { weekday: 'short' })
      const counts: Record<AlertSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 }
      alerts.forEach((a) => {
        const ts = a.created_at ? new Date(a.created_at) : new Date()
        if (ts.toDateString() !== d.toDateString()) return
        const sev = a.severity ?? severityFromScore(a.score)
        counts[sev] = (counts[sev] ?? 0) + 1
      })
      return { name: label, ...counts }
    })
  }, [alerts])

  const alertsTrend = useMemo(() =>
    severityData.map((b) => ({
      name: b.name,
      value: (b.low ?? 0) + (b.medium ?? 0) + (b.high ?? 0) + (b.critical ?? 0),
    })),
    [severityData]
  )

  const visibleCriticalAlerts = useMemo(
    () => alerts.filter((alert) => alert.severity === 'critical' && alert.status !== 'resolved').length,
    [alerts],
  )
  const visibleOpenAlerts = useMemo(
    () => alerts.filter((alert) => alert.status !== 'resolved').length,
    [alerts],
  )
  const demoMode = isDemoModeEnabled()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Real-time energy intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DemoToggle />
          <GuidedDemo />
          <ShockAlertButton />
          <ThreeInspectorAvatar alert={alerts[0]} size={72} />
        </div>
      </div>

      {(errorSummary || errorAlerts) && (
        <ErrorMessage message={errorSummary ?? errorAlerts ?? 'Failed to load data'} />
      )}

      {/* KPIs */}
      <div data-demo-id="kpis">
        <KpiCards
          loading={loadingSummary}
          totalMeters={summary?.total_meters ?? 0}
          totalAlerts={summary?.total_alerts ?? 0}
          openAlerts={demoMode ? visibleOpenAlerts : (summary?.open_alerts ?? summary?.total_alerts ?? 0)}
          criticalAlerts={demoMode ? visibleCriticalAlerts : (summary?.critical_alerts ?? visibleCriticalAlerts)}
          totalReadings={summary?.total_readings ?? 0}
          zoneLossPct={summary?.zone_loss_percentage}
        />
      </div>

      {/* Main row: chart + live feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="min-w-0 lg:col-span-2 space-y-6">
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <h2 className="font-semibold text-sm mb-3">Power Consumption</h2>
            <ConsumptionChart meterId={1} />
          </div>

          {/* Severity bar chart */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <h2 className="font-semibold text-sm mb-3">Alerts by Severity (7d)</h2>
            <SeverityBarChart
              data={severityData}
              categories={['low', 'medium', 'high', 'critical']}
              colors={['#671515', '#e7bd78', '#ff8a7f', '#e84b4b']}
            />
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div data-demo-id="livefeed">
            <LiveFeed />
          </div>
          <div data-demo-id="evidence">
            <ExplanationPanel />
          </div>
        </section>
      </div>

      {/* Trend + zone map row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          className="min-w-0 rounded-xl p-4 space-y-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          data-demo-id="trend"
        >
          <h2 className="font-semibold text-sm">Alert Trend (7d)</h2>
          <TrendLineChart data={alertsTrend} xKey="name" yKey="value" color="var(--accent)" />
          <ForecastPanel />
        </div>

        <div
          className="min-w-0 rounded-xl p-4 space-y-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          data-demo-id="zones"
        >
          <h2 className="font-semibold text-sm">Zone Risk Heatmap</h2>
          <div style={{ height: 220 }}>
            <MapLayer />
          </div>
          <ZoneComparison />
        </div>
      </div>

      {/* Impact row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ImpactComparison />
        <CostSavingsCalc />
      </div>

      {/* Operator workload */}
      <div data-demo-id="operators">
        <OperatorWorkload />
      </div>
    </div>
  )
}
