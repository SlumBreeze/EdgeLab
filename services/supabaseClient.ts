
import { createClient } from '@supabase/supabase-js';

// Use standard process.env which is injected by Vite as per config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const isConfigured = !!(supabaseUrl && supabaseKey);

if (!isConfigured) {
  console.warn("Supabase URL or Key is missing. Cloud sync will be disabled.");
}

// Fallback to placeholder to prevent "supabaseUrl is required" crash on init
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);

export const isSupabaseConfigured = isConfigured;
