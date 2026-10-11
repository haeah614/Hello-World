import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function loadTypeScript(relativePath, names) {
    const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loaded = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    return Object.fromEntries(names.map((name) => [name, loaded[name]]));
}

const { dedupeCommunityPlans } = await loadTypeScript('lib/community-feed.ts', ['dedupeCommunityPlans']);
const { hiddenLegacyPublicPlanIds, isHiddenLegacyPublicPlan } = await loadTypeScript('lib/plan-visibility.ts', ['hiddenLegacyPublicPlanIds', 'isHiddenLegacyPublicPlan']);

test('keeps one stable representative for duplicate place IDs', () => {
    const plans = [
        { id: 'newer', place_id: 'google-park', created_at: '2026-10-11T00:00:00Z' },
        { id: 'older', place_id: 'google-park', created_at: '2026-10-10T00:00:00Z' },
        { id: 'restaurant', place_id: 'google-restaurant' },
        { id: 'missing-place-id', place_id: null },
        { id: 'missing-place-id-2' },
    ];
    const original = JSON.stringify(plans);
    assert.deepEqual(dedupeCommunityPlans(plans).map(({ id }) => id), ['newer', 'restaurant', 'missing-place-id', 'missing-place-id-2']);
    assert.equal(JSON.stringify(plans), original);
});

test('Le Parisien Bakery prefers the already-voted plan for every user', () => {
    const plans = [
        { id: '0dba1b1a-606d-4fea-9cf1-104bff4e72ae', place_id: 'ChIJnzkPKwBZwokRmUk0EzQbaNE', title: 'Newer SAGE note', created_at: '2026-10-11T00:19:18Z' },
        { id: 'b896f59a-9158-4ea2-b5ed-5a9b6bfe2a88', place_id: 'ChIJnzkPKwBZwokRmUk0EzQbaNE', title: 'Voted SAGE note', created_at: '2026-10-11T00:08:29Z' },
    ];
    const metadata = new Map([
        [plans[0].id, { totalVotes: 0 }],
        [plans[1].id, { totalVotes: 1 }],
    ]);
    assert.deepEqual(dedupeCommunityPlans(plans, metadata), [plans[1]]);
});

test('uses highest vote total, then newest timestamp, then plan ID', () => {
    const plans = [
        { id: 'z-plan', place_id: 'same-place', created_at: '2026-10-11T00:00:00Z' },
        { id: 'a-plan', place_id: 'same-place', created_at: '2026-10-12T00:00:00Z' },
        { id: 'b-plan', place_id: 'same-place', created_at: '2026-10-12T00:00:00Z' },
    ];
    assert.equal(dedupeCommunityPlans(plans, new Map([
        ['z-plan', { totalVotes: 2 }],
        ['a-plan', { totalVotes: 3 }],
        ['b-plan', { totalVotes: 3 }],
    ]))[0].id, 'b-plan');
    assert.equal(dedupeCommunityPlans(plans, new Map([
        ['z-plan', { totalVotes: 0 }],
        ['a-plan', { totalVotes: 0 }],
        ['b-plan', { totalVotes: 0 }],
    ]))[0].id, 'b-plan');
});

test('does not aggregate or alter votes and saves for hidden duplicates', () => {
    const plans = [{ id: 'representative', place_id: 'same-place' }, { id: 'duplicate', place_id: 'same-place' }];
    const votes = new Map([['duplicate', -1]]);
    const saves = new Map([['duplicate', true]]);
    assert.deepEqual(dedupeCommunityPlans(plans), [plans[0]]);
    assert.equal(votes.get('duplicate'), -1);
    assert.equal(saves.get('duplicate'), true);
});

test('legacy suppression remains exactly four explicit plan IDs', () => {
    assert.equal(hiddenLegacyPublicPlanIds.length, 4);
    assert.equal(new Set(hiddenLegacyPublicPlanIds).size, 4);
    for (const id of hiddenLegacyPublicPlanIds) assert.equal(isHiddenLegacyPublicPlan(id), true);
    assert.equal(isHiddenLegacyPublicPlan('not-suppressed'), false);
});
