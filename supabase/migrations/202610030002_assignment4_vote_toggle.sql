-- Allow signed-in users to cancel only their own SAGE vote.
grant delete on table public.votes to authenticated;

drop policy if exists "Users can delete their own votes" on public.votes;
create policy "Users can delete their own votes"
    on public.votes for delete to authenticated
    using (user_id = (select auth.uid()));
