create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  hide_disliked boolean not null default false,
  show_only_liked boolean not null default false
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_votes (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (quote_id, user_id)
);

create table if not exists public.quote_suggestions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_votes enable row level security;
alter table public.quote_suggestions enable row level security;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

create or replace function public.admin_list_profiles()
returns table(id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select p.id, p.email, p.role, p.created_at
  from public.profiles p
  order by p.created_at desc;
end;
$$;

grant execute on function public.admin_list_profiles() to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles update own or admin" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles read own" on public.profiles;
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

drop policy if exists "quotes public read approved" on public.quotes;
drop policy if exists "quotes admin insert" on public.quotes;
drop policy if exists "quotes admin update" on public.quotes;
drop policy if exists "quotes admin delete" on public.quotes;

create policy "quotes public read approved"
on public.quotes for select
using (status = 'approved' or public.is_admin(auth.uid()));

create policy "quotes admin insert"
on public.quotes for insert
with check (public.is_admin(auth.uid()));

create policy "quotes admin update"
on public.quotes for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "quotes admin delete"
on public.quotes for delete
using (public.is_admin(auth.uid()));

drop policy if exists "votes read all" on public.quote_votes;
drop policy if exists "votes insert own" on public.quote_votes;
drop policy if exists "votes update own" on public.quote_votes;
drop policy if exists "votes delete own or admin" on public.quote_votes;

create policy "votes read all"
on public.quote_votes for select
using (true);

create policy "votes insert own"
on public.quote_votes for insert
with check (auth.uid() = user_id);

create policy "votes update own"
on public.quote_votes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "votes delete own or admin"
on public.quote_votes for delete
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "suggestions insert anyone" on public.quote_suggestions;
drop policy if exists "suggestions read admin" on public.quote_suggestions;
drop policy if exists "suggestions admin update" on public.quote_suggestions;
drop policy if exists "suggestions admin delete" on public.quote_suggestions;

create policy "suggestions insert anyone"
on public.quote_suggestions for insert
with check (
  (auth.uid() is null and user_id is null)
  or auth.uid() = user_id
  or user_id is null
);

create policy "suggestions read admin"
on public.quote_suggestions for select
using (public.is_admin(auth.uid()));

create policy "suggestions admin update"
on public.quote_suggestions for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "suggestions admin delete"
on public.quote_suggestions for delete
using (public.is_admin(auth.uid()));
