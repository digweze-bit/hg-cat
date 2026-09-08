// Connection details only — no client is created here, so importing this file
// never starts an auth session or a token-refresh ticker.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://gmukkxnxyvmywgrbkwnr.supabase.co'

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdWtreG54eXZteXdncmJrd25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTk1NzgsImV4cCI6MjA5ODY5NTU3OH0.zscg6b3jhsijnAEE9-yoMVSlQYwDHjO47j5-R_odP9g'
