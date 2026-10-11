type PlaceIdentifiedPlan = { id?: string; place_id?: string | null; created_at?: string };
export type CommunityPlanMeta = { totalVotes?: number };

// The caller provides the existing newest-first feed order, so the first plan
// for a place is the stable representative shown publicly.
export function dedupeCommunityPlans<T extends PlaceIdentifiedPlan>(plans: T[], metadata = new Map<string, CommunityPlanMeta>()) {
    const seenPlaceIds = new Set<string>();
    const representatives: T[] = [];
    const representativeIndexes = new Map<string, number>();
    const voteCount = (plan: T) => {
        const details = plan.id ? metadata.get(plan.id) : undefined;
        return typeof details?.totalVotes === "number" && Number.isFinite(details.totalVotes) ? details.totalVotes : 0;
    };
    const compare = (candidate: T, current: T) => {
        const candidateVotes = voteCount(candidate);
        const currentVotes = voteCount(current);
        if (candidateVotes !== currentVotes) return candidateVotes - currentVotes;
        const candidateTime = candidate.created_at ? Date.parse(candidate.created_at) : Number.NEGATIVE_INFINITY;
        const currentTime = current.created_at ? Date.parse(current.created_at) : Number.NEGATIVE_INFINITY;
        if (candidateTime !== currentTime) return candidateTime - currentTime;
        return (candidate.id ?? "").localeCompare(current.id ?? "");
    };
    for (const plan of plans) {
        if (!plan.place_id) {
            representatives.push(plan);
            continue;
        }
        if (seenPlaceIds.has(plan.place_id)) {
            const index = representativeIndexes.get(plan.place_id);
            if (index !== undefined && compare(plan, representatives[index]) > 0) representatives[index] = plan;
            continue;
        }
        seenPlaceIds.add(plan.place_id);
        representativeIndexes.set(plan.place_id, representatives.length);
        representatives.push(plan);
    }
    return representatives;
}
