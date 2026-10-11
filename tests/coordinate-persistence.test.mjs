import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL('../lib/coordinate-persistence.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { coordinateRowsForPlaces, readPlaceCoordinates } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('park, university, and restaurant Places locations become persisted coordinate rows', () => {
    const googleResponse = {
        places: [
            { id: 'park-place', types: ['park'], location: { latitude: 40.81, longitude: -73.97 } },
            { id: 'university-place', types: ['university'], location: { latitude: 40.8075, longitude: -73.9626 } },
            { id: 'restaurant-place', types: ['restaurant'], location: { latitude: 40.75, longitude: -73.99 } },
        ],
    };
    const locations = new Map(googleResponse.places.map((place) => [place.id, readPlaceCoordinates(place)]));
    const rows = coordinateRowsForPlaces([
        { place_id: 'park-place', title: 'Park plan' },
        { place_id: 'university-place', title: 'University plan' },
        { place_id: 'restaurant-place', title: 'Restaurant plan' },
    ], locations);

    assert.deepEqual(rows.map(({ latitude, longitude }) => [latitude, longitude]), [
        [40.81, -73.97],
        [40.8075, -73.9626],
        [40.75, -73.99],
    ]);
});

test('invalid or missing Google locations remain null without affecting other places', () => {
    const locations = new Map([
        ['park-place', readPlaceCoordinates({ id: 'park-place', location: { latitude: 91, longitude: -73.97 } })],
        ['restaurant-place', readPlaceCoordinates({ id: 'restaurant-place', location: { latitude: 40.75, longitude: -73.99 } })],
    ]);
    const rows = coordinateRowsForPlaces([
        { place_id: 'park-place' },
        { place_id: 'university-place' },
        { place_id: 'restaurant-place' },
    ], locations);
    assert.deepEqual(rows.map(({ latitude, longitude }) => [latitude, longitude]), [
        [null, null],
        [null, null],
        [40.75, -73.99],
    ]);
});

test('generation route has no coordinate-dropping insert fallback', () => {
    const route = fs.readFileSync(new URL('../app/api/generate/route.ts', import.meta.url), 'utf8');
    assert.match(route, /insert\(coordinateRows\)/);
    assert.doesNotMatch(route, /insert\(rows\)/);
});
