-- Create user_personas table
create table if not exists public.user_personas (
    user_id uuid primary key references auth.users(id) on delete cascade,
    min_edge_percentage numeric not null default 0.1,
    volume_mode text not null default 'High Action',
    max_odds_american integer not null default -175,
    risk_tolerance text not null default 'Balanced',
    active_sports text[] not null default '{nba, nfl, mlb, nhl}',
    updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.user_personas enable row level security;

-- Create policies
create policy "Users can view their own persona"
    on public.user_personas for select
    using (auth.uid() = user_id);

create policy "Users can update their own persona"
    on public.user_personas for update
    using (auth.uid() = user_id);

create policy "Users can insert their own persona"
    on public.user_personas for insert
    with check (auth.uid() = user_id);

-- Create trigger for updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger set_updated_at
    before update on public.user_personas
    for each row
    execute function public.handle_updated_at();
