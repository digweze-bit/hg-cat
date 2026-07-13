import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LOGO_B64 } from '../lib/assets'
import SignaturePad from 'signature_pad'
import jsPDF from 'jspdf'

const FORM_TYPES = {
  purchase_confirmation: 'Purchase Confirmation',
  consignment_agreement: 'Consignment Agreement',
  condition_report:      'Condition Report',
  loan_agreement:        'Loan Agreement',
  collection_receipt:    'Collection Receipt',
}

export default function FormSign() {
  const { token } = useParams()
  const [form, setForm]         = useState(null)
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading]   = useState(true)
  const [sigMode, setSigMode]   = useState('drawn')  // 'drawn' | 'typed'
  const [typedName, setTypedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const sigPadRef   = useRef(null)
  const sigCanvasRef = useRef(null)
  const formRef     = useRef(null)

  useEffect(() => {
    async function load() {
      const { data: f } = await supabase
        .from('forms').select('*').eq('sign_token', token).single()
      if (!f) { setLoading(false); return }
      const { data: aws } = await supabase
        .from('form_artworks').select('*').eq('form_id', f.id).order('sort_order')
      setForm(f)
      setArtworks(aws || [])
      setLoading(false)
    }
    load()
  }, [token])

  useEffect(() => {
    if (!loading && form && sigMode === 'drawn' && sigCanvasRef.current) {
      sigPadRef.current = new SignaturePad(sigCanvasRef.current, {
        backgroundColor: 'rgba(255,255,255,0)', penColor: '#1a1714',
      })
    }
  }, [loading, form, sigMode])

  async function handleSubmit() {
    if (sigMode === 'drawn' && (!sigPadRef.current || sigPadRef.current.isEmpty())) {
      return alert('Please draw your signature')
    }
    if (sigMode === 'typed' && !typedName.trim()) {
      return alert('Please type your name')
    }
    setSubmitting(true)
    try {
      const sigData = sigMode === 'drawn'
        ? sigPadRef.current.toDataURL()
        : typedName.trim()

      // Generate PDF
      const pdfUrl = await generatePDF(form, artworks, sigData, sigMode)

      // Save to database
      await supabase.from('forms').update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signed_by_name: form.recipient_name,
        recipient_sig_data: sigData,
        recipient_sig_type: sigMode,
        pdf_url: pdfUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', form.id)

      setDone(true)
    } catch(err) {
      alert('Submission failed: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function generatePDF(form, artworks, recipientSig, sigMode) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = 210, ph = 297
    const margin = 18
    const lx = margin
    let y = margin

    const ORANGE = '#E05C2A'
    const INK    = '#1a1714'
    const MUTED  = '#777777'

    // Helper
    const setFont = (size, style='normal', color=INK) => {
      doc.setFontSize(size)
      doc.setFont('helvetica', style)
      doc.setTextColor(color)
    }

    // Logo
    if (LOGO_B64) {
      doc.addImage(LOGO_B64, 'PNG', lx, y, 38, 10)
    }

    // Date top right
    setFont(9, 'normal', MUTED)
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
    doc.text(dateStr, pw - margin, y + 6, { align:'right' })
    y += 18

    // Form type heading
    setFont(18, 'bold', INK)
    doc.text(FORM_TYPES[form.type] || form.type, lx, y)
    y += 6

    // Orange rule
    doc.setDrawColor(ORANGE)
    doc.setLineWidth(0.5)
    doc.line(lx, y, lx + 38, y)
    y += 8

    // Reference
    setFont(8, 'normal', MUTED)
    doc.text(`Reference: ${form.reference || '\u2014'}`, lx, y)
    y += 10

    // Parties
    doc.setFillColor('#f8f7f5')
    doc.roundedRect(lx, y, pw - 2*margin, 18, 2, 2, 'F')
    setFont(7, 'bold', MUTED)
    doc.text('GALLERY', lx + 4, y + 5)
    doc.text('RECIPIENT', pw/2 + 2, y + 5)
    setFont(10, 'bold', INK)
    doc.text('Hourglass Gallery', lx + 4, y + 11)
    doc.text(form.recipient_name || '\u2014', pw/2 + 2, y + 11)
    setFont(8, 'normal', MUTED)
    doc.text('298A Akin Olugbade St, Victoria Island, Lagos', lx + 4, y + 16)
    if (form.recipient_email) doc.text(form.recipient_email, pw/2 + 2, y + 16)
    y += 24

    // Form-specific intro text
    setFont(9, 'normal', INK)
    const introMap = {
      purchase_confirmation: `This confirms that Hourglass Gallery has purchased the artwork(s) listed below from ${form.recipient_name} on ${form.meta?.purchase_date || dateStr}.`,
      consignment_agreement: `This agreement confirms that ${form.recipient_name} has consigned the following artwork(s) to Hourglass Gallery for sale on their behalf.`,
      condition_report:      `This report documents the condition of the following artwork(s) as examined on ${form.meta?.report_date || dateStr}.`,
      loan_agreement:        `This agreement confirms that the following artwork(s) have been loaned to ${form.recipient_name} for the period specified below.`,
      collection_receipt:    `This receipt confirms that ${form.recipient_name} has collected the following artwork(s) from Hourglass Gallery in good condition.`,
    }
    const intro = introMap[form.type] || ''
    const introLines = doc.splitTextToSize(intro, pw - 2*margin)
    doc.text(introLines, lx, y)
    y += introLines.length * 5 + 8

    // Type-specific meta block
    if (form.type === 'consignment_agreement' && form.meta) {
      doc.setFillColor('#fef9ec')
      doc.roundedRect(lx, y, pw - 2*margin, 14, 2, 2, 'F')
      setFont(7, 'bold', MUTED)
      doc.text('CONSIGNMENT TERMS', lx + 4, y + 5)
      setFont(9, 'normal', INK)
      const terms = form.meta.term_type === 'fixed'
        ? `Fixed net to consignor: \u20A6${Number(form.meta.fixed_amount||0).toLocaleString()}`
        : `Gallery commission: ${form.meta.commission_rate || 40}%  \u00B7  Consignor receives: ${100 - (form.meta.commission_rate || 40)}%`
      doc.text(`${terms}  \u00B7  Sale type: ${form.meta.sale_type || 'Secondary'}  \u00B7  Duration: ${form.meta.duration || 'Open'}`, lx + 4, y + 10)
      y += 20
    }

    if (form.type === 'loan_agreement' && form.meta) {
      doc.setFillColor('#f0ecf7')
      doc.roundedRect(lx, y, pw - 2*margin, 14, 2, 2, 'F')
      setFont(7, 'bold', MUTED)
      doc.text('LOAN DETAILS', lx + 4, y + 5)
      setFont(9, 'normal', INK)
      doc.text(`From: ${form.meta.loan_from||'\u2014'}  \u00B7  To: ${form.meta.loan_to||'\u2014'}  \u00B7  Purpose: ${form.meta.purpose||'\u2014'}  \u00B7  Insurance value: \u20A6${Number(form.meta.insurance_value||0).toLocaleString()}`, lx + 4, y + 10)
      y += 20
    }

    if (form.type === 'collection_receipt' && form.meta?.invoice_ref) {
      setFont(8, 'normal', MUTED)
      doc.text(`Invoice reference: ${form.meta.invoice_ref}`, lx, y)
      y += 8
    }

    // Artworks
    setFont(8, 'bold', MUTED)
    doc.text('ARTWORK(S)', lx, y)
    doc.setLineWidth(0.2)
    doc.setDrawColor('#e0dbd4')
    doc.line(lx, y + 2, pw - margin, y + 2)
    y += 8

    for (const aw of artworks) {
      if (y > ph - 70) { doc.addPage(); y = margin }
      const rowH = aw.image_url ? 42 : 22

      // Image
      if (aw.image_url) {
        try {
          const img = await loadImage(aw.image_url)
          doc.addImage(img, 'JPEG', lx, y, 28, 36)
        } catch(_) {}
      }
      const tx = aw.image_url ? lx + 32 : lx

      // Details
      setFont(11, 'bold', INK)
      doc.text(aw.title || '\u2014', tx, y + 5)
      setFont(9, 'normal', MUTED)
      doc.text(aw.artist_name || '', tx, y + 11)
      setFont(8, 'normal', INK)
      const detail = [aw.medium, aw.dimensions, aw.year].filter(Boolean).join('  \u00B7  ')
      doc.text(detail, tx, y + 17)
      if (aw.hg_code) { setFont(8, 'normal', MUTED); doc.text(`HG code: ${aw.hg_code}`, tx, y + 22) }
      if (aw.condition) { setFont(8, 'normal', INK); doc.text(`Condition: ${aw.condition}`, tx, y + 27) }
      if (aw.price && form.meta?.show_price !== false && (form.type === 'purchase_confirmation' || form.type === 'consignment_agreement')) {
        setFont(9, 'bold', INK)
        doc.text(aw.price, pw - margin, y + 5, { align: 'right' })
      }
      doc.setDrawColor('#e0dbd4')
      doc.setLineWidth(0.2)
      doc.line(lx, y + rowH, pw - margin, y + rowH)
      y += rowH + 4
    }

    // Condition report fields
    if (form.type === 'condition_report' && form.meta) {
      y += 4
      setFont(8, 'bold', MUTED)
      doc.text('CONDITION NOTES', lx, y)
      y += 6
      const fields = ['Surface', 'Frame', 'Edges', 'Verso', 'Overall']
      for (const f_ of fields) {
        if (form.meta[f_.toLowerCase()]) {
          setFont(7, 'bold', INK); doc.text(`${f_}:`, lx, y)
          setFont(8, 'normal', INK); doc.text(form.meta[f_.toLowerCase()], lx + 18, y)
          y += 6
        }
      }
    }

    // Signature section
    if (y > ph - 68) { doc.addPage(); y = margin }
    y += 8
    doc.setDrawColor('#e0dbd4')
    doc.setLineWidth(0.3)
    doc.line(lx, y, pw - margin, y)
    y += 8

    const sigColW = (pw - 2*margin - 10) / 2
    const sigX2 = lx + sigColW + 10

    // Gallery sig
    setFont(7, 'bold', MUTED)
    doc.text('FOR HOURGLASS GALLERY', lx, y)
    doc.text('RECIPIENT SIGNATURE', sigX2, y)
    y += 4

    // Gallery sig image
    if (form.gallery_sig_data) {
      try {
        doc.addImage(form.gallery_sig_data, 'PNG', lx, y, sigColW * 0.6, 16)
      } catch(_) {}
    }

    // Recipient sig
    if (recipientSig) {
      if (sigMode === 'drawn') {
        try {
          doc.addImage(recipientSig, 'PNG', sigX2, y, sigColW * 0.6, 16)
        } catch(_) {}
      } else {
        // Typed \u2014 render as text in italic
        doc.setFont('helvetica', 'bolditalic')
        doc.setFontSize(16)
        doc.setTextColor(INK)
        doc.text(recipientSig, sigX2, y + 12)
      }
    }
    y += 20

    doc.setLineWidth(0.3)
    doc.setDrawColor('#1a1714')
    doc.line(lx, y, lx + sigColW, y)
    doc.line(sigX2, y, sigX2 + sigColW, y)
    y += 4
    setFont(8, 'normal', INK)
    doc.text('For Hourglass Gallery\nAuthorised Signatory', lx, y)
    doc.text(`${form.recipient_name || 'Recipient'}\n${new Date().toLocaleDateString('en-GB')}`, sigX2, y)

    // Footer
    doc.setDrawColor('#e0dbd4')
    doc.setLineWidth(0.2)
    doc.line(lx, ph - 14, pw - margin, ph - 14)
    setFont(7, 'normal', MUTED)
    doc.text('Hourglass Gallery  \u00B7  298A Akin Olugbade Street, Victoria Island, Lagos', pw/2, ph - 9, { align:'center' })

    // Save to Supabase storage
    const pdfBlob = doc.output('blob')
    const path = `forms/${form.id}/${form.reference || form.id}.pdf`
    const { error } = await supabase.storage.from('form-pdfs').upload(path, pdfBlob, { contentType:'application/pdf', upsert:true })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('form-pdfs').getPublicUrl(path)
    return publicUrl
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width; canvas.height = img.height
        canvas.getContext('2d').drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = reject
      img.src = url
    })
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:'sans-serif', color:'#999' }}>Loading document{'\u2026'}</div>
    </div>
  )

  if (!form) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <div style={{ fontFamily:'Georgia,serif', fontSize:22 }}>Document not found</div>
      <div style={{ fontSize:13, color:'#999' }}>This link may be invalid or expired.</div>
    </div>
  )

  if (form.status === 'signed' || done) return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:48 }}>{'\u2713'}</div>
      <div style={{ fontFamily:'Georgia,serif', fontSize:22 }}>Document signed</div>
      <div style={{ fontSize:14, color:'#666', textAlign:'center', maxWidth:400 }}>
        Thank you, {form.recipient_name}. This document has been signed and filed with Hourglass Gallery.
      </div>
      {form.pdf_url && (
        <a href={form.pdf_url} target="_blank" rel="noopener noreferrer"
          style={{ marginTop:8, padding:'9px 20px', borderRadius:3, border:'1px solid #e0dbd4', fontSize:13, color:'#1a1714', textDecoration:'none' }}>
          {'\u2193'} Download signed PDF
        </a>
      )}
    </div>
  )

  if (form.status === 'void') return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <div style={{ fontFamily:'Georgia,serif', fontSize:22, color:'#c0392b' }}>Document voided</div>
      <div style={{ fontSize:13, color:'#999' }}>This document has been voided by the gallery.</div>
    </div>
  )

  const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })

  return (
    <div style={{ minHeight:'100vh', background:'#faf8f5', fontFamily:"-apple-system,sans-serif" }}>
      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e8e3db', padding:'14px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
          <span style={{ fontWeight:700, fontSize:15, letterSpacing:'-.01em', color:'#1a1714' }}>HOURGLASS</span>
          <span style={{ fontWeight:700, fontSize:15, color:'#E05C2A' }}>/</span>
          <span style={{ fontWeight:700, fontSize:9, letterSpacing:'.16em', color:'#E05C2A', marginLeft:2 }}>GALLERY</span>
        </div>
        <div style={{ fontSize:12, color:'#999' }}>{dateStr}</div>
      </div>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'40px 24px 80px' }} ref={formRef}>

        {/* Form heading */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:9, letterSpacing:'.14em', textTransform:'uppercase', color:'#999', marginBottom:6 }}>{form.reference}</div>
          <h1 style={{ fontFamily:'Georgia,serif', fontSize:28, fontWeight:400, color:'#1a1714', margin:'0 0 6px' }}>
            {FORM_TYPES[form.type]}
          </h1>
          <div style={{ width:38, height:2, background:'#E05C2A', marginBottom:14 }}/>
        </div>

        {/* Parties */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24, background:'#f8f7f5', borderRadius:4, padding:'16px 18px' }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:'#999', marginBottom:4 }}>Gallery</div>
            <div style={{ fontWeight:600, fontSize:14 }}>Hourglass Gallery</div>
            <div style={{ fontSize:12, color:'#666' }}>298A Akin Olugbade St, Victoria Island, Lagos</div>
          </div>
          <div>
            <div style={{ fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:'#999', marginBottom:4 }}>Recipient</div>
            <div style={{ fontWeight:600, fontSize:14 }}>{form.recipient_name}</div>
            {form.recipient_email && <div style={{ fontSize:12, color:'#666' }}>{form.recipient_email}</div>}
          </div>
        </div>

        {/* Intro text */}
        <div style={{ fontSize:14, color:'#3d3a36', lineHeight:1.7, marginBottom:24 }}>
          {form.type === 'purchase_confirmation' && `This confirms that Hourglass Gallery has purchased the artwork(s) listed below from ${form.recipient_name} on ${form.meta?.purchase_date || dateStr}.`}
          {form.type === 'consignment_agreement' && `This agreement confirms that ${form.recipient_name} has consigned the following artwork(s) to Hourglass Gallery for sale on their behalf.`}
          {form.type === 'condition_report' && `This report documents the condition of the following artwork(s) as examined on ${form.meta?.report_date || dateStr}.`}
          {form.type === 'loan_agreement' && `This agreement confirms that the following artwork(s) have been loaned to ${form.recipient_name} for the period specified below.`}
          {form.type === 'collection_receipt' && `This receipt confirms that ${form.recipient_name} has collected the following artwork(s) from Hourglass Gallery in good condition.`}
        </div>

        {/* Meta fields */}
        {form.type === 'consignment_agreement' && form.meta && (
          <div style={{ background:'#fef9ec', borderRadius:4, padding:'14px 18px', marginBottom:24, fontSize:13 }}>
            <strong>Terms:</strong> {form.meta.term_type === 'fixed'
              ? `Fixed net to consignor: \u20A6${Number(form.meta.fixed_amount||0).toLocaleString()}`
              : `Gallery commission ${form.meta.commission_rate||40}% \u00B7 Consignor receives ${100-(form.meta.commission_rate||40)}%`
            } &nbsp;\u00B7&nbsp; <strong>Sale type:</strong> {form.meta.sale_type || 'Secondary'}
            {form.meta.duration && <span> &nbsp;{'\u00B7'}&nbsp; <strong>Duration:</strong> {form.meta.duration}</span>}
          </div>
        )}
        {form.type === 'loan_agreement' && form.meta && (
          <div style={{ background:'#f3f0f9', borderRadius:4, padding:'14px 18px', marginBottom:24, fontSize:13 }}>
            <strong>Loan period:</strong> {form.meta.loan_from} \u2192 {form.meta.loan_to} &nbsp;\u00B7&nbsp;
            <strong>Purpose:</strong> {form.meta.purpose} &nbsp;\u00B7&nbsp;
            <strong>Insurance value:</strong> {'\u20A6'}{Number(form.meta.insurance_value||0).toLocaleString()}
          </div>
        )}
        {form.type === 'collection_receipt' && form.meta?.invoice_ref && (
          <div style={{ fontSize:13, color:'#666', marginBottom:16 }}>Invoice ref: {form.meta.invoice_ref}</div>
        )}

        {/* Artworks */}
        <div style={{ borderTop:'1px solid #e8e3db', paddingTop:20, marginBottom:28 }}>
          <div style={{ fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:'#999', marginBottom:16 }}>Artwork(s)</div>
          {artworks.map((aw, i) => (
            <div key={aw.id} style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:16, paddingBottom:20, marginBottom:20, borderBottom: i < artworks.length-1 ? '1px solid #f0ece6' : 'none' }}>
              <div>
                {aw.image_url
                  ? <img src={aw.image_url} alt={aw.title} style={{ width:72, height:88, objectFit:'cover', borderRadius:2, border:'1px solid #e8e3db' }}/>
                  : <div style={{ width:72, height:88, background:'#ede9e2', borderRadius:2 }}/>
                }
              </div>
              <div>
                <div style={{ fontWeight:600, fontSize:15, color:'#1a1714', marginBottom:3 }}>{aw.title}</div>
                <div style={{ fontSize:13, color:'#666', marginBottom:6 }}>{aw.artist_name}</div>
                <div style={{ fontSize:12, color:'#888', lineHeight:1.6 }}>
                  {[aw.medium, aw.dimensions, aw.year].filter(Boolean).join('  \u00B7  ')}
                  {aw.hg_code && <span style={{ display:'block', marginTop:2 }}>Code: {aw.hg_code}</span>}
                  {aw.condition && <span style={{ display:'block', marginTop:2 }}>Condition: {aw.condition}</span>}
                </div>
                {aw.price && form.meta?.show_price !== false &&
                  (form.type === 'purchase_confirmation' || form.type === 'consignment_agreement') && (
                  <div style={{ fontWeight:600, fontSize:15, marginTop:8 }}>{aw.price}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Condition report */}
        {form.type === 'condition_report' && form.meta && (
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:'#999', marginBottom:12 }}>Condition notes</div>
            {['Surface','Frame','Edges','Verso','Overall'].filter(f_ => form.meta[f_.toLowerCase()]).map(f_ => (
              <div key={f_} style={{ display:'flex', gap:12, marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#666', width:60, flexShrink:0 }}>{f_}</div>
                <div style={{ fontSize:13 }}>{form.meta[f_.toLowerCase()]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Gallery signature */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, paddingTop:24, borderTop:'1px solid #e8e3db', marginBottom:32 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:'.1em', textTransform:'uppercase', color:'#999', marginBottom:10 }}>Gallery signature</div>
            {form.gallery_sig_data && form.gallery_sig_type === 'stored' && (
              <img src={form.gallery_sig_data} alt="" style={{ height:48, objectFit:'contain', display:'block', marginBottom:6 }}/>
            )}
            {form.gallery_sig_data && form.gallery_sig_type === 'drawn' && (
              <img src={form.gallery_sig_data} alt="" style={{ height:48, objectFit:'contain', display:'block', marginBottom:6 }}/>
            )}
            <div style={{ borderTop:'1px solid #1a1714', width:160, paddingTop:6 }}>
              <div style={{ fontSize:12 }}>For Hourglass Gallery</div>
              <div style={{ fontSize:11, color:'#999' }}>Authorised Signatory</div>
            </div>
          </div>
          <div/>
        </div>

        {/* Recipient signing section */}
        <div style={{ background:'#fff', border:'1px solid #e8e3db', borderRadius:6, padding:'24px' }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Your signature</div>
          <div style={{ fontSize:13, color:'#666', marginBottom:18, lineHeight:1.6 }}>
            By signing below, {form.recipient_name} confirms they have read and agree to the contents of this document.
          </div>

          {/* Sig mode toggle */}
          <div style={{ display:'flex', gap:0, marginBottom:16, border:'1px solid #e8e3db', borderRadius:4, overflow:'hidden', width:'fit-content' }}>
            {[['drawn','Draw'], ['typed','Type name']].map(([mode, label]) => (
              <button key={mode} onClick={() => setSigMode(mode)}
                style={{ padding:'7px 18px', fontSize:12, fontWeight: sigMode===mode ? 600 : 400, background: sigMode===mode ? '#1a1714' : '#fff', color: sigMode===mode ? '#fff' : '#666', border:'none', cursor:'pointer' }}>
                {label}
              </button>
            ))}
          </div>

          {sigMode === 'drawn' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ border:'1px solid #e8e3db', borderRadius:4, background:'#fafaf8' }}>
                <canvas ref={sigCanvasRef} width={620} height={140}
                  style={{ display:'block', width:'100%', touchAction:'none', cursor:'crosshair' }}/>
              </div>
              <button onClick={() => sigPadRef.current?.clear()}
                style={{ fontSize:11, color:'#999', background:'none', border:'none', cursor:'pointer', alignSelf:'flex-start', padding:0 }}>
                Clear
              </button>
            </div>
          )}

          {sigMode === 'typed' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <input
                style={{ padding:'12px 14px', fontSize:14, border:'1px solid #e8e3db', borderRadius:4, fontFamily:'inherit', outline:'none' }}
                placeholder="Type your full name..."
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
              />
              {typedName && (
                <div style={{ padding:'16px 20px', border:'1px solid #e8e3db', borderRadius:4, background:'#fafaf8' }}>
                  <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:26, color:'#1a1714' }}>{typedName}</div>
                </div>
              )}
              <div style={{ fontSize:11, color:'#999' }}>This typed name constitutes your legal signature on this document.</div>
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting}
            style={{ marginTop:20, padding:'12px 28px', background:'#1a1714', color:'#fff', border:'none', borderRadius:3, fontSize:14, fontWeight:600, cursor: submitting ? 'wait' : 'pointer', fontFamily:'inherit' }}>
            {submitting ? 'Signing & generating PDF\u2026' : 'I confirm and sign'}
          </button>
        </div>
      </div>
    </div>
  )
}
