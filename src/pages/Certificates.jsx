import { useState, useEffect } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { LOGO_B64, SIG_B64 } from '../lib/assets'
import * as XLSX from 'xlsx'

export default function Certificates() {
  const { user } = useAuth()
  const [artworks, setArtworks]     = useState([])
  const [artists, setArtists]       = useState([])
  const [certs, setCerts]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [saving, setSaving]         = useState(false)
  const [artworkSearch, setArtworkSearch] = useState('')

  // Form state — all editable before printing
  const [form, setForm] = useState({
    artwork_id:'',
    // Editable artwork fields (pre-filled from selection, editable before print)
    artist_name:'', title:'', medium:'', dimensions:'', year:'',
    // Certificate fields
    client_name:'', show_client:false, notes:'',
    include_signature: true,
    issued_date: new Date().toISOString().split('T')[0],
  })

  async function load() {
    const [w, a, c] = await Promise.all([
      fetchAll('artworks', { order:'title' }),
      fetchAll('artists', { order:'name' }),
      supabase.from('certificates').select('*').order('created_at', { ascending: false }).then(r => r.data || []),
    ])
    setArtworks(w); setArtists(a); setCerts(c)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const artistMap = Object.fromEntries(artists.map(a => [a.id, a]))

  const selectedArtwork = artworks.find(w => w.id === form.artwork_id)
  const selectedArtist  = selectedArtwork ? artistMap[selectedArtwork.artist_id] : null

  const filteredArtworks = artworks.filter(w => {
    if (!artworkSearch) return false
    const q = artworkSearch.toLowerCase()
    return w.title?.toLowerCase().includes(q) || artistMap[w.artist_id]?.name?.toLowerCase().includes(q)
  }).slice(0, 8)

  // When artwork selected, pre-fill editable fields
  function selectArtwork(w) {
    const artist = artistMap[w.artist_id]
    setForm(f => ({
      ...f,
      artwork_id: w.id,
      artist_name: artist?.name || '',
      title: w.title || '',
      medium: w.medium || '',
      dimensions: w.dimensions || '',
      year: w.year || '',
    }))
    setArtworkSearch('')
  }

  async function generateAndSave() {
    if (!form.title || !form.artist_name) return alert('Artist and title are required')
    setSaving(true)
    try {
      const { data: certNum } = await supabase.rpc('next_cert_number')
      await supabase.from('certificates').insert({
        cert_number: certNum,
        artwork_id: form.artwork_id || null,
        artist_name: form.artist_name,
        title: form.title,
        medium: form.medium,
        dimensions: form.dimensions,
        year: form.year,
        client_name: form.show_client ? form.client_name : null,
        show_client: form.show_client,
        issued_date: form.issued_date,
        issued_by: user?.id,
        notes: form.notes,
      })
      await load()

      const html = buildCOAHTML({
        certNumber: certNum,
        artistName: form.artist_name,
        title: form.title,
        medium: form.medium,
        dimensions: form.dimensions,
        year: form.year,
        imageUrl: selectedArtwork?.image_url || null,
        clientName: form.show_client ? form.client_name : null,
        issued: form.issued_date,
        notes: form.notes,
        includeSignature: form.include_signature,
      })
      const w = window.open('', '_blank', 'width=1200,height=800')
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 700)

      setModal(false)
      setForm({ artwork_id:'', artist_name:'', title:'', medium:'', dimensions:'', year:'', client_name:'', show_client:false, notes:'', include_signature:true, issued_date: new Date().toISOString().split('T')[0] })
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally { setSaving(false) }
  }

  function reprint(cert) {
    const artwork = artworks.find(w => w.id === cert.artwork_id)
    const html = buildCOAHTML({
      certNumber: cert.cert_number,
      artistName: cert.artist_name,
      title: cert.title,
      medium: cert.medium,
      dimensions: cert.dimensions,
      year: cert.year,
      imageUrl: artwork?.image_url || null,
      clientName: cert.show_client ? cert.client_name : null,
      issued: cert.issued_date,
      notes: cert.notes,
      includeSignature: true,
    })
    const w = window.open('', '_blank', 'width=1200,height=800')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 700)
  }

  function exportExcel() {
    const rows = certs.map(c => ({
      'Certificate No.': c.cert_number,
      'Artist':          c.artist_name,
      'Title':           c.title,
      'Medium':          c.medium || '',
      'Dimensions':      c.dimensions || '',
      'Year':            c.year || '',
      'Issued To':       c.show_client && c.client_name ? c.client_name : '',
      'Date Issued':     c.issued_date || '',
      'Notes':           c.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    // Column widths
    ws['!cols'] = [18,22,32,22,18,8,24,14,30].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Certificates')
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `Hourglass_COA_Registry_${today}.xlsx`)
  }

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading…</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Certificates of Authenticity</div>
          <div className="page-subtitle">{certs.length} issued · Continuing from HG-26-2180</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline" onClick={exportExcel}>↓ Export registry (Excel)</button>
          <button className="btn btn-primary" onClick={() => setModal(true)}>Generate COA</button>
        </div>
      </div>

      {/* Registry table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Certificate no.</th><th>Artist</th><th>Title</th>
                <th>Medium</th><th>Issued to</th><th>Date issued</th><th></th>
              </tr>
            </thead>
            <tbody>
              {certs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--muted)', padding:'32px' }}>No certificates issued yet</td></tr>
              )}
              {certs.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily:'var(--font-serif)', fontWeight:500, color:'var(--gold)' }}>{c.cert_number}</td>
                  <td>{c.artist_name}</td>
                  <td style={{ fontStyle:'italic' }}>{c.title}</td>
                  <td style={{ color:'var(--muted)', fontSize:13 }}>{c.medium || '—'}</td>
                  <td style={{ color:'var(--muted)', fontSize:13 }}>{c.show_client && c.client_name ? c.client_name : '—'}</td>
                  <td style={{ color:'var(--muted)', fontSize:12 }}>{c.issued_date}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => reprint(c)}>Reprint</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-xl" style={{ maxHeight:'94vh' }}>
            <div className="modal-header">
              <div className="modal-title">Generate Certificate of Authenticity</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>

              {/* LEFT — form */}
              <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
                <div style={{ fontSize:11, color:'var(--muted)', background:'var(--parchment)', padding:'9px 12px', borderRadius:3, lineHeight:1.6 }}>
                  Search for an artwork to pre-fill details, or enter everything manually. All fields are editable before printing.
                </div>

                {/* Artwork search */}
                <div className="form-group">
                  <label className="form-label">Search artwork (optional)</label>
                  <input
                    className="form-input"
                    placeholder="Type title or artist name…"
                    value={artworkSearch}
                    onChange={e => setArtworkSearch(e.target.value)}
                  />
                  {artworkSearch && filteredArtworks.length > 0 && (
                    <div style={{ border:'1px solid var(--line)', borderTop:'none', borderRadius:'0 0 3px 3px', background:'var(--white)', maxHeight:200, overflowY:'auto' }}>
                      {filteredArtworks.map(w => (
                        <div key={w.id}
                          style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', display:'flex', gap:10, alignItems:'center' }}
                          onClick={() => selectArtwork(w)}
                        >
                          {w.image_url && <img src={w.image_url} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:2 }} />}
                          <div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{w.title}</div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name} · {w.year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop:'1px solid var(--line)', paddingTop:13 }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>Certificate details — edit as needed</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Artist *</label>
                      <input className="form-input" value={form.artist_name} onChange={e=>setForm(f=>({...f,artist_name:e.target.value}))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Title *</label>
                      <input className="form-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Medium</label>
                      <input className="form-input" value={form.medium} onChange={e=>setForm(f=>({...f,medium:e.target.value}))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Dimensions</label>
                      <input className="form-input" value={form.dimensions} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Year</label>
                      <input className="form-input" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date issued</label>
                      <input className="form-input" type="date" value={form.issued_date} onChange={e=>setForm(f=>({...f,issued_date:e.target.value}))} />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop:'1px solid var(--line)', paddingTop:13 }}>
                  <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                    <label style={{ display:'flex', gap:7, alignItems:'center', cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={form.show_client} onChange={e=>setForm(f=>({...f,show_client:e.target.checked}))} style={{ width:'auto' }} />
                      Include client name
                    </label>
                    <label style={{ display:'flex', gap:7, alignItems:'center', cursor:'pointer', fontSize:13 }}>
                      <input type="checkbox" checked={form.include_signature} onChange={e=>setForm(f=>({...f,include_signature:e.target.checked}))} style={{ width:'auto' }} />
                      Include signature
                    </label>
                  </div>
                  {form.show_client && (
                    <div className="form-group">
                      <label className="form-label">Client name</label>
                      <input className="form-input" value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} placeholder="Name as it should appear on certificate" />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Additional notes (optional)</label>
                    <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* RIGHT — live preview */}
              <div>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>Preview</div>
                <COAPreview form={form} imageUrl={selectedArtwork?.image_url || null} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={generateAndSave} disabled={saving || !form.title || !form.artist_name}>
                {saving ? 'Generating…' : 'Generate & print'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── LIVE PREVIEW (scaled down, updates as you type) ──────────
function COAPreview({ form, imageUrl }) {
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
  const fields = [
    ['ARTIST', form.artist_name],
    ['TITLE', form.title],
    ['MEDIUM', form.medium],
    ['DIMENSIONS', form.dimensions],
    ['YEAR', form.year],
    form.show_client && form.client_name ? ['ISSUED TO', form.client_name] : null,
    ['DATE ISSUED', form.issued_date ? new Date(form.issued_date).toLocaleDateString('en-GB') : today],
  ].filter(Boolean)

  const certNoPreview = `HG-26-XXXX`

  return (
    <div style={{ border:'1px solid var(--line)', borderRadius:3, overflow:'hidden', background:'#fff',
                  transform:'scale(0.72)', transformOrigin:'top left', width:'139%', boxShadow:'0 2px 12px rgba(0,0,0,.1)' }}>
      {/* Landscape COA preview */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:380, fontFamily:'Georgia,serif' }}>
        {/* Left panel */}
        <div style={{ padding:'28px 32px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
          <div>
            {/* Logo */}
            <div style={{ marginBottom:28 }}>
              <img src={LOGO_B64} alt="Hourglass Gallery" style={{ height:32, objectFit:'contain' }} />
            </div>
            {/* Title */}
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:28, fontWeight:700, letterSpacing:'-.01em', lineHeight:1.05, fontFamily:'-apple-system,sans-serif', color:'#1a1714' }}>
                CERTIFICATE OF
              </div>
              <div style={{ fontSize:28, fontWeight:700, letterSpacing:'-.01em', lineHeight:1.05, fontFamily:'-apple-system,sans-serif', color:'#1a1714' }}>
                AUTHENTICITY
              </div>
              <div style={{ width:48, height:2, background:'#1a1714', marginTop:8, marginBottom:10 }} />
              <div style={{ fontSize:9, color:'#6b6760', lineHeight:1.6, fontFamily:'-apple-system,sans-serif', maxWidth:260 }}>
                Hourglass Gallery certifies that the artwork described below is an authentic and original work by the artist.
              </div>
            </div>
            {/* Fields */}
            <div style={{ marginTop:18 }}>
              {fields.map(([label, value]) => value ? (
                <div key={label} style={{ display:'flex', gap:12, borderBottom:'1px solid #e8e5e0', padding:'6px 0', alignItems:'baseline' }}>
                  <div style={{ fontFamily:'-apple-system,sans-serif', fontSize:7, fontWeight:700, letterSpacing:'.1em', color:'#6b6760', width:74, flexShrink:0 }}>{label}</div>
                  <div style={{ fontSize:11, color:'#1a1714', fontFamily: label==='TITLE'?'Georgia,serif':'-apple-system,sans-serif', fontStyle: label==='TITLE'?'italic':'normal' }}>{value}</div>
                </div>
              ) : null)}
            </div>
            {/* Notes */}
            {form.notes && (
              <div style={{ marginTop:12, fontSize:9, color:'#6b6760', lineHeight:1.65, fontFamily:'-apple-system,sans-serif' }}>{form.notes}</div>
            )}
          </div>
          {/* Footer: signature + cert no */}
          <div style={{ marginTop:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
              <div>
                {form.include_signature && (
                  <img src={SIG_B64} alt="Signature" style={{ height:36, objectFit:'contain', marginBottom:2 }} />
                )}
                <div style={{ borderTop:'1px solid #1a1714', width:160, paddingTop:4 }}>
                  <div style={{ fontFamily:'-apple-system,sans-serif', fontSize:7, color:'#6b6760' }}>For Hourglass Gallery</div>
                  <div style={{ fontFamily:'-apple-system,sans-serif', fontSize:7, color:'#6b6760' }}>Authorised Signatory</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'-apple-system,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'.08em', color:'#1a1714' }}>CERTIFICATE NO. {certNoPreview}</div>
              </div>
            </div>
          </div>
        </div>
        {/* Right panel — image */}
        <div style={{ background:'#f5f0e8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px' }}>
          {imageUrl
            ? <>
                <img src={imageUrl} alt="" style={{ maxWidth:'100%', maxHeight:260, objectFit:'contain', border:'1px solid #ddd9d1' }} />
                <div style={{ marginTop:8, fontFamily:'-apple-system,sans-serif', fontSize:8, color:'#6b6760', textAlign:'center' }}>
                  {[form.artist_name, form.title, form.year, form.medium].filter(Boolean).join(', ')}
                </div>
              </>
            : <div style={{ color:'#bbb', fontSize:11, fontFamily:'-apple-system,sans-serif', textAlign:'center' }}>
                Artwork image will appear here
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// ── COA HTML (print document) ────────────────────────────────
function buildCOAHTML({ certNumber, artistName, title, medium, dimensions, year, imageUrl, clientName, issued, notes, includeSignature }) {
  const issuedFormatted = issued
    ? new Date(issued).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' })
    : new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' })

  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

  const fields = [
    ['ARTIST',      artistName],
    ['TITLE',       title,      true], // italic flag
    ['MEDIUM',      medium],
    ['DIMENSIONS',  dimensions],
    ['YEAR',        year],
    clientName ? ['ISSUED TO', clientName] : null,
    ['DATE ISSUED', issuedFormatted],
  ].filter(Boolean)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Certificate of Authenticity — ${e(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  @page{size:A4 landscape;margin:16mm 20mm;}
  body{
    font-family:Georgia,serif;
    color:#1a1714;
    background:#fff;
    width:100%;
  }
  .page{
    display:grid;
    grid-template-columns:1fr 1fr;
    min-height:160mm;
    gap:0;
  }
  /* ── LEFT PANEL ── */
  .left{
    padding:0 36px 0 0;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
  }
  .logo{
    height:36px;
    object-fit:contain;
    object-position:left;
    display:block;
    margin-bottom:28px;
  }
  .cert-heading{
    font-family:-apple-system,'Helvetica Neue',sans-serif;
    font-size:34px;
    font-weight:800;
    letter-spacing:-.02em;
    line-height:1.0;
    color:#1a1714;
    margin-bottom:8px;
  }
  .underline{
    width:56px;height:2.5px;background:#1a1714;margin:10px 0 10px;
  }
  .certifies{
    font-family:-apple-system,sans-serif;
    font-size:10px;
    color:#6b6760;
    line-height:1.7;
    max-width:280px;
    margin-bottom:20px;
  }
  /* Fields */
  .field-row{
    display:flex;
    align-items:baseline;
    gap:14px;
    border-bottom:1px solid #e8e5e0;
    padding:7px 0;
  }
  .field-label{
    font-family:-apple-system,sans-serif;
    font-size:8px;
    font-weight:700;
    letter-spacing:.1em;
    color:#6b6760;
    width:82px;
    flex-shrink:0;
    text-transform:uppercase;
  }
  .field-value{
    font-family:-apple-system,sans-serif;
    font-size:12px;
    color:#1a1714;
  }
  .field-value-italic{
    font-family:Georgia,serif;
    font-size:12px;
    font-style:italic;
    color:#1a1714;
  }
  .notes-text{
    font-family:-apple-system,sans-serif;
    font-size:9px;
    color:#6b6760;
    line-height:1.65;
    margin-top:12px;
  }
  /* Footer */
  .footer{
    margin-top:20px;
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
  }
  .sig-block{}
  .sig-img{
    height:48px;
    object-fit:contain;
    display:block;
    margin-bottom:4px;
  }
  .sig-line{
    border-top:1px solid #1a1714;
    width:180px;
    padding-top:5px;
  }
  .sig-name{
    font-family:-apple-system,sans-serif;
    font-size:8px;
    color:#6b6760;
    line-height:1.5;
  }
  .cert-no{
    text-align:right;
    font-family:-apple-system,sans-serif;
    font-size:9px;
    font-weight:700;
    letter-spacing:.09em;
    color:#1a1714;
  }
  /* ── RIGHT PANEL ── */
  .right{
    border-left:1px solid #e8e5e0;
    padding-left:36px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
  }
  .artwork-img{
    max-width:100%;
    max-height:155mm;
    object-fit:contain;
    display:block;
    border:1px solid #ddd9d1;
  }
  .img-caption{
    font-family:-apple-system,sans-serif;
    font-size:8px;
    color:#6b6760;
    margin-top:8px;
    text-align:center;
    line-height:1.5;
  }
  .no-image{
    width:100%;
    height:120mm;
    background:#f5f0e8;
    display:flex;
    align-items:center;
    justify-content:center;
    font-family:-apple-system,sans-serif;
    font-size:10px;
    color:#aaa;
  }
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- LEFT -->
  <div class="left">
    <div>
      <!-- Logo -->
      <img class="logo" src="${LOGO_B64}" alt="Hourglass Gallery">

      <!-- Heading -->
      <div class="cert-heading">CERTIFICATE OF<br>AUTHENTICITY</div>
      <div class="underline"></div>
      <div class="certifies">
        Hourglass Gallery certifies that the artwork described below is an<br>authentic and original work by the artist.
      </div>

      <!-- Fields -->
      ${fields.map(([label, value, italic]) => value ? `
      <div class="field-row">
        <div class="field-label">${e(label)}</div>
        <div class="${italic ? 'field-value-italic' : 'field-value'}">${e(value)}</div>
      </div>` : '').join('')}

      ${notes ? `<div class="notes-text">${e(notes)}</div>` : ''}
    </div>

    <!-- Footer: signature + cert number -->
    <div class="footer">
      <div class="sig-block">
        ${includeSignature ? `<img class="sig-img" src="${SIG_B64}" alt="Signature">` : '<div style="height:48px"></div>'}
        <div class="sig-line">
          <div class="sig-name">For Hourglass Gallery<br>Authorised Signatory</div>
        </div>
      </div>
      <div class="cert-no">CERTIFICATE NO. ${e(certNumber)}</div>
    </div>
  </div>

  <!-- RIGHT -->
  <div class="right">
    ${imageUrl
      ? `<img class="artwork-img" src="${e(imageUrl)}" alt="${e(title)}">
         <div class="img-caption">${[artistName, title, year, medium].filter(Boolean).map(e).join(', ')}</div>`
      : `<div class="no-image">No image on file</div>`
    }
  </div>

</div>
</body>
</html>`
}
