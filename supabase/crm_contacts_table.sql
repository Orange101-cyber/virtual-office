-- CRM — leads & clients for the digital agency.
-- Run once in the Supabase SQL editor.

create table if not exists crm_contacts (
  id             uuid primary key default gen_random_uuid(),
  record_type    text not null default 'lead',   -- 'lead' | 'client'
  stage          text not null default 'New',     -- New | Contacted | Proposal | Won | Lost
  first_name     text,
  last_name      text,
  email          text,
  phone          text,
  company        text,
  website        text,
  source         text,             -- where the lead came from (referral, website, etc.)
  owner          text,             -- team member who owns the relationship
  deal_value     numeric,          -- estimated / actual value ($)
  tags           text[] default '{}',   -- freeform tags, double as Mailchimp segments
  notes          jsonb default '[]',    -- [{ text, at, by }]
  last_contacted date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_crm_contacts_stage on crm_contacts(record_type, stage);
create index if not exists idx_crm_contacts_email on crm_contacts(lower(email));

alter table crm_contacts enable row level security;
do $$ begin
  create policy crm_contacts_all on crm_contacts for all using (true) with check (true);
exception when duplicate_object then null; end $$;
