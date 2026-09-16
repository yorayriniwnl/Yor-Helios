import type { WsMessage } from '../types/api'
import { getAuthToken } from './api'

type Listener = (message: string | WsMessage) => void
export type SharedWebSocketStatus = 'connecting' | 'open' | 'closed' | 'error'
type StatusListener = (status: SharedWebSocketStatus) => void

const listeners = new Set<Listener>()
const statusListeners = new Set<StatusListener>()
const seenEventIds = new Set<string>()
let socket: WebSocket | null = null
let socketUrl: string | null = null
let socketStatus: SharedWebSocketStatus = 'closed'
let lastSequence = 0
const WS_AUTH_SUBPROTOCOL = 'helios-auth'

function setSocketStatus(status: SharedWebSocketStatus): void {
  socketStatus = status
  statusListeners.forEach((listener) => {
    try { listener(status) } catch { /* one status consumer must not break fan-out */ }
  })
}

function defaultWebSocketUrl(): string {
  const configured = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined)?.trim()
  let origin = (configured || 'http://localhost:8000').replace(/\/$/, '')
  if (!/^https?:\/\//i.test(origin) && typeof window !== 'undefined') {
    origin = new URL(origin, window.location.origin).origin
  }
  origin = origin.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '')
  const base = /^https?:\/\//i.test(origin)
    ? `${origin.replace(/^http/i, 'ws')}/ws/live`
    : `ws://${origin}/ws/live`
  return base
}

function dispatch(message: string | WsMessage): void {
  let normalized: string | WsMessage = message
  try {
    const parsed: WsMessage = typeof message === 'string' ? JSON.parse(message) : message
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.sequence === 'number') {
        if (parsed.sequence <= lastSequence) return
        lastSequence = parsed.sequence
      }
      if (parsed.event_id) {
        if (seenEventIds.has(parsed.event_id)) return
        seenEventIds.add(parsed.event_id)
        if (seenEventIds.size > 2_000) {
          const oldest = seenEventIds.values().next().value
          if (oldest) seenEventIds.delete(oldest)
        }
      }
      normalized = parsed
    }
  } catch {
    // Preserve malformed messages for existing consumers to ignore safely.
  }
  listeners.forEach((listener) => {
    try {
      listener(normalized)
    } catch {
      // One consumer must not break the shared event fan-out.
    }
  })
}

export function addWebSocketListener(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function removeWebSocketListener(listener: Listener): void {
  listeners.delete(listener)
}

export function addWebSocketStatusListener(listener: StatusListener): () => void {
  statusListeners.add(listener)
  listener(socketStatus)
  return () => statusListeners.delete(listener)
}

export function getWebSocketStatus(): SharedWebSocketStatus {
  return socketStatus
}

export function connectWebSocket(url = defaultWebSocketUrl()): WebSocket | null {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return null
  if (socket && socketUrl === url && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return socket

  disconnectWebSocket()
  socketUrl = url
  setSocketStatus('connecting')
  const token = getAuthToken()
  // Browser WebSocket clients cannot set Authorization headers. Offer the
  // bearer token as a subprotocol so it is not exposed in URL/access logs.
  socket = token ? new WebSocket(url, [WS_AUTH_SUBPROTOCOL, token]) : new WebSocket(url)
  socket.onmessage = (event) => dispatch(event.data as string)
  socket.onopen = () => setSocketStatus('open')
  socket.onerror = () => {
    setSocketStatus('error')
  }
  socket.onclose = () => {
    setSocketStatus('closed')
    socket = null
  }
  return socket
}

export function disconnectWebSocket(): void {
  if (socket) {
    try { socket.close() } catch { /* already closed */ }
  }
  socket = null
  socketUrl = null
  setSocketStatus('closed')
}

export function emitLocalMessage(message: WsMessage): void {
  dispatch(message)
}

export default connectWebSocket
