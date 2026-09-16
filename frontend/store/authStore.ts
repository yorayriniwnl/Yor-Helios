import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError, get, getAuthToken, getRefreshToken, onAuthTokensUpdated, post, refreshAuthSession, setAuthToken, setRefreshToken, TokenResponse } from '../lib/api'

/**
 * Minimal user shape for the auth store. Extend as needed.
 */
export type AuthUser = {
  id?: number | string
  name?: string
  email?: string
} | null

interface AuthState {
  user: AuthUser
  token: string | null
  refreshToken: string | null
  hydrated: boolean
  login: (email: string, password: string) => Promise<void>
  refresh: () => Promise<void>
  setToken: (token: string | null, refreshToken?: string | null, user?: AuthUser) => void
  logout: () => Promise<void>
}


function decodeJwt(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    let json = ''
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      json = window.atob(b64)
    } else {
      // Node / SSR fallback
      const buf = Buffer.from(b64, 'base64')
      json = buf.toString('utf-8')
    }
    return JSON.parse(json)
  } catch (e) {
    return null
  }
}


export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      hydrated: false,
      setToken: (token: string | null, refreshToken: string | null = null, user: AuthUser = null) => {
        set({ token, refreshToken, user })
        try {
          if (token) setAuthToken(token)
          else setAuthToken(undefined)
          if (refreshToken) setRefreshToken(refreshToken)
          else setRefreshToken(undefined)
        } catch (e) {
          // best-effort
        }
      },
      login: async (email: string, password: string) => {
        try { window.localStorage.removeItem('helios.demo') } catch { /* storage is optional */ }
        // Call backend /auth/login
        const data = await post<TokenResponse>('/auth/login', { email, password })
        const token = data?.access_token
        if (!token || !data?.refresh_token) throw new Error('Incomplete authentication response')

        // Attach token to API client
        try {
          setAuthToken(token)
          setRefreshToken(data.refresh_token)
        } catch (e) {
          // ignore
        }

        // Try to decode token to get user id and fetch user profile
        let user: AuthUser = null
        const decoded = decodeJwt(token)
        if (decoded && (decoded.user_id || decoded.sub)) {
          try {
            user = await get<Exclude<AuthUser, null>>(`/users/${decoded.user_id ?? decoded.sub}`)
          } catch (e) {
            // ignore profile fetch errors
          }
        }

        set({ token: getAuthToken() ?? token, refreshToken: getRefreshToken() ?? data.refresh_token, user })
      },
      refresh: async () => {
        await refreshAuthSession()
        const token = getAuthToken()
        const refreshToken = getRefreshToken()
        if (!token || !refreshToken) throw new Error('Session refresh failed')
        set({ token, refreshToken })
      },
      logout: async () => {
        const clearLocalState = () => {
          set({ token: null, refreshToken: null, user: null })
          try { window.localStorage.removeItem('helios.demo') } catch { /* storage is optional */ }
          try {
            setAuthToken(undefined)
            setRefreshToken(undefined)
          } catch (e) {
            // ignore
          }
        }

        if (!getRefreshToken()) {
          clearLocalState()
          return
        }

        // Keep credentials available until revocation completes. If the access
        // token is expired, refresh first and retry logout with the rotated
        // refresh token; the request boundary deliberately does not perform a
        // second implicit rotation with a stale request body.
        try {
          await post('/auth/logout', { refresh_token: getRefreshToken() }, { retryOnUnauthorized: false })
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) {
            clearLocalState()
            return
          }
          try {
            await refreshAuthSession()
            const rotatedRefreshToken = getRefreshToken()
            if (rotatedRefreshToken) {
              await post('/auth/logout', { refresh_token: rotatedRefreshToken }, { retryOnUnauthorized: false })
            }
          } catch {
            // Local sign-out still proceeds when the backend is unavailable.
          }
        } finally {
          clearLocalState()
        }
      },
    }),
    {
      name: 'helios.auth', // localStorage key
      skipHydration: true,
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken, user: state.user }),
      onRehydrateStorage: () => (state) => {
        // when rehydrated, ensure api client has the token set
        if (state && state.token) {
          try {
            setAuthToken(state.token)
            setRefreshToken(state.refreshToken ?? undefined)
          } catch (e) {
            // ignore
          }
        }
      },
    }
  )
)

// Keep Zustand's persisted snapshot aligned when the API boundary performs an
// automatic one-time refresh after a 401 response.
onAuthTokensUpdated((token, refreshToken) => {
  useAuthStore.setState((state) => ({
    ...state,
    token: token ?? null,
    refreshToken: refreshToken ?? null,
  }))
})

export default useAuthStore
