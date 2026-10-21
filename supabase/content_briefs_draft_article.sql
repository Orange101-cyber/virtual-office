-- Article Writer drafts — applied 2026-10-21 (migration content_briefs_draft_article).
-- The Article Writer auto-saves generated/edited articles here; the column was
-- missing, so draft saves silently failed until this was run.
-- Safe to re-run.

alter table content_briefs add column if not exists draft_article text;
