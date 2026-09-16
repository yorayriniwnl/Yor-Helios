"use client"

import React, { useState } from 'react'

export default function CostSavingsCalculator() {
  const [meters, setMeters] = useState<number>(5000)
  const [lossPercent, setLossPercent] = useState<number>(6)
  const [avgKwh, setAvgKwh] = useState<number>(250)
  const [tariff, setTariff] = useState<number>(10)
  const [recoveryPercent, setRecoveryPercent] = useState<number>(65)

  const lossesBeforeKwh = meters * avgKwh * (lossPercent / 100)
  const lossesBeforeINR = lossesBeforeKwh * tariff

  const recoveredKwh = lossesBeforeKwh * (recoveryPercent / 100)
  const lossesAfterKwh = Math.max(0, lossesBeforeKwh - recoveredKwh)
  const lossesAfterINR = lossesAfterKwh * tariff

  const savingsMonthly = Math.max(0, lossesBeforeINR - lossesAfterINR)
  const annualSavings = savingsMonthly * 12

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n)

  return (
    <div className="card">
      <h3 className="font-medium mb-2">Cost Savings Calculator</h3>
      <p className="text-sm text-[var(--muted)] mb-3">Estimate recoverable losses and expected savings (mock/demo estimates).</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <div className="text-xs text-[var(--muted)]">Number of meters</div>
          <input
            id="calculator-meters"
            type="number"
            value={meters}
            min={0}
            onChange={(e) => setMeters(Math.max(0, Number(e.target.value || 0)))}
            className="w-full mt-1 p-2 rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
          />
        </label>

        <label className="text-sm">
          <div className="text-xs text-[var(--muted)]">Avg loss %</div>
          <input
            id="calculator-loss-percent"
            type="number"
            step="0.1"
            value={lossPercent}
            min={0}
            max={100}
            onChange={(e) => setLossPercent(Math.min(100, Math.max(0, Number(e.target.value || 0))))}
            className="w-full mt-1 p-2 rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
          />
        </label>

        <label className="text-sm">
          <div className="text-xs text-[var(--muted)]">Avg monthly kWh per meter</div>
          <input
            id="calculator-avg-kwh"
            type="number"
            value={avgKwh}
            min={0}
            onChange={(e) => setAvgKwh(Math.max(0, Number(e.target.value || 0)))}
            className="w-full mt-1 p-2 rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
          />
        </label>

        <label className="text-sm">
          <div className="text-xs text-[var(--muted)]">Tariff (₹/kWh)</div>
          <input
            id="calculator-tariff"
            type="number"
            step="0.1"
            value={tariff}
            min={0}
            onChange={(e) => setTariff(Math.max(0, Number(e.target.value || 0)))}
            className="w-full mt-1 p-2 rounded bg-[var(--card-bg)] border border-[var(--card-border)]"
          />
        </label>

        <label className="text-sm col-span-1 sm:col-span-2">
          <div className="text-xs text-[var(--muted)]">Detection recovery % (percent of losses recovered)</div>
          <input
            id="calculator-recovery-percent"
            type="range"
            min={0}
            max={100}
            value={recoveryPercent}
            onChange={(e) => setRecoveryPercent(Number(e.target.value || 0))}
            className="w-full mt-1"
          />
          <div className="text-sm mt-1">{recoveryPercent}% recovered</div>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--muted)]">Losses before detection — monthly</div>
          <div className="font-medium">{fmt(lossesBeforeINR)}</div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--muted)]">Losses after detection — monthly</div>
          <div className="font-medium">{fmt(lossesAfterINR)}</div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
          <div className="text-sm text-[var(--muted)]">Estimated savings — monthly</div>
          <div className="text-lg font-semibold">{fmt(savingsMonthly)}</div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--muted)]">Estimated savings — yearly</div>
          <div className="text-lg font-semibold">{fmt(annualSavings)}</div>
        </div>
      </div>

      <div className="mt-3 text-xs text-[var(--muted)]">Note: demo estimator — use operational inputs for planning.</div>
    </div>
  )
}
