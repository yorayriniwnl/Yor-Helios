"use client"

import React from 'react'
import KPICard from './KPICard'

type KpiCardsProps = {
  totalMeters?: number
  totalAlerts?: number
  openAlerts?: number
  criticalAlerts?: number
  totalReadings?: number
  zoneLossPct?: number
  loading?: boolean
}

export default function KpiCards({
  totalMeters = 0,
  totalAlerts = 0,
  openAlerts = totalAlerts,
  criticalAlerts = 0,
  totalReadings = 0,
  zoneLossPct,
  loading = false,
}: KpiCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-5 animate-shimmer"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', minHeight: 96 }}
          />
        ))}
      </div>
    )
  }

  const MeterIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
  const AlertIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
  const ReadingIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
  const LossIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  )

  const cards = [
    {
      title: 'Active Meters',
      value: totalMeters.toLocaleString(),
      icon: <MeterIcon />,
      subtitle: 'across all zones',
    },
    {
      title: 'Open Alerts',
      value: openAlerts.toLocaleString(),
      icon: <AlertIcon />,
      subtitle: criticalAlerts > 0 ? `${criticalAlerts} critical` : 'none critical',
      trend: criticalAlerts > 0
        ? { direction: 'down' as const, change: `${criticalAlerts} critical`, label: 'needs attention' }
        : undefined,
    },
    {
      title: 'Readings Ingested',
      value: totalReadings.toLocaleString(),
      icon: <ReadingIcon />,
      subtitle: 'lifetime total',
    },
    {
      title: 'Avg Zone Loss',
      value: zoneLossPct != null ? `${(zoneLossPct * 100).toFixed(1)}%` : '—',
      icon: <LossIcon />,
      subtitle: 'energy loss estimate',
      trend: zoneLossPct != null && zoneLossPct > 0.05
        ? { direction: 'down' as const, change: `${(zoneLossPct * 100).toFixed(1)}%`, label: 'above threshold' }
        : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <KPICard
          key={c.title}
          title={c.title}
          value={c.value}
          icon={c.icon}
          subtitle={c.subtitle}
          trend={c.trend}
        />
      ))}
    </div>
  )
}
