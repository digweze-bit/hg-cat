import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/CRM.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

mustReplace(
  `      const { data: newClient, error: cErr } = await supabase.from('clients').insert({
        name: p.name, email: p.email || null, phone: p.phone || null,
        phone_mobile: p.phone || null, company: p.company || null, notes: p.notes || null,
      }).select('id').single()
      if (cErr) throw cErr

      await supabase.from('client_visits').update({ client_id: newClient.id, prospect_id: null }).eq('prospect_id', p.id)
      await supabase.from('client_interests').update({ client_id: newClient.id, prospect_id: null }).eq('prospect_id', p.id)
      await supabase.from('prospects').update({ status:'converted', converted_client_id: newClient.id, updated_at: new Date().toISOString() }).eq('id', p.id)`,
  `      const { data: newClient, error: cErr } = await supabase.from('clients').insert({
        name: p.name, email: p.email || null, phone: p.phone || null,
        phone_mobile: p.phone || null, company: p.company || null,
        notes: [p.notes, p.source ? 'Source: ' + p.source : null].filter(Boolean).join('\\n') || null,
        tags: p.tags || [],
      }).select('id').single()
      if (cErr) throw cErr

      // Transfer visits and interests — keep prospect_id so history is traceable
      await supabase.from('client_visits').update({ client_id: newClient.id }).eq('prospect_id', p.id)
      await supabase.from('client_interests').update({ client_id: newClient.id }).eq('prospect_id', p.id)
      await supabase.from('prospects').update({ status:'converted', converted_client_id: newClient.id, updated_at: new Date().toISOString() }).eq('id', p.id)`,
  'Fix conversion to carry over all fields and preserve prospect link'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
