-- Rank Tracker tables — run once in the Supabase SQL editor.
-- (Supabase dashboard → SQL Editor → paste → Run)

-- Keywords being tracked, per client.
create table if not exists rank_tracker_keywords (
  id            uuid primary key default gen_random_uuid(),
  client_name   text not null,
  keyword       text not null,
  keyword_group text,
  target_domain text,
  device        text default 'desktop',
  created_at    timestamptz default now()
);

-- One position snapshot per keyword per refresh (this is what powers the charts).
create table if not exists rank_tracker_snapshots (
  id            uuid primary key default gen_random_uuid(),
  client_name   text not null,
  keyword       text not null,
  captured_on   date not null default current_date,
  position      int,            -- null = not found in top 100
  url           text,
  search_volume int,
  est_traffic   numeric,
  created_at    timestamptz default now()
);

create index if not exists idx_rt_kw_client   on rank_tracker_keywords(client_name);
create index if not exists idx_rt_snap_client on rank_tracker_snapshots(client_name, captured_on);
create index if not exists idx_rt_snap_kw     on rank_tracker_snapshots(client_name, keyword, captured_on);

-- Internal tool: allow the app's anon role full access (same as your other tables).
alter table rank_tracker_keywords  enable row level security;
alter table rank_tracker_snapshots enable row level security;

do $$ begin
  create policy rt_kw_all   on rank_tracker_keywords  for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy rt_snap_all on rank_tracker_snapshots for all using (true) with check (true);
exception when duplicate_object then null; end $$;
