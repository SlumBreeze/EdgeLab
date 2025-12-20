<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15eeRgNHhns6yFpzoOrZ6O5-HORKFVJt3

### Supabase Setup

To enable persistence for your bankroll and the daily slate, you need to set up the following tables in your Supabase project:

1.  Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Open the **SQL Editor** from the left sidebar.
3.  Click **New Query** and paste the following SQL:

```sql
-- Create bankrolls table
create table if not exists public.bankrolls (
  user_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone default now()
);

-- Create daily_slates table for persistence of initial pull
create table if not exists public.daily_slates (
  user_id text not null,
  date text not null,
  queue jsonb default '[]'::jsonb,
  daily_plays jsonb default '{}'::jsonb,
  reference_lines jsonb default '{}'::jsonb,
  scan_results jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default now(),
  primary key (user_id, date)
);

-- Enable RLS
alter table public.bankrolls enable row level security;
alter table public.daily_slates enable row level security;

-- Create policies (allowing public access by user_id for simplicity in this setup)
create policy "Allow bankroll access by user_id" on public.bankrolls for all using (true) with check (true);
create policy "Allow slates access by user_id" on public.daily_slates for all using (true) with check (true);
```

4.  Click **Run**.
5.  Ensure you have your `.env` file set up with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
