import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('subView')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add subView state
mustReplace(
  "  const [modal, setModal] = useState(null)",
  "  const [modal, setModal] = useState(null)\n  const [subView, setSubView] = useState('artworks') // 'artworks' | 'consignors' | 'consignment-report'",
  '1. Add subView state'
)

// 2. Add sub-navigation tabs after subtitle
mustReplace(
  "        <button className=\"btn btn-outline\" onClick={() => navigate('/admin/batch-upload')}>Batch upload</button>\n      </div>",
  `        <button className="btn btn-outline" onClick={() => navigate('/admin/batch-upload')}>Batch upload</button>
      </div>

      {/* Sub-navigation */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid var(--line)', marginBottom:18 }}>
        {[['artworks','All artworks'],['consignors','Consignors'],['consignment-report','Consignment report']].map(([key,label]) => (
          <button key={key} onClick={() => setSubView(key)}
            style={{ padding:'10px 18px', fontSize:12, fontFamily:'inherit', cursor:'pointer', background:'none', border:'none',
              borderBottom: subView===key ? '2px solid var(--ink)' : '2px solid transparent', marginBottom:-2,
              color: subView===key ? 'var(--ink)' : 'var(--muted)', fontWeight: subView===key ? 600 : 400 }}>
            {label}
          </button>
        ))}
      </div>`,
  '2. Sub-nav tabs'
)

// 3. Wrap existing filters + table in subView === 'artworks' condition
mustReplace(
  "      {/* Filters */}",
  "      {subView === 'artworks' && <>\n      {/* Filters */}",
  '3a. Open artworks condition'
)

// Find end of artworks section - before the modal
mustReplace(
  "      {/* Modal */}",
  "      </>}\n\n      {/* ── CONSIGNORS VIEW ── */}\n      {subView === 'consignors' && <ConsignorsView artworks={artworks} artists={artists} onEdit={editArtwork} />}\n\n      {/* ── CONSIGNMENT REPORT ── */}\n      {subView === 'consignment-report' && <ConsignmentReport artworks={artworks} artists={artists} />}\n\n      {/* Modal */}",
  '3b. Close artworks, add consignors/report views'
)

// 4. Add ConsignorsView and ConsignmentReport components at end of file
const lastLine = src.lastIndexOf('\n')
src = src.slice(0, lastLine) + `

// ── CONSIGNORS VIEW ──
function ConsignorsView({ artworks, artists, onEdit }) {
  const [expanded, setExpanded] = useState(null)
  const artistMap = Object.fromEntries(artists.map(a => [a.id, a.name]))
  const consigned = artworks.filter(w => w.ownership === 'consignment' && w.consignor_name)
  const grouped = {}
  consigned.forEach(w => {
    const key = w.consignor_name
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(w)
  })
  const consignors = Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b))
  const sym = c => ({NGN:'\\u20A6',USD:'$',GBP:'\\u00A3',EUR:'\\u20AC'})[c||'NGN'] || '\\u20A6'

  return (
    <div>
      {consignors.length === 0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No consigned artworks found</div>}
      {consignors.map(([name, works]) => (
        <div key={name} className="card" style={{ marginBottom:12, overflow:'hidden' }}>
          <div onClick={() => setExpanded(expanded === name ? null : name)}
            style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', cursor:'pointer', background: expanded===name ? 'var(--parchment)' : 'var(--white)' }}>
            <div>
              <div style={{ fontWeight:600, fontSize:15 }}>{name}</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                {works.length} work{works.length!==1?'s':''} · {works.filter(w=>w.availability==='Available').length} available · {works.filter(w=>w.availability==='Sold').length} sold
              </div>
            </div>
            <span style={{ fontSize:18, color:'var(--muted)' }}>{expanded===name ? '\\u25B2' : '\\u25BC'}</span>
          </div>
          {expanded === name && (
            <div style={{ borderTop:'1px solid var(--line)' }}>
              {works.map(w => (
                <div key={w.id} onClick={() => onEdit(w)}
                  style={{ display:'flex', gap:14, padding:'10px 18px', borderBottom:'1px solid var(--line-soft)', cursor:'pointer', alignItems:'center' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--parchment)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <img src={w.thumbnail_url||w.image_url||''} alt="" style={{ width:50, height:50, objectFit:'cover', borderRadius:3, border:'1px solid var(--line)', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:13 }}>{w.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]||'Unknown'} · {w.medium||''} · {w.year||''}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>{sym(w.consignment_currency)}{Number(w.consignment_price||0).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      {Number(w.commission_rate)===0 ? 'Fixed price' : w.commission_rate+'% commission'}
                    </div>
                  </div>
                  <div style={{ width:70, textAlign:'right' }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:500,
                      background: w.availability==='Available' ? '#e8f5e9' : w.availability==='Sold' ? '#fde8e8' : '#fef9ec',
                      color: w.availability==='Available' ? '#2d6a4f' : w.availability==='Sold' ? '#c0392b' : '#b8862a' }}>
                      {w.availability}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── CONSIGNMENT REPORT ──
function ConsignmentReport({ artworks, artists }) {
  const [reportFilter, setReportFilter] = useState('all') // all | available | sold
  const [printing, setPrinting] = useState(false)
  const artistMap = Object.fromEntries(artists.map(a => [a.id, a.name]))
  const consigned = artworks.filter(w => w.ownership === 'consignment')
  const filtered = reportFilter === 'all' ? consigned : consigned.filter(w => w.availability === reportFilter.charAt(0).toUpperCase() + reportFilter.slice(1))
  const sym = c => ({NGN:'\\u20A6',USD:'$',GBP:'\\u00A3',EUR:'\\u20AC'})[c||'NGN'] || '\\u20A6'

  function printReport() {
    setPrinting(true)
    const rows = filtered.map(w => {
      const artist = artistMap[w.artist_id] || ''
      const s = sym(w.consignment_currency)
      const price = Number(w.consignment_price||0).toLocaleString()
      const comm = Number(w.commission_rate)===0 ? 'Fixed' : w.commission_rate+'%'
      const galleryShare = Number(w.commission_rate) > 0 ? s + Math.round(Number(w.consignment_price||0) * Number(w.commission_rate) / 100).toLocaleString() : '—'
      const ownerShare = Number(w.commission_rate) > 0 ? s + Math.round(Number(w.consignment_price||0) * (100 - Number(w.commission_rate)) / 100).toLocaleString() : s + price
      const img = w.thumbnail_url || w.image_url || ''
      return '<tr>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;vertical-align:middle">' + (img ? '<img src="'+img+'" style="width:48px;height:48px;object-fit:cover;border-radius:3px;border:1px solid #e8e3db" />' : '') + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px"><b>'+w.title+'</b><br><span style="color:#999">'+artist+'</span><br><span style="color:#bbb;font-size:10px">'+[w.medium,w.year,w.dimensions].filter(Boolean).join(' · ')+'</span></td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px">'+w.consignor_name+'</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:right">'+s+price+'</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:center">'+comm+'</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:right">'+galleryShare+'</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:right">'+ownerShare+'</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:11px;text-align:center;color:'+(w.availability==='Available'?'#2d6a4f':w.availability==='Sold'?'#c0392b':'#b8862a')+'">'+w.availability+'</td>' +
        '</tr>'
    }).join('')

    const html = '<!DOCTYPE html><html><head><title>Consignment Report — Hourglass Gallery</title><style>@media print{@page{margin:12mm;size:A4 landscape}body{padding:0}}body{font-family:-apple-system,sans-serif;padding:20px;color:#1a1714}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px;border-bottom:2px solid #1a1714;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999}</style></head><body>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">' +
      '<div><div style="font-size:18px;font-weight:600">Consignment Report</div><div style="font-size:12px;color:#999">Hourglass Gallery · Generated '+new Date().toLocaleDateString('en-GB')+'</div></div>' +
      '<div style="font-size:12px;color:#999">'+filtered.length+' work'+(filtered.length!==1?'s':'')+'</div></div>' +
      '<table><thead><tr><th></th><th>Artwork</th><th>Consignor</th><th style="text-align:right">Price</th><th style="text-align:center">Comm.</th><th style="text-align:right">Gallery</th><th style="text-align:right">Owner</th><th style="text-align:center">Status</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>' +
      '<div style="margin-top:24px;text-align:center;font-size:10px;color:#999;border-top:1px solid #e8e3db;padding-top:12px">Hourglass Gallery · 298A Akin Olugbade Street, Victoria Island, Lagos</div>' +
      '</body></html>'

    const w = window.open('', '_blank', 'width=1100,height=700')
    if (!w) { alert('Allow popups to print'); setPrinting(false); return }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); setPrinting(false) }, 600)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
        {[['all','All consigned'],['available','Available'],['sold','Sold']].map(([key,label]) => (
          <button key={key} onClick={() => setReportFilter(key)}
            style={{ padding:'5px 14px', fontSize:12, borderRadius:14, cursor:'pointer', fontFamily:'inherit',
              border: reportFilter===key ? '1px solid var(--ink)' : '1px solid var(--line)',
              background: reportFilter===key ? 'var(--ink)' : 'transparent',
              color: reportFilter===key ? '#fff' : 'var(--muted)' }}>
            {label} ({key==='all' ? consigned.length : consigned.filter(w=>w.availability===(key.charAt(0).toUpperCase()+key.slice(1))).length})
          </button>
        ))}
        <button className="btn btn-outline btn-sm" style={{ marginLeft:'auto' }} onClick={printReport} disabled={printing}>
          {printing ? 'Preparing...' : 'Print / Save PDF'}
        </button>
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'2px solid var(--line)' }}>
              <th style={{ width:56, padding:'8px' }}></th>
              <th style={{ textAlign:'left', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Artwork</th>
              <th style={{ textAlign:'left', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Consignor</th>
              <th style={{ textAlign:'right', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Price</th>
              <th style={{ textAlign:'center', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Comm.</th>
              <th style={{ textAlign:'right', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Gallery</th>
              <th style={{ textAlign:'right', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Owner</th>
              <th style={{ textAlign:'center', padding:'8px', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => {
              const s = sym(w.consignment_currency)
              const price = Number(w.consignment_price||0)
              const commRate = Number(w.commission_rate||0)
              return (
                <tr key={w.id} style={{ borderBottom:'1px solid var(--line-soft)' }}>
                  <td style={{ padding:'6px 8px' }}>
                    <img src={w.thumbnail_url||w.image_url||''} alt="" style={{ width:48, height:48, objectFit:'cover', borderRadius:3, border:'1px solid var(--line)' }} />
                  </td>
                  <td style={{ padding:'6px 8px' }}>
                    <div style={{ fontWeight:500, fontSize:13 }}>{w.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]||''}</div>
                    <div style={{ fontSize:10, color:'#bbb' }}>{[w.medium,w.year].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td style={{ padding:'6px 8px', fontSize:13 }}>{w.consignor_name}</td>
                  <td style={{ padding:'6px 8px', fontSize:13, textAlign:'right' }}>{s}{price.toLocaleString()}</td>
                  <td style={{ padding:'6px 8px', fontSize:12, textAlign:'center', color:'var(--muted)' }}>
                    {commRate === 0 ? 'Fixed' : commRate+'%'}
                  </td>
                  <td style={{ padding:'6px 8px', fontSize:12, textAlign:'right' }}>
                    {commRate > 0 ? s+Math.round(price*commRate/100).toLocaleString() : '\\u2014'}
                  </td>
                  <td style={{ padding:'6px 8px', fontSize:12, textAlign:'right' }}>
                    {commRate > 0 ? s+Math.round(price*(100-commRate)/100).toLocaleString() : s+price.toLocaleString()}
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:500,
                      background: w.availability==='Available'?'#e8f5e9':w.availability==='Sold'?'#fde8e8':'#fef9ec',
                      color: w.availability==='Available'?'#2d6a4f':w.availability==='Sold'?'#c0392b':'#b8862a' }}>
                      {w.availability}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No consigned artworks</div>}
      </div>
    </div>
  )
}
` + src.slice(lastLine)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
