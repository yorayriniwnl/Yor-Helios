/**
 * useOfflineQueue — React hook for the Helios offline action queue.
 *
 * Exposes:
 *  - queueLength  : number of pending actions
 *  - isOnline     : current network state
 *  - queue        : the full action list
 *  - flush()      : manually trigger sync (also auto-fires on reconnect)
 *  - clearQueue() : discard all pending actions
 */
import { useEffect, useState, useCallback } from 'react'
import {
  onQueueUpdated,
  isOnline as checkOnline,
  getQueue,
  processQueue,
  clearQueue as clearOfflineQueue,
} from '../lib/offline'

export interface UseOfflineQueueResult {
  queueLength: number
  isOnline: boolean
  queue: ReturnType<typeof getQueue>
  flush: () => Promise<void>
  clearQueue: () => void
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const [queueLength, setQueueLength] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [queue, setQueue] = useState<ReturnType<typeof getQueue>>([])

  // Subscribe to queue updates
  useEffect(() => {
    const unsub = onQueueUpdated((len) => {
      setQueueLength(len)
      setQueue(getQueue())
    })
    return unsub
  }, [])

  // Track online/offline
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      setIsOnline(true)
      // Auto-flush on reconnect
      processQueue().catch(() => {})
    }
    const handleOffline = () => setIsOnline(false)

    setIsOnline(checkOnline())
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const flush = useCallback(async () => {
    await processQueue()
    setQueue(getQueue())
  }, [])

  const clearQueue = useCallback(() => {
    clearOfflineQueue()
    setQueueLength(0)
    setQueue([])
  }, [])

  return { queueLength, isOnline, queue, flush, clearQueue }
}

export default useOfflineQueue
