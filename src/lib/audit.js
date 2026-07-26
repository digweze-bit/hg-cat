import { supabase } from './supabase'

export async function auditLog(action, { entityType, entityId, entityLabel, metadata } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_log').insert({
      action,
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      entity_label: entityLabel || null,
      user_id: user?.id || null,
      user_email: user?.email || null,
      metadata: metadata || null,
    })
  } catch(err) {
    // Never let logging errors block the main action
    console.warn('Audit log failed:', err.message)
  }
}
