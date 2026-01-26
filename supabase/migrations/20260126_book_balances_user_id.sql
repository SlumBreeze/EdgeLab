alter table if exists public.book_balances
add column if not exists withdrawn numeric not null default 0;

alter table if exists public.book_balances
add column if not exists user_id uuid;

update public.book_balances
set user_id = (select user_id from public.bets limit 1)
where user_id is null;

alter table if exists public.book_balances
alter column user_id set not null;

create unique index if not exists book_balances_user_book_unique
on public.book_balances (user_id, sportsbook);
