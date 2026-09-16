/**
 * Small, typed HTTP boundary for the Helios frontend.
 *
 * The backend exposes JSON directly under /api/v1. Keeping URL construction,
 * auth headers, errors, and short-lived GET caching here makes every hook use
 * the same contract and keeps demo/local deployments interchangeable.
 */

export type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  cacheMs?: number
  signal?: AbortSignal
  timeoutMs?: number
  retryOnUnauthorized?: boolean
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer' | string
  expires_in: number
}

export interface GetOptions {
  params?: Record<string, QueryValue>
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const ACCESS_TOKEN_KEY = 'helios.access_token'
const REFRESH_TOKEN_KEY = 'helios.refresh_token'
const DEFAULT_API_ORIGIN = 'http://localhost:8000'
const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
let memoryToken: string | undefined
let memoryRefreshToken: string | undefined
let refreshPromise: Promise<boolean> | null = null
const authTokenListeners = new Set<(accessToken?: string, refreshToken?: string) => void>()

function configuredApiOrigin(): string {
  const configured = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined
  return (configured?.trim() || DEFAULT_API_ORIGIN).replace(/\/$/, '')
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const origin = configuredApiOrigin()
  if (normalizedPath === '/api/v1' || normalizedPath.startsWith('/api/v1/')) {
    const suffix = normalizedPath.slice('/api/v1'.length) || '/'
    if (origin.endsWith('/api/v1')) return `${origin}${suffix}`
    return `${origin}${normalizedPath}`
  }
  if (normalizedPath === '/api' || normalizedPath.startsWith('/api/')) {
    const suffix = normalizedPath.slice('/api'.length) || '/'
    if (origin.endsWith('/api') || origin.endsWith('/api/v1')) return `${origin}${suffix}`
    return `${origin}${normalizedPath}`
  }
  if (origin.endsWith('/api/v1')) return `${origin}${normalizedPath}`
  if (origin.endsWith('/api')) return `${origin}/v1${normalizedPath}`
  return `${origin}/api/v1${normalizedPath}`
}

export function getAuthToken(): string | undefined {
  if (memoryToken) return memoryToken
  try {
    const stored = window.localStorage.getItem(ACCESS_TOKEN_KEY)
    if (stored) memoryToken = stored
  } catch {
    // Restricted storage should not prevent public/demo rendering.
  }
  return memoryToken
}

export function setAuthToken(token?: string): void {
  const changed = memoryToken !== (token || undefined)
  memoryToken = token || undefined
  if (changed) clearResponseCache()
  try {
    if (memoryToken) window.localStorage.setItem(ACCESS_TOKEN_KEY, memoryToken)
    else window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  } catch {
    // Auth can still be held in memory when storage is unavailable.
  }
}

export function getRefreshToken(): string | undefined {
  if (memoryRefreshToken) return memoryRefreshToken
  try {
    const stored = window.localStorage.getItem(REFRESH_TOKEN_KEY)
    if (stored) memoryRefreshToken = stored
  } catch {
    // Restricted storage should not prevent public/demo rendering.
  }
  return memoryRefreshToken
}

export function setRefreshToken(token?: string): void {
  memoryRefreshToken = token || undefined
  try {
    if (memoryRefreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, memoryRefreshToken)
    else window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Auth can still be held in memory when storage is unavailable.
  }
}

export function onAuthTokensUpdated(listener: (accessToken?: string, refreshToken?: string) => void): () => void {
  authTokenListeners.add(listener)
  return () => authTokenListeners.delete(listener)
}

function notifyAuthTokensUpdated(accessToken?: string, refreshToken?: string): void {
  authTokenListeners.forEach((listener) => {
    try { listener(accessToken, refreshToken) } catch { /* one consumer must not break auth */ }
  })
}

function withQuery(path: string, params?: Record<string, QueryValue>): string {
  if (!params) return path
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body
  if (body && typeof body === 'object') {
    const candidate = body as { detail?: unknown; message?: unknown }
    if (typeof candidate.detail === 'string' && candidate.detail.trim()) return candidate.detail
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message
  }
  return fallback
}

function normalizedAuthPath(path: string): string {
  return path.split('?', 1)[0].replace(/^\/api\/v1/, '').replace(/^\/api/, '') || '/'
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const response = await fetch(buildApiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      const payload = await response.json().catch(() => null) as Partial<TokenResponse> | null
      if (!response.ok) {
        if (response.status === 401) {
          setAuthToken(undefined)
          setRefreshToken(undefined)
          notifyAuthTokensUpdated()
        }
        return false
      }
      if (!payload?.access_token || !payload.refresh_token) return false
      setAuthToken(payload.access_token)
      setRefreshToken(payload.refresh_token)
      notifyAuthTokensUpdated(payload.access_token, payload.refresh_token)
      return true
    } catch {
      // A temporary network failure should not destroy a usable refresh token.
      return false
    }
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

export async function refreshAuthSession(): Promise<void> {
  if (!(await refreshAccessToken())) {
    throw new ApiError('Session refresh failed', 401)
  }
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}, allowAuthRefresh = true): Promise<T> {
  const url = buildApiUrl(path)
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 15_000
  const abortFromCaller = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', abortFromCaller, { once: true })
  }
  const timeout = typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), timeoutMs) : setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const authPath = normalizedAuthPath(path)
    if (
      response.status === 401 &&
      allowAuthRefresh &&
      options.retryOnUnauthorized !== false &&
      authPath !== '/auth/login' &&
      authPath !== '/auth/refresh' &&
      getRefreshToken() &&
      await refreshAccessToken()
    ) {
      return request<T>(method, path, body, options, false)
    }
    throw new ApiError(errorMessage(payload, `${method} ${path} failed (${response.status})`), response.status, payload)
  }
  return payload as T
}

export async function get<T>(path: string, options?: GetOptions, requestOptions: RequestOptions = {}): Promise<T> {
  const authScope = getAuthToken() ? 'authenticated' : 'anonymous'
  const requestPath = withQuery(path, options?.params)
  const cacheKey = `${authScope}:${requestPath}`
  const now = Date.now()
  const cached = responseCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.value as T

  const value = await request<T>('GET', requestPath, undefined, requestOptions)
  if ((requestOptions.cacheMs ?? 0) > 0) {
    responseCache.set(cacheKey, { expiresAt: now + requestOptions.cacheMs!, value })
  }
  return value
}

export function post<T>(path: string, body?: unknown, requestOptions: RequestOptions = {}): Promise<T> {
  return request<T>('POST', path, body, requestOptions)
}

export function patch<T>(path: string, body?: unknown, requestOptions: RequestOptions = {}): Promise<T> {
  return request<T>('PATCH', path, body, requestOptions)
}

export async function downloadAuthenticatedFile(path: string, requestOptions: RequestOptions = {}): Promise<Blob> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestOptions.timeoutMs ?? 15_000)
  const abortFromCaller = () => controller.abort()
  if (requestOptions.signal) {
    if (requestOptions.signal.aborted) controller.abort()
    else requestOptions.signal.addEventListener('abort', abortFromCaller, { once: true })
  }
  const fetchFile = () => {
    const headers: Record<string, string> = { Accept: '*/*' }
    const token = getAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(buildApiUrl(path), {
      headers,
      credentials: 'include',
      signal: controller.signal,
    })
  }
  try {
    let response = await fetchFile()
    if (response.status === 401 && requestOptions.retryOnUnauthorized !== false && getRefreshToken() && await refreshAccessToken()) {
      // Re-read the access token after rotation so the retry cannot reuse a
      // stale Authorization header.
      response = await fetchFile()
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new ApiError(errorMessage(payload, `Download failed (${response.status})`), response.status, payload)
    }
    return await response.blob()
  } finally {
    clearTimeout(timeout)
    requestOptions.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export function clearResponseCache(): void {
  responseCache.clear()
}
