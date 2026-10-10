"use client";

import { useState } from "react";
import PlanCard, { type PlanCardData } from "./plan-card";

import { filterPlansByCategory, planCategories, type PlanCategory } from "@/lib/plan-categories";

export default function CategoryFeed({ plans, authenticated }: { plans: PlanCardData[]; authenticated: boolean }) {
    const [category, setCategory] = useState<PlanCategory>("");
    const filtered = filterPlansByCategory(plans, category);
    return <>
        <div className="feed-filters">
            <div className="category-chips" role="group" aria-label="Filter plans by category">
                <button className="category-chip" type="button" aria-pressed={category === ""} onClick={() => setCategory("")}>All</button>
                {planCategories.map(({ id, label }) => <button className="category-chip" key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}
            </div>
            {category && <button type="button" className="text-link clear-filter" onClick={() => setCategory("")}>Clear Filter</button>}
            <p role="status">Showing {Math.min(12, filtered.length)} of {filtered.length} matching plans in the latest {plans.length} community plans.</p>
        </div>
        <p className="feed-note">Based on Google place categories. Some places fit more than one; browse All to see every kind of plan.</p>
        {filtered.length ? <div className="plan-grid">{filtered.slice(0, 12).map((plan) => <PlanCard key={plan.id} plan={plan} authenticated={authenticated} />)}</div>
            : <div className="empty-state"><h3>No plans in this category yet.</h3><p>Try All or another category to find your next place.</p><button className="primary-button" onClick={() => setCategory("")}>Show all categories</button></div>}
    </>;
}
