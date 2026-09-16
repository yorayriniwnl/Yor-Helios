"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { useMeters, useZones } from '../../../hooks'
import Spinner from '../../../components/ui/Spinner'
import ErrorMessage from '../../../components/ui/ErrorMessage'
import EmptyState from '../../../components/ui/EmptyState'
import Skeleton from '../../../components/ui/Skeleton'

export default function MetersPage() {
  const [selectedZone, setSelectedZone] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const { zones } = useZones()
  const { meters, loading, error, refetch } = useMeters({ zoneId: selectedZone, limit: 200 })

  const filtered = search.trim()
    ? meters.filter(
        (m) =>
          String(m.meter_number).toLowerCase().includes(search.toLowerCase()) ||
          (m.household_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : meters

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Meters</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {meters.length} meter{meters.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Zone filter */}
          <select
            aria-label="Filter meters by zone"
            value={selectedZone ?? ''}
            onChange={(e) => setSelectedZone(e.target.value ? Number(e.target.value) : null)}
            className="text-sm rounded-lg px-3 py-1.5 focus:outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--fg)',
            }}
          >
            <option value="">All Zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>

          {/* Search */}
          <input
            aria-label="Search meters"
            type="search"
            placeholder="Search meters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5 w-48 focus:outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--fg)',
            }}
          />

          <button
            aria-label="Refresh meters"
            onClick={refetch}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ↻
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        {loading ? (
          <div className="p-6 space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} height={40} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message={search ? `No meters matching "${search}"` : 'No meters found.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wider border-b border-white/6"
                  style={{ color: 'var(--muted)' }}
                >
                  {['ID', 'Meter Number', 'Household', 'Status', 'Zone'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const zone = zones.find((z) => z.id === m.zone_id)
                  return (
                    <tr
                      key={m.id}
                      className="border-t border-white/4 hover:bg-white/3 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/meters/${m.id}`}
                          className="font-mono text-xs hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          #{m.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/dashboard/meters/${m.id}`} className="hover:underline">
                          {m.meter_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                        {m.household_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            m.status === 'active'
                              ? 'bg-green-500/20 text-green-300'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {m.status ?? 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                        {zone?.name ?? (m.zone_id ? `Zone ${m.zone_id}` : '—')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
