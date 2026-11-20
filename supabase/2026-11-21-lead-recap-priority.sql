-- Lead accountability (21 Nov 2026, Tengku): who they are, meeting recap, channels we can reach them on, priority 1-10.
-- SOP: after every meeting the lead owner writes the recap + next step and moves the card on.
alter table public.people add column if not exists about text;                -- what they are / what they do, in our words
alter table public.people add column if not exists meeting_recap text;        -- latest meeting, a few lines
alter table public.people add column if not exists recap_at timestamptz;      -- when the recap was last written
alter table public.people add column if not exists recap_by text;
alter table public.people add column if not exists channels text[] not null default '{}';  -- linkedin | email | whatsapp
alter table public.people add column if not exists priority smallint check (priority between 1 and 10);
