import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('editingClient')) { console.log('Already patched'); process.exit(0) }

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

// 1. Add editingClient state in main Sales component (after editingInvoice)
mustReplace(
  "  const [editingInvoice, setEditingInvoice] = useState(null) // invoice being viewed/edited",
  "  const [editingInvoice, setEditingInvoice] = useState(null) // invoice being viewed/edited\n  const [editingClient, setEditingClient] = useState(null) // client being edited from detail panel",
  '1. Add editingClient state'
)

// 2. Add editingClient modal render next to the existing ClientModal
mustReplace(
  "        <ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />",
  `        <ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />
      )}
      {editingClient && (
        <ClientModal
          onClose={() => setEditingClient(null)}
          onSave={() => { load(); setEditingClient(null) }}
          existingClients={clients}
          editClient={editingClient}
        />`,
  '2. Add editingClient modal render'
)

// 3. Update ClientModal to accept and use editClient prop
mustReplace(
  "function ClientModal({ onClose, onSave, existingClients = [] }) {",
  "function ClientModal({ onClose, onSave, existingClients = [], editClient = null }) {",
  '3. Update ClientModal signature'
)

// 4. Pre-fill form from editClient
mustReplace(
  "  const [form, setForm] = useState({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })",
  "  const [form, setForm] = useState(() => editClient ? { ...editClient, phone_mobile: editClient.phone_mobile||editClient.phone||'', phone_work: editClient.phone_work||'', street: editClient.street||editClient.address||'', suburb: editClient.suburb||'', state: editClient.state||'', postcode: editClient.postcode||'', country: editClient.country||'Nigeria', tags: editClient.tags||[] } : { name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'', tags:[] })",
  '4. Pre-fill form from editClient'
)

// 5. Update save function to handle edit vs create
mustReplace(
  "    const { error } = await supabase.from('clients').insert(payload)",
  "    if (editClient) {\n      const { error } = await supabase.from('clients').update(payload).eq('id', editClient.id)\n      if (error) throw error\n    } else {\n      const { error } = await supabase.from('clients').insert(payload)\n      if (error) throw error\n    }",
  '5. Update save for edit vs create'
)

// Fix the duplicate error throw that would remain
src = src.replace(
  "      if (error) throw error\n    }\n      if (error) throw error",
  "      if (error) throw error\n    }"
)

// 6. Update modal title
mustReplace(
  "<div className=\"modal-title\">Add client</div>",
  "<div className=\"modal-title\">{editClient ? 'Edit client' : 'Add client'}</div>",
  '6. Update modal title'
)

// 7. Change the Edit button in client detail to use editingClient instead of openEdit
mustReplace(
  "<button className=\"btn btn-outline btn-sm\" onClick={() => openEdit(selected)}>Edit</button>",
  "<button className=\"btn btn-outline btn-sm\" onClick={() => setEditingClient(selected)}>Edit</button>",
  '7. Wire Edit button to editingClient'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
