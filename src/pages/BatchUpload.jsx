import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Parse filename into artwork metadata
// Expected: "ArtistName, Title, Medium, Dimensions, Year.jpg"
// or: "timestamp_ArtistName, Title, Medium, Dimensions, Year.jpg"
function parseFilename(filename) {
  // Remove extension
  let name = filename.replace(/\.[^.]+$/, '')
  // Remove leading timestamp (digits + underscore)
  name = name.replace(/^\d+_/, '')
  // Replace underscores with spaces
  name = name.replace(/_/g, ' ')
  // Split by comma
  const parts = name.split(',').map(p => p.trim()).filter(Boolean)

  const result = {
    artist_name: '',
    title: '',
    medium: '',
    dimensions: '',
    dimension_unit: 'in',
    year: '',
    raw: name,
  }

  if (parts.length >= 1) result.artist_name = parts[0]
  if (parts.length >= 2) result.title = parts[1]
  if (parts.length >= 3) result.medium = parts[2]
  if (parts.length >= 4) {
    // Dimensions — detect unit
    const dim = parts[3].trim()
    if (dim.toLowerCase().includes('cm')) {
      result.dimensions = dim.replace(/cm/i, '').trim()
      result.dimension_unit = 'cm'
    } else {
      result.dimensions = dim.replace(/inches?/i, '').trim()
      result.dimension_unit = 'in'
    }
  }
  if (parts.length >= 5) {
    // Year — extract 4-digit number
    const yearMatch = parts[4].match(/\d{4}/)
    if (yearMatch) result.year = yearMatch[0]
  }

  return result
}

export default function BatchUpload() {
  const [files, setFiles] = useState([]) // { file, preview, meta, status, error, artwork_id }
  const [artists, setArtists] = useState([])
  const [artistMap, setArtistMap] = useState({}) // name.lower -> id
  const [step, setStep] = useState('drop') // drop | review | uploading | done
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 })
  const [location, setLocation] = useState('Main Gallery')

  useEffect(() => {
    supabase.from('artists').select('id,name').order('name').then(({ data }) => {
      setArtists(data || [])
      const m = {}
      ;(data || []).forEach(a => { m[a.name.toLowerCase()] = a.id })
      setArtistMap(m)
    })
  }, [])

  const handleFiles = useCallback((newFiles) => {
    const imageFiles = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
    const parsed = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      meta: parseFilename(file.name),
      status: 'pending',
      error: null,
      artwork_id: null,
    }))
    setFiles(prev => [...prev, ...parsed])
    setStep('review')
  }, [])

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function updateMeta(idx, field, value) {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, meta: { ...f.meta, [field]: value } } : f))
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function upload() {
    setStep('uploading')
    setProgress({ done: 0, total: files.length, failed: 0 })
    let done = 0, failed = 0

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        const meta = f.meta

        // 1. Find or create artist
        let artistId = artistMap[meta.artist_name.toLowerCase()]
        if (!artistId) {
          const { data: newArtist, error: artistErr } = await supabase
            .from('artists').insert({ name: meta.artist_name }).select().single()
          if (artistErr) throw new Error('Could not create artist: ' + artistErr.message)
          artistId = newArtist.id
          setArtistMap(prev => ({ ...prev, [meta.artist_name.toLowerCase()]: artistId }))
        }

        // 2. Upload image to Supabase Storage
        const ext = f.file.name.split('.').pop()
        const ts = Date.now()
        const safeName = (meta.artist_name + '_' + meta.title).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60)
        const path = `works/${ts}_${safeName}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('artwork-images').upload(path, f.file, { contentType: f.file.type, upsert: false })
        if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

        const { data: { publicUrl } } = supabase.storage.from('artwork-images').getPublicUrl(path)

        // 3. Create artwork record
        const { data: artwork, error: artErr } = await supabase.from('artworks').insert({
          title: meta.title,
          artist_id: artistId,
          medium: meta.medium,
          dimensions: meta.dimensions,
          dimension_unit: meta.dimension_unit,
          year: meta.year,
          image_url: publicUrl,
          availability: 'Available',
          ownership: 'gallery',
          location: location,
          visible: true,
        }).select().single()
        if (artErr) throw new Error('Could not save artwork: ' + artErr.message)

        setFiles(prev => prev.map((ff, ii) => ii === i ? { ...ff, status: 'done', artwork_id: artwork.id } : ff))
        done++
      } catch (err) {
        setFiles(prev => prev.map((ff, ii) => ii === i ? { ...ff, status: 'error', error: err.message } : ff))
        failed++
      }
      setProgress({ done: done + failed, total: files.length, failed })
    }
    setStep('done')
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Batch image upload</div>
        <div className="page-subtitle">Drag images with filenames like: Artist Name, Title, Medium, Dimensions, Year.jpg</div>
      </div>

      {step === 'drop' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? 'var(--ink)' : 'var(--line)'}`,
            borderRadius: 8, padding: '64px 32px', textAlign: 'center',
            background: dragging ? 'var(--parchment)' : 'var(--white)',
            cursor: 'pointer', transition: 'all 200ms',
          }}
          onClick={() => document.getElementById('batch-file-input').click()}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🖼</div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Drop artwork images here</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>or click to select files</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
            Name your files: <strong>Ablade Glover, Lorry Station 2, Oil on Canvas, 48 by 60 Inches, 2007.jpg</strong><br/>
            Fields: Artist, Title, Medium, Dimensions, Year
          </div>
          <input id="batch-file-input" type="file" multiple accept="image/*" style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)} />
        </div>
      )}

      {(step === 'review' || step === 'uploading' || step === 'done') && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{files.length} image{files.length !== 1 ? 's' : ''} ready</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <label style={{ fontSize: 12 }}>Default location:</label>
              <input className="form-input" style={{ width: 160 }} value={location} onChange={e => setLocation(e.target.value)} />
            </div>
            {step === 'review' && (
              <>
                <button className="btn btn-outline btn-sm" onClick={() => { setFiles([]); setStep('drop') }}>Clear all</button>
                <button className="btn btn-outline btn-sm" onClick={() => document.getElementById('batch-file-input2').click()}>Add more</button>
                <button className="btn btn-primary" onClick={upload} disabled={files.length === 0}>
                  Upload {files.length} artwork{files.length !== 1 ? 's' : ''}
                </button>
                <input id="batch-file-input2" type="file" multiple accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleFiles(e.target.files)} />
              </>
            )}
            {step === 'uploading' && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Uploading {progress.done} / {progress.total}…
              </div>
            )}
            {step === 'done' && (
              <div style={{ fontSize: 13, color: progress.failed > 0 ? 'var(--red,#c0392b)' : 'var(--green,#27ae60)' }}>
                {progress.total - progress.failed} uploaded{progress.failed > 0 ? `, ${progress.failed} failed` : ' successfully'}
              </div>
            )}
          </div>

          {step === 'uploading' && (
            <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--ink)', borderRadius: 3, width: `${(progress.done / progress.total) * 100}%`, transition: 'width 300ms' }} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 12, alignItems: 'start',
                padding: '12px 14px', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 6,
                borderLeft: `4px solid ${f.status === 'done' ? 'var(--green,#27ae60)' : f.status === 'error' ? 'var(--red,#c0392b)' : 'var(--line)'}`,
              }}>
                <img src={f.preview} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    ['Artist', 'artist_name'],
                    ['Title', 'title'],
                    ['Medium', 'medium'],
                    ['Dimensions', 'dimensions'],
                    ['Year', 'year'],
                    ['Unit', 'dimension_unit'],
                  ].map(([label, field]) => (
                    <div key={field}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                      {field === 'dimension_unit' ? (
                        <select className="form-select" style={{ fontSize: 12, padding: '3px 6px' }}
                          value={f.meta[field]} onChange={e => updateMeta(i, field, e.target.value)}>
                          <option value="in">in</option>
                          <option value="cm">cm</option>
                        </select>
                      ) : (
                        <input className="form-input" style={{ fontSize: 12, padding: '3px 6px' }}
                          value={f.meta[field]} onChange={e => updateMeta(i, field, e.target.value)} />
                      )}
                    </div>
                  ))}
                  {f.error && <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--red,#c0392b)', marginTop: 4 }}>&#9888; {f.error}</div>}
                  {f.status === 'done' && <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--green,#27ae60)', marginTop: 4 }}>&#10003; Uploaded successfully</div>}
                </div>
                {step === 'review' && (
                  <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: '0 4px' }}>&times;</button>
                )}
                {step === 'uploading' && f.status === 'pending' && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Waiting…</div>
                )}
              </div>
            ))}
          </div>

          {step === 'done' && (
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => { setFiles([]); setStep('drop') }}>Upload more</button>
              <a href="/admin/artworks" className="btn btn-primary">Go to Artworks</a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
