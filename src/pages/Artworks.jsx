import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { CURRENCIES, formatAmount, fetchLiveRates } from '../lib/currencies'
import { cacheInvalidate } from '../lib/cache'

const AVAILABILITY = ['Available', 'Reserved', 'Sold', 'NFS']
const CATEGORIES = ['Painting','Drawing','Sculpture','Photography','Print','Mixed Media','Textile','Ceramic','Video','Installation','Other']
const DEFAULT_LOCATIONS = ['Main Gallery', 'Miniature Room', 'Storage 1', 'Storage 2', 'Safecourt']
const IMAGE_POSITIONS = ['center', 'top', 'bottom', 'left', 'right']
const EMPTY = { title:'', artist_id:'', year:'', medium:'', category:'', dimensions:'', series:'', availability:'Available', writeup:'', image_url:'', image_position:'center', price:'', retail_price:'', inventory_price:'', valuation:'', tags:'', location:'', sort_order:0, ownership:'gallery', consignment_price:'', consignor_name:'', consignor_contact:'', commission_rate:40, is_framed:false, frame_cost:'', tessera_id:'' }

// â”€â”€ PRICE FIELDS COMPONENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PriceFields({ form, setForm }) {
  const [rates, setRates]             = useState(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [inputCurrency, setInputCurrency] = useState('NGN')
  const [rateInput, setRateInput]     = useState('')   // what user types
  const [confirmedRate, setConfirmedRate] = useState(null) // set after clicking Set
  const [rateMode, setRateMode]       = useState(null) // null | 'live' | 'fixed'

  const DISPLAY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR']

  async function loadLiveRate() {
    setRateLoading(true)
    try {
      const r = await fetchLiveRates()
      setRates(r)
      setRateMode('live')
      setConfirmedRate(null)
      setRateInput('')
    } catch(_) { alert('Could not fetch live rate â€” check connection') }
    setRateLoading(false)
  }

  function confirmFixedRate() {
    const n = Number(rateInput)
    if (!n || n <= 0) return alert('Enter a valid rate')
    setConfirmedRate(n)
    setRateMode('fixed')
  }

  // Active rate for the selected currency
  function getRate(currency) {
    if (currency === 'NGN') return 1
    if (rateMode === 'fixed' && confirmedRate) return confirmedRate
    if (rateMode === 'live' && rates?.[currency]) return rates[currency]
    return null
  }

  function toNGN(amount, currency) {
    if (!amount) return null
    const n = Number(String(amount).replace(/,/g, ''))
    if (isNaN(n) || n === 0) return null
    if (currency === 'NGN') return n
    const rate = getRate(currency)
    return rate ? Math.round(n * rate) : null
  }

  function toDisplay(ngnAmount, currency) {
    if (!ngnAmount) return ''
    const n = Number(ngnAmount)
    if (currency === 'NGN') return n
    const rate = getRate(currency)
    return rate ? Math.round(n / rate) : n
  }

  function handlePriceChange(val, field) {
    const ngnVal = toNGN(val, inputCurrency)
    const updates = {}
    updates[field] = ngnVal !== null ? ngnVal : (val ? Number(val) : null)
    if (field === 'retail_price' && ngnVal) {
      updates.price = 'â‚¦' + ngnVal.toLocaleString()
    }
    setForm(f => ({ ...f, ...updates }))
  }

  const sym = { NGN:'â‚¦', USD:'$', GBP:'Â£', EUR:'â‚¬' }[inputCurrency] || 'â‚¦'
  const activeRate = getRate(inputCurrency)
  const rateLabel = rateMode === 'live'
    ? `Live: 1 ${inputCurrency} = â‚¦${Math.round(activeRate||0).toLocaleString()}`
    : rateMode === 'fixed' && confirmedRate
    ? `Fixed: 1 ${inputCurrency} = â‚¦${confirmedRate.toLocaleString()}`
    : null

  return (
    <div>
      {/* Currency selector */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', fontWeight:600 }}>Input currency</span>
        {DISPLAY_CURRENCIES.map(c => (
          <button key={c} type="button"
            onClick={() => setInputCurrency(c)}
            style={{ padding:'3px 10px', fontSize:11, fontWeight:600, borderRadius:3, border:'1px solid',
              background: inputCurrency === c ? 'var(--ink)' : 'transparent',
              color: inputCurrency === c ? '#fff' : 'var(--muted)',
              borderColor: inputCurrency === c ? 'var(--ink)' : 'var(--line-soft)', cursor:'pointer' }}>
            {c}
          </button>
        ))}
      </div>

      {/* Rate section â€” only shown for non-NGN */}
      {inputCurrency !== 'NGN' && (
        <div style={{ background:'var(--surface-1,#f8f7f5)', borderRadius:4, padding:'10px 14px', marginBottom:12 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            {/* Live rate button */}
            <button type="button" onClick={loadLiveRate} disabled={rateLoading}
              style={{ fontSize:11, padding:'4px 10px', borderRadius:3, border:'1px solid var(--line-soft)',
                background: rateMode==='live' ? 'var(--ink)' : 'transparent',
                color: rateMode==='live' ? '#fff' : 'var(--muted)', cursor:'pointer', fontWeight:600 }}>
              {rateLoading ? 'â€¦' : 'â†» Live rate'}
            </button>

            <span style={{ color:'var(--muted)', fontSize:11 }}>or fixed:</span>

            {/* Fixed rate input + Set button */}
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>1 {inputCurrency} =</span>
              <input className="form-input" type="number" value={rateInput}
                onChange={e => setRateInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmFixedRate()}
                placeholder="e.g. 1650" style={{ width:100, padding:'4px 8px', fontSize:12 }} />
              <span style={{ fontSize:11, color:'var(--muted)' }}>NGN</span>
              <button type="button" onClick={confirmFixedRate}
                style={{ fontSize:11, padding:'4px 10px', borderRadius:3,
                  background: rateMode==='fixed' ? '#27ae60' : 'var(--ink)',
                  color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>
                {rateMode==='fixed' ? 'âœ“ Set' : 'Set'}
              </button>
            </div>
          </div>

          {/* Active rate display */}
          {rateLabel && (
            <div style={{ marginTop:6, fontSize:11, color: rateMode==='fixed' ? '#27ae60' : 'var(--muted)', fontWeight:500 }}>
              {rateLabel}
            </div>
          )}
          {inputCurrency !== 'NGN' && !activeRate && (
            <div style={{ marginTop:6, fontSize:11, color:'var(--amber,#b8862a)' }}>
              âš  Set a rate to convert prices
            </div>
          )}
        </div>
      )}

      {/* Price inputs */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Retail price ({sym})</label>
          <input className="form-input" type="number"
            value={toDisplay(form.retail_price, inputCurrency) || ''}
            onChange={e => handlePriceChange(e.target.value, 'retail_price')}
            placeholder="0" />
          {inputCurrency !== 'NGN' && form.retail_price && activeRate && (
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
              = â‚¦{Number(form.retail_price).toLocaleString()}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Inventory / cost ({sym})</label>
          <input className="form-input" type="number"
            value={toDisplay(form.inventory_price, inputCurrency) || ''}
            onChange={e => handlePriceChange(e.target.value, 'inventory_price')}
            placeholder="0" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Valuation ({sym})</label>
          <input className="form-input" type="number"
            value={toDisplay(form.valuation, inputCurrency) || ''}
            onChange={e => handlePriceChange(e.target.value, 'valuation')}
            placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Price display (public)</label>
          <input className="form-input" value={form.price||''}
            onChange={e => setForm(f => ({...f, price:e.target.value}))}
            placeholder="â‚¦2,500,000 Â· $1,500 Â· or POA" />
        </div>
      </div>
    </div>
  )
}


// â”€â”€ CURRENCY TOGGLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CurrencyToggle({ displayCurrency, setDisplayCurrency, usdRate, setUsdRate }) {
  const [showRate, setShowRate]       = useState(false)
  const [fixedInput, setFixedInput]   = useState('')
  const [rateMode, setRateMode]       = useState(null)   // 'live' | 'fixed'
  const [loading, setLoading]         = useState(false)

  async function fetchLive() {
    setLoading(true)
    try {
      const r = await fetchLiveRates()
      const rate = r?.USD
      if (!rate) throw new Error('No USD rate')
      setUsdRate(rate)
      setRateMode('live')
      setFixedInput('')
      setDisplayCurrency('USD')
    } catch(_) { alert('Could not fetch live rate') }
    setLoading(false)
  }

  function applyFixed() {
    const n = Number(fixedInput)
    if (!n || n <= 0) return alert('Enter a valid rate')
    setUsdRate(n)
    setRateMode('fixed')
    setDisplayCurrency('USD')
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:8, position:'relative' }}>
      {/* NGN button */}
      <button type="button" onClick={() => { setDisplayCurrency('NGN'); setShowRate(false) }}
        style={{ padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:3, border:'1px solid',
          background: displayCurrency==='NGN' ? 'var(--ink)' : 'transparent',
          color: displayCurrency==='NGN' ? '#fff' : 'var(--muted)',
          borderColor: displayCurrency==='NGN' ? 'var(--ink)' : 'var(--line-soft)', cursor:'pointer' }}>
        â‚¦ NGN
      </button>

      {/* USD button */}
      <button type="button"
        onClick={() => { setShowRate(s => !s); if (usdRate) setDisplayCurrency('USD') }}
        style={{ padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:3, border:'1px solid',
          background: displayCurrency==='USD' ? 'var(--ink)' : 'transparent',
          color: displayCurrency==='USD' ? '#fff' : 'var(--muted)',
          borderColor: displayCurrency==='USD' ? 'var(--ink)' : 'var(--line-soft)', cursor:'pointer' }}>
        $ USD {usdRate && displayCurrency==='USD' ? `Â· ${rateMode==='fixed'?'fixed':'live'}` : 'â–¾'}
      </button>

      {/* Rate picker dropdown */}
      {showRate && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200,
          background:'var(--bg)', border:'1px solid var(--line-soft)', borderRadius:5,
          padding:'12px 14px', width:280, boxShadow:'0 4px 20px rgba(0,0,0,.12)' }}>
          <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:10 }}>
            USD conversion rate
          </div>

          {/* Live rate */}
          <button type="button" onClick={fetchLive} disabled={loading}
            style={{ width:'100%', padding:'8px 12px', borderRadius:4, border:'1px solid var(--line-soft)',
              background: rateMode==='live' ? 'var(--ink)' : 'var(--surface-1,#f8f7f5)',
              color: rateMode==='live' ? '#fff' : 'var(--ink)',
              cursor:'pointer', fontSize:12, fontWeight:600, marginBottom:8, textAlign:'left' }}>
            {loading ? 'â³ Fetchingâ€¦' : rateMode==='live' && usdRate
              ? `âœ“ Live rate Â· 1 USD = â‚¦${Math.round(usdRate).toLocaleString()}`
              : 'â†» Fetch live rate'}
          </button>

          {/* Fixed rate */}
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>
            or enter a fixed rate:
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>1 USD =</span>
            <input className="form-input" type="number" value={fixedInput}
              onChange={e => setFixedInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFixed()}
              placeholder={usdRate && rateMode==='fixed' ? String(Math.round(usdRate)) : 'e.g. 1650'}
              style={{ flex:1, padding:'5px 8px', fontSize:12 }} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>NGN</span>
            <button type="button" onClick={applyFixed}
              style={{ padding:'5px 12px', borderRadius:3, border:'none', fontSize:11, fontWeight:700,
                background: rateMode==='fixed' ? '#27ae60' : 'var(--ink)', color:'#fff', cursor:'pointer',
                whiteSpace:'nowrap' }}>
              {rateMode==='fixed' ? 'âœ“ Set' : 'Set'}
            </button>
          </div>

          {rateMode==='fixed' && usdRate && (
            <div style={{ marginTop:6, fontSize:11, color:'#27ae60', fontWeight:500 }}>
              Fixed: 1 USD = â‚¦{Math.round(usdRate).toLocaleString()}
            </div>
          )}

          <button type="button" onClick={() => setShowRate(false)}
            style={{ marginTop:10, width:'100%', padding:'5px', fontSize:11, color:'var(--muted)',
              background:'none', border:'none', cursor:'pointer' }}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}


export default function Artworks() {
  const [artists, setArtists] = useState([])
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [displayCurrency, setDisplayCurrency] = useState('NGN')
  const [usdRate, setUsdRate]       = useState(null)
  const [filters, setFilters] = useState({ artist:'', availability:'Available', location:'', search:'', visible:'', ownership:'' })
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'az' | 'price_desc' | 'price_asc' | 'location'
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [printMenu, setPrintMenu] = useState(false)
  const [page, setPage] = useState(0)
  const PER_PAGE = 30

  async function load() {
    const [a, w] = await Promise.all([
      fetchAll('artists', { order: 'name' }),
      fetchAll('artworks', { select:'id,title,artist_id,year,medium,category,dimensions,availability,ownership,consignor_name,consignment_price,commission_rate,image_url,price,retail_price,hg_code,location,tags,series,sort_order,visible,created_at', order: 'sort_order', onUpdate: w => setArtworks(w) }),
    ])
    setArtists(a)
    setArtworks(w)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])
  const locations = useMemo(() => [...new Set(artworks.map(w => w.location).filter(Boolean))].sort(), [artworks])

  const filtered = useMemo(() => artworks.filter(w => {
    if (filters.artist && w.artist_id !== filters.artist) return false
    if (filters.availability && w.availability !== filters.availability) return false
    if (filters.location && w.location !== filters.location) return false
    if (filters.visible === 'true' && !w.visible) return false
    if (filters.visible === 'false' && w.visible) return false
    if (filters.ownership && w.ownership !== filters.ownership) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const a = artistMap[w.artist_id]
      if (!w.title?.toLowerCase().includes(q) &&
          !a?.name?.toLowerCase().includes(q) &&
          !w.medium?.toLowerCase().includes(q) &&
          !w.series?.toLowerCase().includes(q)) return false
    }
    return true
  }), [artworks, filters, artistMap])

  const sorted = useMemo(() => {
    let list = [...filtered]
    if (sortBy === 'az') list.sort((a, b) => a.title.localeCompare(b.title))
    else if (sortBy === 'recent') list.sort((a, b) => {
      // Use numeric part of hg_code if available, else fall back to id comparison
      const numA = a.hg_code ? parseInt(a.hg_code.replace(/[^0-9]/g,'')) || 0 : 0
      const numB = b.hg_code ? parseInt(b.hg_code.replace(/[^0-9]/g,'')) || 0 : 0
      if (numB !== numA) return numB - numA
      return (b.id || '').localeCompare(a.id || '')
    })
    else if (sortBy === 'price_desc') list.sort((a, b) => parsePrice(b.price) - parsePrice(a.price))
    else if (sortBy === 'price_asc') list.sort((a, b) => parsePrice(a.price) - parsePrice(b.price))
    else if (sortBy === 'location') list.sort((a, b) => (a.location || 'zzz').localeCompare(b.location || 'zzz'))
    return list
  }, [filtered, sortBy])

  const paginated = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(sorted.length / PER_PAGE)

  async function toggleVisible(artwork) {
    await supabase.from('artworks').update({ visible: !artwork.visible }).eq('id', artwork.id)
    setArtworks(prev => prev.map(w => w.id === artwork.id ? { ...w, visible: !w.visible } : w))
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const resized = await resizeImage(file, 1200)
      const path = `works/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const { error } = await supabase.storage.from('artwork-images').upload(path, resized)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('artwork-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.title) return alert('Title is required')
    if (savingRef.current) return  // prevent double-click
    savingRef.current = true
    setSaving(true)
    try {
      const payload = {
        title:             form.title,
        artist_id:         form.artist_id || null,
        year:              form.year || null,
        medium:            form.medium || null,
        dimensions:        form.dimensions || null,
        availability:      form.availability || 'Available',
        ownership:         form.ownership || 'gallery',
        location:          form.location || null,
        price:             form.price || null,
        retail_price:      form.retail_price ? Number(form.retail_price) : null,
        inventory_price:   form.inventory_price ? Number(form.inventory_price) : null,
        valuation:         form.valuation ? Number(form.valuation) : null,
        category:          form.category || null,
        image_url:         form.image_url || null,
        writeup:           form.writeup || null,
        provenance:        form.provenance || null,
        exhibition_history:form.exhibition_history || null,
        tags:              form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        series:            form.series || null,
        sort_order:        parseInt(form.sort_order) || 0,
        is_framed:         form.is_framed || false,
        frame_cost:        form.is_framed && form.frame_cost ? Number(form.frame_cost) : null,
        consignment_price: form.ownership === 'consignment' && form.consignment_price ? Number(form.consignment_price) : null,
        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,
        commission_rate:   form.ownership === 'consignment' ? Number(form.commission_rate) || 40 : null,
        tessera_id:        form.tessera_id || null,
        hg_code:           form.hg_code || null,
        updated_at:        new Date().toISOString(),
      }
      if (modal === 'edit') {
        const { error: updateErr } = await supabase.from('artworks').update(payload).eq('id', editId)
        if (updateErr) throw updateErr
        // Update in-state immediately â€” don't wait for reload
        setArtworks(prev => prev.map(w => w.id === editId ? { ...w, ...payload } : w))
      } else {
        // Auto-generate HG code â€” fail gracefully if sequence not set up
        let hgCode = payload.hg_code || null
        if (!hgCode) {
          const { data: codeData, error: rpcErr } = await supabase.rpc('next_hg_code')
          if (rpcErr) console.warn('HG code generation failed:', rpcErr.message)
          else hgCode = codeData
        }
        const { error: insertErr } = await supabase.from('artworks').insert({ ...payload, visible: true, hg_code: hgCode })
        if (insertErr) throw insertErr
      }
      cacheInvalidate('artworks')
      if (modal !== 'edit') await load()  // only reload for new artworks
      closeModal()
    } catch (err) {
      alert('Save failed: ' + (err.message || JSON.stringify(err)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this artwork?')) return
    await supabase.from('artworks').delete().eq('id', id)
    setArtworks(prev => prev.filter(w => w.id !== id))
  }

  async function openEdit(artwork) {
    // Fetch full record with all fields for editing
    const { data: full } = await supabase.from('artworks').select('*').eq('id', artwork.id).single()
    const aw = full || artwork
    console.log('Opening edit, writeup:', aw.writeup)
    setForm({
      ...EMPTY, ...aw,
      writeup: aw.writeup || '',
      tags: Array.isArray(artwork.tags) ? artwork.tags.join(', ') : '',
      ownership: artwork.ownership || 'gallery',
      consignment_price: artwork.consignment_price || '',
      consignor_name: artwork.consignor_name || '',
      consignor_contact: artwork.consignor_contact || '',
      commission_rate: artwork.commission_rate || 40,
      is_framed: artwork.is_framed || false,
      frame_cost: artwork.frame_cost || '',
      category: artwork.category || '',
      retail_price: artwork.retail_price || '',
      inventory_price: artwork.inventory_price || '',
      valuation: artwork.valuation || '',
      tessera_id: artwork.tessera_id || '',
    })
    setEditId(artwork.id)
    setModal('edit')
  }

  function closeModal() { setModal(null); setForm(EMPTY); setEditId(null) }

  const sf = (key, val) => { setFilters(f => ({...f, [key]: val})); setPage(0) }

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading artworksâ€¦</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Artworks</div>
          <div className="page-subtitle">{artworks.length} total Â· {artworks.filter(w=>w.visible).length} visible Â· {artworks.filter(w=>w.availability==='Available').length} available</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('add') }}>+ Add artwork</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
        <input className="form-input" style={{ width:220 }} placeholder="Searchâ€¦" value={filters.search} onChange={e=>sf('search',e.target.value)} />
        <select className="form-select" style={{ width:180 }} value={filters.artist} onChange={e=>sf('artist',e.target.value)}>
          <option value="">All artists</option>
          {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="form-select" style={{ width:150 }} value={filters.availability} onChange={e=>sf('availability',e.target.value)}>
          <option value="">All status</option>
          {AVAILABILITY.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" style={{ width:180 }} value={filters.location} onChange={e=>sf('location',e.target.value)}>
          <option value="">All locations</option>
          {[...new Set([...DEFAULT_LOCATIONS, ...locations])].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="form-select" style={{ width:170 }} value={filters.ownership} onChange={e=>sf('ownership',e.target.value)}>
          <option value="">All ownership</option>
          <option value="gallery">Gallery owned</option>
          <option value="consignment">Consignment</option>
        </select>
        <select className="form-select" style={{ width:140 }} value={filters.visible} onChange={e=>sf('visible',e.target.value)}>
          <option value="">All visibility</option>
          <option value="true">Visible</option>
          <option value="false">Hidden</option>
        </select>

        {/* Sort controls */}
        <div style={{ marginLeft:'auto', display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
          {[
            ['recent','Most recent'],
            ['az','A â€“ Z'],
            ['price_desc','Price â†“'],
            ['price_asc','Price â†‘'],
            ['location','Location'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => { setSortBy(key); setPage(0) }}
              style={{ padding:'6px 12px', fontSize:11, cursor:'pointer', fontFamily:'var(--font-sans)', border:'none', borderRight:'1px solid var(--line)', background: sortBy===key ? 'var(--ink)' : 'var(--white)', color: sortBy===key ? 'var(--white)' : 'var(--muted)', whiteSpace:'nowrap', transition:'all 150ms' }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize:13, color:'var(--muted)' }}>{filtered.length} results</span>
        <div style={{ position:'relative' }}>
          <button className="btn btn-outline btn-sm" onClick={() =>Print list ▾</button>
          {printMenu && (
            <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:100,
              background:'var(--bg,#fff)', border:'1px solid var(--line-soft)', borderRadius:4,
              boxShadow:'0 4px 16px rgba(0,0,0,.12)', minWidth:200, overflow:'hidden' }}
              onMouseLeave={() => setPrintMenu(false)}>
              <button style={{ display:'block', width:'100%', padding:'11px 16px', textAlign:'left',
                fontSize:13, cursor:'pointer', border:'none', background:'none', color:'var(--ink)',
                borderBottom:'1px solid var(--line-soft)' }}
                onClick={() => { setPrintMenu(false); setTimeout(() => printArtworkList(sorted, artistMap, filters, 'thumbnail'), 10) }}>
                <div style={{ fontWeight:600 }}>Thumbnail list</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Compact with small images</div>
              </button>
              <button style={{ display:'block', width:'100%', padding:'11px 16px', textAlign:'left',
                fontSize:13, cursor:'pointer', border:'none', background:'none', color:'var(--ink)' }}
                onClick={() => { setPrintMenu(false); setTimeout(() => printArtworkList(sorted, artistMap, filters, 'fullpage'), 10) }}>
                <div style={{ fontWeight:600 }}>Full page</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>One large artwork per page</div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width:60 }}>Image</th>
                <th style={{ cursor:'pointer', color: sortBy==='az'?'var(--ink)':'inherit' }} onClick={() => { setSortBy('az'); setPage(0) }}>Title {sortBy==='az'?'â†‘':''}</th>
                <th>Artist</th>
                <th style={{ cursor:'pointer', color: sortBy==='recent'?'var(--ink)':'inherit' }} onClick={() => { setSortBy('recent'); setPage(0) }}>Year {sortBy==='recent'?'â†“':''}</th>
                <th style={{ cursor:'pointer', color: sortBy==='location'?'var(--ink)':'inherit' }} onClick={() => { setSortBy('location'); setPage(0) }}>Location {sortBy==='location'?'â†‘':''}</th>
                <th>Ownership</th>
                <th style={{ cursor:'pointer', color: ['price_desc','price_asc'].includes(sortBy)?'var(--ink)':'inherit' }} onClick={() => { setSortBy(sortBy==='price_desc'?'price_asc':'price_desc'); setPage(0) }}>Price {sortBy==='price_desc'?'â†“':sortBy==='price_asc'?'â†‘':''}</th>
                <th>Status</th><th>Visible</th>
                <th style={{ width:120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(w => (
                <tr key={w.id}>
                  <td>
                    {w.image_url
                      ? <img src={w.image_url} alt="" loading="lazy" decoding="async" style={{ width:44, height:44, objectFit:'cover', objectPosition: w.image_position||'center', borderRadius:2, border:'1px solid var(--line)' }} />
                      : <div style={{ width:44, height:44, background:'var(--parchment-2)', borderRadius:2, border:'1px solid var(--line)' }} />
                    }
                  </td>
                  <td>
                    <a href={`/artwork/${w.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontWeight:500, fontSize:13, color:'var(--ink)', textDecoration:'none', borderBottom:'1px solid var(--line)' }}
                      title="Open artwork page">
                      {w.title}
                    </a>
                    <div style={{ display:'flex', gap:6, marginTop:2, flexWrap:'wrap' }}>
                      {w.hg_code && <span style={{ fontSize:10, color:'var(--gold,#b8862a)', fontWeight:600, letterSpacing:'.04em' }}>{w.hg_code}</span>}
                      {w.medium && <span style={{ fontSize:11, color:'var(--muted)' }}>{w.medium}</span>}
                      {w.category && <span style={{ fontSize:10, color:'var(--muted)', background:'var(--surface-0,#f8f7f5)', padding:'0 5px', borderRadius:2 }}>{w.category}</span>}
                      {w.is_framed && <span style={{ fontSize:10, color:'var(--muted)' }}>ðŸ–¼ Framed</span>}
                    </div>
                  </td>
                  <td><span style={{ fontSize:12, background:'var(--parchment-2)', padding:'2px 8px', borderRadius:3, color:'var(--ink)' }}>{artistMap[w.artist_id]?.name || 'â€”'}</span></td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>{w.year || 'â€”'}</td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{w.location || 'â€”'}</td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>
                    {w.ownership === 'consignment'
                      ? <span title={w.consignor_name ? `Consignor: ${w.consignor_name}` : ''}>
                          Consignment{w.consignment_price ? ` Â· â‚¦${Number(w.consignment_price).toLocaleString()}` : ''}
                        </span>
                      : <span>Gallery</span>
                    }
                  </td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>
                    {(() => {
                      const ngn = Number(w.retail_price) || 0
                      if (!ngn) return w.price || 'â€”'
                      if (displayCurrency === 'USD' && usdRate) {
                        return `$${Math.round(ngn / usdRate).toLocaleString()}`
                      }
                      return w.price || `â‚¦${ngn.toLocaleString()}`
                    })()}
                  </td>
                  <td>
                    <span className={`badge ${w.availability==='Available'?'badge-green':w.availability==='Sold'?'badge-red':'badge-amber'}`}>
                      {w.availability}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => toggleVisible(w)}
                      style={{ fontSize:18, cursor:'pointer', background:'none', border:'none', color: w.visible ? 'var(--green)' : 'var(--line)' }}
                    >{w.visible ? '◉' : '○'}</button>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:5 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(w)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => handleDelete(w.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding:'14px 20px', borderTop:'1px solid var(--line)', display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p-1)}>â† Prev</button>
            <span style={{ fontSize:13, color:'var(--muted)' }}>Page {page+1} of {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages-1} onClick={() => setPage(p => p+1)}>Next â†’</button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-xl">
            <div className="modal-header">
              <div className="modal-title">{modal === 'edit' ? `Edit â€” ${form.title}` : 'Add artwork'}</div>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>âœ•</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {/* Left */}
              <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Artist</label>
                  <select className="form-select" value={form.artist_id||''} onChange={e=>setForm(f=>({...f,artist_id:e.target.value}))}>
                    <option value="">â€” select â€”</option>
                    {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <input className="form-input" value={form.year||''} onChange={e=>setForm(f=>({...f,year:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Series</label>
                    <input className="form-input" value={form.series||''} onChange={e=>setForm(f=>({...f,series:e.target.value}))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Medium</label>
                    <input className="form-input" value={form.medium||''} onChange={e=>setForm(f=>({...f,medium:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                      <option value="">â€” select â€”</option>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Dimensions</label>
                  <input className="form-input" value={form.dimensions||''} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))} />
                </div>
                <PriceFields form={form} setForm={setForm} />
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <select className="form-select" value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))}>
                      <option value="">â€” select â€”</option>
                      {[...new Set([...DEFAULT_LOCATIONS, ...locations])].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Availability</label>
                    <select className="form-select" value={form.availability} onChange={e=>setForm(f=>({...f,availability:e.target.value}))}>
                      {AVAILABILITY.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="form-input" value={form.tags||''} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="portrait, oil, abstract" />
                </div>

                {/* Ownership */}
                <div style={{ background:'var(--parchment)', borderRadius:3, padding:'12px 14px', display:'flex', flexDirection:'column', gap:11 }}>
                  <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:2 }}>Ownership</div>
                  <div className="form-row">
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:`1px solid ${form.ownership==='gallery'?'var(--ink)':'var(--line)'}`, borderRadius:3, background: form.ownership==='gallery'?'var(--ink)':'var(--white)' }}>
                      <input type="radio" name="ownership" value="gallery" checked={form.ownership==='gallery'} onChange={()=>setForm(f=>({...f,ownership:'gallery'}))} style={{ width:'auto', accentColor:'white' }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, color: form.ownership==='gallery'?'var(--white)':'var(--ink)' }}>Gallery owned</div>
                        <div style={{ fontSize:10, color: form.ownership==='gallery'?'rgba(255,255,255,.6)':'var(--muted)' }}>Purchased by Hourglass Gallery</div>
                      </div>
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:`1px solid ${form.ownership==='consignment'?'var(--amber)':'var(--line)'}`, borderRadius:3, background: form.ownership==='consignment'?'#fdf3e0':'var(--white)' }}>
                      <input type="radio" name="ownership" value="consignment" checked={form.ownership==='consignment'} onChange={()=>setForm(f=>({...f,ownership:'consignment'}))} style={{ width:'auto', accentColor:'var(--amber)' }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, color: form.ownership==='consignment'?'var(--amber)':'var(--ink)' }}>Consignment</div>
                        <div style={{ fontSize:10, color: form.ownership==='consignment'?'#b8860b':'var(--muted)' }}>Owner retains title</div>
                      </div>
                    </label>
                  </div>

                  {form.ownership === 'consignment' && (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Consignor name</label>
                          <input className="form-input" value={form.consignor_name||''} onChange={e=>setForm(f=>({...f,consignor_name:e.target.value}))} placeholder="Owner's name" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Consignor contact</label>
                          <input className="form-input" value={form.consignor_contact||''} onChange={e=>setForm(f=>({...f,consignor_contact:e.target.value}))} placeholder="Phone or email" />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Consignment price (â‚¦) <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--amber)', fontSize:10 }}>â€” minimum agreed with owner, not shown publicly</span></label>
                          <input className="form-input" type="number" value={form.consignment_price||''} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value}))} placeholder="0" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gallery commission (%)</label>
                          <input className="form-input" type="number" min={0} max={100} value={form.commission_rate||40} onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} />
                          {form.consignment_price && form.commission_rate && (
                            <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                              Gallery earns â‚¦{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} Â· Owner receives â‚¦{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Framing */}
                <div style={{ background:'var(--parchment)', borderRadius:3, padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                    <input type="checkbox" checked={form.is_framed} onChange={e=>setForm(f=>({...f,is_framed:e.target.checked}))} style={{ width:'auto' }}/>
                    <span style={{ fontWeight:500 }}>Artwork is framed</span>
                  </label>
                  {form.is_framed && (
                    <div className="form-group" style={{ marginBottom:0, maxWidth:200 }}>
                      <label className="form-label">Frame cost (â‚¦)</label>
                      <input className="form-input" type="number" value={form.frame_cost||''} onChange={e=>setForm(f=>({...f,frame_cost:e.target.value}))} placeholder="0"/>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Write-up / description</label>
                  <textarea className="form-textarea" rows={4} value={form.writeup||''} onChange={e=>setForm(f=>({...f,writeup:e.target.value}))} />
                </div>
              </div>

              {/* Right â€” image + metadata */}
              <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
                {/* HG Code display */}
                {modal === 'edit' && form.hg_code && (
                  <div style={{ background:'var(--surface-0,#f8f7f5)', borderRadius:4, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>Gallery code</span>
                    <span style={{ fontSize:15, fontWeight:700, color:'var(--gold,#b8862a)', letterSpacing:'.06em' }}>{form.hg_code}</span>
                  </div>
                )}
                {modal === 'add' && (
                  <div style={{ background:'var(--surface-0,#f8f7f5)', borderRadius:4, padding:'10px 14px', fontSize:12, color:'var(--muted)' }}>
                    A gallery code (HG/XXXX) will be auto-generated on save.
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Tessera / legacy ID <span style={{ fontWeight:400, color:'var(--muted)', textTransform:'none', letterSpacing:0, fontSize:10 }}>â€” for cross-reference only</span></label>
                  <input className="form-input" value={form.tessera_id||''} onChange={e=>setForm(f=>({...f,tessera_id:e.target.value}))} placeholder="e.g. DA(S)/HG/377"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Artwork image</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                  {uploading && <div style={{ fontSize:11, color:'var(--muted)' }}>Uploadingâ€¦</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Image URL (or paste after upload)</label>
                  <input className="form-input" value={form.image_url||''} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))} />
                </div>
                {form.image_url && (
                  <div style={{ aspectRatio:'3/4', background:'var(--parchment-2)', borderRadius:3, overflow:'hidden' }}>
                    <img src={form.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: form.image_position||'center' }} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Image position</label>
                  <select className="form-select" value={form.image_position||'center'} onChange={e=>setForm(f=>({...f,image_position:e.target.value}))}>
                    {IMAGE_POSITIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sort order</label>
                  <input className="form-input" type="number" style={{ width:100 }} value={form.sort_order||0} onChange={e=>setForm(f=>({...f,sort_order:e.target.value}))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Savingâ€¦' : 'Save artwork'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function printArtworkList(artworks, artistMap, filters, mode = 'thumbnail') {
  // Yield to browser so UI can update before heavy work
  await new Promise(r => setTimeout(r, 50))
  const title = filters.location
    ? `Artwork List â€” ${filters.location}`
    : filters.artist
      ? `Artwork List â€” ${artistMap[filters.artist]?.name || 'Artist'}`
      : 'Artwork List â€” All Works'

  const subtitle = [
    filters.availability && `Status: ${filters.availability}`,
    filters.ownership && `Ownership: ${filters.ownership}`,
    filters.search && `Search: "${filters.search}"`,
  ].filter(Boolean).join(' Â· ')

  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })

  let body = ''

  if (mode === 'thumbnail') {
    // Thumbnail list â€” compact rows with small images
    const rows = artworks.map((w, i) => {
      const artist = artistMap[w.artist_id]?.name || 'â€”'
      const img = w.image_url
        ? `<img src="${w.image_url}" style="width:60px;height:60px;object-fit:cover;border-radius:2px;border:1px solid #e8e3db;">`
        : `<div style="width:60px;height:60px;background:#f0ece7;border-radius:2px;border:1px solid #e8e3db;"></div>`
      return `
        <tr>
          <td style="width:64px;padding:8px 6px 8px 0">${img}</td>
          <td style="padding:8px 10px">
            <div style="font-weight:600;font-size:12px">${escH(w.title)}</div>
            <div style="color:#666;font-size:11px;margin-top:2px">${escH(artist)}${w.year ? ` Â· ${escH(w.year)}` : ''}</div>
            ${w.medium ? `<div style="color:#888;font-size:10px">${escH(w.medium)}${w.dimensions ? ` Â· ${escH(w.dimensions)}` : ''}</div>` : ''}
          </td>
          <td style="padding:8px 10px;font-size:11px;color:#666">${escH(w.location || 'â€”')}</td>
          <td style="padding:8px 10px;font-size:11px;color:#666">${escH(w.hg_code || 'â€”')}</td>
          <td style="padding:8px 10px;font-size:12px;font-weight:500;color:${w.availability === 'Available' ? '#2d6a4f' : '#888'}">${escH(w.availability || 'â€”')}</td>
          <td style="padding:8px 10px;font-size:12px">${escH(w.price || (w.retail_price ? 'â‚¦' + Number(w.retail_price).toLocaleString() : 'â€”'))}</td>
        </tr>`
    }).join('')

    body = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:2px solid #1a1714">
            <th style="padding:8px 6px 8px 0;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888;width:64px"></th>
            <th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888">Artwork</th>
            <th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888">Location</th>
            <th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888">HG Code</th>
            <th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888">Status</th>
            <th style="padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`

  } else {
    // Full page â€” one artwork per page, large image
    body = artworks.map((w, i) => {
      const artist = artistMap[w.artist_id]
      const img = w.image_url
        ? `<img src="${w.image_url}" style="display:block;margin:20px auto;max-width:500px;max-height:500px;object-fit:contain;">`
        : `<div style="width:400px;height:400px;background:#f0ece7;margin:20px auto;border-radius:4px;"></div>`
      const price = w.retail_price ? 'â‚¦' + Number(w.retail_price).toLocaleString() : (w.price || '')
      return `<div style="page-break-after:always;padding:32px 40px;">
        <div style="border-bottom:2px solid #1a1714;padding-bottom:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-family:Georgia,serif;font-size:16px;">Hourglass Gallery</span>
          <span style="font-size:10px;color:#aaa;">${escH(w.hg_code || '')}</span>
        </div>
        ${img}
        <div style="margin-top:24px;border-top:1px solid #e8e3db;padding-top:16px;">
          <div style="font-family:Georgia,serif;font-size:24px;font-weight:400;margin-bottom:6px;">${escH(w.title)}</div>
          <div style="font-size:14px;color:#444;margin-bottom:12px;">${escH(artist?.name || 'â€”')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;">
            <div style="font-size:12px;color:#888;line-height:1.8;">
              ${w.year ? `<div>Year: ${escH(w.year)}</div>` : ''}
              ${w.medium ? `<div>Medium: ${escH(w.medium)}</div>` : ''}
              ${w.dimensions ? `<div>Dimensions: ${escH(w.dimensions)}</div>` : ''}
              ${w.location ? `<div>Location: ${escH(w.location)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              ${price ? `<div style="font-size:22px;font-weight:600;color:#1a1714;">${escH(price)}</div>` : ''}
              <div style="font-size:12px;color:${w.availability === 'Available' ? '#2d6a4f' : '#888'};margin-top:4px;font-weight:500;">${escH(w.availability || '')}</div>
            </div>
          </div>
        </div>
      </div>`
    }).join('')
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,sans-serif;color:#1a1714;padding:${mode === 'fullpage' ? '20px 32px' : '24px 32px'};font-size:12px;}
.header{margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1a1714;}
@media print{
  body{padding:12px 20px;}
  ${mode === 'fullpage' ? '@page{margin:0;size:A4 portrait;}' : ''}
}
</style></head><body>
<div class="header">
  <div style="font-family:Georgia,serif;font-size:16px;margin-bottom:2px">Hourglass Gallery</div>
  <div style="font-size:13px;font-weight:600;margin:6px 0 2px">${escH(title)}</div>
  ${subtitle ? `<div style="font-size:11px;color:#888">${escH(subtitle)}</div>` : ''}
  <div style="font-size:10px;color:#aaa;margin-top:3px">Generated ${today} Â· ${artworks.length} work${artworks.length !== 1 ? 's' : ''} Â· ${mode === 'thumbnail' ? 'Thumbnail list' : 'Full page'}</div>
</div>
${body}
</body></html>`

  const w = window.open('', '_blank', 'width=1100,height=750')
  if (!w) { alert('Please allow popups to print'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), mode === 'fullpage' ? 2500 : 800)
}


function escH(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parsePrice(priceStr) {
  if (!priceStr) return 0
  return parseFloat(String(priceStr).replace(/[^0-9.]/g, '')) || 0
}

async function resizeImage(file, maxPx = 1200) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(file)
  })
}
