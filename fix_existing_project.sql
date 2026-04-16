
-- v17 fix_existing_project.sql

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists light_accent text not null default '#c45aa5';
alter table public.profiles add column if not exists dark_accent text not null default '#e88fc7';
alter table public.profiles add column if not exists disable_timer boolean not null default false;
alter table public.profiles add column if not exists liked_mode text not null default 'all';
alter table public.profiles add column if not exists disliked_mode text not null default 'all';

create unique index if not exists profiles_username_unique_idx
on public.profiles (username)
where username is not null;

create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists quote_votes_user_quote_idx on public.quote_votes (user_id, quote_id);
create index if not exists quotes_status_idx on public.quotes (status);

update public.profiles
set
  light_accent = coalesce(light_accent, '#c45aa5'),
  dark_accent = coalesce(dark_accent, '#e88fc7'),
  disable_timer = coalesce(disable_timer, false),
  liked_mode = coalesce(liked_mode, 'all'),
  disliked_mode = coalesce(disliked_mode, 'all');

-- If your quote_suggestions policies are missing:
alter table public.quote_suggestions enable row level security;

drop policy if exists "quote_suggestions insert own" on public.quote_suggestions;
create policy "quote_suggestions insert own"
on public.quote_suggestions
for insert
with check (auth.uid() = user_id);

drop policy if exists "quote_suggestions read own or admin" on public.quote_suggestions;
create policy "quote_suggestions read own or admin"
on public.quote_suggestions
for select
using (auth.uid() = user_id or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

-- Make sure profiles policies are simple and non-recursive:
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

create policy "profiles read own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles insert own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles update own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);
