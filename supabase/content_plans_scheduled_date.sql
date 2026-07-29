-- Calendar view for the Content Planner — run once in the Supabase SQL editor.
alter table content_plans add column if not exists scheduled_date date;
