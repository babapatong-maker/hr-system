import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ywkuanctasartuaeugsf.supabase.co'
const supabaseKey = 'sb_publishable_LOFy7z2KuvEdE6Bu6SedEg_aC8tB8bq'

export const supabase = createClient(supabaseUrl, supabaseKey)