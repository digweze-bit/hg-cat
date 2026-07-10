/**
 * Update artwork prices from Tessera export
 * Two matching strategies:
 * 1. By tessera_id (migrated artworks)
 * 2. By artist name + title (live artworks added directly in HG Cat)
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = 'https://gmukkxnxyvmywgrbkwnr.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const DRY_RUN     = process.argv.includes('--dry-run')
const BATCH       = 100

if (!SUPABASE_KEY) { console.error('Set SUPABASE_SERVICE_KEY'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function stripNonAscii(s) {
  if (!s) return ''
  return String(s).replace(/[^\x00-\x7F]/g, '').trim().toLowerCase()
}

async function fetchAll(table, select, filters = []) {
  let all = [], offset = 0
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + 999)
    filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function main() {
  console.log(`\n💰  Price update ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`)
  console.log('─'.repeat(48))

  const { by_tessera, by_title_artist } = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'price_updates.json'), 'utf8')
  )
  console.log(`   Tessera index: ${Object.keys(by_tessera).length} by ID, ${Object.keys(by_title_artist).length} by title+artist`)

  // Fetch all HG Cat artworks + their artist names
  console.log('\n   Fetching HG Cat artworks…')
  const artworks = await fetchAll('artworks', 'id,title,tessera_id,retail_price,artist_id')
  const artists  = await fetchAll('artists',  'id,name')
  const artistById = {}
  artists.forEach(a => { artistById[a.id] = a.name })
  console.log(`   Found ${artworks.length} artworks, ${artists.length} artists`)

  const toUpdate = []
  let byId = 0, byName = 0, noMatch = 0, noPrice = 0

  for (const aw of artworks) {
    let match = null

    // Strategy 1: match by tessera_id
    if (aw.tessera_id && by_tessera[aw.tessera_id]) {
      match = by_tessera[aw.tessera_id]
      byId++
    }

    // Strategy 2: match by artist name + title
    if (!match && aw.title && aw.artist_id) {
      const artistName = stripNonAscii(artistById[aw.artist_id] || '')
      const title      = stripNonAscii(aw.title)
      const key        = `${artistName}|${title}`
      if (by_title_artist[key]) {
        match = by_title_artist[key]
        byName++
      }
    }

    if (!match) { noMatch++; continue }
    if (!match.retail_price) { noPrice++; continue }

    toUpdate.push({
      id:              aw.id,
      retail_price:    match.retail_price,
      inventory_price: match.inventory_price || null,
      price:           `\u20a6${Math.round(match.retail_price).toLocaleString()}`,
    })
  }

  console.log(`\n   Matched by tessera_id:    ${byId}`)
  console.log(`   Matched by title+artist:  ${byName}`)
  console.log(`   No match:                 ${noMatch}`)
  console.log(`   Total to update:          ${toUpdate.length}`)

  if (DRY_RUN) {
    console.log('\n   Sample updates:')
    toUpdate.slice(0, 8).forEach(u => {
      const aw = artworks.find(a => a.id === u.id)
      const artist = artistById[aw?.artist_id] || '?'
      console.log(`   "${aw?.title?.slice(0,35)}" (${artist.slice(0,20)}) → ${u.price}`)
    })
    console.log('\n   (Dry run — nothing written)')
    return
  }

  // Update in batches
  let updated = 0, errors = 0
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH)
    for (const u of batch) {
      const { error } = await supabase.from('artworks').update({
        retail_price:    u.retail_price,
        inventory_price: u.inventory_price,
        price:           u.price,
        updated_at:      new Date().toISOString(),
      }).eq('id', u.id)
      if (error) { errors++; console.error(`\n   Error on ${u.id}:`, error.message) }
      else updated++
    }
    process.stdout.write(`\r   Updated: ${Math.min(i + BATCH, toUpdate.length)}/${toUpdate.length}`)
  }

  console.log(`\n\n✅  Done — ${updated} artworks priced, ${errors} errors`)
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
