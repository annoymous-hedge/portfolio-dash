-- Run this in the Supabase SQL Editor to create the portfolio_settings table.
-- One row per client (browser session), stores deposit amount, currency, and cash funds.

create table if not exists portfolio_settings (
  client_id   text primary key,
  total_deposit     numeric not null default 0,
  deposit_currency  text    not null default 'MYR',
  cash_funds        jsonb   not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);

-- Enable Row Level Security (optional but recommended)
alter table portfolio_settings enable row level security;

-- Allow anonymous access (same pattern as the holdings table)
create policy "Allow all access to portfolio_settings"
  on portfolio_settings
  for all
  using (true)
  with check (true);
