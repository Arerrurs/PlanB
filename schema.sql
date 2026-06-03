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
  click_refresh_enabled boolean not null default false,
  privacy_mode_enabled boolean not null default false
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
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create table if not exists public.quote_collection_items (
  collection_id uuid not null references public.quote_collections(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, quote_id)
);

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Без заголовка',
  body text not null default '',
  mood text not null default 'calm',
  tags text[] not null default '{}',
  reveal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_votes enable row level security;
alter table public.quote_suggestions enable row level security;
alter table public.quote_collections enable row level security;
alter table public.quote_collection_items enable row level security;
alter table public.diary_entries enable row level security;

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
drop policy if exists "suggestions read own or admin" on public.quote_suggestions;
drop policy if exists "suggestions admin update" on public.quote_suggestions;
drop policy if exists "suggestions admin delete" on public.quote_suggestions;

create policy "suggestions insert anyone"
on public.quote_suggestions for insert
with check (
  (auth.uid() is null and user_id is null)
  or auth.uid() = user_id
  or user_id is null
);

create policy "suggestions read own or admin"
on public.quote_suggestions for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "suggestions admin update"
on public.quote_suggestions for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "suggestions admin delete"
on public.quote_suggestions for delete
using (public.is_admin(auth.uid()));

create policy "collections read own"
on public.quote_collections for select
using (auth.uid() = user_id);

create policy "collections insert own"
on public.quote_collections for insert
with check (auth.uid() = user_id);

create policy "collections update own"
on public.quote_collections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "collections delete own"
on public.quote_collections for delete
using (auth.uid() = user_id);

create policy "collection items read own"
on public.quote_collection_items for select
using (
  exists (
    select 1 from public.quote_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  )
);

create policy "collection items insert own"
on public.quote_collection_items for insert
with check (
  exists (
    select 1 from public.quote_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  )
);

create policy "collection items delete own"
on public.quote_collection_items for delete
using (
  exists (
    select 1 from public.quote_collections c
    where c.id = collection_id and c.user_id = auth.uid()
  )
);

drop policy if exists "diary read own" on public.diary_entries;
drop policy if exists "diary insert own" on public.diary_entries;
drop policy if exists "diary update own" on public.diary_entries;
drop policy if exists "diary delete own" on public.diary_entries;

create policy "diary read own"
on public.diary_entries for select
using (auth.uid() = user_id);

create policy "diary insert own"
on public.diary_entries for insert
with check (auth.uid() = user_id);

create policy "diary update own"
on public.diary_entries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "diary delete own"
on public.diary_entries for delete
using (auth.uid() = user_id);


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


drop function if exists public.admin_list_suggestions();

create or replace function public.admin_list_suggestions()
returns table(id uuid, text text, status text, created_at timestamptz, user_id uuid, email text, rejection_reason text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  select qs.id, qs.text, qs.status, qs.created_at, qs.user_id, p.email, qs.rejection_reason
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




-- chat contacts / requests / aliases
create table if not exists public.chat_contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(requester_id, target_id)
);

create table if not exists public.chat_contact_aliases (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  alias text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, contact_user_id)
);

alter table public.chat_contact_requests enable row level security;
alter table public.chat_contact_aliases enable row level security;

drop policy if exists "contact requests read own" on public.chat_contact_requests;
drop policy if exists "contact requests insert own" on public.chat_contact_requests;
drop policy if exists "contact requests update own" on public.chat_contact_requests;
drop policy if exists "contact aliases read own" on public.chat_contact_aliases;
drop policy if exists "contact aliases write own" on public.chat_contact_aliases;

create policy "contact requests read own" on public.chat_contact_requests for select using (auth.uid() = requester_id or auth.uid() = target_id);
create policy "contact requests insert own" on public.chat_contact_requests for insert with check (auth.uid() = requester_id);
create policy "contact requests update own" on public.chat_contact_requests for update using (auth.uid() = requester_id or auth.uid() = target_id) with check (auth.uid() = requester_id or auth.uid() = target_id);
create policy "contact aliases read own" on public.chat_contact_aliases for select using (auth.uid() = owner_id);
create policy "contact aliases write own" on public.chat_contact_aliases for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists chat_contact_requests_requester_idx on public.chat_contact_requests(requester_id, status);
create index if not exists chat_contact_requests_target_idx on public.chat_contact_requests(target_id, status);
create index if not exists chat_contact_aliases_owner_idx on public.chat_contact_aliases(owner_id);

create or replace function public.are_contacts(u1 uuid, u2 uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.chat_contact_requests r
    where r.status = 'accepted'
      and ((r.requester_id = u1 and r.target_id = u2) or (r.requester_id = u2 and r.target_id = u1))
  );
$$;

grant execute on function public.are_contacts(uuid, uuid) to authenticated;

create or replace function public.list_chat_directory()
returns table(
  id uuid,
  email text,
  username text,
  alias text,
  is_contact boolean,
  relation_status text,
  pending_direction text,
  request_id uuid,
  unread_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;

  return query
  with req as (
    select r.*,
      case when r.requester_id = auth.uid() then r.target_id else r.requester_id end as other_id,
      case when r.requester_id = auth.uid() then 'outgoing' else 'incoming' end as pending_direction
    from public.chat_contact_requests r
    where (r.requester_id = auth.uid() or r.target_id = auth.uid())
  ),
  conv as (
    select m2.user_id as other_id, m1.conversation_id, coalesce(m1.last_read_at, to_timestamp(0)) as last_read_at
    from public.chat_conversation_members m1
    join public.chat_conversation_members m2 on m2.conversation_id = m1.conversation_id and m2.user_id <> m1.user_id
    join public.chat_conversations c on c.id = m1.conversation_id and c.is_group = false
    where m1.user_id = auth.uid()
  ),
  unread as (
    select c.other_id, count(*)::bigint as unread_count
    from conv c
    join public.chat_messages msg on msg.conversation_id = c.conversation_id
    where msg.sender_id <> auth.uid() and msg.created_at > c.last_read_at
    group by c.other_id
  )
  select p.id,
         p.email,
         p.username,
         a.alias,
         public.are_contacts(auth.uid(), p.id) as is_contact,
         coalesce(r.status, 'none') as relation_status,
         r.pending_direction,
         r.id as request_id,
         coalesce(u.unread_count, 0) as unread_count
  from public.profiles p
  left join req r on r.other_id = p.id and r.status in ('pending','accepted')
  left join public.chat_contact_aliases a on a.owner_id = auth.uid() and a.contact_user_id = p.id
  left join unread u on u.other_id = p.id
  where p.id <> auth.uid()
  order by coalesce(a.alias, p.username, p.email);
end;
$$;

grant execute on function public.list_chat_directory() to authenticated;

create or replace function public.send_contact_request(p_target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_target_user is null or p_target_user = auth.uid() then raise exception 'invalid user'; end if;
  if public.are_contacts(auth.uid(), p_target_user) then raise exception 'already contacts'; end if;

  select id into v_id from public.chat_contact_requests
  where ((requester_id = auth.uid() and target_id = p_target_user) or (requester_id = p_target_user and target_id = auth.uid()))
    and status = 'pending'
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.chat_contact_requests(requester_id, target_id, status)
  values (auth.uid(), p_target_user, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.send_contact_request(uuid) to authenticated;

create or replace function public.respond_contact_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_req public.chat_contact_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into v_req from public.chat_contact_requests where id = p_request_id;
  if not found then raise exception 'not found'; end if;
  if v_req.target_id <> auth.uid() then raise exception 'not allowed'; end if;
  if v_req.status <> 'pending' then return; end if;

  update public.chat_contact_requests
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.respond_contact_request(uuid, boolean) to authenticated;

create or replace function public.set_contact_alias(p_contact_user uuid, p_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_contact_user is null or not public.are_contacts(auth.uid(), p_contact_user) then raise exception 'not allowed'; end if;
  insert into public.chat_contact_aliases(owner_id, contact_user_id, alias, updated_at)
  values (auth.uid(), p_contact_user, nullif(trim(p_alias), ''), now())
  on conflict (owner_id, contact_user_id)
  do update set alias = excluded.alias, updated_at = now();
end;
$$;

grant execute on function public.set_contact_alias(uuid, text) to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  update public.chat_conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.chat_notifications_summary()
returns table(unread bigint, requests bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  return query
  with conv as (
    select m2.user_id as other_id, m1.conversation_id, coalesce(m1.last_read_at, to_timestamp(0)) as last_read_at
    from public.chat_conversation_members m1
    join public.chat_conversation_members m2 on m2.conversation_id = m1.conversation_id and m2.user_id <> m1.user_id
    join public.chat_conversations c on c.id = m1.conversation_id and c.is_group = false
    where m1.user_id = auth.uid()
  ), unread_cte as (
    select count(*)::bigint as unread
    from conv c
    join public.chat_messages msg on msg.conversation_id = c.conversation_id
    where msg.sender_id <> auth.uid() and msg.created_at > c.last_read_at
  ), req_cte as (
    select count(*)::bigint as requests
    from public.chat_contact_requests
    where target_id = auth.uid() and status = 'pending'
  )
  select unread_cte.unread, req_cte.requests from unread_cte, req_cte;
end;
$$;

grant execute on function public.chat_notifications_summary() to authenticated;

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
  if not public.are_contacts(auth.uid(), p_other_user) then
    raise exception 'not contacts';
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
