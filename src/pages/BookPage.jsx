import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabasePublic'

/**
 * Loads the signed-in client on demand, only when the anon read came back
 * empty — i.e. staff opening a hidden book's QR. Same approach as ArtworkPage.
 */
async function staffClientIfSignedIn() {
  try {
    if (!localStorage.getItem('hgcat-auth')) return null
  } catch (_) { return null }
  const { supabase: authed } = await import('../lib/supabase')
  const { data: { session } } = await authed.auth.getSession()
  return session ? authed : null
}

// Public page a book's QR label opens (/book/:id). Like the artwork page, the
// price shows only in the gallery view the QR code links to.
export default function BookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isGalleryView = searchParams.get('view') === 'gallery'
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.scrollTo(0, 0)
    async function load() {
      let { data: b } = await supabase.from('books').select('*').eq('id', id).maybeSingle()
      if (!b) {
        const staffClient = await staffClientIfSignedIn()
        if (staffClient) ({ data: b } = await staffClient.from('books').select('*').eq('id', id).maybeSingle())
      }
      setBook(b || null)
      setLoading(false)
    }
    load()
  }, [id])

  function whatsappShare() {
    const url = `${window.location.origin}/book/${id}`
    const text = book
      ? `*${book.title}*\n${[book.author, [book.publisher, book.year].filter(Boolean).join(', ')].filter(Boolean).join('\n')}\n\n${url}`
      : url
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:"'Inter',-apple-system,sans-serif", color:'#9a9490', fontSize:13 }}>Loading...</div>
    </div>
  )

  if (!book) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif", fontSize:22, color:'#1a1714' }}>Book not found</div>
      <button onClick={() => navigate('/')} style={{ fontFamily:"'Inter',sans-serif", fontSize:13, color:'#9a9490', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>&larr; Back to catalogue</button>
    </div>
  )

  const inStock = (book.stock_count || 0) > 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap');
        .bk-grid { display:grid; grid-template-columns: 1fr; gap:24px; align-items:start; }
        .bk-cover { width:100%; max-height:60vh; object-fit:contain; }
        @media (min-width: 900px) {
          .bk-grid { grid-template-columns: 2fr 3fr; gap:56px; }
          .bk-cover { max-height:620px; }
        }
        @media print { .no-print { display:none !important; } }
      `}</style>

      <div style={{ minHeight:'100vh', background:'#faf8f5', fontFamily:"'Inter',-apple-system,sans-serif" }}>
        <div className="no-print" style={{ borderBottom:'1px solid #e8e3db', background:'#fff', padding:'14px 20px', display:'flex', justifyContent:'center' }}>
          <a href="/" style={{ display:'flex', flexDirection:'column', alignItems:'center', lineHeight:1.1, textDecoration:'none' }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:1 }}>
              <span style={{ fontWeight:700, fontSize:14, letterSpacing:'-.01em', color:'#1a1714' }}>HOURGLASS</span>
              <span style={{ fontWeight:700, fontSize:14, color:'#E05C2A' }}>/</span>
            </div>
            <span style={{ fontWeight:700, fontSize:8, letterSpacing:'.2em', color:'#E05C2A', marginLeft:1 }}>GALLERY</span>
          </a>
        </div>

        <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 16px 56px' }}>
          <div className="bk-grid">
            <div>
              {book.cover_url ? (
                <img className="bk-cover" src={book.cover_url} alt={book.title}
                  style={{ display:'block', background:'#f0ece6', borderRadius:2 }} />
              ) : (
                <div style={{ aspectRatio:'3/4', background:'#ede9e2', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:12, color:'#b0aa9f' }}>No cover on file</span>
                </div>
              )}
            </div>

            <div style={{ paddingTop:8 }}>
              <h1 style={{ fontFamily:"'Cormorant Garamond',Georgia,serif", fontWeight:400, fontSize:30, lineHeight:1.15, color:'#1a1714', margin:'0 0 6px' }}>
                {book.title}
              </h1>
              {book.author && <div style={{ fontSize:15, color:'#5a5550', marginBottom:18 }}>{book.author}</div>}

              <div style={{ borderTop:'1px solid #e8e3db', paddingTop:16, marginBottom:16, display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  ['Publisher', book.publisher],
                  ['Year', book.year],
                  ['Format', book.format],
                  ['Subject', book.subject],
                  ['ISBN', book.isbn],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display:'flex' }}>
                    <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'#9a9490', width:100, flexShrink:0, paddingTop:1 }}>{label}</div>
                    <div style={{ fontSize:13, color:'#1a1714' }}>{value}</div>
                  </div>
                ))}
              </div>

              {isGalleryView && Number(book.price) > 0 && (
                <div style={{ paddingTop:16, borderTop:'1px solid #e8e3db', fontSize:16, fontWeight:600, color:'#1a1714' }}>
                  {'₦'}{Number(book.price).toLocaleString()}
                </div>
              )}

              <div style={{ marginTop:16 }}>
                <span style={{
                  fontSize:9, padding:'3px 9px', borderRadius:2, fontWeight:600, letterSpacing:'.07em', textTransform:'uppercase',
                  background: inStock ? '#edf7f0' : '#fef2f0', color: inStock ? '#27ae60' : '#c0392b',
                }}>
                  {inStock ? 'In stock' : 'Out of stock'}
                </span>
              </div>

              {book.description && (
                <div style={{ marginTop:24, fontSize:13, color:'#3d3a36', lineHeight:1.75 }}>
                  {book.description.split('\n\n').map((p, i) => <p key={i} style={{ marginBottom:'1em' }}>{p.trim()}</p>)}
                </div>
              )}

              <div className="no-print" style={{ marginTop:20, display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={whatsappShare}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:3, border:'1px solid #25D366', background:'#fff', color:'#1a8d4a', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  Share on WhatsApp
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop:40, paddingTop:20, borderTop:'1px solid #e8e3db', display:'flex', flexDirection:'column', gap:6, alignItems:'center', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#9a9490' }}>Hourglass Gallery · 298A Akin Olugbade Street, Victoria Island, Lagos</div>
            <a href="/" style={{ fontSize:11, color:'#9a9490', textDecoration:'none' }}>&larr; Back to catalogue</a>
          </div>
        </div>
      </div>
    </>
  )
}
