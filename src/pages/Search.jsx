import { useState } from 'react'
import { supabase } from '../lib/supabase'

const EXAMPLE_QUERIES = [
  "What has Chike Obianwu bought this year?",
  "Which clients have shown interest in sculpture?",
  "What artworks by Ablade Glover are available?",
  "Which collectors might like our new Enwonwu works?",
  "What did we sell last month?",
  "Show me all consignment artworks from Bruce Onobrakpeya",
  "Which clients haven't visited in over 6 months?",
  "What are our most expensive available works?",
]

async function gatherContext(query) {
  const q = query.toLowerCase()
  const context = {}

  // Always fetch basic stats
  const [artworksRes, clientsRes, invoicesRes] = await Promise.all([
    supabase.from('artworks').select('id,title,artist_id,year,medium,price,retail_price,availability,ownership,consignor_name,tags,location,created_at').limit(2000),
    supabase.from('clients').select('id,name,email,phone,company,city,tags,notes,created_at').limit(500),
    supabase.from('invoices').select('id,invoice_number,status,total,currency,issue_date,client_id,clients(name)').order('issue_date', { ascending: false }).limit(500),
  ])

  context.artworks = artworksRes.data || []
  context.clients = clientsRes.data || []
  context.invoices = invoicesRes.data || []

  // Fetch artists for name lookup
  const artistsRes = await supabase.from('artists').select('id,name').limit(500)
  context.artists = artistsRes.data || []

  // Build artist map
  context.artistMap = {}
  context.artists.forEach(a => { context.artistMap[a.id] = a.name })

  // If query mentions purchases/sales, fetch invoice items
  if (q.includes('bought') || q.includes('purchased') || q.includes('sold') || q.includes('invoice') || q.includes('sale')) {
    const itemsRes = await supabase.from('invoice_items').select('id,invoice_id,title,artist_name,line_total,currency,item_type').limit(2000)
    context.invoiceItems = itemsRes.data || []
  }

  // If query mentions visits or interests
  if (q.includes('visit') || q.includes('interest') || q.includes('like') || q.includes('prefer')) {
    const [visitsRes, interestsRes] = await Promise.all([
      supabase.from('client_visits').select('*').order('visit_date', { ascending: false }).limit(1000),
      supabase.from('client_interests').select('*').order('created_at', { ascending: false }).limit(1000),
    ])
    context.visits = visitsRes.data || []
    context.interests = interestsRes.data || []
  }

  // Payments if needed
  if (q.includes('paid') || q.includes('payment') || q.includes('outstanding') || q.includes('balance')) {
    const paymentsRes = await supabase.from('payments').select('*').order('paid_at', { ascending: false }).limit(1000)
    context.payments = paymentsRes.data || []
  }

  return context
}

function buildPrompt(query, context) {
  const today = new Date().toISOString().split('T')[0]
  const thisYear = new Date().getFullYear()

  // Resolve artwork artist names
  const artworksWithArtists = context.artworks.map(w => ({
    ...w,
    artist_name: context.artistMap[w.artist_id] || 'Unknown',
  }))

  // Build concise data summary to avoid token overflow
  const availableArtworks = artworksWithArtists.filter(w => w.availability === 'Available')
  const recentInvoices = context.invoices.filter(i => i.issue_date >= `${thisYear}-01-01`)

  let dataContext = `Today: ${today}

GALLERY DATA SUMMARY:
- Total artworks: ${context.artworks.length} (${availableArtworks.length} available)
- Total clients: ${context.clients.length}
- Total invoices this year: ${recentInvoices.length}

AVAILABLE ARTWORKS (sample):
${availableArtworks.slice(0, 100).map(w =>
  `• ${w.title} | ${w.artist_name} | ${w.year || '-'} | ${w.medium || '-'} | ${w.price || ('₦' + Number(w.retail_price || 0).toLocaleString())} | Tags: ${(w.tags || []).join(', ') || 'none'}`
).join('\n')}

CLIENTS:
${context.clients.slice(0, 100).map(c =>
  `• ${c.name}${c.company ? ' (' + c.company + ')' : ''} | Tags: ${(c.tags || []).join(', ') || 'none'} | Notes: ${c.notes || '-'}`
).join('\n')}

RECENT INVOICES (this year):
${recentInvoices.slice(0, 100).map(i =>
  `• ${i.invoice_number} | ${i.clients?.name || '-'} | ${i.issue_date} | ${i.currency} ${Number(i.total || 0).toLocaleString()} | ${i.status}`
).join('\n')}`

  if (context.invoiceItems) {
    dataContext += `\n\nINVOICE LINE ITEMS (recent):
${context.invoiceItems.slice(0, 200).map(it =>
  `• Invoice ${it.invoice_id} | ${it.title} | ${it.artist_name || '-'} | ${it.currency} ${Number(it.line_total || 0).toLocaleString()}`
).join('\n')}`
  }

  if (context.interests) {
    dataContext += `\n\nCLIENT INTERESTS:
${context.interests.slice(0, 100).map(i =>
  `• Client ${i.client_id} | Artist: ${i.artist_name} | Medium: ${i.medium || '-'} | Budget: ${i.budget_range || '-'} | Notes: ${i.notes || '-'}`
).join('\n')}`
  }

  if (context.visits) {
    dataContext += `\n\nCLIENT VISITS (recent):
${context.visits.slice(0, 100).map(v =>
  `• Client ${v.client_id} | ${v.visit_date} | ${v.visit_type} | ${v.notes || '-'}`
).join('\n')}`
  }

  // Add client name lookup for interests/visits
  if (context.interests || context.visits) {
    dataContext += `\n\nCLIENT ID LOOKUP:\n${context.clients.map(c => `• ${c.id} = ${c.name}`).join('\n')}`
  }

  return `You are an AI assistant for Hourglass Gallery, a contemporary art gallery in Lagos. You have access to the gallery's database and answer questions about artworks, clients, sales, and collector relationships.

${dataContext}

USER QUESTION: ${query}

Answer concisely and helpfully. If the data doesn't contain enough to fully answer, say so and suggest what additional information might help. Format your response clearly — use bullet points for lists. Amounts are in Nigerian Naira (₦) unless otherwise specified.`
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runQuery(q) {
    if (!q.trim()) return
    setLoading(true)
    setAnswer('')
    setError('')
    try {
      const context = await gatherContext(q)
      const prompt = buildPrompt(q, context)

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const data = await res.json()
      const text = data.content?.map(b => b.text || '').join('') || ''
      if (!text) throw new Error(data.error?.message || 'No response from AI')
      setAnswer(text)
    } catch (err) {
      setError('Query failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Gallery search</div>
        <div className="page-subtitle">Ask questions about artworks, clients, sales, and collector relationships in plain English</div>
      </div>

      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="form-input"
            style={{ flex: 1, fontSize: 14 }}
            placeholder="e.g. What has Chike Obianwu bought this year?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runQuery(query)}
          />
          <button className="btn btn-primary" onClick={() => runQuery(query)} disabled={loading || !query.trim()}>
            {loading ? 'Searching…' : 'Ask'}
          </button>
        </div>

        {/* Example queries */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 8 }}>Try asking</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLE_QUERIES.map(eq => (
              <button key={eq}
                onClick={() => { setQuery(eq); runQuery(eq) }}
                style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 20, background: 'var(--white)', color: 'var(--ink)', cursor: 'pointer' }}>
                {eq}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
          <div>Searching gallery data…</div>
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: 20, color: 'var(--red,#c0392b)', background: '#fdf0f0' }}>
          {error}
        </div>
      )}

      {answer && !loading && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>Answer</div>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
            {answer}
          </div>
        </div>
      )}
    </div>
  )
}
