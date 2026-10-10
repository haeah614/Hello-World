import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import type { PlanCardData } from "@/app/sage/plan-card";
import CreateForm from "./create-form";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Constraints = { budget: string; duration: string; neighborhood: string; mood: string; company: string; extra: string };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ idea?: string | string[]; generation?: string | string[]; planIds?: string | string[] }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?next=create");
    const params = await searchParams;
    let restoredGeneration: { prompt: string; constraints: Constraints; plans: PlanCardData[] } | undefined;

    const generationId = typeof params.generation === "string" ? params.generation : "";
    const planIds = typeof params.planIds === "string" ? [...new Set(params.planIds.split(","))] : [];
    if (uuidPattern.test(generationId) && planIds.length > 0 && planIds.length <= 3 && planIds.every((id) => uuidPattern.test(id))) {
        const { data: generation } = await supabase.from("generations").select("id,prompt,constraints").eq("id", generationId).eq("user_id", user.id).maybeSingle();
        if (generation) {
            const initialPlans = await supabase.from("plans").select("id,title,description,why_it_fits,place_name,address,rating,review_count,price_level,place_url,latitude,longitude,created_at").in("id", planIds);
            const { data: savedPlans } = initialPlans.error
                ? await supabase.from("plans").select("id,title,description,why_it_fits,place_name,address,rating,review_count,price_level,place_url,created_at").in("id", planIds)
                : initialPlans;
            if (savedPlans?.length === planIds.length) {
                const savedPlanIds = savedPlans.map((plan) => plan.id);
                const [{ data: totals }, { data: votes }, { data: bookmarks, error: bookmarkError }] = await Promise.all([
                    supabase.rpc("get_plan_vote_totals", { plan_ids: savedPlanIds }),
                    supabase.from("votes").select("plan_id,value").in("plan_id", savedPlanIds),
                    supabase.from("saved_places").select("plan_id").eq("user_id", user.id).in("plan_id", savedPlanIds),
                ]);
                const voteTotals = (totals ?? []) as { plan_id: string; positive_votes: number; negative_votes: number }[];
                const savedConstraints = generation.constraints && typeof generation.constraints === "object" ? generation.constraints as Record<string, unknown> : {};
                const constraints: Constraints = {
                    budget: typeof savedConstraints.budget === "string" ? savedConstraints.budget : "",
                    duration: typeof savedConstraints.duration === "string" ? savedConstraints.duration : "",
                    neighborhood: typeof savedConstraints.neighborhood === "string" ? savedConstraints.neighborhood : "",
                    mood: typeof savedConstraints.mood === "string" ? savedConstraints.mood : "",
                    company: typeof savedConstraints.company === "string" ? savedConstraints.company : "",
                    extra: typeof savedConstraints.extra === "string" ? savedConstraints.extra : "",
                };
                restoredGeneration = {
                    prompt: generation.prompt,
                    constraints,
                    plans: savedPlans.map((plan) => ({
                        ...plan,
                        isSaved: bookmarkError ? null : Boolean(bookmarks?.some((row) => row.plan_id === plan.id)),
                        upvoteCount: voteTotals.find((row) => row.plan_id === plan.id)?.positive_votes ?? 0,
                        downvoteCount: voteTotals.find((row) => row.plan_id === plan.id)?.negative_votes ?? 0,
                        myVote: (votes?.find((vote) => vote.plan_id === plan.id)?.value === -1 ? -1 : votes?.some((vote) => vote.plan_id === plan.id) ? 1 : null) as 1 | -1 | null,
                    })),
                };
            }
        }
    }

    return <main className="create-shell"><header className="site-nav"><Link className="brand" href="/">SAGE<span>NYC</span></Link><nav><Link href="/">Discover</Link><span>Create</span><Link href="/saved">My Saved Places</Link><Link href="/profile">Profile</Link></nav></header>
        <section className="create-layout"><div className="create-intro"><p className="eyebrow">A good day starts somewhere</p><h1>Give us the<br /><em>starting point.</em></h1><div className="create-aside"><span>✳</span><p>Real places from Google.<br />A little perspective from AI.<br />The final call is yours.</p></div></div>
            <CreateForm initialIdea={typeof params.idea === "string" ? params.idea : ""} initialGeneration={restoredGeneration} />
        </section>
        <footer className="site-footer"><Link href="/">← Back to discovery</Link><p>Good plans, made together.</p></footer>
    </main>;
}
