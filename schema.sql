create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  hide_disliked boolean not null default false,
  hide_liked boolean not null default false,
  show_only_liked boolean not null default false,
  light_accent text not null default '#a855f7',
  dark_accent text not null default '#f472b6',
  disable_timer boolean not null default false,
  click_refresh_enabled boolean not null default false
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


create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_conversation_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat conversations by membership" on public.chat_conversations;
drop policy if exists "chat members by membership" on public.chat_conversation_members;
drop policy if exists "chat messages by membership" on public.chat_messages;

create policy "chat conversations by membership"
on public.chat_conversations for select
using (exists (
  select 1 from public.chat_conversation_members m
  where m.conversation_id = id and m.user_id = auth.uid()
));

create policy "chat members by membership"
on public.chat_conversation_members for select
using (exists (
  select 1 from public.chat_conversation_members m
  where m.conversation_id = conversation_id and m.user_id = auth.uid()
));

create policy "chat messages by membership"
on public.chat_messages for select
using (exists (
  select 1 from public.chat_conversation_members m
  where m.conversation_id = conversation_id and m.user_id = auth.uid()
));

create or replace function public.list_chat_users()
returns table(id uuid, email text, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;

  return query
  select p.id, p.email, p.username
  from public.profiles p
  where p.id <> auth.uid()
  order by coalesce(nullif(p.username,''), p.email);
end;
$$;

grant execute on function public.list_chat_users() to authenticated;

create or replace function public.get_or_create_direct_conversation(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;
  if p_other_user is null or p_other_user = auth.uid() then
    raise exception 'invalid user';
  end if;

  select c.id into v_conversation_id
  from public.chat_conversations c
  join public.chat_conversation_members m1 on m1.conversation_id = c.id and m1.user_id = auth.uid()
  join public.chat_conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_other_user
  where c.is_group = false
  limit 1;

  if v_conversation_id is null then
    insert into public.chat_conversations default values returning id into v_conversation_id;
    insert into public.chat_conversation_members(conversation_id, user_id)
    values (v_conversation_id, auth.uid()), (v_conversation_id, p_other_user);
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.list_conversation_messages(p_conversation_id uuid)
returns table(id uuid, sender_id uuid, sender_name text, text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;
  if not exists (
    select 1 from public.chat_conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;

  return query
  select m.id,
         m.sender_id,
         coalesce(p.username, p.email, 'Пользователь') as sender_name,
         m.text,
         m.created_at
  from public.chat_messages m
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.list_conversation_messages(uuid) to authenticated;

create or replace function public.send_chat_message(p_conversation_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;
  if not exists (
    select 1 from public.chat_conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'not allowed';
  end if;
  if trim(coalesce(p_text,'')) = '' then
    raise exception 'empty message';
  end if;

  insert into public.chat_messages(conversation_id, sender_id, text)
  values (p_conversation_id, auth.uid(), trim(p_text))
  returning id into v_id;

  update public.chat_conversations
  set updated_at = now()
  where id = p_conversation_id;

  return v_id;
end;
$$;

grant execute on function public.send_chat_message(uuid, text) to authenticated;

create index if not exists chat_members_user_idx on public.chat_conversation_members(user_id);
create index if not exists chat_messages_conversation_idx on public.chat_messages(conversation_id, created_at);
