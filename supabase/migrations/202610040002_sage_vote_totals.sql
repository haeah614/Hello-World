-- Expose public aggregate vote totals without exposing individual voter rows.
create or replace function public.get_plan_vote_totals(plan_ids uuid[])
returns table (plan_id uuid, positive_votes bigint, negative_votes bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id,
        count(v.id) filter (where v.value = 1),
        count(v.id) filter (where v.value = -1)
    from public.plans p
    left join public.votes v on v.plan_id = p.id
    where p.id = any(plan_ids)
    group by p.id;
$$;

revoke all on function public.get_plan_vote_totals(uuid[]) from public;
grant execute on function public.get_plan_vote_totals(uuid[]) to anon, authenticated;
