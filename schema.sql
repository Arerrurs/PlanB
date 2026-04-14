-- Вставь это в SQL Editor Supabase и выполни целиком.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  like_count integer not null default 0,
  dislike_count integer not null default 0,
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
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
  before update on public.quotes
  for each row execute procedure public.set_updated_at();

create or replace function public.recalculate_quote_counts(p_quote_id uuid)
returns void
language plpgsql
as $$
begin
  update public.quotes q
     set like_count = coalesce((select count(*) from public.quote_votes v where v.quote_id = p_quote_id and v.vote = 'like'), 0),
         dislike_count = coalesce((select count(*) from public.quote_votes v where v.quote_id = p_quote_id and v.vote = 'dislike'), 0),
         updated_at = now()
   where q.id = p_quote_id;
end;
$$;

create or replace function public.handle_vote_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_quote_counts(new.quote_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.recalculate_quote_counts(new.quote_id);
    if old.quote_id is distinct from new.quote_id then
      perform public.recalculate_quote_counts(old.quote_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.recalculate_quote_counts(old.quote_id);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists quote_votes_recount_insert on public.quote_votes;
drop trigger if exists quote_votes_recount_update on public.quote_votes;
drop trigger if exists quote_votes_recount_delete on public.quote_votes;

create trigger quote_votes_recount_insert
  after insert on public.quote_votes
  for each row execute procedure public.handle_vote_change();

create trigger quote_votes_recount_update
  after update on public.quote_votes
  for each row execute procedure public.handle_vote_change();

create trigger quote_votes_recount_delete
  after delete on public.quote_votes
  for each row execute procedure public.handle_vote_change();

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_votes enable row level security;
alter table public.quote_suggestions enable row level security;

-- PROFILES
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (auth.uid() = id or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

create policy "profiles_update_own_or_admin"
on public.profiles
for update
using (auth.uid() = id or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
))
with check (auth.uid() = id or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

-- QUOTES
create policy "quotes_public_read_approved"
on public.quotes
for select
using (
  status = 'approved'
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "quotes_admin_insert"
on public.quotes
for insert
with check (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

create policy "quotes_admin_update"
on public.quotes
for update
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

create policy "quotes_admin_delete"
on public.quotes
for delete
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

-- QUOTE_VOTES
create policy "votes_user_read_own_or_admin"
on public.quote_votes
for select
using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "votes_user_insert_own"
on public.quote_votes
for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.quotes q where q.id = quote_id and q.status = 'approved')
);

create policy "votes_user_update_own"
on public.quote_votes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "votes_user_delete_own_or_admin"
on public.quote_votes
for delete
using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- SUGGESTIONS
create policy "suggestions_insert_anyone"
on public.quote_suggestions
for insert
with check (true);

create policy "suggestions_user_read_own_or_admin"
on public.quote_suggestions
for select
using (
  user_id = auth.uid()
  or user_id is null
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "suggestions_admin_update"
on public.quote_suggestions
for update
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
))
with check (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

create policy "suggestions_admin_delete"
on public.quote_suggestions
for delete
using (exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
));

-- Опционально: первая тестовая цитата.
insert into public.quotes (text, status)
values ('Кто рано встает — тот раньше всех на хуй идет', 'approved')
on conflict do nothing;

-- После регистрации первого аккаунта сделай его админом вручную:
-- update public.profiles set role = 'admin' where email = 'твой@email';
