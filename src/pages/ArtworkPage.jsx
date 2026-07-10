import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import QRCode from 'qrcode'

export default function ArtworkPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [artwork, setArtwork] = useState(null)
  const [displayCurrency, setDisplayCurrency] = useState('NGN')
  const [usdRate, setUsdRate] = useState(null)
  const [artist, setArtist]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const qrRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data: w } = await supabase
        .from('artworks')
        .select('*')
        .eq('id', id)
        .single()
      if (!w) { setLoading(false); return }
      setArtwork(w)
      if (w.artist_id) {
        const { data: a } = await supabase
          .from('artists')
          .select('*')
          .eq('id', w.artist_id)
          .single()
        setArtist(a)
      }
      // Generate QR code for this page URL
      const url = `${window.location.origin}/artwork/${id}`
      const dataUrl = await QRCode.toDataURL(url, {
        width: 220,
        margin: 1,
        color: { dark: '#1a1714', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
      setLoading(false)
    }
    load()
  }, [id])

  function whatsappShare() {
    const url = `${window.location.origin}/artwork/${id}`
    const text = artwork
      ? `*${artwork.title}*\n${artist?.name || ''}\n${[artwork.year, artwork.medium, artwork.dimensions].filter(Boolean).join(' · ')}\n\n${url}`
      : url
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function printPage() {
    window.print()
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:'var(--font-sans,-apple-system,sans-serif)', color:'#9a9490', fontSize:14 }}>Loading…</div>
    </div>
  )

  if (!artwork) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <div style={{ fontFamily:'Georgia,serif', fontSize:22, color:'#1a1714' }}>Artwork not found</div>
      <button onClick={() => navigate('/')} style={{ fontFamily:'sans-serif', fontSize:13, color:'#9a9490', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>← Back to catalogue</button>
    </div>
  )

  const publicUrl = `${window.location.origin}/artwork/${id}`
  const detailParts = [
    artwork.medium,
    artwork.dimensions,
    artwork.year,
  ].filter(Boolean)

  return (
    <>
      {/* ── PRINT STYLES ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .artwork-page { max-width: 100% !important; padding: 0 !important; }
        }
        @media screen {
          .print-only { display: none; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500&display=swap');
      `}</style>

      <div style={{ minHeight:'100vh', background:'#faf8f5', fontFamily:"'Inter',-apple-system,sans-serif" }}>

        {/* Top bar */}
        <div className="no-print" style={{ borderBottom:'1px solid #e8e3db', background:'#fff', padding:'12px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <a href="/" style={{ display:'flex', flexDirection:'column', gap:0, textDecoration:'none', lineHeight:1.1 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:1 }}>
              <span style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:15, letterSpacing:'-.01em', color:'#1a1714' }}>HOURGLASS</span>
              <span style={{ fontWeight:700, fontSize:15, color:'#E05C2A' }}>/</span>
            </div>
            <span style={{ fontWeight:700, fontSize:8, letterSpacing:'.2em', color:'#E05C2A', marginLeft:1 }}>GALLERY</span>
          </a>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={whatsappShare}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:3, border:'1px solid #25D366', background:'#fff', color:'#25D366', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Share on WhatsApp
            </button>
            {qrDataUrl && (
              <a href={qrDataUrl} download={`QR-${artwork.hg_code||artwork.id}.png`}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:3, border:'1px solid #e8e3db', background:'#fff', color:'#1a1714', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textDecoration:'none' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg>
                Print QR Code
              </a>
            )}
            <button onClick={printPage}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:3, border:'1px solid #e8e3db', background:'#fff', color:'#1a1714', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              🖨 Print
            </button>
          </div>
        </div>



        {/* Main content */}
        <div className="artwork-page" style={{ maxWidth:1000, margin:'0 auto', padding:'48px 28px 80px' }}>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'start' }}>

            {/* Left — image */}
            <div>
              {artwork.image_url ? (
                <img
                  src={artwork.image_url}
                  alt={artwork.title}
                  style={{ width:'100%', display:'block', borderRadius:2, objectFit:'contain', maxHeight:560, background:'#f0ece6' }}
                />
              ) : (
                <div style={{ width:'100%', aspectRatio:'3/4', background:'#ede9e2', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:13, color:'#b0aa9f' }}>No image on file</span>
                </div>
              )}


            </div>

            {/* Right — details */}
            <div style={{ paddingTop:8 }}>

              {/* HG code */}
              {artwork.hg_code && (
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.12em', color:'#b8883a', marginBottom:10, textTransform:'uppercase' }}>
                  {artwork.hg_code}
                </div>
              )}

              {/* Title */}
              <h1 style={{ fontFamily:"'Cormorant Garamond',Georgia,serif", fontWeight:400, fontSize:38, lineHeight:1.05, color:'#1a1714', margin:'0 0 6px' }}>
                {artwork.title}
              </h1>

              {/* Artist */}
              {artist && (
                <div style={{ fontSize:16, color:'#5a5550', marginBottom:20, fontWeight:400 }}>
                  {artist.name}
                  {(artist.born || artist.died) && (
                    <span style={{ fontSize:13, color:'#9a9490', marginLeft:8 }}>
                      ({artist.born}{artist.died ? `–${artist.died}` : ''}){artist.nationality ? `, ${artist.nationality}` : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Detail fields */}
              <div style={{ borderTop:'1px solid #e8e3db', paddingTop:20, marginBottom:20, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  ['Year', artwork.year],
                  ['Medium', artwork.medium],
                  ['Dimensions', artwork.dimensions],
                  ['Category', artwork.category],
                  ['Edition', artwork.edition_info],
                  ['Series', artwork.series],
                  ['Framed', artwork.is_framed ? `Yes${artwork.frame_cost ? ` (frame: ₦${Number(artwork.frame_cost).toLocaleString()})` : ''}` : null],
                  ['Location', artwork.location],
                ].filter(([,v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display:'flex', gap:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'#9a9490', width:110, flexShrink:0, paddingTop:1 }}>{label}</div>
                    <div style={{ fontSize:14, color:'#1a1714' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Price + availability */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24, paddingBottom:24, borderBottom:'1px solid #e8e3db' }}>
                {(artwork.price || artwork.retail_price) && (
                  <div style={{ fontFamily:"'Cormorant Garamond',Georgia,serif", fontSize:26, fontWeight:500, color:'#1a1714' }}>
                    {artwork.price || `₦${Number(artwork.retail_price).toLocaleString()}`}
                  </div>
                )}
                <span style={{
                  fontSize:11, padding:'3px 10px', borderRadius:2, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
                  background: artwork.availability === 'Available' ? '#edf7f0' : artwork.availability === 'Sold' ? '#fef2f0' : '#fef9ec',
                  color: artwork.availability === 'Available' ? '#27ae60' : artwork.availability === 'Sold' ? '#c0392b' : '#b8862a',
                }}>
                  {artwork.availability}
                </span>
              </div>

              {/* Artist bio + writeup — same box */}
              {(artist?.bio || artwork.writeup) && (
                <div style={{ background:'#f7f4ef', borderRadius:3, padding:'20px 22px', marginBottom:24 }}>
                  {artist?.bio && (
                    <>
                      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'#9a9490', marginBottom:10 }}>About the artist</div>
                      {artist.portrait_url && (
                        <img src={artist.portrait_url} alt={artist.name}
                          style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', float:'left', marginRight:14, marginBottom:4 }}/>
                      )}
                      <div style={{ fontSize:13, color:'#3d3a36', lineHeight:1.75 }}>{artist.bio}</div>
                      <div style={{ clear:'both' }}/>
                    </>
                  )}
                  {artwork.writeup && (
                    <>
                      {artist?.bio && <div style={{ borderTop:'1px solid #e8e3db', margin:'20px 0' }} />}
                      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.1em', textTransform:'uppercase', color:'#9a9490', marginBottom:10 }}>About this work</div>
                      <div style={{ fontSize:14, color:'#3d3a36', lineHeight:1.75, whiteSpace:'pre-wrap' }}>{artwork.writeup}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop:64, paddingTop:24, borderTop:'1px solid #e8e3db', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, color:'#9a9490' }}>
              Hourglass Gallery · 298A Akin Olugbade Street, Victoria Island, Lagos
            </div>
            <a href="/" style={{ fontSize:12, color:'#9a9490', textDecoration:'none' }}>← Back to catalogue</a>
          </div>
        </div>
      </div>
    </>
  )
}
