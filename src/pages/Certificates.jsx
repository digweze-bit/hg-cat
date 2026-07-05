import { useState, useEffect } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { LOGO_B64, SIG_B64 } from '../lib/assets'
import * as XLSX from 'xlsx'

// ── DIMENSION HELPERS ────────────────────────────────────────
function buildDimensions(form) {
  const h = (form.dim_h||'').trim()
  const w = (form.dim_w||'').trim()
  const d = (form.dim_d||'').trim()
  if (!h && !w && !d) return ''
  const parts = [h, w].filter(Boolean)
  if (d) parts.push(d)
  return parts.join(' × ') + ' inches'
}

function parseDimensions(str) {
  // Try to split existing "H × W × D inches" or "H × W inches" strings
  const cleaned = str.replace(/\s*inches?\s*/i, '').trim()
  const parts = cleaned.split(/[×x]/i).map(s => s.trim()).filter(Boolean)
  return { dim_h: parts[0]||'', dim_w: parts[1]||'', dim_d: parts[2]||'' }
}

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
    artwork_id:'', artist_name:'', title:'', medium:'', dim_h:'', dim_w:'', dim_d:'', year:'',
    is_edition:false, edition_number:'', edition_size:'', edition_type:'',
    client_name:'', show_client:false, notes:'',
    include_signature:true,
    issued_date: new Date().toISOString().split('T')[0],
  })

  async function load() {
    const [w, a, c] = await Promise.all([
      fetchAll('artworks', { order:'title' }),
      fetchAll('artists',  { order:'name' }),
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
      medium:w.medium||'', year:w.year||'',
      ...parseDimensions(w.dimensions||''),
    }))
    setArtworkSearch('')
  }

  function editionLabel() {
    if (!form.is_edition) return null
    const parts = []
    if (form.edition_type) parts.push(form.edition_type)
    if (form.edition_number && form.edition_size) parts.push(`${form.edition_number}/${form.edition_size}`)
    else if (form.edition_number) parts.push(`No. ${form.edition_number}`)
    return parts.join(' — ') || null
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
        medium:form.medium, dimensions:buildDimensions(form), year:form.year,
        editionLabel:editionLabel(),
        imageUrl:selectedArtwork?.image_url||null,
        clientName:form.show_client?form.client_name:null,
        issued:form.issued_date, notes:form.notes,
        includeSignature:form.include_signature,
      })
      setModal(false)
      setForm({ artwork_id:'', artist_name:'', title:'', medium:'', dim_h:'', dim_w:'', dim_d:'', year:'', is_edition:false, edition_number:'', edition_size:'', edition_type:'', client_name:'', show_client:false, notes:'', include_signature:true, issued_date:new Date().toISOString().split('T')[0] })
    } catch(err) { alert('Failed: '+err.message) }
    finally { setSaving(false) }
  }

  function reprint(cert) {
    const artwork = artworks.find(w => w.id===cert.artwork_id)
    printCOA({
      certNumber:cert.cert_number, artistName:cert.artist_name, title:cert.title,
      medium:cert.medium, dimensions:cert.dimensions, year:cert.year,
      editionLabel:null,
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
          <div className="modal modal-xl" style={{maxHeight:'94vh', maxWidth:1100}}>
            <div className="modal-header">
              <div className="modal-title">Generate Certificate of Authenticity</div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{display:'grid',gridTemplateColumns:'380px 1fr',gap:28}}>

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
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <label className="form-label">Dimensions (inches)</label>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <input className="form-input" style={{width:64}} placeholder="H" value={form.dim_h} onChange={e=>setForm(f=>({...f,dim_h:e.target.value}))}/>
                      <span style={{color:'var(--muted)',fontSize:13}}>×</span>
                      <input className="form-input" style={{width:64}} placeholder="W" value={form.dim_w} onChange={e=>setForm(f=>({...f,dim_w:e.target.value}))}/>
                      <span style={{color:'var(--muted)',fontSize:13}}>×</span>
                      <input className="form-input" style={{width:64}} placeholder="D" value={form.dim_d} onChange={e=>setForm(f=>({...f,dim_d:e.target.value}))}/>
                      <span style={{color:'var(--muted)',fontSize:12,flexShrink:0}}>in</span>
                    </div>
                    {buildDimensions(form)&&<div style={{fontSize:11,color:'var(--muted)'}}>Will appear as: <strong>{buildDimensions(form)}</strong></div>}
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Year</label><input className="form-input" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Date issued</label><input className="form-input" type="date" value={form.issued_date} onChange={e=>setForm(f=>({...f,issued_date:e.target.value}))}/></div>
                  </div>
                </div>

                {/* Edition toggle */}
                <div style={{borderTop:'1px solid var(--line)',paddingTop:13,display:'flex',flexDirection:'column',gap:11}}>
                  <label style={{display:'flex',gap:8,alignItems:'center',cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={form.is_edition} onChange={e=>setForm(f=>({...f,is_edition:e.target.checked}))} style={{width:'auto'}}/>
                    <span>Edition</span>
                    <span style={{fontSize:11,color:'var(--muted)'}}>— tick if this work is an edition</span>
                  </label>
                  {form.is_edition&&(
                    <div style={{display:'flex',flexDirection:'column',gap:10,background:'var(--surface-0,#f8f7f5)',borderRadius:6,padding:'12px 14px'}}>
                      <div className="form-group" style={{marginBottom:0}}>
                        <label className="form-label">Edition type</label>
                        <input className="form-input" placeholder="e.g. Artist's proof, Exhibition copy, Open edition…" value={form.edition_type} onChange={e=>setForm(f=>({...f,edition_type:e.target.value}))}/>
                      </div>
                      <div className="form-row">
                        <div className="form-group" style={{marginBottom:0}}><label className="form-label">Edition number</label><input className="form-input" placeholder="e.g. 3" value={form.edition_number} onChange={e=>setForm(f=>({...f,edition_number:e.target.value}))}/></div>
                        <div className="form-group" style={{marginBottom:0}}><label className="form-label">Edition size</label><input className="form-input" placeholder="e.g. 10" value={form.edition_size} onChange={e=>setForm(f=>({...f,edition_size:e.target.value}))}/></div>
                      </div>
                      {editionLabel()&&<div style={{fontSize:11,color:'var(--muted)'}}>Will appear as: <strong>{editionLabel()}</strong></div>}
                    </div>
                  )}
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
                <COAPreview form={form} imageUrl={selectedArtwork?.image_url||null} editionLabel={editionLabel()} logo={LOGO_B64} sig={SIG_B64}/>
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
function COAPreview({ form, imageUrl, editionLabel, logo, sig }) {
  const issued = form.issued_date
    ? new Date(form.issued_date+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})
    : ''

  const fields = [
    ['ARTIST', form.artist_name, false],
    ['TITLE',  form.title, true],
    editionLabel ? ['EDITION', editionLabel, false] : null,
    ['MEDIUM', form.medium, false],
    ['DIMENSIONS', buildDimensions(form), false],
    ['YEAR', form.year, false],
    form.show_client&&form.client_name ? ['ISSUED TO', form.client_name, false] : null,
    ['DATE ISSUED', issued, false],
  ].filter(Boolean)

  const displayW = 440
  // A4 landscape ratio 297:210
  const displayH = Math.round(displayW * (210/297))

  return (
    <div style={{width:displayW, height:displayH, overflow:'hidden', border:'1px solid #ccc', boxShadow:'0 2px 12px rgba(0,0,0,.1)', borderRadius:2, background:'#fff', position:'relative', fontFamily:'Helvetica, Arial, sans-serif'}}>

      {/* Scale factor: preview width vs 297mm */}
      {(() => {
        const s = displayW / 297
        const mm = v => v * s

        const lx = mm(12.8)
        const ORANGE = '#E05C2A'

        return (
          <div style={{position:'absolute',inset:0}}>

            {/* Logo */}
            <div style={{position:'absolute', top:mm(12), left:lx}}>
              <img src={logo} alt="Hourglass Gallery" style={{height:mm(7), objectFit:'contain', objectPosition:'left center', display:'block'}}/>
            </div>

            {/* Heading */}
            <div style={{position:'absolute', top:mm(31), left:lx}}>
              <div style={{fontFamily:"'Times New Roman', Times, serif", fontSize:mm(10.3), fontWeight:400, color:'#000', lineHeight:1.05}}>
                CERTIFICATE OF<br/>AUTHENTICITY
              </div>
              {/* Orange rule — tight under heading */}
              <div style={{width:mm(18), height:mm(0.35), background:ORANGE, marginTop:mm(2)}}/>
              {/* Intro text */}
              <div style={{fontSize:mm(3), color:'#555', lineHeight:1.65, marginTop:mm(5), maxWidth:mm(120)}}>
                Hourglass Gallery certifies that the artwork described below is an<br/>
                authentic and original work by the artist.
              </div>
            </div>

            {/* Fields */}
            <div style={{position:'absolute', top:mm(90), left:lx, width:mm(125)}}>
              {fields.map(([label, value, italic]) => value ? (
                <div key={label} style={{display:'flex', gap:mm(4), borderBottom:`${mm(0.25)}px solid #ccc`, padding:`${mm(1.2)}px 0`, alignItems:'baseline', minHeight:mm(9.5)}}>
                  <div style={{fontSize:mm(2.83), fontWeight:700, letterSpacing:'.12em', color:'#000', width:mm(24), flexShrink:0, textTransform:'uppercase'}}>{label}</div>
                  <div style={{fontSize:mm(3.35), color:'#333', fontStyle:italic?'italic':'normal'}}>{value}</div>
                </div>
              ) : null)}
            </div>

            {/* Disclaimer */}
            <div style={{position:'absolute', top:mm(152), left:lx}}>
              <div style={{fontSize:mm(2.5), color:'#555', lineHeight:1.65}}>
                The work is accompanied by this Certificate of Authenticity.<br/>
                All reasonable due diligence has been exercised to verify the provenance and authenticity of this work.
              </div>
            </div>

            {/* Signature line + cert no */}
            <div style={{position:'absolute', bottom:mm(8), left:lx, right:mm(12), display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
              <div>
                {form.include_signature
                  ? <img src={sig} alt="" style={{height:mm(14), objectFit:'contain', display:'block', marginBottom:mm(1)}}/>
                  : <div style={{height:mm(14)}}/>
                }
                <div style={{borderTop:`${mm(0.25)}px solid #000`, width:mm(55), paddingTop:mm(1.5)}}>
                  <div style={{fontSize:mm(3), color:'#000', lineHeight:1.65}}>For Hourglass Gallery<br/>Authorised Signatory</div>
                </div>
              </div>
            </div>

            {/* Right column — image centred */}
            {(() => {
              const rightColX = displayW * 0.46
              const rightColW = displayW * 0.54
              const mTop = mm(16)
              const mBot = mm(16)
              const imgW = rightColW * 0.55
              const imgH = (displayH - mTop - mBot) * 0.55
              const imgX = rightColX + (rightColW - imgW) / 2
              const imgY = mTop + (displayH - mTop - mBot - imgH) / 2
              const sigY = displayH - mBot - mm(8)

              return (
                <>
                  <div style={{position:'absolute', left:imgX, top:imgY, width:imgW, height:imgH, display:'flex', alignItems:'center', justifyContent:'center'}}>
                    {imageUrl
                      ? <img src={imageUrl} alt="" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}}/>
                      : <span style={{fontSize:mm(2.7), color:'#ccc'}}>Artwork image</span>
                    }
                  </div>
                  {/* Caption */}
                  <div style={{position:'absolute', left:0, width:displayW * 0.46 + displayW * 0.54, top:imgY + imgH + mm(7), textAlign:'center', paddingLeft:rightColX}}>
                    <span style={{fontSize:mm(2.65), color:'#555'}}>
                      {[form.artist_name, form.title, form.year, form.medium].filter(Boolean).join(', ')}
                    </span>
                  </div>
                  {/* Certificate number centred under image */}
                  <div style={{position:'absolute', left:rightColX, width:rightColW, top:sigY + mm(3.5), textAlign:'center'}}>
                    <span style={{fontSize:mm(2.83), fontWeight:700, color:'#000', letterSpacing:'.08em'}}>CERTIFICATE NO. HG-26-XXXX</span>
                  </div>
                </>
              )
            })()}

          </div>
        )
      })()}
    </div>
  )
}

// ── PRINT ────────────────────────────────────────────────────
function printCOA({ certNumber, artistName, title, medium, dimensions, year, editionLabel, imageUrl, clientName, issued, notes, includeSignature }) {
  function e(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  const issuedFmt = issued ? new Date(issued+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''

  const fields = [
    ['ARTIST', artistName, false],
    ['TITLE',  title, true],
    editionLabel ? ['EDITION', editionLabel, false] : null,
    ['MEDIUM', medium, false],
    ['DIMENSIONS', dimensions, false],
    ['YEAR', year, false],
    clientName ? ['ISSUED TO', clientName, false] : null,
    ['DATE ISSUED', issuedFmt, false],
  ].filter(Boolean)

  const logoSrc = LOGO_B64
  const sigSrc  = SIG_B64

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Certificate of Authenticity — ${e(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
@page{size:A4 landscape;margin:0;}
body{font-family:Helvetica,Arial,sans-serif;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;width:297mm;height:210mm;overflow:hidden;}
.page{position:relative;width:297mm;height:210mm;}

.logo{position:absolute;top:12mm;left:12.8mm;display:flex;align-items:baseline;gap:1mm;}
.logo-text{font-size:7mm;font-weight:700;color:#000;letter-spacing:-0.01em;}
.logo-slash{font-size:7mm;font-weight:700;color:#E05C2A;}
.logo-gallery{font-size:3.5mm;font-weight:700;color:#E05C2A;margin-left:1mm;}

.heading{position:absolute;top:31mm;left:12.8mm;}
.heading h1{font-family:'Times New Roman',Times,serif;font-size:10.3mm;font-weight:400;color:#000;line-height:1.05;}
.rule{width:18mm;height:0.35mm;background:#E05C2A;margin-top:2mm;}
.certifies{font-size:3mm;color:#555555;line-height:1.65;margin-top:5mm;max-width:120mm;}

.fields{position:absolute;top:90mm;left:12.8mm;width:125mm;}
.field-row{display:flex;align-items:baseline;gap:4mm;border-bottom:0.25mm solid #ccc;padding:1.2mm 0;min-height:9.5mm;}
.fl{font-size:2.83mm;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;width:24mm;flex-shrink:0;}
.fv{font-size:3.35mm;color:#333333;}
.fv-italic{font-size:3.35mm;color:#333333;font-style:italic;font-family:'Times New Roman',Times,serif;}

.disclaimer{position:absolute;top:152mm;left:12.8mm;}
.disclaimer p{font-size:2.5mm;color:#555555;line-height:1.65;}

.sig-area{position:absolute;bottom:8mm;left:12.8mm;}
.sig-img{height:14mm;object-fit:contain;display:block;margin-bottom:1mm;}
.sig-spacer{height:14mm;display:block;}
.sig-line{border-top:0.25mm solid #000;width:55mm;padding-top:1.5mm;}
.sig-name{font-size:3mm;color:#000;line-height:1.65;}

.right-col{position:absolute;top:0;right:0;width:54%;height:100%;display:flex;align-items:center;justify-content:center;}
.art-wrap{display:flex;flex-direction:column;align-items:center;}
.art-img{max-width:88mm;max-height:94mm;object-fit:contain;display:block;}
.no-img{width:88mm;height:94mm;display:flex;align-items:center;justify-content:center;font-size:3mm;color:#ccc;}
.art-cap{font-size:2.65mm;color:#555555;margin-top:7mm;text-align:center;line-height:1.5;max-width:88mm;}
.cert-no{font-size:2.83mm;font-weight:700;color:#000;letter-spacing:.08em;text-align:center;margin-top:6mm;}
</style>
</head>
<body>
<div class="page">

  <div class="logo">
    <span class="logo-text">HOURGLASS</span>
    <span class="logo-slash">/</span>
    <span class="logo-gallery">GALLERY</span>
  </div>

  <div class="heading">
    <h1>CERTIFICATE OF<br>AUTHENTICITY</h1>
    <div class="rule"></div>
    <div class="certifies">Hourglass Gallery certifies that the artwork described below is an authentic and original work by the artist.</div>
  </div>

  <div class="fields">
    ${fields.map(([label, value, italic]) => value
      ? `<div class="field-row"><div class="fl">${e(label)}</div><div class="${italic?'fv-italic':'fv'}">${e(value)}</div></div>`
      : '').join('')}
  </div>

  <div class="disclaimer">
    <p>The work is accompanied by this Certificate of Authenticity.<br>
    All reasonable due diligence has been exercised to verify the provenance and authenticity of this work.${notes?'<br><br>'+e(notes):''}</p>
  </div>

  <div class="sig-area">
    ${includeSignature ? `<img class="sig-img" src="${logoSrc?sigSrc:''}" alt="Signature">` : `<div class="sig-spacer"></div>`}
    <div class="sig-line">
      <div class="sig-name">For Hourglass Gallery<br>Authorised Signatory</div>
    </div>
  </div>

  <div class="right-col">
    <div class="art-wrap">
      ${imageUrl
        ? `<img class="art-img" src="${e(imageUrl)}" alt="${e(title)}">`
        : `<div class="no-img">No image on file</div>`
      }
      <div class="art-cap">${[artistName,title,year,medium].filter(Boolean).map(e).join(', ')}</div>
      <div class="cert-no">CERTIFICATE NO. ${e(certNumber)}</div>
    </div>
  </div>

</div>
</body>
</html>`

  const w = window.open('', '_blank', 'width=1200,height=820')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 800)
}
