import { useState, useEffect } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

export default function Certificates() {
  const { user } = useAuth()
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists] = useState([])
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ artwork_id:'', client_name:'', show_client:false, notes:'' })
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [artworkSearch, setArtworkSearch] = useState('')

  async function load() {
    const [w, a, c] = await Promise.all([
      fetchAll('artworks', { order:'title' }),
      fetchAll('artists', { order:'name' }),
      fetchAll('certificates', { order:'created_at' }),
    ])
    setArtworks(w); setArtists(a); setCerts(c)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const artistMap = Object.fromEntries(artists.map(a => [a.id, a]))

  const selectedArtwork = artworks.find(w => w.id === form.artwork_id)
  const selectedArtist = selectedArtwork ? artistMap[selectedArtwork.artist_id] : null

  const filteredArtworks = artworks.filter(w => {
    if (!artworkSearch) return false
    const q = artworkSearch.toLowerCase()
    return w.title?.toLowerCase().includes(q) || artistMap[w.artist_id]?.name?.toLowerCase().includes(q)
  }).slice(0, 8)

  function buildPreview() {
    if (!selectedArtwork) return alert('Please select an artwork')
    setPreview({
      artwork: selectedArtwork,
      artist: selectedArtist,
      client: form.show_client ? form.client_name : null,
      notes: form.notes,
    })
  }

  async function generateAndSave() {
    if (!selectedArtwork) return alert('Please select an artwork')
    setSaving(true)
    try {
      const { data: certNum } = await supabase.rpc('next_cert_number')
      const issued = new Date().toISOString().split('T')[0]
      await supabase.from('certificates').insert({
        cert_number: certNum,
        artwork_id: selectedArtwork.id,
        artist_name: selectedArtist?.name || '',
        title: selectedArtwork.title,
        medium: selectedArtwork.medium || '',
        dimensions: selectedArtwork.dimensions || '',
        year: selectedArtwork.year || '',
        client_name: form.show_client ? form.client_name : null,
        show_client: form.show_client,
        issued_date: issued,
        issued_by: user?.id,
        notes: form.notes,
      })
      await load()

      // Open print window
      const html = buildCOAHTML({
        certNumber: certNum,
        artwork: selectedArtwork,
        artist: selectedArtist,
        clientName: form.show_client ? form.client_name : null,
        issued,
        notes: form.notes,
      })
      const w = window.open('', '_blank', 'width=1000,height=700')
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 600)

      setModal(false)
      setForm({ artwork_id:'', client_name:'', show_client:false, notes:'' })
      setPreview(null)
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally { setSaving(false) }
  }

  function reprint(cert) {
    const artwork = artworks.find(w => w.id === cert.artwork_id)
    const artist = artwork ? artistMap[artwork.artist_id] : null
    const html = buildCOAHTML({
      certNumber: cert.cert_number,
      artwork: { ...cert, image_url: artwork?.image_url },
      artist,
      clientName: cert.show_client ? cert.client_name : null,
      issued: cert.issued_date,
      notes: cert.notes,
    })
    const w = window.open('', '_blank', 'width=1000,height=700')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading…</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Certificates of Authenticity</div>
          <div className="page-subtitle">{certs.length} issued · Next number follows HG-{new Date().getFullYear().toString().slice(-2)}-XXXX</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>Generate COA</button>
      </div>

      {/* Certificate list */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Certificate no.</th><th>Artwork</th><th>Artist</th><th>Issued to</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {certs.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--muted)', padding:'32px' }}>No certificates yet</td></tr>
              )}
              {certs.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily:'var(--font-serif)', fontWeight:500 }}>{c.cert_number}</td>
                  <td>{c.title}</td>
                  <td style={{ color:'var(--muted)', fontSize:13 }}>{c.artist_name}</td>
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
          <div className="modal modal-xl" style={{ maxHeight:'92vh' }}>
            <div className="modal-header">
              <div className="modal-title">Generate Certificate of Authenticity</div>
              <button className="btn btn-ghost btn-icon" onClick={() => { setModal(false); setPreview(null) }}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
              {/* Left: form */}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-group">
                  <label className="form-label">Select artwork *</label>
                  <input
                    className="form-input"
                    placeholder="Type artwork title or artist name…"
                    value={artworkSearch || (selectedArtwork ? selectedArtwork.title + (selectedArtist ? ' — ' + selectedArtist.name : '') : '')}
                    onChange={e => { setArtworkSearch(e.target.value); if (!e.target.value) setForm(f=>({...f,artwork_id:''})) }}
                  />
                  {artworkSearch && filteredArtworks.length > 0 && (
                    <div style={{ border:'1px solid var(--line)', borderTop:'none', borderRadius:'0 0 3px 3px', background:'var(--white)', maxHeight:220, overflowY:'auto' }}>
                      {filteredArtworks.map(w => (
                        <div key={w.id}
                          style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', display:'flex', gap:10, alignItems:'center' }}
                          onClick={() => { setForm(f=>({...f,artwork_id:w.id})); setArtworkSearch('') }}
                        >
                          {w.image_url && <img src={w.image_url} alt="" style={{ width:36, height:36, objectFit:'cover', borderRadius:2 }} />}
                          <div>
                            <div style={{ fontSize:13, fontWeight:500 }}>{w.title}</div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name} · {w.year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedArtwork && (
                  <div style={{ background:'var(--parchment)', borderRadius:3, padding:'12px 14px', fontSize:13 }}>
                    <div style={{ fontWeight:500, marginBottom:4 }}>{selectedArtwork.title}</div>
                    {selectedArtist && <div style={{ color:'var(--muted)' }}>{selectedArtist.name}</div>}
                    <div style={{ color:'var(--muted)', marginTop:4 }}>
                      {[selectedArtwork.year, selectedArtwork.medium, selectedArtwork.dimensions].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" id="showClient" checked={form.show_client} onChange={e=>setForm(f=>({...f,show_client:e.target.checked}))} style={{ width:'auto' }} />
                  <label htmlFor="showClient" style={{ fontSize:13, cursor:'pointer' }}>Include client name on certificate</label>
                </div>

                {form.show_client && (
                  <div className="form-group">
                    <label className="form-label">Client name</label>
                    <input className="form-input" value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} placeholder="Name as it should appear on certificate" />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Additional notes (optional)</label>
                  <textarea className="form-textarea" rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any additional information to include…" />
                </div>

                <button className="btn btn-outline" onClick={buildPreview}>Preview certificate</button>
              </div>

              {/* Right: preview */}
              <div>
                <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12 }}>Preview</div>
                {preview ? (
                  <div style={{ border:'1px solid var(--line)', borderRadius:3, padding:'20px', background:'var(--white)', fontSize:12, lineHeight:1.7, transform:'scale(0.85)', transformOrigin:'top left', width:'118%' }}>
                    <COAPreview preview={preview} />
                  </div>
                ) : (
                  <div style={{ border:'1px dashed var(--line)', borderRadius:3, padding:'40px 20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
                    Select an artwork and click "Preview certificate"
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setModal(false); setPreview(null) }}>Cancel</button>
              <button className="btn btn-primary" onClick={generateAndSave} disabled={saving || !selectedArtwork}>
                {saving ? 'Generating…' : 'Generate & print'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function COAPreview({ preview }) {
  const { artwork, artist, clientName } = preview
  return (
    <div style={{ fontFamily:'Georgia,serif' }}>
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:400, letterSpacing:'.05em', marginBottom:2 }}>HOURGLASS GALLERY</div>
        <div style={{ fontSize:9, letterSpacing:'.15em', textTransform:'uppercase', color:'#6b6760' }}>Lagos · Nigeria</div>
        <div style={{ marginTop:12, fontSize:11, letterSpacing:'.12em', textTransform:'uppercase', borderTop:'1px solid #1a1714', borderBottom:'1px solid #1a1714', padding:'5px 0' }}>
          Certificate of Authenticity
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'#6b6760', marginBottom:2 }}>Artist</div>
            <div style={{ fontSize:14, fontWeight:400 }}>{artist?.name || '—'}</div>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'#6b6760', marginBottom:2 }}>Title</div>
            <div style={{ fontSize:14, fontStyle:'italic' }}>{artwork.title}</div>
          </div>
          {artwork.year && <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'#6b6760', marginBottom:2 }}>Year</div>
            <div>{artwork.year}</div>
          </div>}
          {artwork.medium && <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'#6b6760', marginBottom:2 }}>Medium</div>
            <div>{artwork.medium}</div>
          </div>}
          {artwork.dimensions && <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'#6b6760', marginBottom:2 }}>Dimensions</div>
            <div>{artwork.dimensions}</div>
          </div>}
          {clientName && <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'#6b6760', marginBottom:2 }}>Issued to</div>
            <div>{clientName}</div>
          </div>}
        </div>
        {artwork.image_url && (
          <div>
            <img src={artwork.image_url} alt={artwork.title} style={{ width:'100%', maxHeight:200, objectFit:'contain', border:'1px solid #ddd9d1' }} />
          </div>
        )}
      </div>
      <div style={{ marginTop:16, paddingTop:12, borderTop:'1px solid #ddd9d1', fontSize:9, color:'#6b6760', lineHeight:1.6 }}>
        This certificate confirms the authenticity of the above-described work. Hourglass Gallery, Lagos, certifies that the artwork described herein is an original work by the named artist.
      </div>
    </div>
  )
}

function buildCOAHTML({ certNumber, artwork, artist, clientName, issued, notes }) {
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>COA — ${artwork.title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{size:A4 landscape;margin:20mm;}
body{font-family:Georgia,serif;color:#1a1714;background:#fff;}
.page{display:grid;grid-template-columns:1fr 1fr;min-height:100vh;gap:40px;align-items:center;padding:40px;}
.left{display:flex;flex-direction:column;justify-content:space-between;height:100%;}
.header{text-align:center;margin-bottom:32px;}
.gallery-name{font-size:24px;letter-spacing:.06em;font-weight:400;margin-bottom:4px;}
.gallery-sub{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#6b6760;margin-bottom:16px;}
.cert-title{font-size:11px;letter-spacing:.14em;text-transform:uppercase;border-top:1.5px solid #1a1714;border-bottom:1.5px solid #1a1714;padding:6px 0;text-align:center;}
.fields{margin:24px 0;}
.field{margin-bottom:14px;}
.field-label{font-family:-apple-system,sans-serif;font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#6b6760;margin-bottom:3px;}
.field-value{font-size:14px;font-weight:400;}
.field-value-italic{font-size:15px;font-style:italic;}
.cert-no{font-family:-apple-system,sans-serif;font-size:11px;color:#6b6760;margin-top:24px;}
.disclaimer{font-family:-apple-system,sans-serif;font-size:8px;color:#6b6760;line-height:1.6;margin-top:16px;padding-top:12px;border-top:1px solid #ddd9d1;}
.sig-area{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.sig-line{border-top:1px solid #1a1714;padding-top:6px;font-family:-apple-system,sans-serif;font-size:9px;letter-spacing:.06em;color:#6b6760;}
.right img{width:100%;max-height:460px;object-fit:contain;border:1px solid #ddd9d1;}
.img-caption{font-family:-apple-system,sans-serif;font-size:9px;color:#6b6760;margin-top:8px;text-align:center;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="page">
<div class="left">
  <div>
    <div class="header">
      <div class="gallery-name">Hourglass Gallery</div>
      <div class="gallery-sub">Lagos · Nigeria</div>
      <div class="cert-title">Certificate of Authenticity</div>
    </div>
    <div class="fields">
      <div class="field"><div class="field-label">Artist</div><div class="field-value">${escH(artist?.name || '—')}</div></div>
      <div class="field"><div class="field-label">Title</div><div class="field-value-italic">${escH(artwork.title)}</div></div>
      ${artwork.year ? `<div class="field"><div class="field-label">Year</div><div class="field-value">${escH(artwork.year)}</div></div>` : ''}
      ${artwork.medium ? `<div class="field"><div class="field-label">Medium</div><div class="field-value">${escH(artwork.medium)}</div></div>` : ''}
      ${artwork.dimensions ? `<div class="field"><div class="field-label">Dimensions</div><div class="field-value">${escH(artwork.dimensions)}</div></div>` : ''}
      ${clientName ? `<div class="field"><div class="field-label">Issued to</div><div class="field-value">${escH(clientName)}</div></div>` : ''}
      ${notes ? `<div class="field"><div class="field-label">Notes</div><div class="field-value" style="font-size:12px">${escH(notes)}</div></div>` : ''}
    </div>
    <div class="cert-no">Certificate no. ${escH(certNumber)} · Issued ${escH(issued)}</div>
    <div class="disclaimer">
      This certificate confirms the authenticity of the above-described artwork. Hourglass Gallery, 298A Akin Olugbade Street, Victoria Island, Lagos, hereby certifies that the work described herein is an original work by the named artist and was sold through Hourglass Gallery. This certificate should be retained as part of the artwork's provenance documentation.
    </div>
    <div class="sig-area">
      <div class="sig-line">Gallery director</div>
      <div class="sig-line">Date</div>
    </div>
  </div>
</div>
<div class="right">
  ${artwork.image_url ? `<img src="${artwork.image_url}" alt="${escH(artwork.title)}">` : '<div style="height:400px;background:#ede9e2;display:flex;align-items:center;justify-content:center;font-size:12px;color:#6b6760">No image available</div>'}
  <div class="img-caption">${escH(artwork.title)}${artwork.year?' · '+artwork.year:''}</div>
</div>
</div>
</body></html>`
}

function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
