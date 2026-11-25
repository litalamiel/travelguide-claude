-- Travel Maps: the learning memory for reel place detection.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what's missing and replaces the views/functions.

create extension if not exists pg_trgm with schema extensions;

-- One row per reel place a user confirmed, fixed or turned down. This is the training data.
create table if not exists public.reel_lessons (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  shortcode        text not null,              -- Instagram reel code, e.g. DbPx1ASMShs
  author           text,                       -- creator handle, without @
  caption          text,
  caption_en       text,                       -- English caption when the original is in another language
  thumb            text,                       -- small cover image (JPEG data URL), kept for training a vision model later
  flow             text not null default 'single' check (flow in ('single','bulk')),
  method           text not null default 'rules' check (method in ('memory','ai','rules','none')),
  guess            jsonb,                      -- what the app suggested first: {name,address,lat,lng,category}
  final            jsonb,                      -- what the user saved (null when turned down)
  outcome          text not null check (outcome in ('confirmed','fixed','rejected')),
  place_correct    boolean,                    -- first guess was the right place (within ~150 m or same name)
  category_correct boolean,                    -- first guess had the right category
  ai               jsonb,                      -- Claude's reading, when it was used
  client_id        text,                       -- anonymous random id per browser
  app_version      text
);
create index if not exists reel_lessons_shortcode on public.reel_lessons (shortcode);
create index if not exists reel_lessons_author on public.reel_lessons (author);
create index if not exists reel_lessons_created on public.reel_lessons (created_at desc);
create index if not exists reel_lessons_caption_trgm on public.reel_lessons using gin (caption gin_trgm_ops);

-- Only the app's server (secret key) can read or write. The public anon key sees nothing.
alter table public.reel_lessons enable row level security;

-- Shared memory: the answer people confirmed for each reel. Fixes count the same as confirms.
-- `rejections` counts the times this answer was suggested and turned down; the app only trusts
-- answers confirmed more often than turned down.
create or replace view public.reel_answers with (security_invoker = true) as
with kept as (
  select shortcode,
         min(final->>'name')                                       as name,
         avg((final->>'lat')::float8)                              as lat,
         avg((final->>'lng')::float8)                              as lng,
         mode() within group (order by final->>'category')         as category,
         min(final->>'address')                                    as address,
         count(*)                                                  as confirmations,
         max(created_at)                                           as last_confirmed
  from public.reel_lessons
  where final is not null
  group by shortcode, lower(final->>'name'), round((final->>'lat')::numeric, 3), round((final->>'lng')::numeric, 3)
)
select k.*,
       (select count(*) from public.reel_lessons r
         where r.shortcode = k.shortcode and r.outcome = 'rejected'
           and lower(r.guess->>'name') = lower(k.name))            as rejections
from kept k;

-- What each creator usually posts: their usual category and how often the app gets them right.
create or replace view public.creator_habits with (security_invoker = true) as
select author,
       count(*)                                                    as lessons,
       mode() within group (order by final->>'category')           as usual_category,
       round(avg(case when place_correct then 1 else 0 end)::numeric * 100) as first_guess_right_pct,
       max(created_at)                                             as last_seen
from public.reel_lessons
where author is not null and final is not null
group by author;

-- The score: how often the first guess was right, per day and per method.
create or replace view public.accuracy_daily with (security_invoker = true) as
select date_trunc('day', created_at)::date                         as day,
       method,
       count(*)                                                    as reels,
       round(avg(case when place_correct then 1 else 0 end)::numeric * 100)    as place_right_pct,
       round(avg(case when category_correct then 1 else 0 end)::numeric * 100) as category_right_pct,
       round(avg(case when place_correct and category_correct then 1 else 0 end)::numeric * 100) as both_right_pct,
       count(*) filter (where outcome = 'rejected')                as turned_down
from public.reel_lessons
group by 1, 2
order by 1 desc, 2;

create or replace view public.accuracy_summary with (security_invoker = true) as
select period,
       count(*)                                                    as reels,
       round(avg(case when place_correct then 1 else 0 end)::numeric * 100)    as place_right_pct,
       round(avg(case when category_correct then 1 else 0 end)::numeric * 100) as category_right_pct,
       round(avg(case when place_correct and category_correct then 1 else 0 end)::numeric * 100) as both_right_pct
from (
  select '1. last 7 days' as period, * from public.reel_lessons where created_at > now() - interval '7 days'
  union all select '2. last 30 days', * from public.reel_lessons where created_at > now() - interval '30 days'
  union all select '3. all time', * from public.reel_lessons
) t
group by period
order by period;

-- What still fails: the latest reels where the first guess was wrong.
create or replace view public.recent_misses with (security_invoker = true) as
select created_at, shortcode, author, method,
       guess->>'name' as guessed, guess->>'category' as guessed_category,
       final->>'name' as answer, final->>'category' as answer_category,
       outcome, left(caption, 200) as caption
from public.reel_lessons
where outcome <> 'confirmed'
order by created_at desc
limit 200;

-- The most similar past lessons to a new caption, shown to Claude as examples before it guesses.
-- Same creator and fixes (the app was wrong) rank higher, because those teach the most.
create or replace function public.similar_lessons(q text, who text default null, k int default 6)
returns table (shortcode text, author text, caption text, guess jsonb, final jsonb, outcome text, score real)
language sql stable
set search_path = public, extensions
as $$
  select * from (
    select distinct on (l.shortcode) l.shortcode, l.author, l.caption, l.guess, l.final, l.outcome,
           (similarity(l.caption, q)
             + case when who is not null and l.author = who then 0.3 else 0 end
             + case when l.outcome = 'fixed' then 0.1 else 0 end)::real as score
    from public.reel_lessons l
    where l.final is not null and l.caption is not null
    order by l.shortcode, l.created_at desc
  ) s
  order by score desc
  limit greatest(1, least(k, 12));
$$;

revoke all on public.reel_lessons, public.reel_answers, public.creator_habits, public.accuracy_daily,
              public.accuracy_summary, public.recent_misses from anon, authenticated;
revoke execute on function public.similar_lessons(text, text, int) from public, anon, authenticated;
grant execute on function public.similar_lessons(text, text, int) to service_role;
