// Page frame, form controls and buttons for the public shop pages. Matches
// the look of the public artwork page (ArtworkPage.jsx).

export const INK = '#1a1714'
export const MUTED = '#9a9490'
export const LINE = '#e8e3db'
export const ACCENT = '#E05C2A'
export const PAPER = '#faf8f5'

export const inputStyle = {
  width: '100%', padding: '11px 12px', border: `1px solid ${LINE}`, borderRadius: 3,
  fontSize: 14, color: INK, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export const labelStyle = {
  display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
  textTransform: 'uppercase', color: MUTED, marginBottom: 6,
}

export const eyebrowStyle = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED,
}

export function ShopButton({ variant = 'primary', children, style, ...props }) {
  const variants = {
    primary: { background: INK, color: '#fff', border: `1px solid ${INK}` },
    accent: { background: ACCENT, color: '#fff', border: `1px solid ${ACCENT}` },
    outline: { background: '#fff', color: INK, border: `1px solid ${LINE}` },
    whatsapp: { background: '#fff', color: '#1a8d4a', border: '1px solid #25D366' },
  }
  return (
    <button {...props}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
        padding: '13px 16px', borderRadius: 3, fontSize: 14, fontWeight: 600, cursor: props.disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', opacity: props.disabled ? .5 : 1, ...variants[variant], ...style,
      }}>
      {children}
    </button>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 5 }}>{hint}</span>}
    </label>
  )
}

export function Notice({ tone = 'neutral', children }) {
  const tones = {
    neutral: { background: '#f7f4ef', color: '#3d3a36', border: LINE },
    success: { background: '#edf7f0', color: '#1f6b3d', border: '#cfe8d8' },
    warning: { background: '#fef9ec', color: '#8a6212', border: '#f1e2b8' },
    error: { background: '#fef2f0', color: '#a3301f', border: '#f3d2cc' },
  }[tone]
  return (
    <div style={{ padding: '12px 14px', borderRadius: 3, fontSize: 13, lineHeight: 1.6,
                  background: tones.background, color: tones.color, border: `1px solid ${tones.border}` }}>
      {children}
    </div>
  )
}

export function WhatsAppIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  )
}

export function ShopFrame({ children, width = 1000 }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap');
        .shop-body { font-family: 'Inter', -apple-system, sans-serif; color: ${INK}; }
        .shop-body input:focus, .shop-body textarea:focus, .shop-body select:focus { border-color: ${INK} !important; }
        .shop-grid { display: grid; grid-template-columns: 1fr; gap: 24px; align-items: start; }
        @media (min-width: 860px) { .shop-grid { grid-template-columns: 1.1fr 1fr; gap: 48px; } }
        @media print {
          .no-print { display: none !important; }
          .shop-body { background: #fff !important; }
        }
      `}</style>
      <div className="shop-body" style={{ minHeight: '100vh', background: PAPER }}>
        <div className="no-print" style={{ borderBottom: `1px solid ${LINE}`, background: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'center' }}>
          <a href="/" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-.01em', color: INK }}>HOURGLASS</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: ACCENT }}>/</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: '.2em', color: ACCENT, marginLeft: 1 }}>GALLERY</span>
          </a>
        </div>
        <div style={{ maxWidth: width, margin: '0 auto', padding: '28px 16px 56px' }}>
          {children}
          <div style={{ marginTop: 40, paddingTop: 18, borderTop: `1px solid ${LINE}`, textAlign: 'center', fontSize: 11, color: MUTED }}>
            Hourglass Gallery · 298C Akin Olugbade Street, Victoria Island, Lagos
          </div>
        </div>
      </div>
    </>
  )
}

export function Centered({ children }) {
  return (
    <ShopFrame width={560}>
      <div style={{ minHeight: '40vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', fontSize: 14, color: MUTED }}>
        {children}
      </div>
    </ShopFrame>
  )
}
