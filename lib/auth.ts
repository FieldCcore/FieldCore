const TOKEN_KEY = 'fieldcore_token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export function getToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_KEY}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setToken(token: string): void {
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function removeToken(): void {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

export async function apiCall<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    removeToken()
    window.location.href = '/auth/login'
    throw new Error('Unauthorized')
  }

  return res.json() as Promise<T>
}
