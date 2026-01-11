import { createClient } from '@supabase/supabase-js';

// Access environment variables directly so Vite can statically replace them during build
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL or Key is missing. Please check your .env file.");
}

console.log("[Supabase] URL:", supabaseUrl.substring(0, 30) + "...");

export const supabase = createClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = true;