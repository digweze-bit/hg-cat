// Patches Sales.jsx to add invoice sorting
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let src = fs.readFileSync(file, 'utf8')

// Add sortKey state after statusFilter state
src = src.replace(
  "  const [statusFilter, setStatusFilter] = useState('')\n\n  const filtered = invoices.filter",
  "  const [statusFilter, setStatusFilter] = useState('')\n  const [sortKey, setSortKey] = useState('date_desc')\n\n  const SORTS = [\n    { key:'date_desc', label:'Date \u2193 (newest)' },\n    { key:'date_asc', label:'Date \u2191 (oldest)' },\n    { key:'amount_desc', label:'Amount \u2193' },\n    { key:'amount_asc', label:'Amount \u2191' },\n    { key:'balance_desc', label:'Balance \u2193' },\n    { key:'client_az', label:'Client A\u2013Z' },\n    { key:'status', label:'Status' },\n  ]\n\n  const filtered = invoices.filter"
)

// Replace simple filter with sorted filter
src = src.replace(
  `  const filtered = invoices.filter(i => {
    if (statusFilter && i.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return i.invoice_number?.toLowerCase().includes(q) || i.clients?.name?.toLowerCase().includes(q)
    }
    return true
  })`,
  `  const filtered = useMemo(() => {
    let list = invoices.filter(i => {
      if (statusFilter && i.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return i.invoice_number?.toLowerCase().includes(q) || i.clients?.name?.toLowerCase().includes(q)
      }
      return true
    })
    switch (sortKey) {
      case 'date_desc':    list = [...list].sort((a,b) => (b.issue_date||'').localeCompare(a.issue_date||'')); break
      case 'date_asc':     list = [...list].sort((a,b) => (a.issue_date||'').localeCompare(b.issue_date||'')); break
      case 'amount_desc':  list = [...list].sort((a,b) => (Number(b.total)||0) - (Number(a.total)||0)); break
      case 'amount_asc':   list = [...list].sort((a,b) => (Number(a.total)||0) - (Number(b.total)||0)); break
      case 'balance_desc': list = [...list].sort((a,b) => (Number(b.balance_due)||0) - (Number(a.balance_due)||0)); break
      case 'client_az':    list = [...list].sort((a,b) => (a.clients?.name||'').localeCompare(b.clients?.name||'')); break
      case 'status':       list = [...list].sort((a,b) => (a.status||'').localeCompare(b.status||'')); break
    }
    return list
  }, [invoices, search, statusFilter, sortKey])`
)

// Add sort dropdown to toolbar
src = src.replace(
  `        <select className="form-select" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All status</option>
          {['draft','sent','partial','paid','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>`,
  `        <select className="form-select" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All status</option>
          {['draft','sent','partial','paid','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" style={{ width:160 }} value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--muted)' }}>
          {filtered.length} invoices
        </span>
      </div>`
)

// Also fix the 1277ms INP — printInvoice converts images to base64 which blocks
// Add a "Preparing..." state so button responds immediately
src = src.replace(
  "  async function printInvoice() {\n    let logoB64 = null",
  "  const [printing, setPrinting] = useState(false)\n\n  async function printInvoice() {\n    setPrinting(true)\n    await new Promise(r => setTimeout(r, 10)) // yield to browser for repaint\n    let logoB64 = null"
)
src = src.replace(
  "    setTimeout(() => URL.revokeObjectURL(url), 30000)\n  }",
  "    setTimeout(() => URL.revokeObjectURL(url), 30000)\n    setPrinting(false)\n  }"
)
src = src.replace(
  '<button className="btn btn-outline btn-sm" onClick={() => requestAnimationFrame(printInvoice)}>Print / PDF</button>',
  '<button className="btn btn-outline btn-sm" onClick={() => requestAnimationFrame(printInvoice)} disabled={printing}>{printing ? \'Preparing…\' : \'Print / PDF\'}</button>'
)

fs.writeFileSync(file, src, 'utf8')

// Verify
const check = fs.readFileSync(file, 'utf8')
console.log('sortKey found:', check.includes('sortKey'))
console.log('SORTS found:', check.includes('SORTS'))
console.log('Preparing found:', check.includes('Preparing'))
