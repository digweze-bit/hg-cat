import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

// Fuzzy match: find best match from a list by name
function fuzzyMatch(query, items, nameField = 'name') {
  if (!query) return null
  const q = query.toLowerCase().trim()
  // Exact match first
  let best = items.find(i => (i[nameField] || '').toLowerCase() === q)
  if (best) return best
  // Starts with
  best = items.find(i => (i[nameField] || '').toLowerCase().startsWith(q))
  if (best) return best
  // Contains
  best = items.find(i => (i[nameField] || '').toLowerCase().includes(q))
  if (best) return best
  // Words overlap
  const qWords = q.split(/\s+/)
  let maxOverlap = 0
  items.forEach(i => {
    const nameWords = (i[nameField] || '').toLowerCase().split(/\s+/)
    const overlap = qWords.filter(w => nameWords.some(nw => nw.includes(w) || w.includes(nw))).length
    if (overlap > maxOverlap) { maxOverlap = overlap; best = i }
  })
  return maxOverlap >= 1 ? best : null
}

// Parse money amounts: "2.5 million naira" → 2500000, "500 thousand" → 500000, "3m" → 3000000
function parseMoney(text) {
  const t = text.toLowerCase()
  // Match patterns like "2.5 million", "500 thousand", "3m", "₦2,500,000"
  const patterns = [
    { re: /(\d+(?:\.\d+)?)\s*million/i, mult: 1000000 },
    { re: /(\d+(?:\.\d+)?)\s*m\b/i, mult: 1000000 },
    { re: /(\d+(?:\.\d+)?)\s*thousand/i, mult: 1000 },
    { re: /(\d+(?:\.\d+)?)\s*k\b/i, mult: 1000 },
    { re: /[\u20a6ngn]\s*([\d,]+(?:\.\d+)?)/i, mult: 1 },
    { re: /(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/i, mult: 1 },
    { re: /(\d+(?:\.\d+)?)\s*(?:naira|dollars?|usd)/i, mult: 1 },
  ]
  for (const { re, mult } of patterns) {
    const m = t.match(re)
    if (m) return Math.round(parseFloat(m[1].replace(/,/g, '')) * mult)
  }
  return null
}

// Parse the transcript into an intent + entities
function parseCommand(text, clients, artworks, artists, prospects) {
  const t = text.toLowerCase()

  // Detect intent
  let intent = 'unknown'
  if (t.includes('invoice') || t.includes('bill')) intent = 'invoice'
  else if (t.includes('new client') || t.includes('add client') || t.includes('create client')) intent = 'new-client'
  else if (t.includes('prospect') || t.includes('new prospect') || t.includes('add prospect')) intent = 'new-prospect'
  else if (t.includes('visit') || t.includes('log visit') || t.includes('came in') || t.includes('stopped by')) intent = 'visit'
  else if (t.includes('interest') || t.includes('interested in') || t.includes('likes') || t.includes('wants')) intent = 'interest'

  const result = { intent, raw: text, client: null, prospect: null, artwork: null, artist: null, amount: null, phone: null, company: null, medium: null }

  // Extract amount
  result.amount = parseMoney(t)

  // Try to find client/prospect name — look for "for [name]" or "from [name]" or "with [name]"
  const namePatterns = [
    /(?:for|from|with|client|invoice)\s+(.+?)(?:\s+for\s+|\s+at\s+|\s+price\s+|\s+artwork\s+|\s*,\s*|\s*$)/i,
    /(?:for|from|with)\s+(.+?)(?:\s+\d|\s*$)/i,
  ]

  // Collect all names mentioned by trying each client/prospect against the text
  const clientMatches = clients.filter(c => t.includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)
  if (clientMatches.length > 0) result.client = clientMatches[0]

  if (!result.client) {
    const prospectMatches = prospects.filter(p => t.includes(p.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)
    if (prospectMatches.length > 0) result.prospect = prospectMatches[0]
  }

  // Try artwork match
  const artworkMatches = artworks.filter(w => t.includes(w.title.toLowerCase()))
    .sort((a, b) => b.title.length - a.title.length)
  if (artworkMatches.length > 0) result.artwork = artworkMatches[0]

  // Try artist match
  const artistMatches = artists.filter(a => t.includes(a.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)
  if (artistMatches.length > 0) result.artist = artistMatches[0]

  // For new client/prospect, extract phone and company
  const phoneMatch = t.match(/(?:phone|number|mobile)\s*([\d\s+()-]{7,})/i)
  if (phoneMatch) result.phone = phoneMatch[1].trim()

  const companyMatch = t.match(/(?:company|from|works at|at)\s+([A-Z][a-zA-Z\s]+(?:Ltd|Limited|Inc|PLC|Group)?)/i)
  if (companyMatch) result.company = companyMatch[1].trim()

  // For interest — try to extract medium
  const mediumMatch = t.match(/(?:medium|in)\s+(oil|acrylic|watercolour|watercolor|sculpture|print|drawing|photograph|mixed media|textile|bronze)/i)
  if (mediumMatch) result.medium = mediumMatch[1]

  // If no client found by substring, try fuzzy from "for X" pattern
  if (!result.client && !result.prospect) {
    for (const pat of namePatterns) {
      const m = t.match(pat)
      if (m) {
        const nameGuess = m[1].trim()
        result.client = fuzzyMatch(nameGuess, clients)
        if (!result.client) result.prospect = fuzzyMatch(nameGuess, prospects)
        if (result.client || result.prospect) break
      }
    }
  }

  // If we have no name at all for new-client, extract from "client [name]" or just take the rest
  if (intent === 'new-client' && !result.client) {
    const newNameMatch = t.match(/(?:new client|add client|create client)\s+(.+?)(?:\s+phone|\s+company|\s+email|\s*,|\s*$)/i)
    if (newNameMatch) result.extractedName = newNameMatch[1].trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  if (intent === 'new-prospect' && !result.prospect) {
    const newNameMatch = t.match(/(?:new prospect|add prospect)\s+(.+?)(?:\s+phone|\s+company|\s+from|\s+email|\s*,|\s*$)/i)
    if (newNameMatch) result.extractedName = newNameMatch[1].trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return result
}

export default function VoiceCommand({ onCommand }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [clients, setClients] = useState([])
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists] = useState([])
  const [prospects, setProspects] = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const recognitionRef = useRef(null)
  const navigate = useNavigate()

  // Load reference data once
  useEffect(() => {
    async function loadData() {
      const [c, aw, ar, p] = await Promise.all([
        fetchAll('clients', { select: 'id,name,phone,phone_mobile,email,company', order: 'name' }),
        fetchAll('artworks', { select: 'id,title,artist_id,price,retail_price,medium', order: 'title' }),
        fetchAll('artists', { select: 'id,name', order: 'name' }),
        supabase.from('prospects').select('id,name,phone,company').neq('status', 'converted').then(r => r.data || []),
      ])
      setClients(c); setArtworks(aw); setArtists(ar); setProspects(p)
      setDataLoaded(true)
    }
    loadData()
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Speech recognition not supported in this browser. Use Chrome.'); return }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-NG'

    recognition.onresult = (e) => {
      let final = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setTranscript(final || interim)
    }

    recognition.onend = () => {
      setListening(false)
      // Parse the final transcript
      if (transcript) {
        const result = parseCommand(transcript, clients, artworks, artists, prospects)
        setParsed(result)
      }
    }

    recognition.onerror = (e) => {
      console.error('Speech error:', e.error)
      setListening(false)
      if (e.error === 'not-allowed') alert('Microphone access denied. Allow microphone in browser settings.')
    }

    recognitionRef.current = recognition
    setTranscript('')
    setParsed(null)
    setShowModal(true)
    setListening(true)
    recognition.start()
  }, [clients, artworks, artists, prospects, transcript])

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function retry() {
    setTranscript('')
    setParsed(null)
    startListening()
  }

  function executeCommand() {
    if (!parsed) return
    setShowModal(false)

    switch (parsed.intent) {
      case 'invoice':
        navigate('/admin/sales', { state: { voiceCommand: { type: 'invoice', client: parsed.client, artwork: parsed.artwork, amount: parsed.amount } } })
        break
      case 'new-client':
        navigate('/admin/sales', { state: { voiceCommand: { type: 'new-client', name: parsed.extractedName, phone: parsed.phone, company: parsed.company } } })
        break
      case 'visit':
        navigate('/admin/crm', { state: { voiceCommand: { type: 'visit', client: parsed.client, prospect: parsed.prospect } } })
        break
      case 'interest':
        navigate('/admin/crm', { state: { voiceCommand: { type: 'interest', client: parsed.client, prospect: parsed.prospect, artist: parsed.artist, medium: parsed.medium } } })
        break
      case 'new-prospect':
        navigate('/admin/crm', { state: { voiceCommand: { type: 'new-prospect', name: parsed.extractedName, phone: parsed.phone, company: parsed.company } } })
        break
      default:
        alert('Could not understand the command. Try: "Invoice for [client] for [artwork] at [price]"')
    }
  }

  const intentLabels = {
    'invoice': 'Create invoice',
    'new-client': 'Add new client',
    'new-prospect': 'Add new prospect',
    'visit': 'Log visit',
    'interest': 'Record interest',
    'unknown': 'Not understood',
  }

  return (
    <>
      <button
        onClick={startListening}
        title="Voice command"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
          color: listening ? '#c0392b' : 'var(--muted)',
          animation: listening ? 'pulse 1s infinite' : 'none',
        }}
      >
        🎤
      </button>

      {showModal && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--white)', borderRadius:8, width:'100%', maxWidth:480, overflow:'hidden' }}>
            {/* Header */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:15, fontWeight:600 }}>Voice command</div>
              <button onClick={() => { stopListening(); setShowModal(false) }} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--muted)' }}>&times;</button>
            </div>

            {/* Listening indicator */}
            <div style={{ padding:'24px 20px', textAlign:'center' }}>
              {listening ? (
                <>
                  <div style={{ fontSize:48, marginBottom:12, animation:'pulse 1.5s infinite' }}>🎤</div>
                  <div style={{ fontSize:14, color:'var(--ink)', marginBottom:8 }}>Listening...</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>
                    Try: "Invoice for Chike Obianwu for Harbour Point at 2.5 million"
                  </div>
                </>
              ) : transcript ? (
                <>
                  <div style={{ fontSize:14, fontStyle:'italic', color:'var(--ink)', marginBottom:16, lineHeight:1.6, padding:'12px 16px', background:'var(--parchment)', borderRadius:4 }}>
                    "{transcript}"
                  </div>

                  {parsed && (
                    <div style={{ textAlign:'left', padding:'12px 16px', border:'1px solid var(--line)', borderRadius:4, marginBottom:16 }}>
                      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', padding:'2px 8px', borderRadius:10,
                          background: parsed.intent !== 'unknown' ? '#e8f5e9' : '#fde8e8',
                          color: parsed.intent !== 'unknown' ? '#2d6a4f' : '#c0392b', fontWeight:600 }}>
                          {intentLabels[parsed.intent]}
                        </span>
                      </div>
                      {parsed.client && <div style={{ fontSize:13, marginBottom:4 }}>Client: <strong>{parsed.client.name}</strong></div>}
                      {parsed.prospect && <div style={{ fontSize:13, marginBottom:4 }}>Prospect: <strong>{parsed.prospect.name}</strong></div>}
                      {parsed.extractedName && <div style={{ fontSize:13, marginBottom:4 }}>Name: <strong>{parsed.extractedName}</strong></div>}
                      {parsed.artwork && <div style={{ fontSize:13, marginBottom:4 }}>Artwork: <strong>{parsed.artwork.title}</strong></div>}
                      {parsed.artist && <div style={{ fontSize:13, marginBottom:4 }}>Artist: <strong>{parsed.artist.name}</strong></div>}
                      {parsed.amount && <div style={{ fontSize:13, marginBottom:4 }}>Amount: <strong>{'\u20A6'}{parsed.amount.toLocaleString()}</strong></div>}
                      {parsed.phone && <div style={{ fontSize:13, marginBottom:4 }}>Phone: <strong>{parsed.phone}</strong></div>}
                      {parsed.company && <div style={{ fontSize:13, marginBottom:4 }}>Company: <strong>{parsed.company}</strong></div>}
                      {parsed.medium && <div style={{ fontSize:13, marginBottom:4 }}>Medium: <strong>{parsed.medium}</strong></div>}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color:'var(--muted)', fontSize:13 }}>No speech detected. Try again.</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid var(--line)', display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={retry} className="btn btn-outline btn-sm">Try again</button>
              {parsed && parsed.intent !== 'unknown' && (
                <button onClick={executeCommand} className="btn btn-primary btn-sm">
                  {intentLabels[parsed.intent]}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  )
}
