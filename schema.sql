
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  role text not null default 'user',
  username text unique,
  light_accent text not null default '#c45aa5',
  dark_accent text not null default '#e88fc7',
  disable_timer boolean not null default false,
  liked_mode text not null default 'all',
  disliked_mode text not null default 'all',
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  status text not null default 'approved',
  created_by uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_votes (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('like','dislike')),
  created_at timestamptz not null default now(),
  unique(user_id, quote_id)
);

create table if not exists public.quote_suggestions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_votes enable row level security;
alter table public.quote_suggestions enable row level security;

create policy "profiles read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "quotes public read" on public.quotes for select using (status = 'approved' or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "quotes admin write" on public.quotes for all using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "votes own read" on public.quote_votes for select using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "votes own write" on public.quote_votes for all using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "quote_suggestions insert own" on public.quote_suggestions for insert with check (auth.uid() = user_id);
create policy "quote_suggestions read own or admin" on public.quote_suggestions for select using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
