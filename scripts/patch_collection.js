import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

const src = fs.readFileSync(file, 'utf8')
const lines = src.split(/\r?\n/)

// Verify anchor at expected location (0-indexed line 1508 = "{(it.item_type...")
const anchorIdx = lines.findIndex(l => l.includes("{(it.item_type === 'artwork' || !it.item_type) && ("))
if (anchorIdx < 0) { console.error('Anchor not found anywhere'); process.exit(1) }
console.log('Found anchor at line', anchorIdx + 1)

// Find the matching closing "  )}" - search forward for the specific closing pattern
// We know from inspection it spans to a line with just ")}" followed by matching indent
let endIdx = -1
for (let i = anchorIdx + 1; i < anchorIdx + 30; i++) {
  if (lines[i] && lines[i].trim() === ')}') { endIdx = i; break }
}
if (endIdx < 0) { console.error('End not found'); process.exit(1) }
console.log('Found end at line', endIdx + 1)
console.log('Block content:')
console.log(lines.slice(anchorIdx, endIdx+1).join('\n'))

const indent = '                  '
const newBlock = [
`${indent}{(it.item_type === 'artwork' || !it.item_type) && (`,
`${indent}  <div style={{ marginTop:6 }}>`,
`${indent}    <div style={{ display:'flex', alignItems:'center', gap:8 }}>`,
`${indent}      <input type="checkbox" style={{ width:18, height:18, cursor:'pointer' }}`,
`${indent}        checked={it.delivered || false}`,
`${indent}        onChange={async e => {`,
`${indent}          const checked = e.target.checked`,
`${indent}          const now = new Date().toISOString()`,
`${indent}          if (checked) { setCollectingItem(it.id); return }`,
`${indent}          await supabase.from('invoice_items').update({ delivered: false, delivered_at: null, collected_by: null }).eq('id', it.id)`,
`${indent}          setItems(prev => prev.map(i => i.id === it.id ? { ...i, delivered: false, delivered_at: null, collected_by: null } : i))`,
`${indent}          cacheInvalidate('invoices')`,
`${indent}        }}`,
`${indent}      />`,
`${indent}      <span onClick={() => it.delivered && setCollectingItem(it.id)}`,
`${indent}        style={{ color: it.delivered ? 'var(--green,#27ae60)' : '#b8862a', fontWeight:500, fontSize:12, cursor: it.delivered ? 'pointer' : 'default' }}>`,
`${indent}        {it.delivered`,
`${indent}          ? \`Collected\${it.delivered_at ? ' - ' + new Date(it.delivered_at).toLocaleDateString('en-GB') : ''}\${it.collected_by ? ' by ' + it.collected_by : ''}\``,
`${indent}          : 'Pending collection'}`,
`${indent}      </span>`,
`${indent}      {it.delivered && <button onClick={() => setCollectingItem(it.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:11, textDecoration:'underline' }}>edit</button>}`,
`${indent}    </div>`,
`${indent}    {collectingItem === it.id && (`,
`${indent}      <CollectionEditRow item={it}`,
`${indent}        onCancel={() => setCollectingItem(null)}`,
`${indent}        onSave={async (vals) => {`,
`${indent}          await supabase.from('invoice_items').update({ delivered: true, delivered_at: vals.date, collected_by: vals.agent }).eq('id', it.id)`,
`${indent}          setItems(prev => prev.map(i => i.id === it.id ? { ...i, delivered: true, delivered_at: vals.date, collected_by: vals.agent } : i))`,
`${indent}          cacheInvalidate('invoices')`,
`${indent}          setCollectingItem(null)`,
`${indent}        }} />`,
`${indent}    )}`,
`${indent}  </div>`,
`${indent})}`,
].join('\n')

const result = [...lines.slice(0, anchorIdx), newBlock, ...lines.slice(endIdx + 1)].join('\n')

// Add collectingItem state
const stateAnchor = "  const [editingPayment, setEditingPayment] = useState(null)"
let result2 = result
if (!result2.includes('collectingItem')) {
  result2 = result2.replace(stateAnchor, stateAnchor + "\n  const [collectingItem, setCollectingItem] = useState(null)")
}

// Add CollectionEditRow component before PaymentEditRow
const compAnchor = 'function PaymentEditRow('
const newComp = `function CollectionEditRow({ item, onSave, onCancel }) {
  const [agent, setAgent] = useState(item.collected_by || '')
  const [date, setDate] = useState(item.delivered_at ? item.delivered_at.split('T')[0] : new Date().toISOString().split('T')[0])
  return (
    <div style={{ display:'flex', gap:8, alignItems:'flex-end', marginTop:6, padding:'8px 10px', background:'var(--surface-1,#f8f7f5)', borderRadius:3 }}>
      <div className="form-group" style={{ marginBottom:0 }}>
        <label className="form-label">Collected by</label>
        <input className="form-input" style={{ width:160 }} value={agent} onChange={e=>setAgent(e.target.value)} placeholder="Agent / staff name" />
      </div>
      <div className="form-group" style={{ marginBottom:0 }}>
        <label className="form-label">Date</label>
        <input className="form-input" type="date" style={{ width:150 }} value={date} onChange={e=>setDate(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => onSave({ agent, date: new Date(date).toISOString() })}>Save</button>
      <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}

`

if (!result2.includes('function CollectionEditRow')) {
  const cIdx = result2.indexOf(compAnchor)
  if (cIdx < 0) { console.error('PaymentEditRow anchor not found'); process.exit(1) }
  result2 = result2.slice(0, cIdx) + newComp + result2.slice(cIdx)
}

fs.writeFileSync(file, result2, 'utf8')
console.log('\nPatched successfully')
