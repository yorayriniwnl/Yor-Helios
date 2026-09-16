import { buildApiUrl, getAuthToken } from './api'

export interface OfflineAction {
  id: string
  method: string
  url: string
  data?: Record<string, unknown>
  ts?: string
}

const QUEUE_KEY = 'helios.offline.queue'
const MAX_QUEUE_LENGTH = 500
const listeners = new Set<(length: number) => void>()

function notify(): void {
  const length = getQueue().length
  listeners.forEach((listener) => {
    try { listener(length) } catch { /* isolate observers */ }
  })
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function getQueue(): OfflineAction[] {
  try {
    if (typeof window === 'undefined') return []
    const value = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string' && typeof item.url === 'string') : []
  } catch {
    return []
  }
}

export function getQueueLength(): number {
  return getQueue().length
}

export function queueAction(action: Omit<OfflineAction, 'id' | 'ts'> & Partial<Pick<OfflineAction, 'id' | 'ts'>>): void {
  try {
    const queue = getQueue()
    const id = action.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    if (queue.some((item) => item.id === id)) return
    queue.push({ ...action, id, ts: action.ts || new Date().toISOString() })
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_LENGTH)))
    notify()
  } catch {
    // Offline support is best-effort; the primary request path remains intact.
  }
}

export function clearQueue(): void {
  try { window.localStorage.removeItem(QUEUE_KEY) } catch { /* ignore */ }
  notify()
}

export function onQueueUpdated(listener: (length: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function processQueue(): Promise<void> {
  if (!isOnline()) return
  const queue = getQueue()
  if (!queue.length) return
  const batch = queue.slice(0, 100)

  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(buildApiUrl('/sync/actions'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ actions: batch }),
  })
  if (!response.ok) throw new Error(`Offline sync failed (${response.status})`)

  const payload = await response.json().catch(() => ({})) as { applied?: unknown }
  const applied = new Set(Array.isArray(payload.applied) ? payload.applied.filter((id): id is string => typeof id === 'string') : [])
  if (applied.size) {
    const remaining = getQueue().filter((action) => !applied.has(action.id))
    try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining)) } catch { /* ignore */ }
  }
  notify()
}
