import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add pendingInvoiceId state
mustReplace(
  '  const [activeInvoice, setActiveInvoice] = useState(null)',
  '  const [activeInvoice, setActiveInvoice] = useState(null)\n  const [pendingInvoiceId, setPendingInvoiceId] = useState(null)',
  '1. Add pendingInvoiceId state'
)

// 2. Replace broken setTimeout approach
mustReplace(
  `    if (openId) {
      window.history.replaceState({}, '')
      setTab('Invoices')
      setTimeout(() => { setActiveInvoice(openId); setModal('invoice-detail') }, 300)
      setTimeout(() => { const inv = invoices.find(i => i.id === openId); if (inv) { setActiveInvoice(inv); setModal('invoice-detail') } }, 500)
    }`,
  `    if (openId) {
      window.history.replaceState({}, '')
      setTab('Invoices')
      setPendingInvoiceId(openId)
      return
    }`,
  '2. Replace setTimeout with pendingInvoiceId'
)

// 3. Add effect that opens invoice once data loads — after artistMap
mustReplace(
  '  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])',
  `  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])

  // Open pending invoice from dashboard click once invoices are loaded
  useEffect(() => {
    if (!pendingInvoiceId || invoices.length === 0) return
    const inv = invoices.find(i => i.id === pendingInvoiceId)
    if (inv) { setActiveInvoice(inv); setModal('invoice-detail'); setPendingInvoiceId(null) }
  }, [pendingInvoiceId, invoices])`,
  '3. Add data-dependent invoice opener'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
