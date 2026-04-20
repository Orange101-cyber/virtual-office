-- Allow the anon role to insert and update monthly_reports.
-- Required because the dashboard connects with VITE_SUPABASE_ANON_KEY
-- and users are not logged in via Supabase Auth (yet).
--
-- NOTE: This means anyone with the anon key can write to monthly_reports.
-- That is acceptable for a private internal URL, but before exposing the
-- Admin page publicly you should tighten this (see auth TODO in README).

create policy "Allow anon read access"
  on monthly_reports for select
  to anon
  using (true);

create policy "Allow anon insert access"
  on monthly_reports for insert
  to anon
  with check (true);

create policy "Allow anon update access"
  on monthly_reports for update
  to anon
  using (true);
