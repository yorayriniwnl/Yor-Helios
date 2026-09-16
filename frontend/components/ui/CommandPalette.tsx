'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export const COMMAND_PALETTE_EVENT = 'helios:open-command-palette'

export function openCommandPalette(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT))
}

type PaletteCommand = {
  id: string
  label: string
  description: string
  href: string
  keywords: string
  group: string
}

const COMMANDS: PaletteCommand[] = [
  { id: 'overview', label: 'Open overview', description: 'Read the current operations signal.', href: '/dashboard', keywords: 'home dashboard monitor signal', group: 'Navigate' },
  { id: 'alerts', label: 'Open alert triage', description: 'Review, assign, and resolve incidents.', href: '/dashboard/alerts', keywords: 'alerts incidents triage response', group: 'Navigate' },
  { id: 'critical-alerts', label: 'Show critical alerts', description: 'Jump directly to the highest-severity queue.', href: '/dashboard/alerts?severity=critical', keywords: 'critical urgent red priority', group: 'Navigate' },
  { id: 'meters', label: 'Inspect meter network', description: 'Drill into assets and readings.', href: '/dashboard/meters', keywords: 'meters assets readings telemetry', group: 'Navigate' },
  { id: 'zones', label: 'Compare zones', description: 'Open the zone risk and hotspot view.', href: '/dashboard/zones', keywords: 'zones map risk hotspots geography', group: 'Navigate' },
  { id: 'analytics', label: 'Open analytics', description: 'Review trend, recovery, and forecast context.', href: '/dashboard/analytics', keywords: 'analytics recovery forecast trend', group: 'Navigate' },
]

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  const tag = element?.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element?.isContentEditable === true
}

export default function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return COMMANDS
    return COMMANDS.filter((command) => `${command.label} ${command.description} ${command.keywords}`.toLowerCase().includes(normalized))
  }, [query])

  useEffect(() => {
    const openPalette = () => {
      triggerRef.current = document.activeElement as HTMLElement | null
      setOpen(true)
    }
    window.addEventListener(COMMAND_PALETTE_EVENT, openPalette)
    return () => window.removeEventListener(COMMAND_PALETTE_EVENT, openPalette)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandKey = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
      const slashKey = event.key === '/' && !isEditableTarget(event.target)

      if (!open && (commandKey || slashKey)) {
        event.preventDefault()
        openCommandPalette()
        return
      }
      if (!open) return

      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, Math.max(0, filteredCommands.length - 1)))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter' && filteredCommands[activeIndex]) {
        event.preventDefault()
        router.push(filteredCommands[activeIndex].href)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, filteredCommands, open, router])

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus?.()
      return
    }
    setQuery('')
    setActiveIndex(0)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, pathname])

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filteredCommands.length - 1)))
  }, [filteredCommands.length])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-[14vh] backdrop-blur-sm" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#120607] shadow-[0_24px_90px_rgba(0,0,0,0.65)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">Helios command</p>
              <h2 id="command-palette-title" className="mt-1 text-lg font-semibold text-[var(--fg)]">Where do you want to go?</h2>
            </div>
            <kbd className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-[var(--muted)]">Esc</kbd>
          </div>
          <label htmlFor="command-palette-input" className="sr-only">Search command routes</label>
          <input
            ref={inputRef}
            id="command-palette-input"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            placeholder="Search routes, alerts, meters…"
            autoComplete="off"
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60"
          />
        </div>

        <div className="max-h-[min(52vh,420px)] overflow-y-auto p-2" role="listbox" aria-label="Command routes">
          {filteredCommands.length ? filteredCommands.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => { router.push(command.href); setOpen(false) }}
              className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition-colors ${index === activeIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--fg)]">{command.label}</span>
                <span className="mt-1 block truncate text-xs text-[var(--muted)]">{command.description}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">{command.group}</span>
            </button>
          )) : (
            <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">No command matches “{query}”.</p>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-3 text-[11px] text-[var(--muted)]">
          <span><kbd className="rounded border border-white/10 px-1">↑↓</kbd> move</span>
          <span><kbd className="rounded border border-white/10 px-1">Enter</kbd> open</span>
          <span><kbd className="rounded border border-white/10 px-1">/</kbd> search</span>
        </div>
      </section>
    </div>
  )
}
