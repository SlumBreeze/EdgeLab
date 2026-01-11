
import { createClient } from '@supabase/supabase-js';

// Access environment variables directly so Vite can statically replace them during build
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only mark as configured if we have real values (not placeholders)
const isConfigured = !!(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('placeholder')
);

console.log("[Supabase] URL:", supabaseUrl?.substring(0, 30) + "...");
console.log("[Supabase] Configured:", isConfigured);

if (!supabaseUrl || !supabaseKey) {
    console.warn("Supabase URL or Key is missing. Supabase features will be disabled.");
}

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : createClient('https://placeholder.supabase.co', 'placeholder');

export const isSupabaseConfigured = isConfigured;
