-- Per-client blog design reference (PDF uploads) — run once in Supabase SQL editor.

-- 1) Storage bucket to hold the PDFs (public read so the links open).
insert into storage.buckets (id, name, public)
values ('client-blogs', 'client-blogs', true)
on conflict (id) do nothing;

-- Allow the app's anon role to read/upload/delete in this bucket (internal tool).
do $$ begin
  create policy "client-blogs read"   on storage.objects for select using (bucket_id = 'client-blogs');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "client-blogs insert" on storage.objects for insert with check (bucket_id = 'client-blogs');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "client-blogs delete" on storage.objects for delete using (bucket_id = 'client-blogs');
exception when duplicate_object then null; end $$;

-- 2) Metadata table linking uploads to clients.
create table if not exists client_blog_reference (
  id           uuid primary key default gen_random_uuid(),
  client_name  text not null,
  file_name    text,
  path         text,
  url          text,
  uploaded_at  timestamptz default now()
);
create index if not exists idx_blogref_client on client_blog_reference(client_name);

alter table client_blog_reference enable row level security;
do $$ begin
  create policy blogref_all on client_blog_reference for all using (true) with check (true);
exception when duplicate_object then null; end $$;
