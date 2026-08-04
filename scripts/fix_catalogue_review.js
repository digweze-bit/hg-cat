import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/CatalogueBuilder.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('step === \'review\'')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.error('ANCHOR NOT FOUND: ' + label)
    console.error('--- Looking for ---')
    console.error(oldStr.slice(0, 200))
    process.exit(1)
  }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add step and overrides state
mustReplace(
  "  const [generating, setGenerating] = useState(false)",
  `  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState('select') // 'select' | 'review' | 'edit-details'
  const [overrides, setOverrides] = useState({}) // id -> { title, price, bio, note }`,
  '1. Add step and overrides state'
)

// 2. Update the Create button text and behavior
mustReplace(
  `              {generating ? 'Generating...' : \`Create catalogue (\${selected.length} work\${selected.length !== 1 ? 's' : ''})\`}`,
  `              {generating ? 'Generating...' : \`Review catalogue (\${selected.length} work\${selected.length !== 1 ? 's' : ''})\`}`,
  '2. Rename button to Review'
)

// 3. At end of generate(), instead of opening window, set step to review
mustReplace(
  `    setPreviewHtml(html)
    setShowPreview(true)
    setGenerating(false)
  }`,
  `    setPreviewHtml(html)
    setStep('review')
    setGenerating(false)
  }

  function getOverride(id, field) {
    return overrides[id]?.[field] ?? null
  }
  function setOverride(id, field, value) {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }`,
  '3. Set step to review after generate'
)

// 4. Replace the preview overlay with a proper review/edit-details flow
mustReplace(
  `      {/* Preview overlay */}
      {showPreview && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.85)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#1a1714' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:500 }}>Catalogue preview</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowPreview(false)}
                style={{ padding:'6px 14px', background:'transparent', border:'1px solid #555', color:'#aaa', borderRadius:3, cursor:'pointer', fontSize:12 }}>
                Back to editor
              </button>
              <button onClick={() => {
                const w = window.open('', '_blank')
                if (!w) { alert('Allow popups to generate PDF'); return }
                w.document.open(); w.document.write(previewHtml); w.document.close(); w.focus()
              }}
                style={{ padding:'6px 14px', background:'#E05C2A', border:'none', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:500 }}>
                Open & Download PDF
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center' }}>
            <iframe ref={previewRef} srcDoc={previewHtml}
              style={{ width:'100%', maxWidth:480, height:'100%', border:'none', background:'#f5f3f0' }}
              title="Catalogue preview" />
          </div>
        </div>
      )}`,
  `      {/* Review step */}
      {step === 'review' && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.85)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#1a1714' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:500 }}>Review catalogue</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setStep('select')}
                style={{ padding:'6px 14px', background:'transparent', border:'1px solid #555', color:'#aaa', borderRadius:3, cursor:'pointer', fontSize:12 }}>
                Back
              </button>
              <button onClick={() => setStep('edit-details')}
                style={{ padding:'6px 14px', background:'transparent', border:'1px solid #888', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12 }}>
                Edit details
              </button>
              <button onClick={() => {
                const w = window.open('', '_blank')
                if (!w) { alert('Allow popups to generate PDF'); return }
                w.document.open(); w.document.write(previewHtml); w.document.close(); w.focus()
              }}
                style={{ padding:'6px 14px', background:'#E05C2A', border:'none', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:500 }}>
                Create PDF
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center' }}>
            <iframe ref={previewRef} srcDoc={previewHtml}
              style={{ width:'100%', maxWidth:480, height:'100%', border:'none', background:'#f5f3f0' }}
              title="Catalogue preview" />
          </div>
        </div>
      )}

      {/* Edit details step */}
      {step === 'edit-details' && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'var(--white)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#1a1714' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:500 }}>Edit catalogue details</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { generate(); }}
                style={{ padding:'6px 14px', background:'#E05C2A', border:'none', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:500 }}>
                Update preview
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', padding:'20px 24px' }}>
            <div style={{ maxWidth:700, margin:'0 auto', display:'flex', flexDirection:'column', gap:16 }}>
              {selected.map((w, i) => (
                <div key={w.id} style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:16, padding:'14px 16px', border:'1px solid var(--line)', borderRadius:6 }}>
                  {(w.thumbnail_url || w.image_url)
                    ? <img src={w.thumbnail_url || w.image_url} alt="" style={{ width:80, height:80, objectFit:'cover', borderRadius:4 }} />
                    : <div style={{ width:80, height:80, background:'var(--parchment-2)', borderRadius:4 }} />
                  }
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--muted)' }}>{i+1}. {w.artist_name}</div>
                    <div className="form-row" style={{ gap:8 }}>
                      <div className="form-group" style={{ flex:2 }}>
                        <label className="form-label" style={{ fontSize:10 }}>Title</label>
                        <input className="form-input" style={{ fontSize:12, padding:'4px 8px' }}
                          value={overrides[w.id]?.title ?? w.title}
                          onChange={e => setOverride(w.id, 'title', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex:1 }}>
                        <label className="form-label" style={{ fontSize:10 }}>Price</label>
                        <input className="form-input" style={{ fontSize:12, padding:'4px 8px' }}
                          value={overrides[w.id]?.price ?? (w.price || '')}
                          onChange={e => setOverride(w.id, 'price', e.target.value)} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize:10 }}>Note (appears below artwork)</label>
                      <input className="form-input" style={{ fontSize:12, padding:'4px 8px' }}
                        value={overrides[w.id]?.note ?? (notes[w.id] || '')}
                        onChange={e => { setOverride(w.id, 'note', e.target.value); setNotes(prev => ({...prev, [w.id]: e.target.value})) }} />
                    </div>
                    {showBio && (
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize:10 }}>Bio ({w.artist_name})</label>
                        <textarea className="form-textarea" rows={2} style={{ fontSize:11 }}
                          value={overrides[w.id]?.bio ?? (bios[w.artist_name] || '')}
                          onChange={e => { setOverride(w.id, 'bio', e.target.value); setBios(prev => ({...prev, [w.artist_name]: e.target.value})) }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}`,
  '4. Replace preview with review/edit-details flow'
)

// 5. Update generate to apply overrides to selected data
mustReplace(
  `    const du = (w) => w.dimension_unit === 'cm' ? 'cm' : 'in'`,
  `    const du = (w) => w.dimension_unit === 'cm' ? 'cm' : 'in'

    // Apply overrides
    const finalSelected = selected.map(w => ({
      ...w,
      title: overrides[w.id]?.title ?? w.title,
      price: overrides[w.id]?.price ?? w.price,
    }))`,
  '5. Apply overrides in generate'
)

// 6. Use finalSelected instead of selected in page building
mustReplace(
  `    if (layout === 'single') {
      selected.forEach(w => pages.push(\`<div class="pg">\${card(w,'full')}</div>\`))
    } else if (layout === 'double') {
      for (let i = 0; i < selected.length; i += 2) {
        const c = [card(selected[i],'half')]
        if (selected[i+1]) c.push(card(selected[i+1],'half'))
        pages.push(\`<div class="pg dbl">\${c.join('')}</div>\`)
      }
    } else {
      for (let i = 0; i < selected.length; i += 4) {
        const c = selected.slice(i,i+4).map(w => card(w,'quarter'))
        pages.push(\`<div class="pg quad">\${c.join('')}</div>\`)
      }
    }

    if (showBio && bioPlacement === 'end') {
      const used = [...new Set(selected.map(w => w.artist_name))].filter(Boolean).sort()`,
  `    if (layout === 'single') {
      finalSelected.forEach(w => pages.push(\`<div class="pg">\${card(w,'full')}</div>\`))
    } else if (layout === 'double') {
      for (let i = 0; i < finalSelected.length; i += 2) {
        const c = [card(finalSelected[i],'half')]
        if (finalSelected[i+1]) c.push(card(finalSelected[i+1],'half'))
        pages.push(\`<div class="pg dbl">\${c.join('')}</div>\`)
      }
    } else {
      for (let i = 0; i < finalSelected.length; i += 4) {
        const c = finalSelected.slice(i,i+4).map(w => card(w,'quarter'))
        pages.push(\`<div class="pg quad">\${c.join('')}</div>\`)
      }
    }

    if (showBio && bioPlacement === 'end') {
      const used = [...new Set(finalSelected.map(w => w.artist_name))].filter(Boolean).sort()`,
  '6. Use finalSelected in page building'
)

// 7. Hide the select UI when in review/edit mode
mustReplace(
  `      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>`,
  `      {step === 'select' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>`,
  '7a. Open conditional for select step'
)

// Find the closing of the grid - right before the review overlay
mustReplace(
  `      {/* Review step */}`,
  `      </div>}

      {/* Review step */}`,
  '7b. Close conditional for select step'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
