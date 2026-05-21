import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iqhswfuddwltzxpggldc.supabase.co'
const supabaseKey = 'sb_publishable_D8vUfkTd2LZMnsB7W1fvIQ_a1oVeJeO'

export const supabase = createClient(supabaseUrl, supabaseKey)