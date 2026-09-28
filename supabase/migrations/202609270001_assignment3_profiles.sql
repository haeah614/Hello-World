-- Assignment 3 profile data and avatar storage.
-- This migration does not touch movies or any RLS policy.

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    first_name text,
    last_name text,
    avatar_path text,
    created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    metadata_name text;
begin
    metadata_name := coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '');
    insert into public.profiles (id, first_name, last_name)
    values (
        new.id,
        coalesce(nullif(new.raw_user_meta_data ->> 'given_name', ''), nullif(split_part(metadata_name, ' ', 1), '')),
        coalesce(nullif(new.raw_user_meta_data ->> 'family_name', ''), nullif(trim(substr(metadata_name, length(split_part(metadata_name, ' ', 1)) + 1)), ''))
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'on_auth_user_created_create_profile'
          and tgrelid = 'auth.users'::regclass
          and not tgisinternal
    ) then
        create trigger on_auth_user_created_create_profile
            after insert on auth.users
            for each row execute function public.create_profile_for_new_user();
    end if;
end;
$$;

-- Also create a missing row for the account already used by this assignment.
insert into public.profiles (id, first_name, last_name)
select
    u.id,
    coalesce(nullif(u.raw_user_meta_data ->> 'given_name', ''), nullif(split_part(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', ''), ' ', 1), '')),
    coalesce(
        nullif(u.raw_user_meta_data ->> 'family_name', ''),
        nullif(trim(substr(
            coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', ''),
            length(split_part(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', ''), ' ', 1)) + 1
        )), '')
    )
from auth.users as u
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
