-- Google Search Console import — run once in the Supabase SQL editor.
create table if not exists gsc_metrics (
  id           uuid primary key default gen_random_uuid(),
  client_name  text not null,
  kind         text not null,          -- 'query' | 'page'
  term         text not null,          -- the search query or the page URL
  clicks       int,
  impressions  int,
  ctr          numeric,                -- percent, e.g. 3.5
  position     numeric,
  imported_on  date default current_date,
  created_at   timestamptz default now()
);
create index if not exists idx_gsc_client on gsc_metrics(client_name, kind);

alter table gsc_metrics enable row level security;
do $$ begin
  create policy gsc_all on gsc_metrics for all using (true) with check (true);
exception when duplicate_object then null; end $$;
