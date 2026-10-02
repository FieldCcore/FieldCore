export default function Login() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--n)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '40px 48px', width: '100%', maxWidth: 400 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--wh)', marginBottom: 28 }}>
          FIELDCORE<sup style={{ color: 'var(--sd)', fontSize: 9 }}>™</sup>
        </div>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: 'var(--wh)', fontWeight: 400, marginBottom: 8 }}>Sign in</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', marginBottom: 28 }}>Access your FieldCore account.</p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--st)', marginBottom: 6 }}>Email</label>
          <input type="email" placeholder="you@business.com" style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 14, color: 'var(--wh)', outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--st)', marginBottom: 6 }}>Password</label>
          <input type="password" placeholder="••••••••" style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 14, color: 'var(--wh)', outline: 'none' }} />
        </div>
        <button style={{ width: '100%', padding: '13px', background: 'var(--sd)', color: 'var(--n)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Sign in
        </button>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,.3)' }}>
          No account? <a href="/#cta" style={{ color: 'var(--sd)' }}>Start free trial</a>
        </p>
      </div>
    </div>
  );
}
