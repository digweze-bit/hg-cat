/**
 * Repairs invoice line items that were missed during migration
 * Finds invoices with no line items and inserts them from Tessera data
 * Run: node scripts/repair_invoice_items.js [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = 'https://gmukkxnxyvmywgrbkwnr.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const DRY_RUN     = process.argv.includes('--dry-run')

if (!SUPABASE_KEY) { console.error('Set SUPABASE_SERVICE_KEY'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  console.log(`\n🔧  Invoice items repair ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`)
  console.log('─'.repeat(48))

  // Load Tessera items data
  const tessera = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'tessera_items_by_invoice.json'), 'utf8'
  ))
  console.log(`   Tessera: ${Object.keys(tessera).length} invoices with items`)

  // Fetch all TES- invoices from HG Cat
  let allInvoices = []
  let offset = 0
  while (true) {
    const { data } = await supabase.from('invoices')
      .select('id, invoice_number')
      .like('invoice_number', 'TES-%')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    allInvoices = allInvoices.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  console.log(`   HG Cat: ${allInvoices.length} TES- invoices`)

  // Find invoices with no line items
  const { data: withItems } = await supabase
    .from('invoice_items')
    .select('invoice_id')
  const hasItems = new Set((withItems || []).map(i => i.invoice_id))
  
  const missing = allInvoices.filter(i => !hasItems.has(i.id))
  console.log(`   Invoices missing line items: ${missing.length}`)

  // Fetch artwork tessera_id → HG Cat id map
  let artMap = {}
  let artOffset = 0
  while (true) {
    const { data } = await supabase.from('artworks')
      .select('id, tessera_id')
      .not('tessera_id', 'is', null)
      .range(artOffset, artOffset + 999)
    if (!data || data.length === 0) break
    data.forEach(a => { artMap[a.tessera_id] = a.id })
    if (data.length < 1000) break
    artOffset += 1000
  }
  console.log(`   Artwork map: ${Object.keys(artMap).length} entries`)

  // Insert missing items
  let totalInserted = 0
  let totalMissed = 0

  for (const inv of missing) {
    const key = inv.invoice_number  // e.g. TES-HG20191445
    const tessKey = key             // matches our json keys
    const items = tessera[tessKey]
    if (!items || items.length === 0) { totalMissed++; continue }

    const toInsert = items.map(item => ({
      invoice_id:   inv.id,
      artwork_id:   item.tessera_id ? (artMap[item.tessera_id] || null) : null,
      item_type:    'artwork',
      title:        item.title,
      artist_name:  item.artist_name,
      medium:       item.medium,
      year:         item.year,
      unit_price:   item.unit_price,
      quantity:     item.quantity,
      discount:     0,
      line_total:   item.line_total,
      sort_order:   0,
      ownership:    'gallery',
      delivered:    true,
      delivered_at: new Date().toISOString(),
    }))

    if (DRY_RUN) {
      console.log(`   ${inv.invoice_number}: would insert ${toInsert.length} items`)
      continue
    }

    const { error } = await supabase.from('invoice_items').insert(toInsert)
    if (error) {
      console.error(`   ❌ ${inv.invoice_number}: ${error.message}`)
    } else {
      totalInserted += toInsert.length
      process.stdout.write(`\r   ✓ Inserted items for ${totalInserted} invoices processed`)
    }
  }

  console.log(`\n\n✅  Done`)
  console.log(`   Items inserted: ${totalInserted}`)
  console.log(`   Invoices not in Tessera data: ${totalMissed}`)
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
