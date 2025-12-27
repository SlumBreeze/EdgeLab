
import { createClient } from '@supabase/supabase-js';

// Direct fallbacks for AI Studio environment where process.env may not be injected
const FALLBACK_URL = 'https://thcstqwbinhbkpstcvme.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY3N0cXdiaW5oYmtwc3Rjdm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDQxMDIsImV4cCI6MjA4MTgyMDEwMn0.gdCn1H9MCPmoTPOo06m12QtzgWbTmpOqcX_bKSFLd_I';

// Safely check for process.env (may not exist in all environments)
const getEnvVar = (key: string): string | undefined => {
  try {
    return typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  } catch {
    return undefined;
  }
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || FALLBACK_URL;
const supabaseKey = getEnvVar('SUPABASE_KEY') || FALLBACK_KEY;

// Only mark as configured if we have real values (not placeholders)
const isConfigured = !!(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('placeholder')
);

console.log("[Supabase] URL:", supabaseUrl.substring(0, 30) + "...");
console.log("[Supabase] Configured:", isConfigured);

export const supabase = createClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = isConfigured;
