create extension if not exists pgcrypto;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists hide_disliked boolean not null default false;
alter table public.profiles add column if not exists hide_liked boolean not null default false;
alter table public.profiles add column if not exists show_only_liked boolean not null default false;
alter table public.profiles add column if not exists light_accent text not null default '#a855f7';
alter table public.profiles add column if not exists dark_accent text not null default '#f472b6';
alter table public.profiles add column if not exists disable_timer boolean not null default false;

alter table public.quotes add column if not exists updated_at timestamptz not null default now();

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

create or replace function public.admin_list_suggestions()
returns table(id uuid, text text, status text, created_at timestamptz, user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select qs.id, qs.text, qs.status, qs.created_at, qs.user_id, p.email
  from public.quote_suggestions qs
  left join public.profiles p on p.id = qs.user_id
  order by qs.created_at desc;
end;
$$;

grant execute on function public.admin_list_suggestions() to authenticated;


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


create or replace function public.admin_quote_vote_details(p_quote_id uuid, p_vote text)
returns table(user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select p.id, p.email, p.role, qv.created_at
  from public.quote_votes qv
  left join public.profiles p on p.id = qv.user_id
  where qv.quote_id = p_quote_id
    and qv.vote = p_vote
  order by qv.created_at desc;
end;
$$;

grant execute on function public.admin_quote_vote_details(uuid, text) to authenticated;

create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username)) where username is not null;

create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when strpos(trim(p_identifier), '@') > 0 then lower(trim(p_identifier))
    else (
      select email
      from public.profiles
      where lower(username) = lower(trim(p_identifier))
      limit 1
    )
  end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
