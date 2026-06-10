'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || data.message || 'Login failed'); setLoading(false); return }
      document.cookie = `fieldcore_token=${data.token}; path=/; max-age=86400; SameSite=Lax`
      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center">
      <div className="bg-white border border-lightgray rounded-lg p-8 w-full max-w-md shadow-sm">
        <div className="font-black text-navy text-2xl tracking-wider uppercase mb-6" style={{ fontFamily: 'Arial Black, sans-serif' }}>
          FIELDCORE<sup className="text-sand text-xs">™</sup>
        </div>
        <h1 className="font-bold text-navy text-xl mb-1">Sign in to your account</h1>
        <p className="text-slate text-sm mb-6">Enter your credentials to access your dashboard.</p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <form onSubmit={handleSubmit}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="you@example.com"
            className="w-full border border-lightgray rounded-md px-3 py-2 text-navy placeholder-steel focus:ring-2 focus:ring-sand focus:outline-none mb-3"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)} required
            placeholder="Password"
            className="w-full border border-lightgray rounded-md px-3 py-2 text-navy placeholder-steel focus:ring-2 focus:ring-sand focus:outline-none mb-4"
          />
          <button type="submit" disabled={loading}
            className="w-full bg-sand text-navy font-bold py-3 rounded-md hover:brightness-95 transition disabled:opacity-60">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
