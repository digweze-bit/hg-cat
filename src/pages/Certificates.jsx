import { useState, useEffect } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { LOGO_B64, SIG_B64 } from '../lib/assets'
import * as XLSX from 'xlsx'

export default function Certificates() {
  const { user } = useAuth()
  const [artworks, setArtworks]   = useState([])
  const [artists, setArtists]     = useState([])
  const [certs, setCerts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [artworkSearch, setArtworkSearch] = useState('')

  const [form, setForm] = useState({
    artwork_id:'',
    artist_name:'', title:'', medium:'', dimensions:'', year:'',
    client_name:'', show_client:false, notes:'',
    include_signature:true,
    issued_date: new Date().toISOString().split('T')[0],
  })

  async function load() {
    const [w, a, c] = await Promise.all([
      fetchAll('artworks', { order:'title' }),
      fetchAll('artists', { order:'name' }),
      supabase.from('certificates').select('*').order('created_at', { ascending:false }).then(r => r.data||[]),
    ])
    setArtworks(w); setArtists(a); setCerts(c)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const artistMap = Object.fromEntries(artists.map(a => [a.id, a]))
  const selectedArtwork = artworks.find(w => w.id === form.artwork_id)

  const filteredArtworks = artworks.filter(w => {
    if (!artworkSearch) return false
    const q = artworkSearch.toLowerCase()
    return w.title?.toLowerCase().includes(q) || artistMap[w.artist_id]?.name?.toLowerCase().includes(q)
  }).slice(0, 8)

  function selectArtwork(w) {
    const artist = artistMap[w.artist_id]
    setForm(f => ({
      ...f, artwork_id:w.id,
      artist_name:artist?.name||'', title:w.title||'',
      medium:w.medium||'', dimensions:w.dimensions||'', year:w.year||'',
    }))
    setArtworkSearch('')
  }

  async function generateAndSave() {
    if (!form.title||!form.artist_name) return alert('Artist and title are required')
    setSaving(true)
    try {
      const { data:certNum } = await supabase.rpc('next_cert_number')
      await supabase.from('certificates').insert({
        cert_number:certNum, artwork_id:form.artwork_id||null,
        artist_name:form.artist_name, title:form.title,
        medium:form.medium, dimensions:form.dimensions, year:form.year,
        client_name:form.show_client?form.client_name:null,
        show_client:form.show_client,
        issued_date:form.issued_date, issued_by:user?.id, notes:form.notes,
      })
      await load()
      printCOA({
        certNumber:certNum,
        artistName:form.artist_name, title:form.title,
        medium:form.medium, dimensions:form.dimensions, year:form.year,
        imageUrl:selectedArtwork?.image_url||null,
        clientName:form.show_client?form.client_name:null,
        issued:form.issued_date, notes:form.notes,
        includeSignature:form.include_signature,
      })
      setModal(false)
      setForm({ artwork_id:'', artist_name:'', title:'', medium:'', dimensions:'', year:'', client_name:'', show_client:false, notes:'', include_signature:true, issued_date:new Date().toISOString().split('T')[0] })
    } catch(err) { alert('Failed: '+err.message) }
    finally { setSaving(false) }
  }

  function reprint(cert) {
    const artwork = artworks.find(w => w.id===cert.artwork_id)
    printCOA({
      certNumber:cert.cert_number, artistName:cert.artist_name, title:cert.title,
      medium:cert.medium, dimensions:cert.dimensions, year:cert.year,
      imageUrl:artwork?.image_url||null,
      clientName:cert.show_client?cert.client_name:null,
      issued:cert.issued_date, notes:cert.notes, includeSignature:true,
    })
  }

  function exportExcel() {
    const rows = certs.map(c => ({
      'Certificate No.':c.cert_number, 'Artist':c.artist_name, 'Title':c.title,
      'Medium':c.medium||'', 'Dimensions':c.dimensions||'', 'Year':c.year||'',
      'Issued To':c.show_client&&c.client_name?c.client_name:'',
      'Date Issued':c.issued_date||'', 'Notes':c.notes||'',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [16,24,32,22,18,8,24,14,30].map(w=>({wch:w}))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Certificates')
    XLSX.writeFile(wb, `Hourglass_COA_Registry_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (loading) return <div style={{color:'var(--muted)'}}>Loading…</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Certificates of Authenticity</div>
          <div className="page-subtitle">{certs.length} issued</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline" onClick={exportExcel}>↓ Export registry</button>
          <button className="btn btn-primary" onClick={()=>setModal(true)}>Generate COA</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Certificate no.</th><th>Artist</th><th>Title</th><th>Medium</th><th>Issued to</th><th>Date issued</th><th></th></tr></thead>
            <tbody>
              {certs.length===0&&<tr><td colSpan={7} style={{textAlign:'center',color:'var(--muted)',padding:'32px'}}>No certificates issued yet</td></tr>}
              {certs.map(c=>(
                <tr key={c.id}>
                  <td style={{fontFamily:'var(--font-serif)',fontWeight:500,color:'var(--gold)'}}>{c.cert_number}</td>
                  <td>{c.artist_name}</td>
                  <td style={{fontStyle:'italic'}}>{c.title}</td>
                  <td style={{color:'var(--muted)',fontSize:13}}>{c.medium||'—'}</td>
                  <td style={{color:'var(--muted)',fontSize:13}}>{c.show_client&&c.client_name?c.client_name:'—'}</td>
                  <td style={{color:'var(--muted)',fontSize:12}}>{c.issued_date}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={()=>reprint(c)}>Reprint</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal&&(
        <div className="modal-overlay">
          <div className="modal modal-xl" style={{maxHeight:'94vh'}}>
            <div className="modal-header">
              <div className="modal-title">Generate Certificate of Authenticity</div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:28}}>

              {/* LEFT — form */}
              <div style={{display:'flex',flexDirection:'column',gap:13}}>
                <div className="form-group">
                  <label className="form-label">Search artwork (optional — pre-fills details)</label>
                  <input className="form-input" placeholder="Type title or artist name…" value={artworkSearch} onChange={e=>setArtworkSearch(e.target.value)} />
                  {artworkSearch&&filteredArtworks.length>0&&(
                    <div style={{border:'1px solid var(--line)',borderTop:'none',borderRadius:'0 0 3px 3px',background:'var(--white)',maxHeight:200,overflowY:'auto'}}>
                      {filteredArtworks.map(w=>(
                        <div key={w.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid var(--line-soft)',display:'flex',gap:10,alignItems:'center'}} onClick={()=>selectArtwork(w)}>
                          {w.image_url&&<img src={w.image_url} alt="" style={{width:32,height:32,objectFit:'cover',borderRadius:2}}/>}
                          <div>
                            <div style={{fontSize:13,fontWeight:500}}>{w.title}</div>
                            <div style={{fontSize:11,color:'var(--muted)'}}>{artistMap[w.artist_id]?.name} · {w.year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{borderTop:'1px solid var(--line)',paddingTop:13,display:'flex',flexDirection:'column',gap:11}}>
                  <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--muted)'}}>Artwork details — all editable</div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Artist *</label><input className="form-input" value={form.artist_name} onChange={e=>setForm(f=>({...f,artist_name:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Title *</label><input className="form-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Medium</label><input className="form-input" value={form.medium} onChange={e=>setForm(f=>({...f,medium:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Dimensions</label><input className="form-input" value={form.dimensions} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))}/></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Year</label><input className="form-input" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Date issued</label><input className="form-input" type="date" value={form.issued_date} onChange={e=>setForm(f=>({...f,issued_date:e.target.value}))}/></div>
                  </div>
                </div>

                <div style={{borderTop:'1px solid var(--line)',paddingTop:13,display:'flex',flexDirection:'column',gap:11}}>
                  <div style={{display:'flex',gap:18}}>
                    <label style={{display:'flex',gap:7,alignItems:'center',cursor:'pointer',fontSize:13}}>
                      <input type="checkbox" checked={form.show_client} onChange={e=>setForm(f=>({...f,show_client:e.target.checked}))} style={{width:'auto'}}/>
                      Include client name
                    </label>
                    <label style={{display:'flex',gap:7,alignItems:'center',cursor:'pointer',fontSize:13}}>
                      <input type="checkbox" checked={form.include_signature} onChange={e=>setForm(f=>({...f,include_signature:e.target.checked}))} style={{width:'auto'}}/>
                      Include signature
                    </label>
                  </div>
                  {form.show_client&&(
                    <div className="form-group"><label className="form-label">Client name</label><input className="form-input" value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} placeholder="Name as it should appear"/></div>
                  )}
                  <div className="form-group"><label className="form-label">Additional notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
                </div>
              </div>

              {/* RIGHT — preview */}
              <div>
                <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--muted)',marginBottom:10}}>Live preview</div>
                <COAPreview form={form} imageUrl={selectedArtwork?.image_url||null}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={generateAndSave} disabled={saving||!form.title||!form.artist_name}>
                {saving?'Generating…':'Generate & print'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── LIVE PREVIEW ─────────────────────────────────────────────
function COAPreview({ form, imageUrl }) {
  const issued = form.issued_date
    ? new Date(form.issued_date).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})
    : ''

  const fields = [
    ['ARTIST', form.artist_name],
    ['TITLE', form.title],
    ['MEDIUM', form.medium],
    ['DIMENSIONS', form.dimensions],
    ['YEAR', form.year],
    form.show_client&&form.client_name ? ['ISSUED TO', form.client_name] : null,
    ['DATE ISSUED', issued],
  ].filter(Boolean)

  return (
    <div style={{
      transform:'scale(0.68)', transformOrigin:'top left', width:'147%',
      border:'1px solid #ccc', boxShadow:'0 2px 16px rgba(0,0,0,.15)',
      background:'#fff', fontFamily:'Georgia,serif',
    }}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:370}}>
        {/* Left */}
        <div style={{padding:'32px 36px 28px', display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
          <div>
            <img src={LOGO_B64} alt="Hourglass Gallery" style={{height:28, objectFit:'contain', objectPosition:'left', display:'block', marginBottom:32}}/>
            <div style={{fontFamily:'-apple-system,sans-serif', fontSize:30, fontWeight:800, letterSpacing:'-.02em', lineHeight:1.0, color:'#1a1714', marginBottom:6}}>
              CERTIFICATE OF<br/>AUTHENTICITY
            </div>
            <div style={{width:52, height:2.5, background:'#e05c00', marginTop:10, marginBottom:12}}/>
            <div style={{fontFamily:'-apple-system,sans-serif', fontSize:8.5, color:'#6b6760', lineHeight:1.7, maxWidth:230, marginBottom:24}}>
              Hourglass Gallery certifies that the artwork described below is an authentic and original work by the artist.
            </div>
            <div>
              {fields.map(([label, value]) => value ? (
                <div key={label} style={{display:'flex', gap:12, borderBottom:'1px solid #e8e5e0', padding:'7px 0', alignItems:'baseline'}}>
                  <div style={{fontFamily:'-apple-system,sans-serif', fontSize:7, fontWeight:700, letterSpacing:'.1em', color:'#3d3a36', width:80, flexShrink:0}}>{label}</div>
                  <div style={{fontFamily: label==='TITLE'?'Georgia,serif':'-apple-system,sans-serif', fontSize:11, fontStyle:label==='TITLE'?'italic':'normal', color:'#1a1714'}}>{value}</div>
                </div>
              ) : null)}
            </div>
          </div>
          {/* Footer */}
          <div style={{marginTop:20, display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
            <div>
              {form.include_signature
                ? <img src={SIG_B64} alt="" style={{height:44, objectFit:'contain', display:'block', marginBottom:2}}/>
                : <div style={{height:44}}/>
              }
              <div style={{borderTop:'1px solid #1a1714', width:160, paddingTop:5}}>
                <div style={{fontFamily:'-apple-system,sans-serif', fontSize:7, color:'#6b6760', lineHeight:1.5}}>For Hourglass Gallery<br/>Authorised Signatory</div>
              </div>
            </div>
            <div style={{fontFamily:'-apple-system,sans-serif', fontSize:7.5, fontWeight:700, letterSpacing:'.08em', color:'#1a1714', textAlign:'right'}}>
              CERTIFICATE NO.<br/>HG-26-XXXX
            </div>
          </div>
        </div>
        {/* Right */}
        <div style={{borderLeft:'1px solid #e8e5e0', padding:'28px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#faf9f7'}}>
          {imageUrl
            ? <>
                <img src={imageUrl} alt="" style={{maxWidth:'100%', maxHeight:270, objectFit:'contain', border:'1px solid #ddd9d1', display:'block'}}/>
                <div style={{fontFamily:'-apple-system,sans-serif', fontSize:8, color:'#6b6760', marginTop:8, textAlign:'center', lineHeight:1.5}}>
                  {[form.artist_name, form.title, form.year, form.medium].filter(Boolean).join(', ')}
                </div>
              </>
            : <div style={{color:'#ccc', fontSize:11, fontFamily:'-apple-system,sans-serif', textAlign:'center', lineHeight:1.7}}>
                Artwork image<br/>will appear here
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// ── PRINT ────────────────────────────────────────────────────
function printCOA({ certNumber, artistName, title, medium, dimensions, year, imageUrl, clientName, issued, notes, includeSignature }) {
  function e(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  const issuedFmt = issued ? new Date(issued).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''

  const fields = [
    ['ARTIST', artistName],
    ['TITLE', title, true],
    ['MEDIUM', medium],
    ['DIMENSIONS', dimensions],
    ['YEAR', year],
    clientName ? ['ISSUED TO', clientName] : null,
    ['DATE ISSUED', issuedFmt],
  ].filter(Boolean)

  // Embed the data URLs directly — critical so they render in the new window
  const logoSrc = LOGO_B64
  const sigSrc  = SIG_B64

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Certificate of Authenticity — ${e(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{size:A4 landscape;margin:14mm 18mm;}
body{font-family:Georgia,serif;color:#1a1714;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{display:grid;grid-template-columns:1fr 1fr;height:calc(297mm - 28mm);gap:0;}
/* LEFT */
.left{padding:0 44px 0 0;display:flex;flex-direction:column;justify-content:space-between;}
.logo{height:40px;object-fit:contain;object-position:left center;display:block;margin-bottom:36px;}
.heading{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1.0;color:#1a1714;margin-bottom:10px;}
.rule{width:56px;height:3px;background:#e05c00;margin-bottom:14px;}
.certifies{font-family:-apple-system,sans-serif;font-size:10.5px;color:#6b6760;line-height:1.7;max-width:310px;margin-bottom:28px;}
.fields{}
.field-row{display:flex;align-items:baseline;gap:16px;border-bottom:1px solid #e8e5e0;padding:8px 0;}
.fl{font-family:-apple-system,sans-serif;font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3d3a36;width:92px;flex-shrink:0;}
.fv{font-family:-apple-system,sans-serif;font-size:13px;color:#1a1714;}
.fv-italic{font-family:Georgia,serif;font-size:13px;font-style:italic;color:#1a1714;}
.notes{font-family:-apple-system,sans-serif;font-size:9.5px;color:#6b6760;line-height:1.65;margin-top:14px;}
/* FOOTER */
.footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;}
.sig-img{height:56px;object-fit:contain;display:block;margin-bottom:4px;}
.sig-spacer{height:56px;display:block;}
.sig-line{border-top:1px solid #1a1714;width:200px;padding-top:6px;}
.sig-name{font-family:-apple-system,sans-serif;font-size:9px;color:#6b6760;line-height:1.6;}
.cert-no{font-family:-apple-system,sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.1em;color:#1a1714;text-align:right;text-transform:uppercase;}
/* RIGHT */
.right{border-left:1px solid #e8e5e0;padding-left:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.art-img{max-width:100%;max-height:172mm;object-fit:contain;display:block;border:1px solid #ddd9d1;}
.art-cap{font-family:-apple-system,sans-serif;font-size:8.5px;color:#6b6760;margin-top:10px;text-align:center;line-height:1.5;}
.no-img{width:100%;height:140mm;background:#f5f0e8;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;font-size:11px;color:#bbb;}
</style>
</head>
<body>
<div class="page">
  <div class="left">
    <div>
      <img class="logo" src="${logoSrc}" alt="Hourglass Gallery">
      <div class="heading">CERTIFICATE OF<br>AUTHENTICITY</div>
      <div class="rule"></div>
      <div class="certifies">Hourglass Gallery certifies that the artwork described below is an authentic and original work by the artist.</div>
      <div class="fields">
        ${fields.map(([label, value, italic]) => value ? `<div class="field-row"><div class="fl">${e(label)}</div><div class="${italic?'fv-italic':'fv'}">${e(value)}</div></div>` : '').join('')}
      </div>
      ${notes ? `<div class="notes">${e(notes)}</div>` : ''}
    </div>
    <div class="footer">
      <div>
        ${includeSignature ? `<img class="sig-img" src="${sigSrc}" alt="Signature">` : `<div class="sig-spacer"></div>`}
        <div class="sig-line">
          <div class="sig-name">For Hourglass Gallery<br>Authorised Signatory</div>
        </div>
      </div>
      <div class="cert-no">Certificate No.<br>${e(certNumber)}</div>
    </div>
  </div>
  <div class="right">
    ${imageUrl
      ? `<img class="art-img" src="${e(imageUrl)}" alt="${e(title)}">
         <div class="art-cap">${[artistName,title,year,medium].filter(Boolean).map(e).join(', ')}</div>`
      : `<div class="no-img">No image on file</div>`
    }
  </div>
</div>
</body>
</html>`

  const w = window.open('', '_blank', 'width=1200,height=820')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 800)
}
