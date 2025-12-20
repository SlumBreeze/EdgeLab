
import { createClient } from '@supabase/supabase-js';

// Use standard process.env which is injected by Vite as per config
const supabaseUrl = process.env.SUPABASE_URL || "https://thcstqwbinhbkpstcvme.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoY3N0cXdiaW5oYmtwc3Rjdm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDQxMDIsImV4cCI6MjA4MTgyMDEwMn0.gdCn1H9MCPmoTPOo06m12QtzgWbTmpOqcX_bKSFLd_I";

if (!supabaseUrl) {
  console.error("Supabase URL is missing");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
