-- Week 5: private bookmarks, independent of votes. Apply manually after review.
begin;
create table public.saved_places (
    user_id uuid not null references auth.users (id) on delete cascade,
    plan_id uuid not null references public.plans (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, plan_id)
);
create index saved_places_user_created_idx on public.saved_places (user_id, created_at desc, plan_id);
create index saved_places_plan_idx on public.saved_places (plan_id);
alter table public.saved_places enable row level security;
revoke all on public.saved_places from public, anon, authenticated;
grant select, insert, delete on public.saved_places to authenticated;
create policy "Read own saved places" on public.saved_places
    for select to authenticated using (user_id = (select auth.uid()));
create policy "Save places for yourself" on public.saved_places
    for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Remove own saved places" on public.saved_places
    for delete to authenticated using (user_id = (select auth.uid()));
commit;
