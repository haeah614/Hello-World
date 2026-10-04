import { createClient } from "@/lib/supabase-server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Sign in to vote on a plan." }, { status: 401 });
    let body: { planId?: unknown; value?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Please submit a valid vote." }, { status: 400 }); }
    if (typeof body.planId !== "string" || !uuidPattern.test(body.planId) || (body.value !== 1 && body.value !== -1)) return Response.json({ error: "That vote is not valid." }, { status: 400 });

    const { data: existingVote, error: lookupError } = await supabase
        .from("votes")
        .select("id,value")
        .eq("user_id", user.id)
        .eq("plan_id", body.planId)
        .maybeSingle();
    if (lookupError) return Response.json({ error: "We couldn’t update your vote. Please try again." }, { status: 400 });

    let vote: 1 | -1 | null;
    if (existingVote) {
        if (existingVote.value !== body.value) {
            const { error } = await supabase
                .from("votes")
                .delete()
                .eq("user_id", user.id)
                .eq("plan_id", body.planId);
            if (error) return Response.json({ error: "We couldn’t update your vote. Please try again." }, { status: 400 });

            const { error: insertError } = await supabase.from("votes").insert({ user_id: user.id, plan_id: body.planId, value: body.value });
            if (insertError) return Response.json({ error: "We couldn’t update your vote. Please try again." }, { status: 400 });
            vote = body.value;
        } else {
            const { error } = await supabase
                .from("votes")
                .delete()
                .eq("user_id", user.id)
                .eq("plan_id", body.planId);
            if (error) return Response.json({ error: "We couldn’t update your vote. Please try again." }, { status: 400 });
            vote = null;
        }
    } else {
        const { error } = await supabase.from("votes").insert({ user_id: user.id, plan_id: body.planId, value: body.value });
        if (error?.code === "23505") return Response.json({ error: "You’ve already voted for this plan." }, { status: 409 });
        if (error) return Response.json({ error: "We couldn’t save your vote. Please try again." }, { status: 400 });
        vote = body.value;
    }

    const { data: totals, error: countError } = await supabase.rpc("get_plan_vote_counts", { plan_ids: [body.planId] });
    if (countError) return Response.json({ vote, upvotes: null });
    return Response.json({ vote, upvotes: totals?.[0]?.upvotes ?? 0 });
}
