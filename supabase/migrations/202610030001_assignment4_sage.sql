-- Assignment 4: SAGE community generations and voting.
-- Safe to apply once; preserves movies SELECT behavior and the profile photo Storage policy.

alter table public.profiles enable row level security;
alter table public.movies enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
    on public.profiles for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

-- Retain read-only public movie catalogue access required by the existing app.
drop policy if exists "Enable read access for all users" on public.movies;
create policy "Enable read access for all users"
    on public.movies for select to public using (true);

create table if not exists public.generations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    prompt text not null check (char_length(prompt) between 8 and 1000),
    constraints jsonb not null default '{}'::jsonb,
    provider text not null default 'google-gemini',
    model text not null,
    created_at timestamptz not null default now(),
    constraint generations_id_user_id_key unique (id, user_id)
);

create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    generation_id uuid not null references public.generations (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 100),
    description text not null check (char_length(description) between 1 and 280),
    why_it_fits text not null check (char_length(why_it_fits) between 1 and 350),
    place_id text not null,
    place_name text not null,
    address text,
    rating numeric(2,1) check (rating is null or rating between 0 and 5),
    review_count integer check (review_count is null or review_count >= 0),
    price_level smallint check (price_level is null or price_level between 0 and 4),
    place_url text,
    place_types text[] not null default '{}',
    created_at timestamptz not null default now(),
    constraint plans_generation_owner_fk foreign key (generation_id, user_id)
        references public.generations (id, user_id) on delete cascade
);

create table if not exists public.votes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    plan_id uuid not null references public.plans (id) on delete cascade,
    value smallint not null default 1 check (value in (-1, 1)),
    created_at timestamptz not null default now(),
    constraint votes_one_per_user_per_plan unique (user_id, plan_id)
);

create index if not exists generations_created_at_idx on public.generations (created_at desc);
create index if not exists generations_user_created_idx on public.generations (user_id, created_at desc);
create index if not exists plans_created_at_idx on public.plans (created_at desc);
create index if not exists plans_generation_id_idx on public.plans (generation_id);
create index if not exists votes_plan_value_idx on public.votes (plan_id, value);

alter table public.generations enable row level security;
alter table public.plans enable row level security;
alter table public.votes enable row level security;

-- Keep API grants narrow as well as row policies. The profile auth trigger is
-- SECURITY DEFINER and can still create rows without client INSERT access.
revoke all on table public.profiles from anon, authenticated;
grant select (id, first_name, last_name, avatar_path, created_at)
    on table public.profiles to authenticated;
grant update (first_name, last_name, avatar_path)
    on table public.profiles to authenticated;

revoke all on table public.movies from anon, authenticated;
grant select on table public.movies to anon, authenticated;

revoke all on table public.generations from anon, authenticated;
grant select (id, user_id, prompt, constraints, provider, model, created_at)
    on table public.generations to authenticated;
grant insert (user_id, prompt, constraints, provider, model)
    on table public.generations to authenticated;
grant delete on table public.generations to authenticated;

revoke all on table public.plans from anon, authenticated;
grant select (id, title, description, why_it_fits, place_name, address,
    rating, review_count, price_level, place_url, place_types, created_at)
    on table public.plans to anon, authenticated;
grant insert (generation_id, user_id, title, description, why_it_fits,
    place_id, place_name, address, rating, review_count, price_level,
    place_url, place_types)
    on table public.plans to authenticated;
grant delete on table public.plans to authenticated;

revoke all on table public.votes from anon, authenticated;
grant select (id, user_id, plan_id, value, created_at)
    on table public.votes to authenticated;
grant insert (user_id, plan_id, value)
    on table public.votes to authenticated;

drop policy if exists "Users can read their own generations" on public.generations;
create policy "Users can read their own generations"
    on public.generations for select to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own generations" on public.generations;
create policy "Users can create their own generations"
    on public.generations for insert to authenticated
    with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own generations" on public.generations;
create policy "Users can delete their own generations"
    on public.generations for delete to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists "Plans are readable by everyone" on public.plans;
create policy "Plans are readable by everyone"
    on public.plans for select to public using (true);

drop policy if exists "Users can create plans for their own generations" on public.plans;
create policy "Users can create plans for their own generations"
    on public.plans for insert to authenticated
    with check (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.generations g
            where g.id = generation_id and g.user_id = (select auth.uid())
        )
    );

drop policy if exists "Users can delete their own plans" on public.plans;
create policy "Users can delete their own plans"
    on public.plans for delete to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists "Users can read their own votes" on public.votes;
create policy "Users can read their own votes"
    on public.votes for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can vote for themselves" on public.votes;
create policy "Authenticated users can vote for themselves"
    on public.votes for insert to authenticated
    with check (user_id = (select auth.uid()));

-- No vote UPDATE/DELETE policies: submitted votes are immutable.

-- Expose aggregate counts without exposing the identities behind individual votes.
create or replace function public.get_plan_vote_counts(plan_ids uuid[])
returns table (plan_id uuid, upvotes bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select p.id, count(v.id) filter (where v.value = 1)
    from public.plans p
    left join public.votes v on v.plan_id = p.id
    where p.id = any(plan_ids)
    group by p.id;
$$;

revoke all on function public.get_plan_vote_counts(uuid[]) from public;
grant execute on function public.get_plan_vote_counts(uuid[]) to anon, authenticated;
