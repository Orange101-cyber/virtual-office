-- Rank Tracker v2 — DRAFT, NOT YET RUN. Needs approval before running.
-- Safe to re-run (everything is "if not exists" / "or replace").
-- Adds: one-snapshot-per-day rule, competitor tracking, organic-rank column,
-- live updates, and a server-side overview so the page loads fast.
-- It deletes no data.

-- 1. One snapshot per keyword per day (lets refreshes upsert instead of
--    delete-then-insert). There are currently 0 duplicates, so this will apply cleanly.
create unique index if not exists uq_rt_snap_day
  on rank_tracker_snapshots (client_name, keyword, captured_on);

-- 2. New snapshot columns.
--    position       — from now on = ORGANIC rank (rank_group), like Wincher/Semrush.
--    rank_absolute  — position counting every SERP element (AI Overview, PAA, maps…).
--    position_type  — 'absolute' for rows saved before this change (their
--                     `position` counted SERP features), 'organic' after. The app
--                     doesn't compare old and new rows, so the switch won't
--                     show fake "improvements".
--    competitors    — { "domain": { "position": n, "url": "…" } } — the tracked
--                     competitors plus the top 20 organic domains for that SERP.
alter table rank_tracker_snapshots
  add column if not exists rank_absolute int,
  add column if not exists position_type text,
  add column if not exists competitors jsonb;
update rank_tracker_snapshots set position_type = 'absolute', rank_absolute = coalesce(rank_absolute, position)
  where position_type is null;
alter table rank_tracker_snapshots alter column position_type set default 'organic';

-- 3. Competitors to track, per client.
create table if not exists rank_tracker_competitors (
  id          uuid primary key default gen_random_uuid(),
  client_name text not null,
  domain      text not null,
  label       text,
  created_at  timestamptz default now(),
  unique (client_name, domain)
);
alter table rank_tracker_competitors enable row level security;
-- Same open access as the other rank_tracker tables (the daily job uses the anon key).
do $$ begin
  create policy rt_comp_all on rank_tracker_competitors for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- 4. Live updates: broadcast new/updated snapshots to open Rank Tracker pages.
do $$ begin
  alter publication supabase_realtime add table rank_tracker_snapshots;
exception when duplicate_object then null; end $$;

-- 5. Server-side overview: one row per client with the card KPIs, so the
--    overview no longer downloads every snapshot for every client.
create or replace function public.rank_tracker_ctr(p int)
returns numeric language sql immutable as $$
  select case
    when p is null then 0
    when p = 1 then .28 when p = 2 then .15 when p = 3 then .11 when p = 4 then .08
    when p = 5 then .06 when p = 6 then .05 when p = 7 then .04 when p = 8 then .033
    when p = 9 then .028 when p = 10 then .025
    when p <= 20 then .015 when p <= 30 then .008 when p <= 50 then .004 when p <= 100 then .002
    else 0 end
$$;

create or replace function public.rank_tracker_overview(series_days int default 120)
returns table (
  client_name text, keyword_count int, latest_date date,
  avg_position numeric, improved int, declined int, total_est numeric, share_of_voice numeric,
  b_first int, b_23 int, b_410 int, b_1130 int, b_30plus int, series jsonb
)
language sql stable security invoker set search_path = public as $$
  with s as (
    select client_name, keyword, captured_on, position, position_type, search_volume, est_traffic,
           row_number() over (partition by client_name, keyword order by captured_on desc) rn
    from rank_tracker_snapshots
  ),
  r as (
    select k.client_name, c.position pos, c.captured_on,
           c.search_volume vol, coalesce(c.est_traffic, round(rank_tracker_ctr(c.position) * coalesce(c.search_volume, 0))) est,
           case when p.position is not null and c.position is not null
                 and coalesce(p.position_type, 'organic') = coalesce(c.position_type, 'organic')
                then p.position - c.position end delta
    from rank_tracker_keywords k
    left join s c on c.client_name = k.client_name and c.keyword = k.keyword and c.rn = 1
    left join s p on p.client_name = k.client_name and p.keyword = k.keyword and p.rn = 2
  ),
  ser as (
    select client_name, jsonb_agg(jsonb_build_object('date', d, 'avg', a) order by d) series
    from (select client_name, captured_on d, round(avg(position), 2) a
          from rank_tracker_snapshots
          where position is not null and captured_on >= current_date - series_days
          group by 1, 2) x
    group by 1
  )
  select r.client_name,
         count(*)::int,
         max(r.captured_on),
         round(avg(r.pos), 2),
         count(*) filter (where r.delta > 0)::int,
         count(*) filter (where r.delta < 0)::int,
         coalesce(sum(r.est), 0),
         case when sum(rank_tracker_ctr(1) * coalesce(r.vol, 0)) > 0
              then round(100 * sum(rank_tracker_ctr(r.pos) * coalesce(r.vol, 0)) / sum(rank_tracker_ctr(1) * coalesce(r.vol, 0)), 2)
              else 0 end,
         count(*) filter (where r.pos = 1)::int,
         count(*) filter (where r.pos between 2 and 3)::int,
         count(*) filter (where r.pos between 4 and 10)::int,
         count(*) filter (where r.pos between 11 and 30)::int,
         count(*) filter (where r.pos is null or r.pos > 30)::int,
         coalesce(max(ser.series::text)::jsonb, '[]'::jsonb)
  from r left join ser on ser.client_name = r.client_name
  group by r.client_name
  order by r.client_name
$$;
grant execute on function public.rank_tracker_overview(int) to anon, authenticated;
grant execute on function public.rank_tracker_ctr(int) to anon, authenticated;

-- 6. OPTIONAL — NOT part of the main change. There are 133 duplicate keywords
--    (same client, same keyword ignoring case). Review them with the query below.
--    The delete stays commented out until you approve it separately.
-- select client_name, lower(keyword), count(*) from rank_tracker_keywords group by 1, 2 having count(*) > 1;
-- delete from rank_tracker_keywords k using rank_tracker_keywords d
--   where k.client_name = d.client_name and lower(k.keyword) = lower(d.keyword)
--     and (k.created_at, k.id) > (d.created_at, d.id);
