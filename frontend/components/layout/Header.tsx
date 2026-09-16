"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useAuthStore from '../../store/authStore'
import useAlertStore from '../../store/alertStore'
import { BellIcon, BoltIcon, DASHBOARD_NAV_ITEMS, getPageMeta } from '../../lib/navigation'
import { openCommandPalette } from '../ui/CommandPalette'

export default function Header() {
  const pathname = usePathname() || '/dashboard'
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const unread = useAlertStore((s) => s.unreadCount)
  const clearUnread = useAlertStore((s) => s.clearUnread)
  const pageMeta = getPageMeta(pathname)

  const displayName = user?.name ?? user?.email ?? 'Guest Operator'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'GO'

  function handleLogout() {
    logout()
    if (typeof window !== 'undefined') {
      localStorage.removeItem('helios.demo')
    }
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[rgba(0,0,0,0.86)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="Helios home" className="inline-flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 shadow-[0_12px_32px_rgba(15,23,42,0.35)]"
                  style={{ background: 'linear-gradient(135deg, rgba(103,21,21,0.72), rgba(232,75,75,0.18))', color: 'var(--fg)' }}
                >
                  <BoltIcon className="h-5 w-5" />
                </span>
              </Link>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] leading-none text-[var(--muted)]">
                    Helios Command
                  </p>
                  <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] leading-none text-[var(--muted)] lg:inline-flex">
                    Live workspace
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h1 className="text-lg font-semibold tracking-tight text-[var(--fg)]">
                    {pageMeta.title}
                  </h1>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ background: 'rgba(255,255,255,0.06)', color: pageMeta.accent }}
                  >
                    {pageMeta.shortTitle}
                  </span>
                </div>
                <p className="mt-1 max-w-2xl truncate text-sm text-[var(--muted)]">
                  {pageMeta.description}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={openCommandPalette}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-[var(--fg)]"
              aria-label="Open command palette"
              title="Open command palette (Ctrl K)"
            >
              <span className="hidden sm:inline">Command</span>
              <kbd className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold">⌘K</kbd>
            </button>
            <Link
              href="/dashboard/alerts"
              onClick={clearUnread}
              className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--fg)] transition-colors hover:bg-white/10"
              aria-label={`Alerts${unread > 0 ? ` (${unread} unread)` : ''}`}
              title="Alerts"
            >
              <BellIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
              {unread > 0 && (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>

            <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 sm:flex">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg, rgba(103,21,21,0.72), rgba(255,138,127,0.2))', color: 'var(--fg)' }}
              >
                {initials}
              </span>
              <div className="min-w-0">
                <div className="max-w-[160px] truncate text-sm font-medium text-[var(--fg)]">
                  {displayName}
                </div>
                <div className="text-xs text-[var(--muted)]">Operator session</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-[var(--fg)]"
              aria-label="Logout"
            >
              <span className="sm:hidden leading-none">{initials}</span>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        <nav
          className="flex gap-2 overflow-x-auto pb-1 md:hidden"
          aria-label="Mobile dashboard navigation"
          style={{ scrollbarWidth: 'none' }}
        >
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const active = item.href === '/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-white/15 bg-white/10 text-[var(--fg)]'
                    : 'border-white/10 bg-white/5 text-[var(--muted)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.shortTitle}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
