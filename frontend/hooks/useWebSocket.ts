/**
 * useWebSocket — shared React hook for managing the Helios WebSocket connection.
 *
 * Handles:
 * - Connection lifecycle (open, close, error)
 * - Exponential backoff reconnection (max 30 s)
 * - Demo-mode awareness: skips real connection when demo is active
 * - Exposes `status` so UI can show connectivity indicators
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import connectWebSocket, {
  disconnectWebSocket,
  addWebSocketListener,
} from '../lib/websocket'
import type { WsMessage } from '../types/api'
import { isDemoModeEnabled } from '../lib/demo'

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error' | 'demo'

export interface UseWebSocketOptions {
  /** Override the WS URL. Falls back to env-derived URL. */
  url?: string
  /** Called on every incoming message. */
  onMessage?: (msg: WsMessage) => void
  /** Auto-connect on mount. Default: true */
  autoConnect?: boolean
}

export interface UseWebSocketResult {
  status: WsStatus
  connect: () => void
  disconnect: () => void
  lastMessage: WsMessage | null
}

function buildWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8000/ws/live'
  let origin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
  if (!/^https?:\/\//i.test(origin)) origin = new URL(origin, window.location.origin).origin
  origin = origin.replace(/\/api\/v1$/i, '').replace(/\/api$/i, '')
  const base = `${origin.replace(/^http/i, 'ws')}/ws/live`
  return base
}

const BASE_DELAY = 1_000   // 1 s initial backoff
const MAX_DELAY  = 30_000  // 30 s cap

export function useWebSocket(opts: UseWebSocketOptions = {}): UseWebSocketResult {
  const { url, onMessage, autoConnect = true } = opts

  const [status, setStatus] = useState<WsStatus>('closed')
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null)

  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const isMounted = useRef(true)

  const clearRetry = () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return

    if (isDemoModeEnabled()) {
      setStatus('demo')
      return
    }

    clearRetry()
    const wsUrl = url ?? buildWsUrl()
    setStatus('connecting')

    const ws = connectWebSocket(wsUrl)
    socketRef.current = ws as WebSocket | null

    if (!ws) return

    const originalOnOpen = ws.onopen
    ws.onopen = (ev) => {
      if (originalOnOpen) (originalOnOpen as any).call(ws, ev)
      if (!isMounted.current) return
      retryCount.current = 0
      setStatus('open')
    }

    const originalOnClose = ws.onclose
    ws.onclose = (ev) => {
      if (originalOnClose) (originalOnClose as any).call(ws, ev)
      if (!isMounted.current) return
      setStatus('closed')
      // Exponential backoff reconnect
      const delay = Math.min(BASE_DELAY * 2 ** retryCount.current, MAX_DELAY)
      retryCount.current += 1
      retryTimer.current = setTimeout(() => {
        if (isMounted.current) connect()
      }, delay)
    }

    const originalOnError = ws.onerror
    ws.onerror = (ev) => {
      if (originalOnError) (originalOnError as any).call(ws, ev)
      if (!isMounted.current) return
      setStatus('error')
    }
  }, [url])

  const disconnect = useCallback(() => {
    clearRetry()
    disconnectWebSocket()
    setStatus('closed')
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    isMounted.current = true
    if (autoConnect) connect()
    return () => {
      isMounted.current = false
      clearRetry()
    }
  }, [autoConnect, connect])

  // Forward messages to caller callback and update lastMessage
  useEffect(() => {
    const remove = addWebSocketListener((raw: any) => {
      try {
        const msg: WsMessage = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!isMounted.current) return
        setLastMessage(msg)
        onMessage?.(msg)
      } catch {
        // ignore malformed messages
      }
    })
    return remove
  }, [onMessage])

  return { status, connect, disconnect, lastMessage }
}

export default useWebSocket
