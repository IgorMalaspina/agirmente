import { createClient } from '@supabase/supabase-js'

// Publishable keys are intended for browser use; RLS is the access boundary.
// Local .env values can override these defaults when developing against another project.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://diclvusyagpboazywcue.supabase.co'
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VU2SPcM9am-9QeQbkmE24w_SzlmwfCA'

export const supabaseReady = Boolean(url && publishableKey)
export const supabase = supabaseReady ? createClient(url, publishableKey) : null
