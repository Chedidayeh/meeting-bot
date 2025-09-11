import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client for Storage and admin ops
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE (preferred) or SUPABASE_ANON_KEY (limited)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE) as string

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE/ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    }
})


