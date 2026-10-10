import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Use the existing TypeScript dependency; no test framework or build output.
const source = fs.readFileSync(new URL('../lib/plan-categories.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { planCategories, matchesPlanCategory, filterPlansByCategory } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const categoriesFor = (place_types) => planCategories.filter(({ id }) => matchesPlanCategory({ place_types }, id)).map(({ id }) => id);

test('restaurants, cafes, bars, museums, parks, and activities stay distinct', () => {
    assert.deepEqual(categoriesFor(['thai_restaurant', 'restaurant', 'food']), ['food']);
    assert.deepEqual(categoriesFor(['cafe', 'coffee_shop', 'food', 'food_store']), ['coffee']);
    assert.deepEqual(categoriesFor(['bar', 'cocktail_bar']), ['bars']);
    assert.deepEqual(categoriesFor(['art_museum', 'museum', 'tourist_attraction']), ['arts']);
    assert.deepEqual(categoriesFor(['city_park', 'park']), ['outdoors']);
    assert.deepEqual(categoriesFor(['bowling_alley']), ['activities']);
    assert.deepEqual(categoriesFor(['tea_house']), ['coffee']);
});

test('reported records use actual persisted types, including noisy secondary tags', () => {
    // Read-only Supabase inspection, 2026-10-10. No names used for classification.
    const chalong = ['thai_restaurant', 'cocktail_bar', 'performing_arts_theater', 'bar', 'event_venue', 'american_restaurant', 'restaurant', 'food', 'point_of_interest', 'establishment'];
    const cityCoffee = ['sports_bar', 'brunch_restaurant', 'latin_american_restaurant', 'hookah_bar', 'coffee_shop', 'breakfast_restaurant', 'catering_service', 'food_delivery', 'cocktail_bar', 'bar', 'food_store', 'cafe', 'american_restaurant', 'service', 'restaurant', 'food', 'point_of_interest', 'store', 'establishment'];
    assert.deepEqual(categoriesFor(chalong), ['food', 'bars', 'arts']);
    assert.deepEqual(categoriesFor(cityCoffee), ['food', 'coffee', 'bars']);
    assert.deepEqual(categoriesFor([...chalong].reverse()), categoriesFor(chalong));
    assert.equal(planCategories.some(({ label }) => label === 'American Restaurant'), false);
});

test('overlap requires explicit types; generic tags and names cannot classify', () => {
    assert.deepEqual(categoriesFor(['bakery', 'cafe']), ['food', 'coffee']);
    assert.deepEqual(categoriesFor(['museum', 'cafe', 'park']), ['coffee', 'arts', 'outdoors']);
    assert.deepEqual(categoriesFor(['food', 'store', 'food_store', 'event_venue', 'tourist_attraction', 'point_of_interest', 'establishment']), []);
    for (const types of [undefined, null, [], ['unknown_restaurant']]) {
        assert.deepEqual(categoriesFor(types), []);
        assert.equal(matchesPlanCategory({place_types: types}, ''), true);
    }
    assert.equal(matchesPlanCategory({place_name: 'Museum Cafe Bar', description: 'A park restaurant', place_types: []}, 'coffee'), false);
});

test('filter excludes nonmatches, preserves order, and runs before the 12-card limit', () => {
    const plans = Array.from({length: 100}, (_, id) => ({id, place_types: id < 80 ? ['cafe'] : ['restaurant']}));
    const original = JSON.stringify(plans);
    const food = filterPlansByCategory(plans, 'food');
    assert.equal(food.length, 20);
    assert.deepEqual(food.slice(0, 12).map(({id}) => id), Array.from({length: 12}, (_, i) => 80 + i));
    assert.deepEqual(filterPlansByCategory(plans, 'outdoors'), []);
    assert.deepEqual(filterPlansByCategory(plans, ''), plans);
    assert.equal(JSON.stringify(plans), original);
});
