-- ============ CORE: SCHEMA & TABLES ============

-- Use built-in md5() for hashes (no extra extensions required)

-- 1) Category (seeded with your 6 categories)
create table if not exists public.category (
  id smallserial primary key,
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.category (slug, name) values
  ('business','Business'),
  ('finance','Finance'),
  ('markets','Markets'),
  ('startups','Startups'),
  ('tech','Tech'),
  ('politics','Politics')
on conflict (slug) do nothing;

-- 2) Article (one row per unique URL)
create table if not exists public.article (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  url_hash text generated always as (md5(lower(url))) stored,
  source_name text not null,
  source_domain text,
  title text not null,
  category_id smallint not null references public.category(id) on delete restrict,
  published_at timestamptz not null,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_article_cat_pub on public.article (category_id, published_at desc);
create index if not exists idx_article_urlhash on public.article (url_hash);

-- 3) Summary (5 bullets + why-it-matters)
create table if not exists public.summary (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null unique references public.article(id) on delete cascade,
  bullets jsonb not null,
  why_it_matters text not null,
  model_version text not null,
  quality_score numeric(3,2) not null default 0.00,
  created_at timestamptz not null default now(),
  constraint bullets_is_array check (jsonb_typeof(bullets) = 'array'),
  constraint bullets_len_5 check (jsonb_array_length(bullets) = 5)
);

create index if not exists idx_summary_article on public.summary (article_id);

-- 4) Profile (user plan/entitlements) — one row per auth user
--    NOTE: auth.users is managed by Supabase Auth
create table if not exists public.profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  entitlement_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5) Bookmark (user saves stories)
create table if not exists public.bookmark (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.article(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);

create index if not exists idx_bookmark_user on public.bookmark (user_id);

-- 6) Feedback (like/dislike/too_long/irrelevant)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  article_id uuid not null references public.article(id) on delete cascade,
  rating text not null check (rating in ('up','down','too_long','irrelevant')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_article on public.feedback (article_id);
create index if not exists idx_feedback_user on public.feedback (user_id);

-- ============ SECURITY: RLS POLICIES ============

-- Server-only tables (clients must NOT hit these directly).
-- Service role (your server key) bypasses RLS automatically.

alter table public.article enable row level security;
alter table public.summary enable row level security;

-- No policies for article/summary => locked to clients; server can read/write via service role.

-- User-scoped tables: allow only the owner to read/write their own rows.

alter table public.profile enable row level security;
create policy "profile_read_own"
  on public.profile for select
  using (auth.uid() = user_id);
create policy "profile_update_own"
  on public.profile for update
  using (auth.uid() = user_id);

alter table public.bookmark enable row level security;
create policy "bookmark_read_own"
  on public.bookmark for select
  using (auth.uid() = user_id);
create policy "bookmark_insert_own"
  on public.bookmark for insert
  with check (auth.uid() = user_id);
create policy "bookmark_delete_own"
  on public.bookmark for delete
  using (auth.uid() = user_id);

alter table public.feedback enable row level security;
create policy "feedback_read_own"
  on public.feedback for select
  using (auth.uid() = user_id);
create policy "feedback_insert_own"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Optional hygiene: prevent anonymous public from listing entire tables by default
revoke all on table public.article from anon, authenticated;
revoke all on table public.summary from anon, authenticated;
