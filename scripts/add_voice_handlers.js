import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Sales.jsx: handle voice invoice + new-client commands ──
const salesFile = path.join(__dirname, '../src/pages/Sales.jsx')
let sales = fs.readFileSync(salesFile, 'utf8')
const salesCRLF = sales.includes('\r\n')
sales = sales.replace(/\r\n/g, '\n')

if (!sales.includes('voiceCommand')) {
  // Add useLocation import
  if (!sales.includes('useLocation')) {
    sales = sales.replace(
      "import { supabase",
      "import { useLocation } from 'react-router-dom'\nimport { supabase"
    )
  }

  // Add voice command handler after load() is first called in useEffect
  const salesUseEffect = "  useEffect(() => { load() }, [])"
  if (sales.includes(salesUseEffect)) {
    sales = sales.replace(salesUseEffect, `  const location = useLocation()

  useEffect(() => { load() }, [])

  // Handle voice commands
  useEffect(() => {
    const vc = location.state?.voiceCommand
    if (!vc) return
    window.history.replaceState({}, '')
    if (vc.type === 'invoice' && vc.client) {
      setTab('Invoices')
      setTimeout(() => {
        setEditingInvoice(null)
        setModal('invoice')
      }, 300)
    }
    if (vc.type === 'new-client') {
      setEditingClient({ name: vc.name || '', phone: vc.phone || '', company: vc.company || '' })
    }
  }, [location.state])`)
    console.log('OK: Sales voice handler')
  } else {
    console.log('SKIP: Sales useEffect anchor not found')
  }
}

fs.writeFileSync(salesFile, salesCRLF ? sales.replace(/\n/g, '\r\n') : sales, 'utf8')

// ── CRM.jsx: handle voice visit/interest/prospect commands ──
const crmFile = path.join(__dirname, '../src/pages/CRM.jsx')
let crm = fs.readFileSync(crmFile, 'utf8')
const crmCRLF = crm.includes('\r\n')
crm = crm.replace(/\r\n/g, '\n')

if (!crm.includes('voiceCommand')) {
  // Add useLocation
  if (!crm.includes('useLocation')) {
    crm = crm.replace(
      "import { supabase",
      "import { useLocation } from 'react-router-dom'\nimport { supabase"
    )
  }

  // Add voice handler after load
  const crmUseEffect = "  useEffect(() => { load() }, [])"
  if (crm.includes(crmUseEffect)) {
    crm = crm.replace(crmUseEffect, `  const location = useLocation()

  useEffect(() => { load() }, [])

  // Handle voice commands
  useEffect(() => {
    const vc = location.state?.voiceCommand
    if (!vc) return
    window.history.replaceState({}, '')
    if (vc.type === 'visit') {
      const who = vc.client?.id || vc.prospect?.id || ''
      const whoType = vc.client ? 'client' : vc.prospect ? 'prospect' : 'client'
      setVisitForm(f => ({...f, who, whoType}))
      setModal('visit')
    }
    if (vc.type === 'interest') {
      const who = vc.client?.id || vc.prospect?.id || ''
      const whoType = vc.client ? 'client' : vc.prospect ? 'prospect' : 'client'
      setInterestForm(f => ({...f, who, whoType, artist_name: vc.artist?.name || '', medium: vc.medium || ''}))
      setModal('interest')
    }
    if (vc.type === 'new-prospect') {
      setProspectForm(f => ({...f, name: vc.name || '', phone: vc.phone || '', company: vc.company || ''}))
      setModal('prospect')
    }
  }, [location.state])`)
    console.log('OK: CRM voice handler')
  } else {
    console.log('SKIP: CRM useEffect anchor not found')
  }
}

fs.writeFileSync(crmFile, crmCRLF ? crm.replace(/\n/g, '\r\n') : crm, 'utf8')
console.log('ALL DONE')
