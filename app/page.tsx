import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import LoginButton from "./login-button";
import PlanCard, { type PlanCardData } from "./sage/plan-card";
import ExploreNearColumbia from "./explore-near-columbia";

export const dynamic = "force-dynamic";

export default async function Home() {
    const supabase = await createClient();
    const [{ data: { user } }, { data: plans, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("plans").select("id,title,description,why_it_fits,place_name,address,rating,review_count,price_level,place_url,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    const planIds = (plans ?? []).map((plan) => plan.id);
    const [{ data: totals }, { data: myVotes }] = planIds.length ? await Promise.all([
        supabase.rpc("get_plan_vote_totals", { plan_ids: planIds }),
        user ? supabase.from("votes").select("plan_id,value").in("plan_id", planIds) : Promise.resolve({ data: [] }),
    ]) : [{ data: [] }, { data: [] }];
    const voteTotals = (totals ?? []) as { plan_id: string; positive_votes: number; negative_votes: number }[];
    const cards: PlanCardData[] = (plans ?? []).map((plan) => ({
        ...plan,
        upvoteCount: voteTotals.find((row) => row.plan_id === plan.id)?.positive_votes ?? 0,
        downvoteCount: voteTotals.find((row) => row.plan_id === plan.id)?.negative_votes ?? 0,
        myVote: (myVotes?.find((vote) => vote.plan_id === plan.id)?.value === -1 ? -1 : myVotes?.some((vote) => vote.plan_id === plan.id) ? 1 : null) as 1 | -1 | null,
    })).sort((a, b) => b.upvoteCount - a.upvoteCount || b.created_at.localeCompare(a.created_at)).slice(0, 12);

    return (
        <main className="sage-shell">
            <header className="site-nav">
                <Link className="brand" href="/" aria-label="SAGE home">SAGE<span>NYC</span></Link>
                <nav aria-label="Main navigation">
                    <Link className="nav-active" href="/">Discover</Link>
                    <Link href={user ? "/create" : "/?login=create"}>Create</Link>
                    {user ? <Link href="/profile">Profile</Link> : <LoginButton />}
                </nav>
            </header>

            <section className="hero-section">
                <div className="hero-copy">
                    <p className="eyebrow">SAGE · NYC</p>
                    <h1>New York.<br />Your way.</h1>
                    <p className="hero-question">Where to?</p>
                    <p className="hero-description">Real places. Right for right now.</p>
                    <Link className="primary-button" href={user ? "/create" : "/?login=create"}>Find your plan <span aria-hidden="true">→</span></Link>
                    {!user && <p className="hero-login">Sign in with Google to create a plan and vote.</p>}
                </div>
                <ExploreNearColumbia />
            </section>

            <section className="quick-picks" aria-label="Popular filters">
                <div><h2>Where to next?</h2></div>
                <div className="pick-list">
                    {["Tonight", "This weekend", "Under $25", "Under $50", "Near Columbia", "Coffee", "Study break", "Solo", "Outdoors"].map((pick) => <Link href={`/create?idea=${encodeURIComponent(pick)}`} key={pick} className="pick-chip">{pick}<span>↗</span></Link>)}
                </div>
            </section>

            <section className="discover-section">
                <div className="section-heading">
                    <div><p className="eyebrow">The city, by you</p><h2>Plans worth leaving for.</h2></div>
                    <Link className="text-link" href={user ? "/create" : "/?login=create"}>Make a plan <span>↗</span></Link>
                </div>
                {error ? <div className="empty-state"><p>We couldn’t load community plans right now. Please refresh in a moment.</p></div> : cards.length ? (
                    <div className="plan-grid">{cards.map((plan) => <PlanCard key={plan.id} plan={plan} authenticated={Boolean(user)} />)}</div>
                ) : (
                    <div className="empty-state"><div className="empty-spark">✳</div><h3>The board is yours to start.</h3><p>No community plans yet. Make the first one, and give someone else a reason to head out.</p><Link className="primary-button" href={user ? "/create" : "/?login=create"}>Create the first plan <span>↗</span></Link></div>
                )}
            </section>
            <footer className="site-footer"><Link className="brand" href="/">SAGE<span>NYC</span></Link><p>Real places. Better plans. A city that keeps surprising you.</p><Link href="/protected">My Protected Movies</Link></footer>
        </main>
    );
}
