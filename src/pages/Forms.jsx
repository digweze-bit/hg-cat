import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { LOGO_B64, SIG_B64 } from '../lib/assets'
import SignaturePad from 'signature_pad'

const FORM_TYPES = {
  purchase_confirmation: { label: 'Purchase Confirmation', icon: '◈', color: '#27ae60' },
  consignment_agreement: { label: 'Consignment Agreement', icon: '◐', color: '#b8862a' },
  condition_report:      { label: 'Condition Report',      icon: '◇', color: '#5a7ac7' },
  loan_agreement:        { label: 'Loan Agreement',        icon: '◉', color: '#9b59b6' },
  collection_receipt:    { label: 'Collection Receipt',    icon: '◑', color: '#1a9a8a' },
  catalogue:             { label: 'Artwork Catalogue',       icon: '◧', color: '#2c3e50' },
}

const STATUS = {
  draft:  { label: 'Draft',  bg: '#f0f0f0', color: '#666' },
  sent:   { label: 'Sent',   bg: '#fef9ec', color: '#b8862a' },
  signed: { label: 'Signed', bg: '#edf7f0', color: '#27ae60' },
  void:   { label: 'Void',   bg: '#fef2f0', color: '#c0392b' },
}

// ── CATALOGUE PDF GENERATOR ──────────────────────────────────────────
async function generateCatalogue(options, artworks, logoB64, previewOnly = false, artists = []) {
  const { showLogo, showPricing, showBio, title, intro } = options

  // Collect unique artists with bios — from artists array
  const artistsSeen = new Set()
  const artistBios = {}
  // Build name->bio from artists list
  const artistBioMap = {}
  artists.forEach(a => { if (a.name && a.bio) artistBioMap[a.name] = a.bio })
  artworks.forEach(w => {
    if (w.artist_name && !artistsSeen.has(w.artist_name)) {
      artistsSeen.add(w.artist_name)
      artistBios[w.artist_name] = artistBioMap[w.artist_name] || w.artist_bio || null
    }
  })

  // Convert all images to base64 for reliable rendering in popup
  async function toBase64(url) {
    if (!url) return null
    try {
      const r = await fetch(url)
      const blob = await r.blob()
      return await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.onerror = rej
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const imgMap = {}
  await Promise.all(artworks.map(async w => {
    if (w.image_url) imgMap[w.artwork_id || w.id] = await toBase64(w.image_url)
  }))

  let pages = ''

  // Cover / title page (if title provided)
  if (title || intro) {
    pages += `
    <div class="page cover-page">
      ${showLogo && logoB64 ? `<div class="logo-wrap"><img src="${logoB64}" class="logo"></div>` : ''}
      <div class="cover-content">
        ${title ? `<h1 class="cover-title">${escH(title)}</h1>` : ''}
        ${intro ? `<p class="cover-intro">${escH(intro)}</p>` : ''}
      </div>
    </div>`
  }

  // Artwork pages
  let lastArtist = null
  artworks.forEach((w, i) => {
    const isFirst = i === 0
    const imgSrc = imgMap[w.artwork_id || w.id] || w.image_url
    const details = [w.medium, w.dimensions, w.year].filter(Boolean).join('  ·  ')
    const price = showPricing && (w.price || w.retail_price)
      ? (w.price || ('₦' + Number(w.retail_price).toLocaleString()))
      : ''

    pages += `
    <div class="page artwork-page">
      ${isFirst && showLogo && logoB64 && !title ? `<div class="logo-wrap"><img src="${logoB64}" class="logo"></div>` : ''}
      <div class="artwork-image-wrap">
        ${imgSrc ? `<img src="${imgSrc}" class="artwork-image">` : '<div class="artwork-placeholder"></div>'}
      </div>
      <div class="artwork-caption">
        <div class="artwork-title">${escH(w.title || 'Untitled')}</div>
        <div class="artwork-artist">${escH(w.artist_name || '')}</div>
        ${details ? `<div class="artwork-details">${escH(details)}</div>` : ''}
        ${price ? `<div class="artwork-price">${escH(price)}</div>` : ''}
      </div>
    </div>`
  })

  // Bio pages — one per artist, after all artworks
  if (showBio) {
    Object.entries(artistBios).forEach(([artist, bio]) => {
      if (!bio) return
      pages += `
      <div class="page bio-page">
        <div class="bio-content">
          <div class="bio-name">${escH(artist)}</div>
          <div class="bio-text">${escH(bio)}</div>
        </div>
      </div>`
    })
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escH(title || 'Hourglass Gallery Catalogue')}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');

body {
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  background: #fff;
  color: #1a1714;
}

.page {
  width: 100%;
  min-height: 100vh;
  page-break-after: always;
  position: relative;
  padding: 32px 40px 28px;
  display: flex;
  flex-direction: column;
}

.logo-wrap {
  position: absolute;
  top: 28px;
  right: 36px;
}
.logo {
  height: 22px;
  object-fit: contain;
  opacity: .7;
}

/* Cover page */
.cover-page {
  justify-content: center;
  align-items: flex-start;
  padding-top: 120px;
}
.cover-title {
  font-size: 32px;
  font-weight: 300;
  letter-spacing: .02em;
  color: #1a1714;
  margin-bottom: 24px;
  line-height: 1.2;
  max-width: 500px;
}
.cover-intro {
  font-size: 16px;
  font-weight: 300;
  color: #666;
  line-height: 1.8;
  max-width: 420px;
}

/* Artwork page */
.artwork-page {
  justify-content: space-between;
}
.artwork-image-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0 20px;
}
.artwork-image {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  display: block;
}
.artwork-placeholder {
  width: 100%;
  height: 60vh;
  background: #f5f2ee;
}
.artwork-caption {
  border-top: 1px solid #e8e3db;
  padding-top: 14px;
}
.artwork-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: .01em;
  margin-bottom: 3px;
}
.artwork-artist {
  font-size: 14px;
  font-weight: 300;
  color: #444;
  margin-bottom: 4px;
}
.artwork-details {
  font-size: 12px;
  font-weight: 300;
  color: #888;
  letter-spacing: .03em;
  margin-bottom: 4px;
}
.artwork-price {
  font-size: 13px;
  font-weight: 400;
  color: #1a1714;
  margin-top: 2px;
}

/* Bio page */
.bio-page {
  justify-content: center;
}
.bio-content {
  max-width: 480px;
}
.bio-name {
  font-size: 20px;
  font-weight: 400;
  margin-bottom: 20px;
  letter-spacing: .02em;
}
.bio-text {
  font-size: 14px;
  font-weight: 300;
  line-height: 1.9;
  color: #444;
}

@media print {
  .page { min-height: 100vh; }
  @page { margin: 0; size: A4 portrait; }
}
</style>
</head>
<body>
${pages}
</body>
</html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) { alert('Please allow popups'); return }
  w.document.write(html)
  w.document.close()
  if (!previewOnly) {
    setTimeout(() => w.print(), 2500)
  }
}

function escH(s) {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}


export default function Forms() {
  const { user } = useAuth()
  const [forms, setForms]       = useState([])
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists]   = useState([])
  const [consignors, setConsignors] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)   // null | 'new' | 'view'
  const [activeForm, setActiveForm] = useState(null)
  const [step, setStep]         = useState(1)      // catalogue: 1=type 2=artworks 3=options
  // other forms: 1=type 2=artworks 3=details 4=sign 5=preview 6=share
  const [saving, setSaving]     = useState(false)

  // Builder state
  const [bType, setBType]       = useState('')
  const [bArtworks, setBArtworks] = useState([])   // [{artwork_id, title, artist_name, medium, dimensions, year, image_url, condition, price, hg_code, notes}]
  const [bRecipient, setBRecipient] = useState({ name:'', email:'', phone:'' })
  const [bMeta, setBMeta]       = useState({})
  const [bGallerySig, setBGallerySig] = useState('stored')  // 'stored' | 'drawn'
  const [catOptions, setCatOptions] = useState({ showLogo:true, showPricing:true, showBio:false, title:'', intro:'' })
  const [drawnSig, setDrawnSig] = useState(null)   // base64
  const [artworkSearch, setArtworkSearch] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const sigPadRef = useRef(null)
  const sigCanvasRef = useRef(null)

  async function load() {
    const [{ data: f }, { data: w }, { data: a }, { data: c }] = await Promise.all([
      supabase.from('forms').select('*, form_artworks(*)').order('created_at', { ascending: false }),
      supabase.from('artworks').select('id,title,artist_id,medium,dimensions,year,image_url,price,retail_price,hg_code,availability,category').order('title'),
      supabase.from('artists').select('id,name'),
      supabase.from('consignors').select('*').order('name'),
    ])
    setForms(f || [])
    setArtworks(w || [])
    setArtists(a || [])
    setConsignors(c || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const artistMap = Object.fromEntries((artists||[]).map(a => [a.id, a.name]))

  // Signature pad init
  useEffect(() => {
    if (step === 4 && bGallerySig === 'drawn' && sigCanvasRef.current) {
      sigPadRef.current = new SignaturePad(sigCanvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)', penColor: '#1a1714',
      })
    }
  }, [step, bGallerySig])

  function resetBuilder() {
    setBType(''); setBArtworks([]); setBRecipient({ name:'', email:'', phone:'' })
    setBMeta({}); setBGallerySig('stored'); setDrawnSig(null); setStep(1); setShareUrl('')
  }

  function addArtworkFromLibrary(w) {
    if (bArtworks.find(a => a.artwork_id === w.id)) return
    setBArtworks(prev => [...prev, {
      artwork_id: w.id, title: w.title, artist_name: artistMap[w.artist_id] || '',
      medium: w.medium || '', dimensions: w.dimensions || '', year: w.year || '',
      image_url: w.image_url || '', hg_code: w.hg_code || '', category: w.category || '',
      price: w.retail_price ? `₦${Number(w.retail_price).toLocaleString()}` : (w.price || ''),
      condition: '', notes: '',
    }])
    setArtworkSearch('')
  }

  function addBlankArtwork() {
    setBArtworks(prev => [...prev, {
      artwork_id: null, title: '', artist_name: '', medium: '', dimensions: '',
      year: '', image_url: '', hg_code: '', category: '', price: '', condition: '', notes: '',
    }])
  }

  function updateArtwork(idx, field, value) {
    setBArtworks(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a))
  }

  function removeArtwork(idx) {
    setBArtworks(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleGenerate() {
    if (!bType) return alert('Select a form type')
    if (bArtworks.length === 0) return alert('Add at least one artwork')
    if (!bRecipient.name) return alert('Recipient name is required')
    setSaving(true)
    try {
      const gallerySigData = bGallerySig === 'stored'
        ? SIG_B64
        : (sigPadRef.current && !sigPadRef.current.isEmpty() ? sigPadRef.current.toDataURL() : null)

      const { data: ref } = await supabase.rpc('next_form_ref')
      const typeLabel = FORM_TYPES[bType].label

      const { data: form, error } = await supabase.from('forms').insert({
        type: bType, status: 'draft',
        reference: ref,
        title: `${typeLabel} — ${bRecipient.name}`,
        recipient_name: bRecipient.name,
        recipient_email: bRecipient.email || null,
        recipient_phone: bRecipient.phone || null,
        meta: bMeta,
        gallery_sig_type: bGallerySig,
        gallery_sig_data: gallerySigData,
        created_by: user?.id,
      }).select().single()

      if (error) throw error

      // Insert form artworks
      await supabase.from('form_artworks').insert(
        bArtworks.map((a, i) => ({ ...a, form_id: form.id, sort_order: i }))
      )

      const url = `${window.location.origin}/sign/${form.sign_token}`
      setShareUrl(url)
      await load()
      setStep(6)  // share step
    } catch(err) { alert('Failed: ' + err.message) }
    finally { setSaving(false) }
  }

  async function markSent(formId) {
    await supabase.from('forms').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', formId)
    setForms(prev => prev.map(f => f.id === formId ? { ...f, status: 'sent' } : f))
  }

  async function voidForm(form) {
    if (!confirm(`Void "${form.title}"? This cannot be undone.`)) return
    await supabase.from('forms').update({ status: 'void' }).eq('id', form.id)
    await load()
  }

  const filteredArtworks = artworks.filter(w => {
    if (!artworkSearch) return false
    const q = artworkSearch.toLowerCase()
    return w.title?.toLowerCase().includes(q) || artistMap[w.artist_id]?.toLowerCase().includes(q) || w.hg_code?.toLowerCase().includes(q)
  }).slice(0, bType === 'catalogue' ? 200 : 12)

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Forms</div>
          <div className="page-subtitle">{forms.length} documents</div>
        </div>
        <button className="btn btn-primary" onClick={() => { resetBuilder(); setModal('new') }}>+ New form</button>
      </div>

      {/* ── FORMS LIST ── */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th><th>Type</th><th>Recipient</th>
                <th>Artworks</th><th>Status</th><th>Date</th><th style={{width:160}}></th>
              </tr>
            </thead>
            <tbody>
              {forms.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>No forms yet</td></tr>
              )}
              {forms.map(f => {
                const ft = FORM_TYPES[f.type]
                const st = STATUS[f.status]
                return (
                  <tr key={f.id}>
                    <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--muted)' }}>{f.reference}</td>
                    <td>
                      <span style={{ fontSize:12, fontWeight:600, color: ft?.color }}>
                        {ft?.icon} {ft?.label}
                      </span>
                    </td>
                    <td style={{ fontSize:13 }}>{f.recipient_name}</td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{f.form_artworks?.length || 0} work{f.form_artworks?.length !== 1 ? 's' : ''}</td>
                    <td>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:3, fontWeight:600, background: st?.bg, color: st?.color }}>
                        {st?.label}
                      </span>
                    </td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{new Date(f.created_at).toLocaleDateString('en-GB')}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setActiveForm(f); setModal('view') }}>View</button>
                        {f.status === 'draft' && (
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--gold)' }}
                            onClick={() => {
                              const url = `${window.location.origin}/sign/${f.sign_token}`
                              setShareUrl(url); setActiveForm(f); setModal('share')
                            }}>Share</button>
                        )}
                        {f.pdf_url && (
                          <a className="btn btn-ghost btn-sm" href={f.pdf_url} target="_blank" rel="noopener noreferrer">PDF</a>
                        )}
                        {f.status !== 'void' && (
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red,#c0392b)' }} onClick={() => voidForm(f)}>Void</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── NEW FORM MODAL ── */}
      {modal === 'new' && (
        <div className="modal-overlay">
          <div className="modal modal-xl" style={{ maxWidth:820, maxHeight:'94vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">New form</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Step {bType === 'catalogue' ? `${step} of 3` : `${step} of 6`} — {bType === 'catalogue' ? ['','Form type','Artworks','Options'][step] || '' : ['','Form type','Artworks','Recipient & details','Gallery signature','Preview','Share'][step]}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => { setModal(null); resetBuilder() }}>✕</button>
            </div>

            <div className="modal-body" style={{ flex:1, overflowY:'auto' }}>

              {/* STEP 1 — Type */}
              {step === 1 && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {Object.entries(FORM_TYPES).map(([key, ft]) => (
                    <div key={key} onClick={() => setBType(key)}
                      style={{ padding:'18px 20px', border:`2px solid ${bType === key ? ft.color : 'var(--line)'}`, borderRadius:6, cursor:'pointer', background: bType === key ? `${ft.color}10` : 'var(--white)', transition:'all .15s' }}>
                      <div style={{ fontSize:18, marginBottom:8 }}>{ft.icon}</div>
                      <div style={{ fontWeight:600, fontSize:14, color: bType === key ? ft.color : 'var(--ink)', marginBottom:4 }}>{ft.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>
                        {key === 'purchase_confirmation' && 'Confirm purchase of artwork from seller'}
                        {key === 'consignment_agreement' && 'Record works left with gallery for sale'}
                        {key === 'condition_report' && 'Document condition of artwork at a point in time'}
                        {key === 'loan_agreement' && 'Artwork leaving gallery temporarily'}
                        {key === 'collection_receipt' && 'Client collecting a purchased work'}
        {key === 'catalogue' && 'Elegant artwork catalogue for collectors'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 2 — Artworks */}
              {step === 2 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <div style={{ flex:1, position:'relative' }}>
                      <input className="form-input" placeholder="Search artworks by title, artist, HG code…"
                        value={artworkSearch} onChange={e => setArtworkSearch(e.target.value)}/>
                      {artworkSearch && filteredArtworks.length > 0 && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--white)', border:'1px solid var(--line)', borderTop:'none', borderRadius:'0 0 4px 4px', zIndex:50, maxHeight:220, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,.08)' }}>
                          {filteredArtworks.map(w => (
                            <div key={w.id} style={{ display:'flex', gap:10, padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', alignItems:'center' }}
                              onMouseDown={() => addArtworkFromLibrary(w)}>
                              {w.image_url && <img src={w.image_url} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:2 }}/>}
                              <div>
                                <div style={{ fontSize:13, fontWeight:500 }}>{w.title}</div>
                                <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]} {w.hg_code ? `· ${w.hg_code}` : ''}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="btn btn-outline" onClick={addBlankArtwork}>+ Add manually</button>
                  </div>

                  {/* Consignor quick-fill for consignment forms */}
                  {bType === 'consignment_agreement' && consignors.length > 0 && (
                    <div style={{ background:'var(--surface-0,#f8f7f5)', borderRadius:4, padding:'12px 14px' }}>
                      <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Quick fill from consignor</div>
                      <select className="form-select" style={{ maxWidth:300 }}
                        onChange={e => {
                          const c = consignors.find(x => x.id === e.target.value)
                          if (c) setBRecipient({ name: c.name, email: c.email || '', phone: c.phone || '' })
                          if (c) setBMeta(m => ({ ...m, term_type: c.term_type, commission_rate: c.commission_rate, fixed_amount: c.fixed_amount, sale_type: c.sale_type }))
                        }}>
                        <option value="">— select consignor —</option>
                        {consignors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                      </select>
                    </div>
                  )}

                  {/* Artwork rows */}
                  {bArtworks.length === 0 && (
                    <div style={{ padding:24, textAlign:'center', color:'var(--muted)', border:'1px dashed var(--line)', borderRadius:4 }}>
                      Search your library or add manually above
                    </div>
                  )}
                  {bArtworks.map((a, idx) => (
                    <div key={idx} style={{ border:'1px solid var(--line)', borderRadius:6, padding:'14px 16px', display:'grid', gridTemplateColumns:'56px 1fr', gap:14 }}>
                      <div>
                        {a.image_url
                          ? <img src={a.image_url} alt="" style={{ width:48, height:56, objectFit:'cover', borderRadius:2 }}/>
                          : <div style={{ width:48, height:56, background:'var(--parchment-2)', borderRadius:2 }}/>
                        }
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Title</label>
                          <input className="form-input" value={a.title} onChange={e => updateArtwork(idx,'title',e.target.value)}/>
                        </div>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Artist</label>
                          <input className="form-input" value={a.artist_name} onChange={e => updateArtwork(idx,'artist_name',e.target.value)}/>
                        </div>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Medium</label>
                          <input className="form-input" value={a.medium} onChange={e => updateArtwork(idx,'medium',e.target.value)}/>
                        </div>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Dimensions</label>
                          <input className="form-input" value={a.dimensions} onChange={e => updateArtwork(idx,'dimensions',e.target.value)}/>
                        </div>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Year</label>
                          <input className="form-input" value={a.year} onChange={e => updateArtwork(idx,'year',e.target.value)}/>
                        </div>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Condition</label>
                          <input className="form-input" value={a.condition} onChange={e => updateArtwork(idx,'condition',e.target.value)} placeholder="e.g. Good"/>
                        </div>
                        {(bType === 'purchase_confirmation' || bType === 'consignment_agreement') && (
                          <div className="form-group" style={{ marginBottom:0 }}>
                            <label className="form-label">Price / Value</label>
                            <input className="form-input" value={a.price} onChange={e => updateArtwork(idx,'price',e.target.value)}/>
                          </div>
                        )}
                        <div className="form-group" style={{ marginBottom:0, gridColumn:'1 / -1' }}>
                          <label className="form-label">Notes</label>
                          <input className="form-input" value={a.notes} onChange={e => updateArtwork(idx,'notes',e.target.value)}/>
                        </div>
                        <div style={{ gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red,#c0392b)' }} onClick={() => removeArtwork(idx)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 3 — Recipient & details */}
              {step === 3 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:4 }}>Recipient</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Name *</label>
                      <input className="form-input" value={bRecipient.name} onChange={e => setBRecipient(r => ({ ...r, name: e.target.value }))}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" value={bRecipient.email} onChange={e => setBRecipient(r => ({ ...r, email: e.target.value }))}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone / WhatsApp</label>
                      <input className="form-input" value={bRecipient.phone} onChange={e => setBRecipient(r => ({ ...r, phone: e.target.value }))}/>
                    </div>
                  </div>

                  <div style={{ borderTop:'1px solid var(--line)', paddingTop:14 }}>
                    <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12 }}>
                      {FORM_TYPES[bType]?.label} details
                    </div>

                    {bType === 'purchase_confirmation' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        <label style={{ display:'flex', gap:8, alignItems:'center', fontSize:13, cursor:'pointer' }}>
                          <input type="checkbox" checked={bMeta.show_price !== false} onChange={e => setBMeta(m => ({ ...m, show_price: e.target.checked }))} style={{ width:'auto' }}/>
                          Show purchase amount on form
                        </label>
                        <div className="form-group">
                          <label className="form-label">Date of purchase</label>
                          <input className="form-input" type="date" value={bMeta.purchase_date || new Date().toISOString().split('T')[0]} onChange={e => setBMeta(m => ({ ...m, purchase_date: e.target.value }))}/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Additional notes</label>
                          <textarea className="form-textarea" rows={2} value={bMeta.notes||''} onChange={e => setBMeta(m => ({ ...m, notes: e.target.value }))}/>
                        </div>
                      </div>
                    )}

                    {bType === 'consignment_agreement' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Term type</label>
                            <select className="form-select" value={bMeta.term_type||'commission'} onChange={e => setBMeta(m => ({ ...m, term_type: e.target.value }))}>
                              <option value="commission">Commission %</option>
                              <option value="fixed">Fixed net amount</option>
                            </select>
                          </div>
                          {(!bMeta.term_type || bMeta.term_type === 'commission') ? (
                            <div className="form-group">
                              <label className="form-label">Gallery commission %</label>
                              <input className="form-input" type="number" value={bMeta.commission_rate||40} onChange={e => setBMeta(m => ({ ...m, commission_rate: e.target.value }))}/>
                            </div>
                          ) : (
                            <div className="form-group">
                              <label className="form-label">Fixed net to consignor (₦)</label>
                              <input className="form-input" type="number" value={bMeta.fixed_amount||''} onChange={e => setBMeta(m => ({ ...m, fixed_amount: e.target.value }))}/>
                            </div>
                          )}
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Sale type</label>
                            <select className="form-select" value={bMeta.sale_type||'secondary'} onChange={e => setBMeta(m => ({ ...m, sale_type: e.target.value }))}>
                              <option value="primary">Primary sale</option>
                              <option value="secondary">Secondary sale</option>
                              <option value="both">Primary & Secondary</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Duration</label>
                            <input className="form-input" value={bMeta.duration||''} placeholder="e.g. 12 months" onChange={e => setBMeta(m => ({ ...m, duration: e.target.value }))}/>
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Date of consignment</label>
                          <input className="form-input" type="date" value={bMeta.consignment_date || new Date().toISOString().split('T')[0]} onChange={e => setBMeta(m => ({ ...m, consignment_date: e.target.value }))}/>
                        </div>
                      </div>
                    )}

                    {bType === 'condition_report' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {['Surface', 'Frame', 'Edges', 'Verso', 'Overall'].map(field => (
                          <div key={field} className="form-group">
                            <label className="form-label">{field}</label>
                            <input className="form-input" value={bMeta[field.toLowerCase()]||''} onChange={e => setBMeta(m => ({ ...m, [field.toLowerCase()]: e.target.value }))} placeholder="Condition notes…"/>
                          </div>
                        ))}
                        <div className="form-group">
                          <label className="form-label">Examiner name</label>
                          <input className="form-input" value={bMeta.examiner||''} onChange={e => setBMeta(m => ({ ...m, examiner: e.target.value }))}/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Date</label>
                          <input className="form-input" type="date" value={bMeta.report_date || new Date().toISOString().split('T')[0]} onChange={e => setBMeta(m => ({ ...m, report_date: e.target.value }))}/>
                        </div>
                      </div>
                    )}

                    {bType === 'loan_agreement' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Loan from</label>
                            <input className="form-input" type="date" value={bMeta.loan_from||''} onChange={e => setBMeta(m => ({ ...m, loan_from: e.target.value }))}/>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Loan to</label>
                            <input className="form-input" type="date" value={bMeta.loan_to||''} onChange={e => setBMeta(m => ({ ...m, loan_to: e.target.value }))}/>
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Purpose</label>
                          <input className="form-input" value={bMeta.purpose||''} onChange={e => setBMeta(m => ({ ...m, purpose: e.target.value }))} placeholder="e.g. Exhibition loan"/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Insurance value (₦)</label>
                          <input className="form-input" type="number" value={bMeta.insurance_value||''} onChange={e => setBMeta(m => ({ ...m, insurance_value: e.target.value }))}/>
                        </div>
                      </div>
                    )}

                    {bType === 'collection_receipt' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        <div className="form-group">
                          <label className="form-label">Invoice reference</label>
                          <input className="form-input" value={bMeta.invoice_ref||''} onChange={e => setBMeta(m => ({ ...m, invoice_ref: e.target.value }))}/>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Collection date</label>
                          <input className="form-input" type="date" value={bMeta.collection_date || new Date().toISOString().split('T')[0]} onChange={e => setBMeta(m => ({ ...m, collection_date: e.target.value }))}/>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4 — Gallery signature */}
              {step === 4 && (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ fontSize:13, color:'var(--muted)' }}>Choose how Hourglass Gallery signs this document.</div>
                  <div style={{ display:'flex', gap:12 }}>
                    {[
                      { value:'stored', label:'Use stored signature', desc:'Apply the gallery\'s saved signature' },
                      { value:'drawn', label:'Draw signature', desc:'Sign fresh with mouse or touch' },
                    ].map(opt => (
                      <div key={opt.value} onClick={() => setBGallerySig(opt.value)}
                        style={{ flex:1, padding:'14px 16px', border:`2px solid ${bGallerySig === opt.value ? 'var(--ink)' : 'var(--line)'}`, borderRadius:6, cursor:'pointer', background: bGallerySig === opt.value ? 'var(--parchment)' : 'var(--white)' }}>
                        <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>{opt.label}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.desc}</div>
                      </div>
                    ))}
                  </div>

                  {bGallerySig === 'stored' && (
                    <div style={{ border:'1px solid var(--line)', borderRadius:6, padding:'20px 24px', display:'flex', alignItems:'flex-end', gap:20 }}>
                      <img src={SIG_B64} alt="Gallery signature" style={{ height:56, objectFit:'contain' }}/>
                      <div>
                        <div style={{ fontWeight:500, fontSize:13 }}>For Hourglass Gallery</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>Authorised Signatory</div>
                      </div>
                    </div>
                  )}

                  {bGallerySig === 'drawn' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ border:'1px solid var(--line)', borderRadius:4, overflow:'hidden', background:'#fff' }}>
                        <canvas ref={sigCanvasRef} width={480} height={140} style={{ display:'block', width:'100%', touchAction:'none' }}/>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start' }} onClick={() => sigPadRef.current?.clear()}>Clear</button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5 — Share */}
              
              {step === 5 && (
                <div>
                  <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
                    This is how the form will appear to the recipient. Review before generating.
                  </div>
                  <div style={{ border:'1px solid var(--line-soft)', borderRadius:4, overflow:'hidden', maxHeight:500, overflowY:'auto' }}>
                    {/* Form preview */}
                    <div style={{ background:'#fff', padding:'24px 28px', fontFamily:'-apple-system,sans-serif' }}>
                      {/* Header */}
                      <div style={{ borderBottom:'1px solid #e8e3db', paddingBottom:14, marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        {LOGO_B64
                          ? <img src={LOGO_B64} alt="Hourglass Gallery" style={{ height:28, objectFit:'contain' }} />
                          : <span style={{ fontWeight:700, fontSize:14 }}>HOURGLASS GALLERY</span>
                        }
                        <span style={{ fontSize:11, color:'#999' }}>{new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}</span>
                      </div>
                      {/* Title */}
                      <div style={{ marginBottom:20 }}>
                        <div style={{ fontSize:8, letterSpacing:'.14em', textTransform:'uppercase', color:'#999', marginBottom:4 }}>DRAFT PREVIEW</div>
                        <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:400, color:'#1a1714', margin:'0 0 6px' }}>
                          {FORM_TYPES[bType]?.label}
                        </div>
                        <div style={{ width:32, height:2, background:'#E05C2A' }}/>
                      </div>
                      {/* Parties */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20, background:'#f8f7f5', borderRadius:4, padding:'14px 16px' }}>
                        <div>
                          <div style={{ fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#999', marginBottom:3 }}>Gallery</div>
                          <div style={{ fontWeight:600, fontSize:13 }}>Hourglass Gallery</div>
                          <div style={{ fontSize:11, color:'#666' }}>298A Akin Olugbade St, Victoria Island, Lagos</div>
                        </div>
                        <div>
                          <div style={{ fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#999', marginBottom:3 }}>Recipient</div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{bRecipient.name}</div>
                          {bRecipient.email && <div style={{ fontSize:11, color:'#666' }}>{bRecipient.email}</div>}
                          {bRecipient.phone && <div style={{ fontSize:11, color:'#666' }}>{bRecipient.phone}</div>}
                        </div>
                      </div>
                      {/* Artworks */}
                      <div style={{ fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#999', marginBottom:8 }}>Artworks</div>
                      {bArtworks.map((aw, i) => (
                        <div key={i} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid #f0ece7' }}>
                          {aw.image_url && <img src={aw.image_url} alt="" style={{ width:52, height:64, objectFit:'cover', borderRadius:2, flexShrink:0 }} />}
                          <div>
                            <div style={{ fontWeight:500, fontSize:13 }}>{aw.title}</div>
                            <div style={{ fontSize:11, color:'#666', marginTop:2 }}>{aw.artist_name}{aw.year ? `, ${aw.year}` : ''}</div>
                            {aw.medium && <div style={{ fontSize:11, color:'#666' }}>{aw.medium}{aw.dimensions ? ` · ${aw.dimensions}` : ''}</div>}
                            {aw.price && <div style={{ fontSize:12, fontWeight:500, marginTop:4 }}>₦{Number(aw.price).toLocaleString()}</div>}
                          </div>
                        </div>
                      ))}
                      {/* Gallery signature */}
                      <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid #e8e3db' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
                          <div>
                            <div style={{ fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#999', marginBottom:8 }}>For Hourglass Gallery</div>
                            {(bGallerySig === 'stored' ? SIG_B64 : drawnSig) &&
                              <img src={bGallerySig === 'stored' ? SIG_B64 : drawnSig} alt="" style={{ height:36, objectFit:'contain', display:'block', marginBottom:4 }} />
                            }
                            <div style={{ borderTop:'1px solid #ccc', paddingTop:4, fontSize:11, color:'#666' }}>Authorised signatory</div>
                          </div>
                          <div>
                            <div style={{ fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:'#999', marginBottom:8 }}>Recipient signature</div>
                            <div style={{ borderTop:'1px solid #ccc', paddingTop:4, fontSize:11, color:'#666', marginTop:44 }}>Signature</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 6 && (
                <div style={{ display:'flex', flexDirection:'column', gap:20, alignItems:'center', padding:'24px 0' }}>
                  <div style={{ fontSize:32 }}>✓</div>
                  <div style={{ fontWeight:600, fontSize:16 }}>Form generated</div>
                  <div style={{ fontSize:13, color:'var(--muted)', textAlign:'center' }}>
                    Share the link below with the recipient. They'll be able to view the form and add their signature.
                  </div>
                  <div style={{ width:'100%', background:'var(--surface-0,#f8f7f5)', borderRadius:4, padding:'12px 16px', fontFamily:'monospace', fontSize:12, wordBreak:'break-all', border:'1px solid var(--line)' }}>
                    {shareUrl}
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
                    <button className="btn btn-primary" style={{ background:'#25D366', border:'none' }}
                      onClick={() => {
                        const text = `Please review and sign this document from Hourglass Gallery:\n${shareUrl}`
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                        markSent(forms[0]?.id)
                      }}>
                      📱 Send via WhatsApp
                    </button>
                    <button className="btn btn-outline"
                      onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Link copied') }}>
                      📋 Copy link
                    </button>
                    {bRecipient.email && (
                      <a className="btn btn-outline"
                        href={`mailto:${bRecipient.email}?subject=Document for signature — Hourglass Gallery&body=Please review and sign this document: ${shareUrl}`}>
                        ✉ Open in email
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {step > 1 && step < 6 && (
                <button className="btn btn-outline" onClick={() => setStep(s => s - 1)}>← Back</button>
              )}
              <div style={{ flex:1 }}/>
              {step === 6 ? (
                <button className="btn btn-primary" onClick={() => { setModal(null); resetBuilder() }}>Done</button>
              ) : step === 5 ? (
                <button className="btn btn-primary" onClick={handleGenerate} disabled={saving}>
                  {saving ? 'Generating…' : 'Confirm & Generate →'}
                </button>
              ) : step === 4 ? (
                <button className="btn btn-primary" onClick={() => setStep(5)}>
                  Preview →
                </button>
              ) : (
                <button className="btn btn-primary"
                  onClick={() => setStep(s => s + 1)}
                  disabled={
                    (step === 1 && !bType) ||
                    (step === 2 && bArtworks.length === 0) ||
                    (step === 3 && !bRecipient.name)
                  }>
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SHARE MODAL (for existing forms) ── */}
      {modal === 'share' && activeForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <div className="modal-title">Share — {activeForm.reference}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'var(--surface-0)', borderRadius:4, padding:'12px 16px', fontFamily:'monospace', fontSize:12, wordBreak:'break-all', border:'1px solid var(--line)' }}>
                {shareUrl}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn btn-primary" style={{ background:'#25D366', border:'none' }}
                  onClick={() => {
                    const text = `Please review and sign this document from Hourglass Gallery:\n${shareUrl}`
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                    markSent(activeForm.id)
                  }}>
                  📱 Send via WhatsApp
                </button>
                <button className="btn btn-outline" onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Copied') }}>
                  📋 Copy link
                </button>
                {activeForm.recipient_email && (
                  <a className="btn btn-outline"
                    href={`mailto:${activeForm.recipient_email}?subject=Document for signature — Hourglass Gallery&body=Please review and sign: ${shareUrl}`}>
                    ✉ Email
                  </a>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
