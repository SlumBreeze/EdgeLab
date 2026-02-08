-- Add decision_mode to user_personas
alter table public.user_personas
  add column if not exists decision_mode text not null default 'MATH_STRICT';
