import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { useAuth } from '../components/AuthProvider'

const FORMATS = ['Hardcover','Paperback','Limited Edition','Artists Book','Catalogue','Journal','Other']
const SUBJECTS = ['African Art','Contemporary Art','Photography','Architecture','Design','Art History','Criticism','Poetry','Fiction','Other']

const EMPTY = {
  title:'', author:'', publisher:'', year:'', isbn:'', format:'Hardcover',
  subject:'', description:'', cover_url:'', price:'', stock_count:0,
  stock_low:2, location:'', notes:'', visible:true,
}

export default function Books() {
  const { user } = useAuth()
  const [books, setBooks]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filterFormat, setFilterFormat] = useState('')
  const [filterStock, setFilterStock]   = useState('')   // '' | 'low' | 'out'
  const [modal, setModal]         = useState(null)       // null | 'add' | 'edit' | 'stock' | 'history'
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [stockForm, setStockForm] = useState({ type:'receive', quantity:'', reference:'', notes:'' })
  const [movements, setMovements] = useState([])
  const [activeBook, setActiveBook] = useState(null)

  async function load() {
    const { data } = await supabase.from('books').select('*').order('title')
    setBooks(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => books.filter(b => {
    if (filterFormat && b.format !== filterFormat) return false
    if (filterStock === 'low'  && b.stock_count > b.stock_low) return false
    if (filterStock === 'out'  && b.stock_count > 0) return false
    if (search) {
      const q = search.toLowerCase()
      if (!b.title?.toLowerCase().includes(q) &&
          !b.author?.toLowerCase().includes(q) &&
          !b.publisher?.toLowerCase().includes(q) &&
          !b.isbn?.toLowerCase().includes(q)) return false
    }
    return true
  }), [books, search, filterFormat, filterStock])

  const lowStockCount = books.filter(b => b.stock_count <= b.stock_low && b.stock_count > 0).length
  const outOfStockCount = books.filter(b => b.stock_count === 0).length

  async function handleSave() {
    if (!form.title.trim()) return alert('Title is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        price: form.price ? Number(form.price) : 0,
        stock_count: modal === 'add' ? Number(form.stock_count) || 0 : undefined,
        stock_low: Number(form.stock_low) || 2,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'edit') {
        delete payload.stock_count  // stock managed via movements
        await supabase.from('books').update(payload).eq('id', editId)
      } else {
        const { data: newBook } = await supabase.from('books').insert({ ...payload, visible: true }).select().single()
        // Record initial stock as a receive movement if > 0
        if (payload.stock_count > 0 && newBook) {
          await supabase.from('book_stock_movements').insert({
            book_id: newBook.id, type: 'receive', quantity: payload.stock_count,
            notes: 'Initial stock on entry', recorded_by: user?.id,
          })
        }
      }
      cacheInvalidate('books')
      await load()
      setModal(null)
      setForm(EMPTY)
      setEditId(null)
    } catch(err) { alert('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `covers/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
      const { error } = await supabase.storage.from('book-covers').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('book-covers').getPublicUrl(path)
      setForm(f => ({ ...f, cover_url: publicUrl }))
    } catch(err) { alert('Upload failed: ' + err.message) }
    finally { setUploading(false) }
  }

  async function openStock(book) {
    setActiveBook(book)
    setStockForm({ type:'receive', quantity:'', reference:'', notes:'' })
    const { data } = await supabase.from('book_stock_movements')
      .select('*').eq('book_id', book.id).order('created_at', { ascending: false }).limit(20)
    setMovements(data || [])
    setModal('stock')
  }

  async function saveStock() {
    if (!stockForm.quantity || Number(stockForm.quantity) === 0) return alert('Enter a quantity')
    setSaving(true)
    try {
      const qty = ['sale','writeoff'].includes(stockForm.type)
        ? -Math.abs(Number(stockForm.quantity))
        :  Math.abs(Number(stockForm.quantity))
      await supabase.from('book_stock_movements').insert({
        book_id: activeBook.id, type: stockForm.type, quantity: qty,
        reference: stockForm.reference || null, notes: stockForm.notes || null,
        recorded_by: user?.id,
      })
      await load()
      const updated = books.find(b => b.id === activeBook.id)
      if (updated) setActiveBook({ ...activeBook, stock_count: activeBook.stock_count + qty })
      const { data } = await supabase.from('book_stock_movements')
        .select('*').eq('book_id', activeBook.id).order('created_at', { ascending: false }).limit(20)
      setMovements(data || [])
      setStockForm({ type:'receive', quantity:'', reference:'', notes:'' })
    } catch(err) { alert('Failed: ' + err.message) }
    finally { setSaving(false) }
  }

  async function toggleVisible(book) {
    await supabase.from('books').update({ visible: !book.visible }).eq('id', book.id)
    cacheInvalidate('books')
    setBooks(prev => prev.map(b => b.id === book.id ? { ...b, visible: !b.visible } : b))
  }

  async function handleDelete(id) {
    if (!confirm('Delete this book? Stock history will also be deleted.')) return
    await supabase.from('books').delete().eq('id', id)
    cacheInvalidate('books')
    setBooks(prev => prev.filter(b => b.id !== id))
  }

  function openEdit(book) {
    setForm({ ...EMPTY, ...book, price: book.price || '' })
    setEditId(book.id)
    setModal('edit')
  }

  function stockBadge(book) {
    if (book.stock_count === 0) return { label: 'Out of stock', bg:'#fef2f0', color:'#c0392b' }
    if (book.stock_count <= book.stock_low) return { label: `Low \u2014 ${book.stock_count} left`, bg:'#fef9ec', color:'#b8862a' }
    return { label: `${book.stock_count} in stock`, bg:'#f0faf4', color:'#27ae60' }
  }

  function movementLabel(type) {
    return { receive:'Received', sale:'Sale', return:'Return', adjustment:'Adjustment', writeoff:'Write-off' }[type] || type
  }

  if (loading) return <div style={{color:'var(--muted)'}}>Loading{'\u2026'}</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Books</div>
          <div className="page-subtitle">
            {books.length} titles
            {lowStockCount > 0 && <span style={{color:'#b8862a', marginLeft:12}}>{'\u00B7'} {lowStockCount} low stock</span>}
            {outOfStockCount > 0 && <span style={{color:'#c0392b', marginLeft:8}}>{'\u00B7'} {outOfStockCount} out of stock</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('add') }}>+ Add book</button>
      </div>

      {/* Filters */}
      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:18}}>
        <input className="form-input" style={{width:240}} placeholder="Search title, author, ISBN..."
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="form-select" style={{width:160}} value={filterFormat} onChange={e=>setFilterFormat(e.target.value)}>
          <option value="">All formats</option>
          {FORMATS.map(f=><option key={f}>{f}</option>)}
        </select>
        <select className="form-select" style={{width:160}} value={filterStock} onChange={e=>setFilterStock(e.target.value)}>
          <option value="">All stock levels</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <span style={{fontSize:13, color:'var(--muted)', alignSelf:'center', marginLeft:'auto'}}>{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:52}}>Cover</th>
                <th>Title</th>
                <th>Author</th>
                <th>Format</th>
                <th>ISBN</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Visible</th>
                <th style={{width:140}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{textAlign:'center', padding:32, color:'var(--muted)'}}>No books found</td></tr>
              )}
              {filtered.map(b => {
                const badge = stockBadge(b)
                return (
                  <tr key={b.id}>
                    <td>
                      {b.cover_url
                        ? <img src={b.cover_url} alt="" style={{width:40, height:52, objectFit:'cover', borderRadius:2, border:'1px solid var(--line)'}}/>
                        : <div style={{width:40, height:52, background:'var(--parchment-2)', borderRadius:2, border:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>{'\uD83D'}{'\uDCD6'}</div>
                      }
                    </td>
                    <td>
                      <div style={{fontWeight:500, fontSize:13}}>{b.title}</div>
                      {b.publisher && <div style={{fontSize:11, color:'var(--muted)'}}>{b.publisher}{b.year ? ` \u00B7 ${b.year}` : ''}</div>}
                    </td>
                    <td style={{fontSize:13, color:'var(--muted)'}}>{b.author||'\u2014'}</td>
                    <td style={{fontSize:12, color:'var(--muted)'}}>{b.format||'\u2014'}</td>
                    <td style={{fontSize:11, color:'var(--muted)', fontFamily:'monospace'}}>{b.isbn||'\u2014'}</td>
                    <td style={{fontSize:13}}>{'\u20A6'}{Number(b.price||0).toLocaleString()}</td>
                    <td>
                      <span style={{fontSize:11, padding:'2px 8px', borderRadius:3, background:badge.bg, color:badge.color, fontWeight:500}}>
                        {badge.label}
                      </span>
                    </td>
                    <td>
                      <button onClick={()=>toggleVisible(b)}
                        style={{fontSize:18, cursor:'pointer', background:'none', border:'none', color: b.visible?'var(--green)':'var(--line)'}}>
                        {b.visible ? '\u25C9' : '\u25CB'}
                      </button>
                    </td>
                    <td>
                      <div style={{display:'flex', gap:4}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(b)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openStock(b)} title="Manage stock">Stock</button>
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={()=>handleDelete(b.id)}>{'\u2715'}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* \u2500\u2500 ADD / EDIT MODAL \u2500\u2500 */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay">
          <div className="modal modal-xl">
            <div className="modal-header">
              <div className="modal-title">{modal === 'edit' ? `Edit \u2014 ${form.title}` : 'Add book'}</div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(null)}>{'\u2715'}</button>
            </div>
            <div className="modal-body" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>

              {/* Left */}
              <div style={{display:'flex', flexDirection:'column', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Author</label>
                    <input className="form-input" value={form.author||''} onChange={e=>setForm(f=>({...f,author:e.target.value}))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Publisher</label>
                    <input className="form-input" value={form.publisher||''} onChange={e=>setForm(f=>({...f,publisher:e.target.value}))}/>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <input className="form-input" value={form.year||''} onChange={e=>setForm(f=>({...f,year:e.target.value}))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ISBN</label>
                    <input className="form-input" value={form.isbn||''} onChange={e=>setForm(f=>({...f,isbn:e.target.value}))} placeholder="978-..."/>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Format</label>
                    <select className="form-select" value={form.format||'Hardcover'} onChange={e=>setForm(f=>({...f,format:e.target.value}))}>
                      {FORMATS.map(f=><option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subject</label>
                    <input className="form-input" value={form.subject||''} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} list="subject-list"/>
                    <datalist id="subject-list">{SUBJECTS.map(s=><option key={s} value={s}/>)}</datalist>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Price ({'\u20A6'})</label>
                    <input className="form-input" type="number" value={form.price||''} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input className="form-input" value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="e.g. Yellow Adire shelf"/>
                  </div>
                </div>
                {modal === 'add' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Opening stock</label>
                      <input className="form-input" type="number" min={0} value={form.stock_count||0} onChange={e=>setForm(f=>({...f,stock_count:e.target.value}))}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Low stock alert at</label>
                      <input className="form-input" type="number" min={0} value={form.stock_low||2} onChange={e=>setForm(f=>({...f,stock_low:e.target.value}))}/>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows={3} value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes (internal)</label>
                  <textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
                </div>
              </div>

              {/* Right \u2014 cover image */}
              <div style={{display:'flex', flexDirection:'column', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Cover image</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload}/>
                  {uploading && <div style={{fontSize:11, color:'var(--muted)'}}>Uploading{'\u2026'}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Cover URL</label>
                  <input className="form-input" value={form.cover_url||''} onChange={e=>setForm(f=>({...f,cover_url:e.target.value}))}/>
                </div>
                {form.cover_url && (
                  <div style={{maxWidth:200, borderRadius:3, overflow:'hidden', border:'1px solid var(--line)'}}>
                    <img src={form.cover_url} alt="" style={{width:'100%', display:'block'}}/>
                  </div>
                )}
                {modal === 'edit' && (
                  <div style={{background:'var(--surface-0,#f8f7f5)', borderRadius:4, padding:'12px 14px', marginTop:8}}>
                    <div style={{fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8}}>Stock</div>
                    <div style={{fontSize:24, fontWeight:700, color:'var(--ink)'}}>{editId ? books.find(b=>b.id===editId)?.stock_count ?? 0 : 0}</div>
                    <div style={{fontSize:12, color:'var(--muted)', marginTop:2}}>Use the Stock button on the table to adjust</div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving\u2026' : modal === 'edit' ? 'Save changes' : 'Add book'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* \u2500\u2500 STOCK MODAL \u2500\u2500 */}
      {modal === 'stock' && activeBook && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Stock {'\u2014'} {activeBook.title}</div>
                <div style={{fontSize:12, color:'var(--muted)', marginTop:2}}>
                  Current stock: <strong style={{color: activeBook.stock_count === 0 ? '#c0392b' : activeBook.stock_count <= activeBook.stock_low ? '#b8862a' : 'var(--ink)'}}>{activeBook.stock_count}</strong>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(null)}>{'\u2715'}</button>
            </div>
            <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:16}}>

              {/* Add movement */}
              <div style={{background:'var(--surface-0,#f8f7f5)', borderRadius:4, padding:'14px 16px', display:'flex', flexDirection:'column', gap:12}}>
                <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)'}}>Record stock movement</div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={stockForm.type} onChange={e=>setStockForm(f=>({...f,type:e.target.value}))}>
                      <option value="receive">Receive stock</option>
                      <option value="return">Customer return</option>
                      <option value="adjustment">Adjustment</option>
                      <option value="writeoff">Write-off</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input className="form-input" type="number" min={1} value={stockForm.quantity}
                      onChange={e=>setStockForm(f=>({...f,quantity:e.target.value}))} placeholder="0"/>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Reference <span style={{fontWeight:400, color:'var(--muted)'}}>{'\u2014'} supplier, PO, etc</span></label>
                    <input className="form-input" value={stockForm.reference} onChange={e=>setStockForm(f=>({...f,reference:e.target.value}))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input className="form-input" value={stockForm.notes} onChange={e=>setStockForm(f=>({...f,notes:e.target.value}))}/>
                  </div>
                </div>
                <button className="btn btn-primary" style={{alignSelf:'flex-start'}} onClick={saveStock} disabled={saving}>
                  {saving ? 'Saving\u2026' : 'Record movement'}
                </button>
              </div>

              {/* Movement history */}
              <div>
                <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8}}>Movement history</div>
                {movements.length === 0 && <div style={{fontSize:13, color:'var(--muted)'}}>No movements recorded</div>}
                <div style={{display:'flex', flexDirection:'column', gap:0, border:'1px solid var(--line)', borderRadius:4, overflow:'hidden'}}>
                  {movements.map((m,i) => (
                    <div key={m.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', borderBottom: i < movements.length-1 ? '1px solid var(--line-soft)' : 'none', background: i%2===0 ? 'var(--white)' : 'var(--surface-0,#f8f7f5)'}}>
                      <div>
                        <span style={{fontSize:12, fontWeight:500}}>{movementLabel(m.type)}</span>
                        {m.reference && <span style={{fontSize:11, color:'var(--muted)', marginLeft:8}}>{m.reference}</span>}
                        {m.notes && <span style={{fontSize:11, color:'var(--muted)', marginLeft:8}}>{m.notes}</span>}
                        <div style={{fontSize:11, color:'var(--muted)'}}>{new Date(m.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <span style={{fontWeight:700, fontSize:14, color: m.quantity > 0 ? '#27ae60' : '#c0392b'}}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
