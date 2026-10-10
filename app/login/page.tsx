import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LoginButton from "../login-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const creating = (await searchParams).next === "create";
    if (user) redirect(creating ? "/create" : "/");

    return <main className="sage-shell">
        <header className="site-nav">
            <Link className="brand" href="/">SAGE<span>NYC</span></Link>
            <nav aria-label="Main navigation"><Link href="/">Discover</Link><Link href="/create">Create</Link><Link href="/saved">My Saved Places</Link></nav>
        </header>
        <section className="discover-section saved-section">
            <div className="empty-state">
                <p className="eyebrow">SAGE · NYC</p>
                <h1>{creating ? "Sign in to create your next plan." : "Welcome back to SAGE."}</h1>
                <p>{creating ? "Continue with Google to turn your ideas into real NYC recommendations." : "Continue with Google to create plans, vote, and save places for later."}</p>
                <LoginButton />
                <p className="login-return-note">After signing in, choose Create to start a plan. New accounts may be asked to complete their profile first.</p>
                <Link className="text-link" href="/">Keep exploring →</Link>
            </div>
        </section>
    </main>;
}
