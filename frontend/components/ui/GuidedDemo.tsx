"use client"

import React, { useEffect, useRef, useState } from 'react'
import { startDemo, stopDemo } from '../../lib/demo'
import { emitLocalMessage } from '../../lib/websocket'
import { useRouter } from 'next/navigation'

type Step = { id: string; title: string; desc: string; duration?: number; action?: string }

const STEPS: Step[] = [
  { id: 'livefeed', title: 'Anomaly Detected', desc: 'A high-severity anomaly appears in the live feed.', duration: 3800, action: 'anomaly' },
  { id: 'kpis', title: 'Prioritization', desc: 'Decision engine suggests a root cause, normalized score band and estimated recovery.', duration: 3200, action: 'priority' },
  { id: 'operators', title: 'Assignment', desc: 'Assign the alert to an inspector for investigation.', duration: 3200, action: 'assign' },
  { id: 'evidence', title: 'Evidence Capture', desc: 'Attach photo and notes to the case as proof.', duration: 3200, action: 'evidence' },
  { id: 'recovery', title: 'Recovery', desc: 'Resolve the issue and observe estimated recovered value on the dashboard.', duration: 3200, action: 'recovery' },
  { id: 'wrap', title: 'Wrap Up', desc: 'Demo complete — thanks!', duration: 2600 },
]

export default function GuidedDemo() {
  const [running, setRunning] = useState(false)
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [instruction, setInstruction] = useState<{ title: string; desc: string } | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const activeElRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<any>(null)
  const lastAlertRef = useRef<any | null>(null)
  const router = useRouter()

  const silentAutoStartRef = useRef(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('demo') === 'silent' && !silentAutoStartRef.current) {
        silentAutoStartRef.current = true
        start()
      }
    } catch {
      // ignore — the manual Start Demo button still works
    }
    // start is intentionally stable for this one-time URL-driven trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  function cleanup() {
    try {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (activeElRef.current) activeElRef.current.classList.remove('demo-highlight-target')
    } catch (e) {}
    timerRef.current = null
    activeElRef.current = null
  }

  function highlightSelector(id: string) {
    cleanup()
    if (id === 'wrap') {
      setPos({ top: window.innerHeight / 2 - 80, left: window.innerWidth / 2 - 220 })
      return
    }
    const sel = `[data-demo-id="${id}"]`
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) {
      setPos({ top: window.innerHeight / 2 - 80, left: window.innerWidth / 2 - 220 })
      return
    }
    activeElRef.current = el
    try {
      el.classList.add('demo-highlight-target')
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      const rect = el.getBoundingClientRect()
      const top = Math.max(12, rect.top + window.scrollY - 8)
      const left = Math.min(window.innerWidth - 440, rect.left + window.scrollX + rect.width + 12)
      setPos({ top, left })
    } catch (e) {
      setPos({ top: window.innerHeight / 2 - 80, left: window.innerWidth / 2 - 220 })
    }
  }

  function emitDemoAlert() {
    const id = 9201
    const meter = 204
    const score = 0.94
    const a = {
      id,
      meter_id: meter,
      score,
      severity: 'critical',
      type: 'tamper_suspicion',
      explanation: `Sustained under-reporting detected at M-${meter}; inspect the meter and transformer path.`,
      created_at: new Date().toISOString(),
      status: 'open',
    }
    try {
      emitLocalMessage({ type: 'alert', data: a })
      lastAlertRef.current = a
    } catch (e) {}
  }

  function simulatePriority() {
    const a = lastAlertRef.current
    if (!a) return
    const decision = {
      root_cause: 'Transformer stress',
      score_band: 'HIGH',
      recommended_action: 'Inspect transformer and balance load',
      estimated_recovery_minutes: 60,
      estimated_recovery_value_usd: 12000,
    }
    const updated = { ...a, decision, explanation: `${a.explanation} — likely transformer stress` }
    emitLocalMessage({ type: 'alert', data: updated })
    lastAlertRef.current = updated
  }

  function simulateAssign() {
    const a = lastAlertRef.current
    if (!a) return
    const assigned = { ...a, status: 'assigned', assigned_to: 1, explanation: `${a.explanation} — Assigned to Inspector Raj` }
    emitLocalMessage({ type: 'alert', data: assigned })
    lastAlertRef.current = assigned
    try { router.push('/dashboard') } catch (e) {}
  }

  function simulateEvidence() {
    const a = lastAlertRef.current
    if (!a) return
    const ev = { id: 'ev-9201', url: '/demo/evidence.jpg', notes: 'Before photo' }
    const updated = { ...a, evidence: [ev], explanation: `${a.explanation} — Evidence attached` }
    emitLocalMessage({ type: 'alert', data: updated })
    lastAlertRef.current = updated
  }

  function simulateResolve() {
    const a = lastAlertRef.current
    if (!a) return
    const resolved = { ...a, status: 'resolved', resolved_at: new Date().toISOString(), explanation: `${a.explanation} — Resolved on-site`, recovered_value: 15000 }
    emitLocalMessage({ type: 'alert', data: resolved })
    lastAlertRef.current = resolved
    try { router.push('/dashboard/analytics') } catch (e) {}
  }

  function runStep(i: number) {
    if (i >= STEPS.length) {
      setStepIndex(null)
      setInstruction(null)
      setRunning(false)
      return
    }
    const s = STEPS[i]
    setStepIndex(i)
    setInstruction({ title: s.title, desc: s.desc })

    // run optional action for the step (emits local messages to update UI)
    try {
      if (s.action === 'anomaly') emitDemoAlert()
      else if (s.action === 'priority') simulatePriority()
      else if (s.action === 'assign') simulateAssign()
      else if (s.action === 'evidence') simulateEvidence()
      else if (s.action === 'recovery') simulateResolve()
    } catch (e) {}

    // small delay to allow UI to update before highlight
    setTimeout(() => highlightSelector(s.id), 250)
    const dur = s.duration ?? 3000
    timerRef.current = setTimeout(() => runStep(i + 1), dur)
  }

  function start() {
    try { localStorage.setItem('helios.demo', '1') } catch (e) {}
    startDemo()
    setRunning(true)
    setTimeout(() => runStep(0), 700)
  }

  function stop() {
    cleanup()
    try { localStorage.removeItem('helios.demo') } catch (e) {}
    stopDemo()
    setRunning(false)
    setStepIndex(null)
    setInstruction(null)
  }

  return (
    <div className="inline-flex items-center gap-3">
      <button
        onClick={() => (running ? stop() : start())}
        className={`btn-primary ${running ? 'bg-gradient-to-r from-[#671515] to-[#e84b4b]' : ''}`}
      >
        {running ? 'End Demo' : 'Start Demo'}
      </button>

      {instruction && pos && (
        <div>
          <div className="demo-overlay" />
          <div className="demo-instruction" style={{ top: pos.top, left: pos.left }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-[var(--muted)]">Step {stepIndex! + 1} of {STEPS.length}</div>
                <div className="text-lg font-semibold">{instruction.title}</div>
                <div className="text-sm muted-small mt-2">{instruction.desc}</div>
              </div>
              <div>
                <button onClick={stop} className="px-2 py-1 rounded bg-white/6">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
