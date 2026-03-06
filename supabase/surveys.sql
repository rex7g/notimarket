-- ============================================================
-- TuNoti – Surveys (Encuestas) Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- Self-contained: safe to run independently or after schema.sql
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ─── Helper: is_admin() ──────────────────────────────────────
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ─── Surveys table ───────────────────────────────────────────
-- questions format: [{ id, question, options: [{ id, text }] }]
-- NOTE: options no longer store votes – results come from survey_responses
create table if not exists public.surveys (
  id               uuid        primary key default gen_random_uuid(),
  title            text        not null,
  description      text,
  topic            text        not null default 'política',
  province         text,
  status           text        not null default 'active'
                               check (status in ('active', 'closed', 'draft')),
  questions        jsonb       not null default '[]',
  total_responses  integer     not null default 0,
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table  public.surveys           is 'Admin-created surveys – questions are definitions only, votes live in survey_responses';
comment on column public.surveys.questions is '[{id, question, options:[{id, text}]}] — no vote tallies here';

-- ─── Surveys RLS ─────────────────────────────────────────────
alter table public.surveys enable row level security;

create policy "Surveys: public read active"
  on public.surveys for select
  using (status = 'active' or public.is_admin());

create policy "Surveys: admin insert"
  on public.surveys for insert
  with check (public.is_admin());

create policy "Surveys: admin update"
  on public.surveys for update
  using  (public.is_admin())
  with check (public.is_admin());

create policy "Surveys: admin delete"
  on public.surveys for delete
  using (public.is_admin());

-- ─── Surveys indexes ─────────────────────────────────────────
create index if not exists surveys_status_idx     on public.surveys (status);
create index if not exists surveys_topic_idx      on public.surveys (topic);
create index if not exists surveys_created_at_idx on public.surveys (created_at desc);

-- ─── Survey Responses table ──────────────────────────────────
-- answers format: [{ question_id, option_id, option_index }]
-- This is the single source of truth for all vote data.
create table if not exists public.survey_responses (
  id             uuid        primary key default gen_random_uuid(),
  survey_id      uuid        not null references public.surveys(id) on delete cascade,
  user_id        uuid        not null references auth.users(id)    on delete cascade,
  answers        jsonb       not null,
  province       text,
  captcha_score  numeric(3,2),
  created_at     timestamptz not null default now(),
  unique (survey_id, user_id)
);

comment on table  public.survey_responses         is 'Single source of truth for all survey votes – one immutable row per user per survey';
comment on column public.survey_responses.answers is '[{question_id, option_id, option_index}]';

-- ─── Survey Responses RLS ────────────────────────────────────
alter table public.survey_responses enable row level security;

create policy "SurveyResp: user insert own"
  on public.survey_responses for insert
  with check (auth.uid() = user_id);

create policy "SurveyResp: user reads own"
  on public.survey_responses for select
  using (auth.uid() = user_id or public.is_admin());

-- ─── Survey Responses indexes ────────────────────────────────
create index if not exists survey_resp_survey_idx  on public.survey_responses (survey_id);
create index if not exists survey_resp_user_idx    on public.survey_responses (user_id);
create index if not exists survey_resp_created_idx on public.survey_responses (created_at desc);

-- ─── Trigger: increment total_responses counter only ─────────
-- Votes are NOT tallied into questions JSONB.
-- Use get_survey_results() to get option-level counts.
create or replace function public.handle_new_survey_response()
returns trigger as $$
begin
  update public.surveys
    set total_responses = total_responses + 1
    where id = new.survey_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_survey_response_created on public.survey_responses;
create trigger on_survey_response_created
  after insert on public.survey_responses
  for each row execute procedure public.handle_new_survey_response();

-- ─── RPC: get_survey_results ─────────────────────────────────
-- Returns aggregated vote counts per option for a given survey.
-- Security definer so any authenticated user can see totals
-- without being able to read individual survey_responses rows.
create or replace function public.get_survey_results(p_survey_id uuid)
returns table(question_id text, option_id text, vote_count bigint)
language sql security definer stable as $$
  select
    a->>'question_id' as question_id,
    a->>'option_id'   as option_id,
    count(*)          as vote_count
  from public.survey_responses,
       lateral jsonb_array_elements(answers) as a
  where survey_id = p_survey_id
  group by a->>'question_id', a->>'option_id';
$$;

-- ============================================================
-- USAGE NOTES
-- ============================================================
-- • Close a survey:
--     update public.surveys set status = 'closed' where id = '<uuid>';
--
-- • Get results for a survey (from any authenticated client):
--     select * from get_survey_results('<survey-uuid>');
--
-- • Grant admin role:
--     insert into public.profiles (id, full_name, avatar_url, role)
--     select id,
--       coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
--       raw_user_meta_data->>'avatar_url', 'admin'
--     from auth.users where email = 'tu@email.com'
--     on conflict (id) do update set role = 'admin';
-- ============================================================
