"use client"

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useZones } from '../../../hooks'
import Spinner from '../../../components/ui/Spinner'
import ErrorMessage from '../../../components/ui/ErrorMessage'
import EmptyState from '../../../components/ui/EmptyState'
import Skeleton from '../../../components/ui/Skeleton'
import { zoneRiskBadge, sortZonesByRisk, formatLossPct } from '../../../features/zones'

const ZoneHeatmap = dynamic(() => import('../../../components/zones/ZoneHeatmap'), { ssr: false })
const ZoneComparison = dynamic(() => import('../../../components/zones/ZoneComparison'), { ssr: false })

export default function ZonesPage() {
  const { zones, loading, error, refetch } = useZones()

  const sorted = sortZonesByRisk(zones as any[])

  const totals = zones.reduce(
    (acc, z: any) => ({
      meters: acc.meters + (z.meter_count ?? 0),
      alerts: acc.alerts + (z.alert_count ?? 0),
      anomalies: acc.anomalies + (z.anomaly_count ?? 0),
    }),
    { meters: 0, alerts: 0, anomalies: 0 }
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Zones</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Grid zones and anomaly risk overview
          </p>
        </div>
        <button
          onClick={refetch}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
          style={{ color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Zones',    value: zones.length },
          { label: 'Total Meters',   value: totals.meters },
          { label: 'Active Alerts',  value: totals.alerts },
          { label: 'Anomaly Events', value: totals.anomalies },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl p-4"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            {loading ? (
              <Skeleton height={32} />
            ) : (
              <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
                {k.value.toLocaleString()}
              </div>
            )}
            <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Heatmap */}
      {!loading && zones.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--card-border)', height: 340 }}
        >
          <ZoneHeatmap />
        </div>
      )}

      {/* Zone table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="px-4 py-3 border-b border-white/6">
          <h2 className="font-semibold text-sm">Zone Details</h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} height={40} />)}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState message="No zones found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  {['Zone', 'City', 'Meters', 'Alerts', 'Anomalies', 'Loss %', 'Risk'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((z: any, idx) => (
                  <tr
                    key={z.id}
                    className="border-t border-white/4 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/dashboard/zones?zone=${z.id}`}
                        className="hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        {z.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                      {z.city ?? '—'}
                    </td>
                    <td className="px-4 py-3">{z.meter_count ?? 0}</td>
                    <td className="px-4 py-3">{z.alert_count ?? 0}</td>
                    <td className="px-4 py-3">{z.anomaly_count ?? 0}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                      {formatLossPct(z.zone_loss_percentage)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${zoneRiskBadge(z.risk)}`}>
                        {(z.risk ?? 'low').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Zone comparison chart */}
      {!loading && zones.length > 1 && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <h2 className="font-semibold text-sm mb-3">Zone Comparison</h2>
          <ZoneComparison />
        </div>
      )}
    </div>
  )
}
