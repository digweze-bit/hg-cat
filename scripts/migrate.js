/**
 * HG Cat — Data Migration Script
 * Copies 170 artists + 2,199 artworks from old Visitor Catalogue
 * to the new HG Cat Supabase project.
 *
 * Usage:
 *   node scripts/migrate.js
 *
 * Requires: npm install @supabase/supabase-js
 */

import { createClient } from '@supabase/supabase-js'

// ── SOURCE (old Visitor Catalogue) ───────────────────────────
const SRC_URL  = 'https://upgevmtgtmnwprdyjmsw.supabase.co'
const SRC_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZ2V2bXRndG1ud3ByZHlqbXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjQ0NjIsImV4cCI6MjA5NTU0MDQ2Mn0.ncL7ioYqzDGSyVFrlrYiCWTNN_yZxiESROFS-uBVEtM'

// ── DESTINATION (new HG Cat) ─────────────────────────────────
const DST_URL  = 'https://gmukkxnxyvmywgrbkwnr.supabase.co'
const DST_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdWtreG54eXZteXdncmJrd25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTk1NzgsImV4cCI6MjA5ODY5NTU3OH0.zscg6b3jhsijnAEE9-yoMVSlQYwDHjO47j5-R_odP9g'

const src = createClient(SRC_URL, SRC_KEY)
const dst = createClient(DST_URL, DST_KEY)

const BATCH = 200   // rows per request
const SLEEP = 300   // ms between batches

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchAll(client, table, select = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .range(from, from + BATCH - 1)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`Fetch ${table} at ${from}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    console.log(`  fetched ${table}: ${all.length} so far…`)
    if (data.length < BATCH) break
    from += BATCH
    await sleep(SLEEP)
  }
  return all
}

async function insertBatch(client, table, rows) {
  const { error } = await client.from(table).insert(rows)
  if (error) throw new Error(`Insert ${table}: ${error.message}`)
}

async function migrate() {
  console.log('\n══════════════════════════════════')
  console.log('  HG Cat — Data Migration')
  console.log('══════════════════════════════════\n')

  // ── 1. ARTISTS ────────────────────────────────────────────
  console.log('▶ Fetching artists from source…')
  const artists = await fetchAll(src, 'artists')
  console.log(`  Found ${artists.length} artists\n`)

  // Build ID map: old id → keep same id (uuids are portable)
  // We'll insert with same IDs so artwork foreign keys work
  const artistMap = {}
  let aInserted = 0
  const artistBatches = chunk(artists, 50)
  for (const batch of artistBatches) {
    const rows = batch.map(a => ({
      id:           a.id,
      name:         a.name || 'Unknown Artist',
      nationality:  a.nationality || null,
      medium:       a.medium || null,
      bio:          a.bio || null,
      portrait_url: a.portrait_url || null,
      link:         a.link || null,
      sort_order:   a.sort_order || 0,
      visible:      true,   // default all visible
      created_at:   a.created_at || new Date().toISOString(),
    }))
    await insertBatch(dst, 'artists', rows)
    batch.forEach(a => { artistMap[a.id] = a.id })
    aInserted += batch.length
    console.log(`  Inserted artists: ${aInserted}/${artists.length}`)
    await sleep(SLEEP)
  }
  console.log(`✓ Artists done: ${aInserted}\n`)

  // ── 2. ARTWORKS ───────────────────────────────────────────
  console.log('▶ Fetching artworks from source…')
  const artworks = await fetchAll(src, 'artworks')
  console.log(`  Found ${artworks.length} artworks\n`)

  let wInserted = 0
  const workBatches = chunk(artworks, 50)
  for (const batch of workBatches) {
    const rows = batch.map(w => ({
      id:             w.id,
      artist_id:      w.artist_id || null,
      title:          w.title || 'Untitled',
      year:           w.year || null,
      medium:         w.medium || null,
      dimensions:     w.dimensions || null,
      series:         w.series || null,
      availability:   w.availability || 'Available',
      writeup:        w.writeup || null,
      image_url:      w.image_url || null,
      image_position: w.image_position || 'center',
      price:          w.price || null,
      tags:           w.tags || [],
      location:       null,   // new field — populate via admin
      visible:        true,   // default all visible
      sort_order:     w.sort_order || 0,
      created_at:     w.created_at || new Date().toISOString(),
    }))
    await insertBatch(dst, 'artworks', rows)
    wInserted += batch.length
    console.log(`  Inserted artworks: ${wInserted}/${artworks.length}`)
    await sleep(SLEEP)
  }
  console.log(`✓ Artworks done: ${wInserted}\n`)

  // ── SUMMARY ───────────────────────────────────────────────
  console.log('══════════════════════════════════')
  console.log(`  Migration complete`)
  console.log(`  Artists:  ${aInserted}`)
  console.log(`  Artworks: ${wInserted}`)
  console.log('══════════════════════════════════\n')
  console.log('Next steps:')
  console.log('  1. Go to Supabase dashboard and verify data')
  console.log('  2. Create your admin account via Supabase Auth > Add user')
  console.log('  3. Set your profile role to admin via SQL:')
  console.log("     UPDATE profiles SET role='admin', approved=true WHERE email='your@email.com';")
  console.log('  4. Deploy to Vercel\n')
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

migrate().catch(err => {
  console.error('\n✗ Migration failed:', err.message)
  process.exit(1)
})
