import { useState, useRef } from 'react'

// Suggested tags by context
export const ARTWORK_TAG_SUGGESTIONS = [
  // Genre / Style
  'modernist', 'contemporary', 'traditional', 'abstract', 'figurative', 'landscape',
  'portrait', 'still life', 'narrative', 'geometric', 'expressionist',
  // Medium group
  'oil painting', 'acrylic', 'watercolour', 'drawing', 'print', 'photography',
  'sculpture', 'mixed media', 'textile', 'ceramic', 'bronze', 'installation',
  // Subject
  'female figure', 'male figure', 'Lagos', 'market scene', 'religious',
  'political', 'nature', 'architecture', 'Nsibidi', 'Uli',
  // Period
  'Zaria Rebels', 'Natural Synthesis', 'post-independence', 'colonial era',
]

export const CLIENT_TAG_SUGGESTIONS = [
  // Collection focus
  'modernist', 'contemporary', 'sculpture', 'photography', 'works on paper',
  'textile', 'prints', 'large format', 'small works',
  // Artist interests
  'Enwonwu', 'Onobrakpeya', 'Twins Seven Seven', 'Buraimoh', 'Grillo',
  'Glover', 'Oshinowo', 'Ugbine', 'Njoku',
  // Budget range
  'under ₦1m', '₦1m–₦5m', '₦5m–₦20m', 'above ₦20m',
  // Collector type
  'institutional', 'corporate', 'diaspora', 'new collector', 'established collector',
  'investment focused', 'passion collector',
]

export default function TagInput({ tags = [], onChange, suggestions = [], placeholder = 'Add tag...' }) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef(null)

  const filtered = input.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s))
    : suggestions.filter(s => !tags.includes(s)).slice(0, 12)

  function addTag(tag) {
    const t = tag.trim().toLowerCase()
    if (t && !tags.includes(t)) {
      onChange([...tags, t])
    }
    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  function removeTag(tag) {
    onChange(tags.filter(t => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 8px',
          border: '1px solid var(--line)', borderRadius: 4, background: 'var(--white)',
          cursor: 'text', minHeight: 38,
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--ink)', color: '#fff',
            fontSize: 11, padding: '2px 8px', borderRadius: 3,
          }}>
            {tag}
            <button
              onClick={e => { e.stopPropagation(); removeTag(tag) }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
            >&times;</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12, flex: 1, minWidth: 100, padding: '2px 0',
          }}
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--white)', border: '1px solid var(--line)',
          borderTop: 'none', borderRadius: '0 0 4px 4px',
          maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,.08)',
        }}>
          {filtered.slice(0, 20).map(s => (
            <div
              key={s}
              onMouseDown={() => addTag(s)}
              style={{
                padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                borderBottom: '1px solid var(--line-soft)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1,#f5f3f0)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {s}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
        Type and press Enter or comma to add · Backspace to remove
      </div>
    </div>
  )
}
