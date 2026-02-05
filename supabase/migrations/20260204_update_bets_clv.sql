-- Add CLV columns to bets table
alter table if exists public.bets
add column if not exists closing_odds_sharp numeric,
add column if not exists clv_percent numeric;
