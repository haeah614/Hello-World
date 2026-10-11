import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import LoginButton from "../login-button";
import PlanCard, { type PlanCardData } from "../sage/plan-card";

export const dynamic = "force-dynamic";
const pageSize = 24;

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const params = await searchParams;
    const requestedPage = Number(params.page ?? 1);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
    let cards: PlanCardData[] = [];
    let failed = false;
    let votesFailed = false;
    let hasNext = false;
    if (user) {
        const initialSaved = await supabase.from("saved_places")
            .select("plan_id,plans!inner(id,title,description,why_it_fits,place_name,address,rating,review_count,price_level,place_url,latitude,longitude,created_at)")
            .eq("user_id", user.id).order("created_at", { ascending: false }).order("plan_id")
            .range((page - 1) * pageSize, page * pageSize);
        const { data, error } = initialSaved;
        failed = Boolean(error);
        hasNext = (data?.length ?? 0) > pageSize;
        // Supabase's untyped client infers joins as arrays; normalize both shapes.
        const plans = (data ?? []).slice(0, pageSize).flatMap((row) => Array.isArray(row.plans) ? row.plans : [row.plans]) as Omit<PlanCardData, "upvoteCount">[];
        const ids = plans.map((plan) => plan.id);
        if (ids.length) {
            const [totals, votes] = await Promise.all([
                supabase.rpc("get_plan_vote_totals", { plan_ids: ids }),
                supabase.from("votes").select("plan_id,value").eq("user_id", user.id).in("plan_id", ids),
            ]);
            votesFailed = Boolean(totals.error || votes.error);
            cards = plans.map((plan) => ({
                ...plan,
                isSaved: true,
                upvoteCount: totals.data?.find((row: { plan_id: string }) => row.plan_id === plan.id)?.positive_votes ?? 0,
                downvoteCount: totals.data?.find((row: { plan_id: string }) => row.plan_id === plan.id)?.negative_votes ?? 0,
                myVote: votes.data?.find((row) => row.plan_id === plan.id)?.value ?? null,
            }));
        }
    }
    return <main className="sage-shell">
        <header className="site-nav">
            <Link className="brand" href="/">SAGE<span>NYC</span></Link>
            <nav aria-label="Main navigation"><Link href="/">Discover</Link><Link href="/create">Create</Link><Link className="nav-active" aria-current="page" href="/saved">My Saved Places</Link>{user ? <Link href="/profile">Profile</Link> : <Link href="#saved-sign-in">Sign in</Link>}</nav>
        </header>
        <section className="discover-section saved-section">
            <div className="section-heading"><div><p className="eyebrow">A little something for later</p><h1>My Saved Places</h1><p>Your private shortlist. Come back when the moment feels right.</p></div><Link className="primary-button" href="/">Discover more <span aria-hidden="true">↗</span></Link></div>
            {user && !failed && <p className="saved-page-count">{cards.length} {cards.length === 1 ? "place" : "places"} on this page <span aria-hidden="true">·</span> Page {page} <span aria-hidden="true">·</span> Only visible to you</p>}
            {!user ? <div className="empty-state saved-empty" id="saved-sign-in"><span className="empty-spark" aria-hidden="true">✳</span><p className="eyebrow">A shortlist that’s yours</p><h2>Your next good day, saved.</h2><p>That café for Sunday. A museum for a rainy day. Sign in to keep your favorite places together, just for you.</p><LoginButton /></div>
                : failed ? <div className="empty-state" role="alert"><h2>Saved places couldn’t load.</h2><p>Please refresh in a moment. Your saved places haven’t been changed.</p><Link className="text-link" href="/saved">Try again</Link></div>
                : cards.length ? <>{votesFailed && <p role="status">Voting information is temporarily unavailable. Refresh before voting.</p>}<div className="plan-grid">{cards.map((plan) => <PlanCard key={plan.id} plan={plan} authenticated votesUnavailable={votesFailed} />)}</div></>
                : <div className="empty-state saved-empty"><div className="empty-spark" aria-hidden="true">✳</div><h2>{page > 1 ? "No more saved places." : "Keep a place in mind."}</h2><p>Found somewhere you’d love to go? Tap Save for later on a recommendation and find it here whenever you’re ready.</p><Link className="primary-button" href={page > 1 ? "/saved" : "/"}>{page > 1 ? "Back to saved places" : "Discover places"} →</Link></div>}
            {user && !failed && <nav className="saved-pagination" aria-label="Saved places pages">{page > 1 && <Link className="text-link" href={`/saved?page=${page - 1}`}>← Previous</Link>}{hasNext && <Link className="text-link" href={`/saved?page=${page + 1}`}>Next →</Link>}</nav>}
        </section>
    </main>;
}
