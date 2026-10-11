// Temporary public-feed suppression for legacy rows awaiting
// coordinate backfill. Remove these IDs after their coordinates are restored.
export const hiddenLegacyPublicPlanIds = [
    "1e94dfd7-b2e8-4d37-8dd8-2bd63cfaaaec",
    "2569e794-fce5-41b8-b95d-217ede14d5ad",
    "3c7c6581-b731-4d33-bff6-72b48bbd394d",
    "3558832c-d672-4cee-b356-a152c9506b92",
] as const;

export function isHiddenLegacyPublicPlan(planId: string) {
    return hiddenLegacyPublicPlanIds.includes(planId as (typeof hiddenLegacyPublicPlanIds)[number]);
}
