import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('editingItem')) { console.log('Already patched'); process.exit(0) }

// 1. Add editingItem state after itemForm state
src = src.replace(
  "const [itemForm, setItemForm] = useState({ item_type: 'article', title: '', content: '', url: '', source: '', item_date: '', tags: [] })",
  "const [itemForm, setItemForm] = useState({ item_type: 'article', title: '', content: '', url: '', source: '', item_date: '', tags: [] })\n  const [editingItem, setEditingItem] = useState(null)\n  const [synthMode, setSynthMode] = useState('summary') // 'summary' | 'provenance'"
)

// 2. Add openEditItem function after deleteItem function
const deleteItemFn = `  async function deleteItem(id) {
    if (!confirm('Delete this item?')) return
    await supabase.from('archive_items').delete().eq('id', id)
    await loadItems(activeEntry.id)
  }`

if (!src.includes(deleteItemFn)) { console.error('deleteItem anchor not found'); process.exit(1) }

const newFns = `  async function deleteItem(id) {
    if (!confirm('Delete this item?')) return
    await supabase.from('archive_items').delete().eq('id', id)
    await loadItems(activeEntry.id)
  }

  function openEditItem(item) {
    setItemForm({
      item_type: item.item_type, title: item.title, content: item.content || '',
      url: item.url || '', source: item.source || '', item_date: item.item_date || '',
      tags: item.tags || [],
    })
    setEditingItem(item)
    setModal('edit-item')
  }

  async function updateItem() {
    if (!itemForm.title.trim()) return alert('Title is required')
    setSaving(true)
    await supabase.from('archive_items').update({
      item_type: itemForm.item_type, title: itemForm.title, content: itemForm.content || null,
      url: itemForm.url || null, source: itemForm.source || null,
      item_date: itemForm.item_date || null, tags: itemForm.tags,
    }).eq('id', editingItem.id)
    await loadItems(activeEntry.id)
    setModal(null)
    setEditingItem(null)
    setItemForm({ item_type: 'article', title: '', content: '', url: '', source: '', item_date: '', tags: [] })
    setSaving(false)
  }`

src = src.replace(deleteItemFn, newFns)

// 3. Update synthesise function to support provenance mode
const oldSynth = `  async function synthesise() {
    if (items.length === 0) return alert('No items to synthesise')
    setAiLoading(true)
    setAiSummary('')
    try {
      const textItems = items.filter(i => i.content || i.url)
      const prompt = \`You are an art historian and researcher for Hourglass Gallery, Lagos. 
      
You have been given archive materials about: "\${activeEntry.name}" (\${activeEntry.type}).

ARCHIVE ITEMS:
\${textItems.map((it, idx) => \`
[\${idx + 1}] \${ITEM_TYPE_ICONS[it.item_type]} \${it.title}
Source: \${it.source || 'Unknown'} | Date: \${it.item_date || 'Unknown'}
\${it.content ? 'Content: ' + it.content.slice(0, 1000) : ''}
\${it.url ? 'URL: ' + it.url : ''}
Tags: \${(it.tags || []).join(', ') || 'none'}
\`).join('\\n---\\n')}

\${activeEntry.notes ? 'Curator notes: ' + activeEntry.notes : ''}

Please provide:
1. A concise synthesis of what these materials tell us about \${activeEntry.name}
2. Key themes and recurring ideas
3. Significance in the context of Nigerian/African art history
4. Any gaps or areas that need further research

Be specific, scholarly but accessible. Use the source materials directly.\`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      const text = data.content?.map(b => b.text || '').join('') || ''
      setAiSummary(text)
    } catch (err) {
      alert('Synthesis failed: ' + err.message)
    }
    setAiLoading(false)
  }`

if (!src.includes(oldSynth)) { console.error('synthesise anchor not found'); process.exit(1) }

const newSynth = `  async function synthesise(mode) {
    if (items.length === 0) return alert('No items to synthesise')
    setSynthMode(mode)
    setAiLoading(true)
    setAiSummary('')
    try {
      const textItems = items.filter(i => i.content || i.url)
      const itemsBlock = textItems.map((it, idx) => \`
[\${idx + 1}] \${ITEM_TYPE_ICONS[it.item_type]} \${it.title}
Source: \${it.source || 'Unknown'} | Date: \${it.item_date || 'Unknown'}
\${it.content ? 'Content: ' + it.content.slice(0, 1200) : ''}
\${it.url ? 'URL: ' + it.url : ''}
Tags: \${(it.tags || []).join(', ') || 'none'}
\`).join('\\n---\\n')

      const prompt = mode === 'provenance'
        ? \`You are preparing a provenance document for Hourglass Gallery, Lagos, regarding: "\${activeEntry.name}" (\${activeEntry.type}).

Draft a formal provenance research summary based strictly on the archive materials below. Structure it as:

1. SUBJECT — brief identification
2. DOCUMENTED HISTORY — chronological account of ownership, exhibition, publication, or attribution history as evidenced by the sources, citing each source
3. SOURCE MATERIALS CONSULTED — list each item with its source and date
4. GAPS AND UNVERIFIED CLAIMS — anything that needs further verification before this can support a formal provenance claim
5. RECOMMENDATION — whether the current evidence is sufficient to support a provenance statement, or what additional research is needed

Be precise and conservative — do not state anything as fact unless it is directly supported by a source below. This document may be used to support authentication or sale.

ARCHIVE MATERIALS:
\${itemsBlock}

\${activeEntry.notes ? 'Curator notes: ' + activeEntry.notes : ''}\`
        : \`You are an art historian and researcher for Hourglass Gallery, Lagos.

You have been given archive materials about: "\${activeEntry.name}" (\${activeEntry.type}).

ARCHIVE ITEMS:
\${itemsBlock}

\${activeEntry.notes ? 'Curator notes: ' + activeEntry.notes : ''}

Please provide:
1. A concise synthesis of what these materials tell us about \${activeEntry.name}
2. Key themes and recurring ideas
3. Significance in the context of Nigerian/African art history
4. Any gaps or areas that need further research

Be specific, scholarly but accessible. Use the source materials directly.\`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1800,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      const text = data.content?.map(b => b.text || '').join('') || ''
      setAiSummary(text)
    } catch (err) {
      alert('Synthesis failed: ' + err.message)
    }
    setAiLoading(false)
  }`

src = src.replace(oldSynth, newSynth)

// 4. Update the synthesise button to show two options
const oldButton = `              <button className="btn btn-primary btn-sm" onClick={synthesise} disabled={aiLoading || items.length === 0}>
                {aiLoading ? 'Synthesising…' : '✦ Synthesise'}
              </button>`

if (!src.includes(oldButton)) { console.error('Synth button anchor not found'); process.exit(1) }

const newButton = `              <button className="btn btn-primary btn-sm" onClick={() => synthesise('summary')} disabled={aiLoading || items.length === 0}>
                {aiLoading && synthMode === 'summary' ? 'Synthesising…' : '✦ Synthesise'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => synthesise('provenance')} disabled={aiLoading || items.length === 0}>
                {aiLoading && synthMode === 'provenance' ? 'Drafting…' : '📋 Provenance doc'}
              </button>`

src = src.replace(oldButton, newButton)

// 5. Update AI summary header to reflect mode
src = src.replace(
  `<div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b5ce7', fontWeight: 600, marginBottom: 10 }}>✦ AI Synthesis</div>`,
  `<div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b5ce7', fontWeight: 600, marginBottom: 10 }}>{synthMode === 'provenance' ? '📋 Provenance Document Draft' : '✦ AI Synthesis'}</div>`
)

// 6. Add Edit button to each item row, and pencil icon before delete
const oldItemButtons = `                    <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>&times;</button>`

if (!src.includes(oldItemButtons)) { console.error('Item delete button anchor not found'); process.exit(1) }

const newItemButtons = `                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => openEditItem(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, padding: '2px 6px' }}>Edit</button>
                      <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px' }}>&times;</button>
                    </div>`

src = src.replace(oldItemButtons, newItemButtons)

// 7. Add edit-item modal — reuse new-item modal structure but for editing
const newItemModalStart = src.indexOf("{modal === 'new-item' && (")
if (newItemModalStart < 0) { console.error('new-item modal not found'); process.exit(1) }

src = src.replace(
  "{modal === 'new-item' && (",
  "{(modal === 'new-item' || modal === 'edit-item') && ("
)

src = src.replace(
  `<div className="modal-title">Add item to {activeEntry?.name}</div>`,
  `<div className="modal-title">{modal === 'edit-item' ? 'Edit item' : 'Add item to ' + activeEntry?.name}</div>`
)

src = src.replace(
  `<button className="btn btn-primary" onClick={saveItem} disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>`,
  `<button className="btn btn-primary" onClick={modal === 'edit-item' ? updateItem : saveItem} disabled={saving}>{saving ? 'Saving…' : (modal === 'edit-item' ? 'Save changes' : 'Save item')}</button>`
)

// Close modal handlers should also clear editingItem
src = src.replace(
  /onClick=\{\(\) => setModal\(null\)\}>&times;<\/button>\s*<\/div>\s*<div className="modal-body" style=\{\{ display: 'flex', flexDirection: 'column', gap: 14 \}\}>\s*<div className="form-group">\s*<label className="form-label">Item type<\/label>/,
  (match) => match.replace("onClick={() => setModal(null)}", "onClick={() => { setModal(null); setEditingItem(null) }}")
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Archive enhanced: edit item, provenance document mode')
