"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PlanCardData } from "@/app/sage/plan-card";
import PlanCard from "@/app/sage/plan-card";

type Constraints = { budget: string; duration: string; neighborhood: string; mood: string; company: string; extra: string };
type InitialGeneration = { prompt: string; constraints: Constraints; plans: PlanCardData[] };

export default function CreateForm({ initialIdea, initialGeneration }: { initialIdea: string; initialGeneration?: InitialGeneration }) {
    const router = useRouter();
    const [prompt, setPrompt] = useState(initialGeneration?.prompt ?? (initialIdea ? `I’m interested in ${initialIdea.toLowerCase()}.` : ""));
    const [constraints, setConstraints] = useState<Constraints>(initialGeneration?.constraints ?? { budget: "", duration: "", neighborhood: "", mood: "", company: "", extra: "" });
    const [plans, setPlans] = useState<PlanCardData[]>(initialGeneration?.plans ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    function update(field: keyof Constraints, value: string) { setConstraints((current) => ({ ...current, [field]: value })); }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true); setError(""); setPlans([]);
        try {
            const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, constraints }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "We couldn’t make that plan. Please try again.");
            const generatedPlans = result.plans.map((plan: PlanCardData) => ({ ...plan, upvoteCount: 0, hasVoted: false }));
            setPlans(generatedPlans);
            if (typeof result.generationId === "string" && generatedPlans.length > 0) {
                const query = new URLSearchParams({ generation: result.generationId, planIds: generatedPlans.map((plan: PlanCardData) => plan.id).join(",") });
                router.replace(`/create?${query.toString()}`, { scroll: false });
            }
        } catch (err) { setError(err instanceof Error ? err.message : "We couldn’t make that plan. Please try again."); }
        finally { setBusy(false); }
    }

    return <div className="create-content"><form className="create-form" onSubmit={submit}>
        <div className="form-heading"><span>01 / YOUR VIBE</span><h2>What sounds like a good day?</h2></div>
        <label className="form-field"><span>Your starting point <b>*</b></span><textarea required minLength={8} maxLength={1000} rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A quiet cafe, a long walk, a little culture…" /></label>
        <div className="form-grid">
            <label className="form-field"><span className="selector-label">Neighborhood</span><select value={constraints.neighborhood} onChange={(e) => update("neighborhood", e.target.value)}><option value="">Surprise me</option><option>Morningside Heights</option><option>Upper West Side</option><option>Harlem</option><option>Central Park</option><option>Lower Manhattan</option><option>Chinatown</option><option>Brooklyn</option><option>Anywhere in NYC</option></select></label>
            <label className="form-field"><span className="selector-label">Time to spare?</span><select value={constraints.duration} onChange={(e) => update("duration", e.target.value)}><option value="">I’m flexible</option><option>About an hour</option><option>2–3 hours</option><option>Half a day</option><option>All afternoon</option><option>Evening</option></select></label>
            <label className="form-field"><span className="selector-label">Who&apos;s coming?</span><select value={constraints.company} onChange={(e) => update("company", e.target.value)}><option value="">Open to anything</option><option value="Solo">Just me</option><option>A friend</option><option>A few friends</option><option>A date</option><option>Family</option></select></label>
            <fieldset className="form-field budget-field"><legend className="selector-label">Budget</legend><div className="budget-options" role="group" aria-label="Choose a budget">
                {[{ label: "Free", value: "Free" }, { label: "Under $25", value: "Under $25" }, { label: "Under $50", value: "Under $50" }, { label: "Under $100", value: "Under $100" }, { label: "Any", value: "" }].map((option) => <button key={option.label} className="budget-chip" type="button" aria-pressed={constraints.budget === option.value} onClick={() => update("budget", option.value)}>{option.label}</button>)}
            </div></fieldset>
            <label className="form-field form-field-wide"><span className="selector-label">Mood</span><input value={constraints.mood} onChange={(e) => update("mood", e.target.value)} maxLength={100} placeholder="Low-key, curious, outdoorsy…" /></label>
            <label className="form-field form-field-wide"><span className="selector-label">Anything else?</span><input value={constraints.extra} onChange={(e) => update("extra", e.target.value)} maxLength={300} placeholder="Dietary needs, accessibility, must-haves…" /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button generate-button" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Finding your places…</> : <>Find my plan <span>✳</span></>}</button>
        <p className="form-footnote">SAGE uses real place listings and clearly labels what’s AI-generated.</p>
    </form>
    {plans.length > 0 && <section className="results-section"><div><p className="eyebrow">Your city, your way</p><h2>Here’s a place to start.</h2><p className="results-saved">Saved to the community board · your plan can now collect votes</p></div><div className="plan-grid">{plans.map((plan) => <PlanCard key={plan.id} plan={plan} authenticated />)}</div></section>}
    </div>;
}
