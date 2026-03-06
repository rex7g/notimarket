-- ============================================================
-- TuNoti – Phone Survey Calls Schema (Premium Feature)
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Depends on: surveys.sql (surveys + profiles tables must exist)
-- ============================================================

-- ─── Helper: is_admin() (idempotent) ─────────────────────────
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ─── Premium flag on profiles ────────────────────────────────
-- Manually activated per customer via SQL (no billing system yet).
alter table public.profiles
  add column if not exists is_premium boolean not null default false;

comment on column public.profiles.is_premium
  is 'Premium plan flag – set manually: UPDATE profiles SET is_premium=true WHERE id=...';

-- ─── Phone Campaigns table ───────────────────────────────────
-- One campaign = one batch of outbound calls for a given survey.
create table if not exists public.phone_campaigns (
  id            uuid        primary key default gen_random_uuid(),
  survey_id     uuid        not null references public.surveys(id) on delete cascade,
  created_by    uuid        references auth.users(id) on delete set null,
  status        text        not null default 'pending'
                            check (status in ('pending', 'running', 'completed', 'failed')),
  total_numbers integer     not null default 0,
  calls_made    integer     not null default 0,   -- calls initiated
  calls_done    integer     not null default 0,   -- webhook confirmed
  agent_id      text        not null,              -- ElevenLabs agent_id used
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

comment on table public.phone_campaigns
  is 'Batch outbound call campaigns using ElevenLabs agent for survey collection';

alter table public.phone_campaigns enable row level security;

create policy "PhoneCampaigns: admin all"
  on public.phone_campaigns
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists phone_campaigns_survey_idx    on public.phone_campaigns (survey_id);
create index if not exists phone_campaigns_status_idx   on public.phone_campaigns (status);
create index if not exists phone_campaigns_created_idx  on public.phone_campaigns (created_at desc);

-- ─── Phone Calls table ───────────────────────────────────────
-- One row per individual outbound call.
create table if not exists public.phone_calls (
  id                  uuid        primary key default gen_random_uuid(),
  campaign_id         uuid        not null references public.phone_campaigns(id) on delete cascade,
  survey_id           uuid        not null references public.surveys(id) on delete cascade,
  phone_number        text        not null,
  contact_name        text,
  el_conversation_id  text unique,    -- ElevenLabs conversation_id for webhook reconciliation
  status              text        not null default 'pending'
                                  check (status in ('pending', 'calling', 'completed', 'no_answer', 'failed')),
  transcript          jsonb,          -- [{role: 'agent'|'user', message: string}]
  answered            boolean     not null default false,
  duration_secs       integer,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

comment on table  public.phone_calls                    is 'Individual outbound calls; transcript stored after webhook from ElevenLabs';
comment on column public.phone_calls.el_conversation_id is 'Key to match ElevenLabs post-call webhook to this row';
comment on column public.phone_calls.transcript         is '[{role, message}] from ElevenLabs post-call webhook';

alter table public.phone_calls enable row level security;

create policy "PhoneCalls: admin all"
  on public.phone_calls
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists phone_calls_campaign_idx     on public.phone_calls (campaign_id);
create index if not exists phone_calls_survey_idx       on public.phone_calls (survey_id);
create index if not exists phone_calls_el_conv_idx      on public.phone_calls (el_conversation_id);
create index if not exists phone_calls_status_idx       on public.phone_calls (status);

-- ─── Adapt survey_responses for phone calls ──────────────────
-- Allow null user_id (phone responses have no auth user).
-- Add phone_call_id so phone responses are traceable.
alter table public.survey_responses
  alter column user_id drop not null;

alter table public.survey_responses
  add column if not exists phone_call_id uuid references public.phone_calls(id) on delete cascade;

-- Drop old unique constraint and replace with partial ones
alter table public.survey_responses
  drop constraint if exists survey_responses_survey_id_user_id_key;

-- One web response per user per survey
create unique index if not exists survey_resp_web_unique
  on public.survey_responses (survey_id, user_id)
  where user_id is not null;

-- One phone response per call per survey
create unique index if not exists survey_resp_phone_unique
  on public.survey_responses (survey_id, phone_call_id)
  where phone_call_id is not null;

-- Check: either user_id or phone_call_id must be present
alter table public.survey_responses
  drop constraint if exists survey_resp_source_check;

alter table public.survey_responses
  add constraint survey_resp_source_check
  check (user_id is not null or phone_call_id is not null);

-- ─── RPC: increment campaign counters ────────────────────────
-- Used by callService.ts to avoid race conditions.
create or replace function public.increment_campaign_calls_made(campaign_id uuid)
returns void language sql security definer as $$
  update public.phone_campaigns
    set calls_made = calls_made + 1
    where id = campaign_id;
$$;

create or replace function public.increment_campaign_calls_done(campaign_id uuid)
returns void language sql security definer as $$
  update public.phone_campaigns
    set calls_done = calls_done + 1
    where id = campaign_id;
$$;

-- ─── Update SurveyResp RLS for phone responses ───────────────
-- Phone responses (phone_call_id is not null) are readable by admins only.
-- Existing "SurveyResp: user reads own" policy already handles both cases
-- because it checks: auth.uid() = user_id OR is_admin().
-- Phone responses (user_id = null) are only readable by admins. ✓

-- ============================================================
-- USAGE NOTES
-- ============================================================
-- • Activate premium for a user:
--     UPDATE public.profiles SET is_premium = true
--     WHERE id = (SELECT id FROM auth.users WHERE email = 'cliente@email.com');
--
-- • View campaign progress:
--     SELECT id, status, calls_made, calls_done, total_numbers
--     FROM public.phone_campaigns ORDER BY created_at DESC;
--
-- • View call transcripts:
--     SELECT contact_name, phone_number, status, answered, duration_secs, transcript
--     FROM public.phone_calls WHERE campaign_id = '<uuid>';
-- ============================================================
