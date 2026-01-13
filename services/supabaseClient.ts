import { createClient } from '@supabase/supabase-js';

// Access environment variables directly so Vite can statically replace them during build
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase URL or Key is missing in environment variables. Sync will be disabled.");
}

// Fallback to avoid crash if keys are missing (Sync will fail gracefully)
const validUrl = supabaseUrl || "https://placeholder.supabase.co";
const validKey = supabaseKey || "placeholder";

export const supabase = createClient(validUrl, validKey);

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);