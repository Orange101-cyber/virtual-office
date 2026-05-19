-- Fix RLS for ALL public tables in the project.
-- Adds anon select/insert/update/delete policies to every table
-- in the public schema that has RLS enabled, skipping any table
-- that already has an anon policy for that operation.

do $$
declare
  tbl text;
begin
  for tbl in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = true
  loop
    -- SELECT
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl
        and policyname = 'anon_select_' || tbl
    ) then
      execute format(
        'create policy "anon_select_%I" on public.%I for select to anon using (true)',
        tbl, tbl
      );
    end if;

    -- INSERT
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl
        and policyname = 'anon_insert_' || tbl
    ) then
      execute format(
        'create policy "anon_insert_%I" on public.%I for insert to anon with check (true)',
        tbl, tbl
      );
    end if;

    -- UPDATE
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl
        and policyname = 'anon_update_' || tbl
    ) then
      execute format(
        'create policy "anon_update_%I" on public.%I for update to anon using (true)',
        tbl, tbl
      );
    end if;

    -- DELETE
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl
        and policyname = 'anon_delete_' || tbl
    ) then
      execute format(
        'create policy "anon_delete_%I" on public.%I for delete to anon using (true)',
        tbl, tbl
      );
    end if;
  end loop;
end
$$;
