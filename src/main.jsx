import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// After a deploy, a tab still running the previous build asks for page chunks
// whose hashed filenames no longer exist, and the page goes blank. Reload once
// to pick up the new build; the timestamp stops a reload loop if the chunk is
// genuinely broken.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'hgcat-chunk-reload'
  let last = 0
  try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch {}
  if (Date.now() - last < 10000) return
  event.preventDefault()
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch {}
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
