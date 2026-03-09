-- Create the monthly_reports table for the Invida Performance Dashboard
create table if not exists monthly_reports (
  id            uuid primary key default gen_random_uuid(),
  month         text not null unique,  -- format: YYYY-MM
  web_sessions  int,
  leads         int,
  strategy_calls int,
  sales         int,

  -- Ad spend
  google_spend  numeric,
  meta_spend    numeric,
  cost_per_lead numeric,

  -- Lead source percentages (should sum to ~100)
  leads_fb_pct       numeric,
  leads_google_pct   numeric,
  leads_ig_pct       numeric,
  leads_youtube_pct  numeric,
  leads_referral_pct numeric,
  leads_other_pct    numeric,

  -- Freeform text fields
  campaigns    text,
  improvements text,
  notes        text,

  created_at   timestamptz not null default now()
);

-- Index for fast month lookups
create index if not exists idx_monthly_reports_month on monthly_reports (month);

-- Row-level security (enable, then add policies as needed)
alter table monthly_reports enable row level security;

-- Allow authenticated reads (adjust to your auth strategy)
create policy "Allow authenticated read access"
  on monthly_reports for select
  to authenticated
  using (true);

-- Allow authenticated inserts
create policy "Allow authenticated insert access"
  on monthly_reports for insert
  to authenticated
  with check (true);

-- Allow authenticated updates
create policy "Allow authenticated update access"
  on monthly_reports for update
  to authenticated
  using (true);
