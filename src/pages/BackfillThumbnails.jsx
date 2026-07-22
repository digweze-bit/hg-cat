import { useState } from 'react'
import { supabase } from '../lib/supabase'

function resizeImage(blob, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
}

export default function BackfillThumbnails() {
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0, skipped: 0 })
  const [stopFlag, setStopFlag] = useState(false)

  function addLog(msg) {
    setLog(prev => [msg, ...prev].slice(0, 200))
  }

  async function run() {
    setRunning(true)
    setStopFlag(false)
    setLog([])
    setProgress({ done: 0, total: 0, failed: 0, skipped: 0 })

    // Fetch all artworks missing thumbnail_url but having image_url
    const { data: artworks, error } = await supabase
      .from('artworks')
      .select('id, title, image_url, thumbnail_url, full_image_url')
      .not('image_url', 'is', null)
      .is('thumbnail_url', null)

    if (error) { addLog('ERROR fetching artworks: ' + error.message); setRunning(false); return }

    setProgress(p => ({ ...p, total: artworks.length }))
    addLog(`Found ${artworks.length} artworks needing thumbnails`)

    for (let i = 0; i < artworks.length; i++) {
      if (stopFlag) { addLog('Stopped by user'); break }
      const w = artworks[i]
      try {
        const resp = await fetch(w.image_url)
        if (!resp.ok) throw new Error('fetch failed: ' + resp.status)
        const blob = await resp.blob()

        const [thumbBlob, displayBlob, fullBlob] = await Promise.all([
          resizeImage(blob, 150),
          resizeImage(blob, 600),
          resizeImage(blob, 1600),
        ])

        const base = `works/backfill_${w.id}_${Date.now()}`
        const thumbPath = base + '_thumb.jpg'
        const displayPath = base + '_display.jpg'
        const fullPath = base + '_full.jpg'

        const [r1, r2, r3] = await Promise.all([
          supabase.storage.from('artwork-images').upload(thumbPath, thumbBlob, { upsert: true }),
          supabase.storage.from('artwork-images').upload(displayPath, displayBlob, { upsert: true }),
          supabase.storage.from('artwork-images').upload(fullPath, fullBlob, { upsert: true }),
        ])
        if (r1.error) throw r1.error
        if (r2.error) throw r2.error
        if (r3.error) throw r3.error

        const thumbUrl = supabase.storage.from('artwork-images').getPublicUrl(thumbPath).data.publicUrl
        const displayUrl = supabase.storage.from('artwork-images').getPublicUrl(displayPath).data.publicUrl
        const fullUrl = supabase.storage.from('artwork-images').getPublicUrl(fullPath).data.publicUrl

        const { error: updErr } = await supabase.from('artworks').update({
          thumbnail_url: thumbUrl,
          image_url: displayUrl,
          full_image_url: fullUrl,
        }).eq('id', w.id)
        if (updErr) throw updErr

        setProgress(p => ({ ...p, done: p.done + 1 }))
        addLog(`✓ ${w.title || w.id}`)
      } catch (err) {
        setProgress(p => ({ ...p, failed: p.failed + 1 }))
        addLog(`✗ FAILED ${w.title || w.id}: ${err.message}`)
      }
      // Small delay to avoid hammering the network/API
      await new Promise(r => setTimeout(r, 150))
    }

    addLog('Done.')
    setRunning(false)
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-header">
        <div className="page-title">Backfill Thumbnails</div>
        <div className="page-subtitle">One-time maintenance: generates thumbnail/display/full-res images for existing artworks</div>
      </div>

      <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          This fetches each artwork's current image, creates three resized versions (150px thumbnail, 600px display, 1600px full),
          uploads them to storage, and updates the artwork record. Only artworks missing a thumbnail are processed — safe to
          run multiple times or stop and resume.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={run} disabled={running}>
            {running ? 'Running...' : 'Start backfill'}
          </button>
          {running && (
            <button className="btn btn-outline" onClick={() => setStopFlag(true)}>Stop</button>
          )}
        </div>
      </div>

      {progress.total > 0 && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span>{progress.done + progress.failed} / {progress.total}</span>
            <span style={{ color: 'var(--green,#27ae60)' }}>{progress.done} done</span>
            {progress.failed > 0 && <span style={{ color: 'var(--red,#c0392b)' }}>{progress.failed} failed</span>}
          </div>
          <div style={{ background: 'var(--line-soft)', borderRadius: 2, height: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${((progress.done + progress.failed) / progress.total) * 100}%`,
              height: '100%', background: 'var(--green,#27ae60)', borderRadius: 2, transition: 'width 200ms'
            }} />
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="card" style={{ padding: '12px 14px', maxHeight: 400, overflowY: 'auto' }}>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: l.startsWith('✗') ? 'var(--red,#c0392b)' : 'var(--muted)', padding: '2px 0' }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
