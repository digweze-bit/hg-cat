/**
 * Tessera â†’ HG Cat Historical Migration
 * 
 * Migrates: sold artworks, clients, invoices, invoice line items
 * Run:      node --env-file=.env scripts/migrate_tessera.js [--dry-run]
 * 
 * Requires: SUPABASE_SERVICE_KEY in environment
 * Place .tab files in scripts/tessera_data/
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// â”€â”€ CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUPABASE_URL = 'https://gmukkxnxyvmywgrbkwnr.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const DATA_DIR     = path.join(__dirname, 'tessera_data')
const BATCH        = 50
const DRY_RUN      = process.argv.includes('--dry-run')

if (!SUPABASE_KEY) {
  console.error('âŒ  Set SUPABASE_SERVICE_KEY environment variable')
  console.error('    Example: $env:SUPABASE_SERVICE_KEY="your-service-role-key"')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// â”€â”€ TAB FILE PARSER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseTab(filename) {
  const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'latin1')
  return raw.split('\n')
    .filter(l => l.trim())
    .map(line => line.split('\t').map(v => {
      const s = v.trim()
      if (s === '' || s === 'nan') return null
      // Fix common latin-1 â†’ UTF-8 mojibake
      return s
        .replace(/Ãƒâ€”/g, 'x')
        .replace(/Ã¢â€šÂ¦/g, 'N')
        .replace(/Ãƒâ€”/g, 'x')
        
    }))
}

// â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const clean = v => { if (v === null || v === undefined) return null; const s = String(v).replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim(); return s || null }

function cleanNum(v) {
  if (!v) return null
  const n = parseFloat(String(v).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function cleanDate(v) {
  if (!v) return null
  const part = String(v).split(' ')[0]
  const [d, m, y] = part.split('/')
  if (!d || !m || !y) return null
  const year = y.length === 2 ? '20' + y : y
  return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

function normaliseDimensions(v) {
  if (!v) return null
  return String(v)
    .replace(/h:/gi, '')
    .replace(/\s*w:/gi, ' Ã— ')
    .replace(/\s*d:/gi, ' Ã— ')
    .trim() + ' inches'
}

function normaliseCategory(v) {
  if (!v) return null
  const map = {
    'painting': 'Painting', 'print': 'Print', 'etching': 'Print',
    'drawing': 'Drawing', 'sculpture': 'Sculpture', 'photography': 'Photography',
    'mixed media': 'Mixed Media', 'ceramic': 'Ceramic', 'textile': 'Textile',
    'watercolour': 'Painting', 'pastel': 'Drawing',
  }
  return map[v.toLowerCase().trim()] || v
}

const SOLD_STATUSES = new Set([
  'Sold','sold','SOLD','HG Sold','Sold pack 2',' Sold pack 2',
  'Sold Dec 22','Sold Dec 2022','Sold22','Sold SA',
  'Sold 04052022','Sold 09062023','sold 19082020',
  'Sold as per to Mr Kunle Tinubu','Sold to Roseberys Auction',
  'Sold to ?','Sold to Mr Wilson Aikhomu',
  'Sold design options ltd','Sols','Storage Sold','SoldÃ•','SoldÃµ'
])

async function batchUpsert(table, rows, conflictCol, label) {
  if (rows.length === 0) { console.log(`  â­  ${label}: nothing to upsert`); return 0 }
  if (DRY_RUN) { console.log(`  ðŸ” DRY RUN â€” would upsert ${rows.length} rows into ${table}`); return rows.length }
  let upserted = 0
  const errors = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictCol, ignoreDuplicates: true })
    if (error) {
      errors.push(error.message)
      fs.appendFileSync('migration_errors.log',
        JSON.stringify({ table, batch: i, error: error.message, sample: batch[0] }) + '\n')
    } else {
      upserted += batch.length
    }
    process.stdout.write(`\r  âœ“  ${label}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }
  console.log(errors.length > 0 ? ` (${errors.length} errors)` : '')
  return upserted
}

async function batchInsert(table, rows, label) {
  if (rows.length === 0) { console.log(`  â­  ${label}: nothing to insert`); return 0 }
  if (DRY_RUN) { console.log(`  ðŸ” DRY RUN â€” would insert ${rows.length} rows into ${table}`); return rows.length }

  let inserted = 0
  const errors = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      errors.push({ batch: i, message: error.message })
      fs.appendFileSync('migration_errors.log',
        JSON.stringify({ table, batch: i, error: error.message, sample: batch[0] }) + '\n')
    } else {
      inserted += batch.length
    }
    process.stdout.write(`\r  âœ“  ${label}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }
  console.log(errors.length > 0 ? ` (${errors.length} batch errors â€” see migration_errors.log)` : '')
  return inserted
}

// â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function main() {
  console.log(`\nðŸŽ¨  Tessera â†’ HG Cat Migration ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`)
  console.log('â”€'.repeat(52))

  // â”€â”€ 1. LOAD FILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nðŸ“‚  Loading export filesâ€¦')
  const awRows  = parseTab('Artworks.tab')
  const clRows  = parseTab('Clients.tab')
  const invRows = parseTab('Invoices.tab')
  const itRows  = parseTab('Invoice_Line_Items.tab')

  console.log(`    Artworks: ${awRows.length} | Clients: ${clRows.length} | Invoices: ${invRows.length} | Items: ${itRows.length}`)

  // â”€â”€ 2. SOLD ARTWORKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sold = awRows.filter(r => SOLD_STATUSES.has(String(r[13]||'').trim()))
  console.log(`\nðŸ–¼   Sold artworks: ${sold.length}`)

  // Build lookup: tessera UUID â†’ row
  const artByUUID = {}
  sold.forEach(r => { if (r[30]) artByUUID[r[30]] = r })

  // â”€â”€ 3. CHECK EXISTING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const existingTids = new Set()
  if (!DRY_RUN) {
    const { data } = await supabase.from('artworks').select('tessera_id').not('tessera_id','is',null)
    data?.forEach(r => existingTids.add(r.tessera_id))
    console.log(`    Already in HG Cat: ${existingTids.size}`)
  }

  // â”€â”€ 4. FETCH HG CAT ARTISTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: hgArtists, error: artErr } = await supabase.from('artists').select('id,name').limit(500)
  if (artErr) console.warn(`    âš ï¸  Artist fetch error: ${artErr.message}`)
  const artistByName = {}
  hgArtists?.forEach(a => { artistByName[a.name.toLowerCase().trim()] = a.id })
  console.log(`    Artists in HG Cat: ${hgArtists?.length ?? 0}`)

  // â”€â”€ 5. PREPARE ARTWORKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nðŸ“  Preparing artworksâ€¦')
  const artInserts = []
  const artUUIDtoHGID = {}  // tessera UUID â†’ new supabase id (filled after insert)

  for (const r of sold) {
    const tUUID = clean(r[30])
    if (!tUUID || existingTids.has(tUUID)) continue

    const artistName = clean(r[26])
    const artistId   = artistName ? (artistByName[artistName.toLowerCase().trim()] || null) : null
    const price      = cleanNum(r[19])
    const dateStr    = cleanDate(r[22])

    artInserts.push({
      title:         clean(r[5]) || 'Untitled',
      artist_id:     artistId,
      year:          clean(r[7]),
      medium:        clean(r[14]),
      dimensions:    normaliseDimensions(r[8]) || null,
      category:      normaliseCategory(r[6]),
      availability:  'Sold',
      ownership:     'gallery',
      retail_price:  price,
      price:         price ? `N${Math.round(price).toLocaleString()}` : null,
      hg_code:       clean(r[12]) || null,   // preserve old ref e.g. GLO/HG/032
      tessera_id:    tUUID,
      visible:       false,                  // hidden from public catalogue
      sort_order:    9999,
      location:      'Storage',
      created_at:    dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    })
  }
  console.log(`    To insert: ${artInserts.length} (${sold.length - artInserts.length} already exist)`)

  const artCount = await batchInsert('artworks', artInserts, 'Artworks')

  // For dry run: populate map with placeholders
  if (DRY_RUN) {
    artInserts.forEach(a => { artUUIDtoHGID[a.tessera_id] = 'dry-run-id' })
    // Also include already-existing
    for (const tUUID of Object.keys(artByUUID)) {
      if (!artUUIDtoHGID[tUUID]) artUUIDtoHGID[tUUID] = 'dry-run-existing-id'
    }
  }

  // Fetch back ALL migrated artwork IDs in batches of 200 tessera_ids
  if (!DRY_RUN) {
    const allTids = sold.map(r => clean(r[30])).filter(Boolean)
    for (let i = 0; i < allTids.length; i += 200) {
      const chunk = allTids.slice(i, i + 200)
      const { data, error } = await supabase
        .from('artworks').select('id,tessera_id').in('tessera_id', chunk)
      if (error) console.warn('Artwork fetch error:', error.message)
      data?.forEach(a => { if (a.tessera_id) artUUIDtoHGID[a.tessera_id] = a.id })
    }
    console.log(`    Mapped ${Object.keys(artUUIDtoHGID).length} artwork IDs`)
  }

  // â”€â”€ 6. CLIENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nðŸ‘¤  Preparing clientsâ€¦')
  const { data: hgClients } = await supabase.from('clients').select('id,name')
  const clientByName = {}
  hgClients?.forEach(c => { clientByName[c.name.toLowerCase().trim()] = c.id })

  // Build tessera client map
  const tClientByUUID = {}
  clRows.forEach(r => { if (r[27]) tClientByUUID[r[27]] = r })

  // Collect client UUIDs from sold invoices
  const soldItemArtUUIDs = new Set(sold.map(r => r[30]).filter(Boolean))
  const soldItems = itRows.filter(r => soldItemArtUUIDs.has(r[0]))
  const invUUIDsFromItems = new Set([
    ...soldItems.map(r => r[2]).filter(Boolean),
    ...soldItems.map(r => r[1]).filter(Boolean),
  ])
  const soldInvoices = invRows.filter(r => invUUIDsFromItems.has(r[4]) || invUUIDsFromItems.has(r[3]))
  const soldClientUUIDs = new Set(soldInvoices.map(r => r[3]).filter(Boolean))

  console.log(`    Sold invoices: ${soldInvoices.length}`)
  console.log(`    Unique client UUIDs on sold invoices: ${soldClientUUIDs.size}`)

  const clientInserts = []
  const tClientUUIDtoHGID = {}  // tessera client UUID â†’ hg client id

  for (const uuid of soldClientUUIDs) {
    const r = tClientByUUID[uuid]
    if (!r) continue
    const name = clean(r[1])
    if (!name) continue
    const existing = clientByName[name.toLowerCase().trim()]
    if (existing) { tClientUUIDtoHGID[uuid] = existing; continue }
    clientInserts.push({
      name,
      first_name: clean(r[10]),
      last_name:  clean(r[11]),
      email:      clean(r[14]),
      phone:      clean(r[15]),
      city:       clean(r[16]),
      country:    'Nigeria',
      created_at: cleanDate(r[0]) ? new Date(cleanDate(r[0])).toISOString() : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  // Also add invoice-level client names not matched by UUID
  const invoiceClientNames = new Set(soldInvoices.map(r => clean(r[0])).filter(Boolean))
  for (const name of invoiceClientNames) {
    if (!clientByName[name.toLowerCase().trim()] &&
        !clientInserts.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      clientInserts.push({
        name, country: 'Nigeria',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
    }
  }

  console.log(`    New clients: ${clientInserts.length} (${soldClientUUIDs.size - clientInserts.filter(c=>c.first_name).length} matched existing)`)
  const clientCount = await batchInsert('clients', clientInserts, 'Clients')

  // Fetch back client IDs
  if (!DRY_RUN && clientCount > 0) {
    const names = clientInserts.map(c => c.name)
    for (let i = 0; i < names.length; i += 500) {
      const chunk = names.slice(i, i + 500)
      const { data } = await supabase.from('clients').select('id,name').in('name', chunk)
      data?.forEach(c => { clientByName[c.name.toLowerCase().trim()] = c.id })
    }
    // Map tessera UUIDs to new IDs
    for (const uuid of soldClientUUIDs) {
      const r = tClientByUUID[uuid]
      if (!r) continue
      const name = clean(r[1])
      if (name) {
        const id = clientByName[name.toLowerCase().trim()]
        if (id) tClientUUIDtoHGID[uuid] = id
      }
    }
  }

  // â”€â”€ 7. INVOICES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nðŸ§¾  Preparing invoicesâ€¦')
  const { data: hgInvoices } = await supabase.from('invoices').select('id,invoice_number').limit(2000)
  const existingInvNums = new Set(hgInvoices?.map(i => i.invoice_number) || [])
  // Build ID map for already-existing invoices too
  hgInvoices?.forEach(inv => {
    // We don't have tessera UUIDs for existing ones but they'll be re-mapped after fetch
  })

  const invInserts = []
  const tInvUUIDtoHGID = {}  // tessera inv UUID â†’ hg invoice id (or placeholder for dry run)

  for (const r of soldInvoices) {
    const tUUID  = clean(r[3])  // invoice UUID
    const tUUID4 = clean(r[4])  // alternate invoice UUID
    const invNum = `TES-${clean(r[2]) || tUUID?.slice(0,8)}`

    // Find client â€” first by tessera UUID, then by name
    const clientId = tClientUUIDtoHGID[tUUID4]
      || clientByName[clean(r[0])?.toLowerCase().trim()]
      || null

    const total   = cleanNum(r[7]) || 0
    const paid    = cleanNum(r[9]) || 0
    const balance = cleanNum(r[10]) || 0
    const dateStr = cleanDate(r[5])

    invInserts.push({
      invoice_number: invNum,
      client_id:      clientId,
      issue_date:     dateStr || new Date().toISOString().split('T')[0],
      status:         balance <= 0 ? 'paid' : 'partial',
      currency:       'NGN',
      total:          total,
      total_ngn:      total,
      amount_paid:    paid,
      balance_due:    balance,
      discount_type:  'none',
      discount_value: 0,
      notes:          `Migrated from Tessera. Original ref: ${clean(r[2]) || 'unknown'}`,
      created_at:     dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    })
    // Map both UUID columns so items can find this invoice
    if (tUUID)  tInvUUIDtoHGID[tUUID]  = '__pending__' + invNum
    if (tUUID4) tInvUUIDtoHGID[tUUID4] = '__pending__' + invNum
  }

  // Populate dry run map
  if (DRY_RUN) {
    soldInvoices.forEach(r => {
      const tUUID3 = clean(r[3])
      const tUUID4 = clean(r[4])
      if (tUUID3) tInvUUIDtoHGID[tUUID3] = 'dry-run-id'
      if (tUUID4) tInvUUIDtoHGID[tUUID4] = 'dry-run-id'
    })
  }
  console.log(`    Invoices to upsert: ${invInserts.length}`)
  const invCount = await batchUpsert('invoices', invInserts, 'invoice_number', 'Invoices')

  // Fetch back invoice IDs
  if (!DRY_RUN && invCount > 0) {
    // Fetch ALL TES- invoices by their invoice numbers in batches
    // Build the full list of expected invoice numbers
    const allInvNums = soldInvoices.map(r => `TES-${clean(r[2]) || clean(r[3])?.slice(0,8)}`).filter(Boolean)
    const uniqueInvNums = [...new Set(allInvNums)]
    for (let i = 0; i < uniqueInvNums.length; i += 200) {
      const chunk = uniqueInvNums.slice(i, i + 200)
      const { data, error } = await supabase
        .from('invoices').select('id,invoice_number').in('invoice_number', chunk)
      if (error) console.warn('Invoice fetch error:', error.message)
      data?.forEach(fetchedInv => {
        for (const [k, v] of Object.entries(tInvUUIDtoHGID)) {
          if (v === '__pending__' + fetchedInv.invoice_number) {
            tInvUUIDtoHGID[k] = fetchedInv.id
          }
        }
      })
    }
    const mappedCount = Object.values(tInvUUIDtoHGID).filter(v => v && !String(v).startsWith('__pending__')).length
    console.log(`    Mapped ${mappedCount} invoice IDs`)
  }

  // â”€â”€ 8. INVOICE LINE ITEMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nðŸ“‹  Preparing line itemsâ€¦')
  const itemInserts = []

  for (const r of soldItems) {
    const artTUUID = clean(r[0])
    const invTUUID = clean(r[2]) || clean(r[1])  // col2 â†’ inv[4], col1 â†’ inv[3]
    if (!artTUUID || !invTUUID) continue

    const artHGID = artUUIDtoHGID[artTUUID] || null
    const invHGID = tInvUUIDtoHGID[invTUUID]
    if (!invHGID || String(invHGID).startsWith('__pending__')) continue

    const artRow = artByUUID[artTUUID]
    const price  = cleanNum(r[9]) || cleanNum(r[13]) || 0
    const qty    = cleanNum(r[8]) || 1
    const dateStr = cleanDate(r[12])
    itemInserts.push({

      invoice_id:   invHGID,
      artwork_id:   artHGID,
      title:        ((artRow ? clean(artRow[5]) : null) || 'Untitled').split('').filter(c => c.charCodeAt(0) < 128).join(''),
      artist_name:  artRow && clean(artRow[26]) ? clean(artRow[26]).split('').filter(c => c.charCodeAt(0) < 128).join('') : null,
      medium:       artRow && clean(artRow[14]) ? clean(artRow[14]).split('').filter(c => c.charCodeAt(0) < 128).join('') : null,
      dimensions:   null,

      year:         artRow ? clean(artRow[7]) : null,
      unit_price:   price,
      quantity:     qty,
      discount:     0,
      line_total:   price * qty,
      sort_order:   0,
      ownership:    'gallery',
      delivered:    true,
      delivered_at: dateStr ? new Date(dateStr).toISOString() : null,
    })
  }

  console.log(`    Line items to insert: ${itemInserts.length}`)
  const itemCount = await batchInsert('invoice_items', itemInserts, 'Line items')

  // â”€â”€ 9. SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\n' + 'â”€'.repeat(52))
  console.log('âœ…  Migration complete\n')
  console.log(`   Artworks inserted:      ${artCount}`)
  console.log(`   Clients inserted:       ${clientCount}`)
  console.log(`   Invoices inserted:      ${invCount}`)
  console.log(`   Line items inserted:    ${itemCount}`)
  if (DRY_RUN) console.log('\n   (Dry run â€” nothing written to database)')
  if (fs.existsSync('migration_errors.log')) {
    console.log('\n   âš ï¸  Some errors logged to migration_errors.log')
  }
}

main().catch(err => {
  console.error('\nâŒ  Fatal error:', err.message)
  process.exit(1)
})




