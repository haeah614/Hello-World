import { createClient } from "@/lib/supabase-server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Sign in to save places." }, { status: 401 });
    let body: { planId?: unknown; saved?: unknown };
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid save request." }, { status: 400 }); }
    if (!body || typeof body.planId !== "string" || !uuidPattern.test(body.planId) || typeof body.saved !== "boolean") {
        return Response.json({ error: "Invalid save request." }, { status: 400 });
    }
    // Explicit desired state makes retries safe. Ownership always comes from auth.
    const { error } = body.saved
        ? await supabase.from("saved_places").upsert({ user_id: user.id, plan_id: body.planId }, { onConflict: "user_id,plan_id", ignoreDuplicates: true })
        : await supabase.from("saved_places").delete().eq("user_id", user.id).eq("plan_id", body.planId);
    if (error) return Response.json({ error: "Couldn’t update saved places. Please try again shortly." }, { status: 503 });
    return Response.json({ saved: body.saved });
}
