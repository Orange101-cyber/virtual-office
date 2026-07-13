-- Site Auditor — run once in the Supabase SQL editor.

create table if not exists site_audits (
  id           uuid primary key default gen_random_uuid(),
  client_name  text not null,
  url          text,
  audited_on   date not null default current_date,
  score        int,              -- overall on-page score (0-100)
  summary      text,             -- one-line health summary
  issues       jsonb,            -- array of detected issues
  tasks        jsonb,            -- array of { title, issue, action, impact, effort, category, done }
  raw          jsonb,            -- crawl signals (for reference)
  created_at   timestamptz default now()
);

create index if not exists idx_site_audits_client on site_audits(client_name, audited_on desc);

alter table site_audits enable row level security;
do $$ begin
  create policy site_audits_all on site_audits for all using (true) with check (true);
exception when duplicate_object then null; end $$;
