import { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'

const TEMPLATE_HEADERS = [
  'title', 'artist_name', 'year', 'medium', 'dimensions', 'dimension_unit',
  'category', 'series', 'price', 'retail_price', 'location', 'availability',
  'ownership', 'consignor_name', 'commission_rate', 'is_framed', 'frame_cost',
  'image_url', 'writeup', 'tags', 'notes'
]

function downloadTemplate() {
  const csv = TEMPLATE_HEADERS.join(',') + '\n' +
    'Sample Title,Artist Full Name,2023,Oil on Canvas,50 x 60,in,Painting,,500000,650000,Main Gallery,Available,gallery,,,false,,,,,'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'artwork_upload_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function BatchUpload() {
  const [rows, setRows] = useState([])
  const [artists, setArtists] = useState([])
  const [unmatchedArtists, setUnmatchedArtists] = useState([])
  const [artistDecisions, setArtistDecisions] = useState({}) // name -> 'create' | 'skip' | artistId
  const [step, setStep] = useState('upload') // upload | review | importing | done
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })
  const [log, setLog] = useState([])
  const [fileName, setFileName] = useState('')

  function addLog(msg) { setLog(prev => [msg, ...prev].slice(0, 300)) }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)

    const { data: existingArtists } = await supabase.from('artists').select('id, name')
    setArtists(existingArtists || [])

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((r, i) => ({
          ...r,
          _rowNum: i + 2, // +2 for header row + 1-index
          _errors: validateRow(r),
        }))
        setRows(parsed)

        const artistMap = new Map((existingArtists || []).map(a => [a.name.toLowerCase().trim(), a]))
        const unmatched = [...new Set(
          parsed
            .map(r => r.artist_name?.trim())
            .filter(name => name && !artistMap.has(name.toLowerCase()))
        )]
        setUnmatchedArtists(unmatched)
        const initialDecisions = {}
        unmatched.forEach(name => { initialDecisions[name] = 'pending' })
        setArtistDecisions(initialDecisions)

        setStep('review')
      },
      error: (err) => alert('CSV parse error: ' + err.message)
    })
  }

  function validateRow(r) {
    const errors = []
    if (!r.title?.trim()) errors.push('Missing title')
    if (!r.artist_name?.trim()) errors.push('Missing artist name')
    if (r.ownership === 'consignment' && !r.consignor_name?.trim()) errors.push('Consignment needs consignor_name')
    return errors
  }

  const artistMap = new Map(artists.map(a => [a.name.toLowerCase().trim(), a]))
  const allDecided = unmatchedArtists.every(name => artistDecisions[name] !== 'pending')
  const validRows = rows.filter(r => r._errors.length === 0)
  const errorRows = rows.filter(r => r._errors.length > 0)

  async function runImport() {
    setStep('importing')
    setLog([])
    setProgress({ done: 0, total: validRows.length, failed: 0 })

    // First, create any artists marked "create"
    const newArtistIds = {}
    for (const name of unmatchedArtists) {
      if (artistDecisions[name] === 'create') {
        const { data, error } = await supabase.from('artists').insert({ name: name.trim() }).select('id').single()
        if (!error && data) {
          newArtistIds[name.toLowerCase().trim()] = data.id
          addLog(`Created artist: ${name}`)
        } else {
          addLog(`FAILED to create artist ${name}: ${error?.message}`)
        }
      }
    }

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i]
      const artistNameLower = r.artist_name?.trim().toLowerCase()
      let artistId = artistMap.get(artistNameLower)?.id || newArtistIds[artistNameLower]

      if (!artistId && artistDecisions[r.artist_name?.trim()] === 'skip') {
        setProgress(p => ({ ...p, failed: p.failed + 1 }))
        addLog(`✗ Skipped "${r.title}" — artist "${r.artist_name}" not created`)
        continue
      }
      if (!artistId) {
        setProgress(p => ({ ...p, failed: p.failed + 1 }))
        addLog(`✗ FAILED "${r.title}" — no artist match`)
        continue
      }

      try {
        const { data: codeData } = await supabase.rpc('next_hg_code')
        const { error } = await supabase.from('artworks').insert({
          title: r.title?.trim(),
          artist_id: artistId,
          year: r.year || null,
          medium: r.medium || null,
          dimensions: r.dimensions || null,
          dimension_unit: r.dimension_unit || 'in',
          category: r.category || null,
          series: r.series || null,
          price: r.price || null,
          retail_price: r.retail_price ? Number(r.retail_price) : null,
          location: r.location || null,
          availability: r.availability || 'Available',
          ownership: r.ownership || 'gallery',
          consignor_name: r.ownership === 'consignment' ? r.consignor_name || null : null,
          commission_rate: r.ownership === 'consignment' ? Number(r.commission_rate) || 40 : null,
          is_framed: r.is_framed === 'true' || r.is_framed === 'TRUE' || r.is_framed === '1',
          frame_cost: r.frame_cost ? Number(r.frame_cost) : null,
          image_url: r.image_url || null,
          writeup: r.writeup || null,
          tags: r.tags || null,
          notes: r.notes || null,
          hg_code: codeData || null,
          visible: true,
        })
        if (error) throw error
        setProgress(p => ({ ...p, done: p.done + 1 }))
        addLog(`✓ ${r.title}`)
      } catch (err) {
        setProgress(p => ({ ...p, failed: p.failed + 1 }))
        addLog(`✗ FAILED "${r.title}": ${err.message}`)
      }
      await new Promise(res => setTimeout(res, 80))
    }

    addLog('Import complete.')
    setStep('done')
  }

  function reset() {
    setRows([]); setUnmatchedArtists([]); setArtistDecisions({}); setStep('upload'); setLog([]); setFileName('')
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div className="page-title">Batch Upload Artworks</div>
        <div className="page-subtitle">Import multiple artworks at once via CSV</div>
      </div>

      {step === 'upload' && (
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.7 }}>
            Download the CSV template, fill in your artwork details, then upload it here. Each row becomes one artwork.
            Artist names are matched against your existing Artists list — if a name doesn't match, you'll be asked whether to create a new artist or skip those rows.
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button className="btn btn-outline" onClick={downloadTemplate}>Download CSV template</button>
          </div>
          <div className="form-group">
            <label className="form-label">Upload CSV file</label>
            <input type="file" accept=".csv" onChange={handleFile} />
          </div>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}><strong>{fileName}</strong></div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {rows.length} rows found — {validRows.length} ready to import, {errorRows.length} with errors
            </div>
          </div>

          {unmatchedArtists.length > 0 && (
            <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 10 }}>
                Unmatched artists ({unmatchedArtists.length}) — decide for each
              </div>
              {unmatchedArtists.map(name => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn btn-sm ${artistDecisions[name] === 'create' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setArtistDecisions(d => ({ ...d, [name]: 'create' }))}>
                      Create new artist
                    </button>
                    <button
                      className={`btn btn-sm ${artistDecisions[name] === 'skip' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setArtistDecisions(d => ({ ...d, [name]: 'skip' }))}>
                      Skip these rows
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {errorRows.length > 0 && (
            <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--red,#c0392b)', marginBottom: 10 }}>
                Rows with errors ({errorRows.length}) — will not be imported
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Row</th><th>Title</th><th>Errors</th></tr></thead>
                  <tbody>
                    {errorRows.map(r => (
                      <tr key={r._rowNum}>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r._rowNum}</td>
                        <td style={{ fontSize: 13 }}>{r.title || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--red,#c0392b)' }}>{r._errors.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 10 }}>
              Preview ({Math.min(validRows.length, 10)} of {validRows.length} ready rows)
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Artist</th><th>Year</th><th>Medium</th><th>Price</th></tr></thead>
                <tbody>
                  {validRows.slice(0, 10).map(r => (
                    <tr key={r._rowNum}>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{r.title}</td>
                      <td style={{ fontSize: 13 }}>{r.artist_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.year}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.medium}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.retail_price ? `₦${Number(r.retail_price).toLocaleString()}` : r.price || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={reset}>Cancel</button>
            <button className="btn btn-primary" onClick={runImport} disabled={!allDecided || validRows.length === 0}>
              Import {validRows.length} artwork{validRows.length !== 1 ? 's' : ''}
            </button>
          </div>
          {!allDecided && <div style={{ fontSize: 12, color: 'var(--amber,#b8862a)', marginTop: 8 }}>Decide on all unmatched artists before importing.</div>}
        </div>
      )}

      {(step === 'importing' || step === 'done') && (
        <div>
          <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span>{progress.done + progress.failed} / {progress.total}</span>
              <span style={{ color: 'var(--green,#27ae60)' }}>{progress.done} imported</span>
              {progress.failed > 0 && <span style={{ color: 'var(--red,#c0392b)' }}>{progress.failed} failed</span>}
            </div>
            <div style={{ background: 'var(--line-soft)', borderRadius: 2, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${progress.total ? ((progress.done + progress.failed) / progress.total) * 100 : 0}%`,
                height: '100%', background: 'var(--green,#27ae60)', borderRadius: 2, transition: 'width 200ms'
              }} />
            </div>
          </div>

          {step === 'done' && (
            <button className="btn btn-primary" onClick={reset} style={{ marginBottom: 16 }}>Upload another file</button>
          )}

          <div className="card" style={{ padding: '12px 14px', maxHeight: 400, overflowY: 'auto' }}>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: l.startsWith('✗') ? 'var(--red,#c0392b)' : 'var(--muted)', padding: '2px 0' }}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
