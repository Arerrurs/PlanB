create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
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

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid and role = 'admin'
  );
$$;

create policy if not exists "profiles read own or admin"
on public.profiles for select
using (auth.uid() = id or public.is_admin(auth.uid()));

create policy if not exists "profiles insert own"
on public.profiles for insert
with check (auth.uid() = id);

create policy if not exists "profiles update own or admin"
on public.profiles for update
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

create policy if not exists "quotes public read approved"
on public.quotes for select
using (status = 'approved' or public.is_admin(auth.uid()));

create policy if not exists "quotes admin insert"
on public.quotes for insert
with check (public.is_admin(auth.uid()));

create policy if not exists "quotes admin update"
on public.quotes for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy if not exists "quotes admin delete"
on public.quotes for delete
using (public.is_admin(auth.uid()));

create policy if not exists "votes read all"
on public.quote_votes for select
using (true);

create policy if not exists "votes insert own"
on public.quote_votes for insert
with check (auth.uid() = user_id);

create policy if not exists "votes update own"
on public.quote_votes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "votes delete own or admin"
on public.quote_votes for delete
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy if not exists "suggestions insert anyone"
on public.quote_suggestions for insert
with check (true);

create policy if not exists "suggestions read admin"
on public.quote_suggestions for select
using (public.is_admin(auth.uid()));

create policy if not exists "suggestions admin update"
on public.quote_suggestions for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy if not exists "suggestions admin delete"
on public.quote_suggestions for delete
using (public.is_admin(auth.uid()));
