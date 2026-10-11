import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 100;

if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    console.error("--limit must be an integer between 1 and 1000");
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
if (!supabaseUrl || !serviceRoleKey || !googlePlacesKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GOOGLE_PLACES_API_KEY in the local shell.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

function validLocation(value) {
    const location = value && typeof value === "object" ? value.location : null;
    const latitude = location?.latitude;
    const longitude = location?.longitude;
    return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
        ? { latitude, longitude }
        : null;
}

function safeError(error) {
    return error && typeof error === "object"
        ? { code: typeof error.code === "string" ? error.code.slice(0, 40) : "unknown", status: typeof error.status === "number" ? error.status : "unknown" }
        : { code: "unknown", status: "unknown" };
}

const { data: plans, error: readError } = await supabase
    .from("plans")
    .select("id,place_id")
    .is("latitude", null)
    .is("longitude", null)
    .limit(limit);
if (readError) {
    console.error("Could not read plans missing coordinates", safeError(readError));
    process.exit(1);
}

let resolved = 0;
let skipped = 0;
let updated = 0;
const failureStatuses = {};
for (const plan of plans ?? []) {
    if (typeof plan.place_id !== "string" || !plan.place_id) {
        skipped += 1;
        continue;
    }

    let response;
    try {
        response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(plan.place_id)}`, {
            headers: { "X-Goog-Api-Key": googlePlacesKey, "X-Goog-FieldMask": "location" },
            signal: AbortSignal.timeout(12000),
        });
    } catch {
        failureStatuses.network = (failureStatuses.network ?? 0) + 1;
        skipped += 1;
        continue;
    }
    if (!response.ok) {
        const key = String(response.status);
        failureStatuses[key] = (failureStatuses[key] ?? 0) + 1;
        skipped += 1;
        continue;
    }

    let location;
    try {
        location = validLocation(await response.json());
    } catch {
        location = null;
    }
    if (!location) {
        skipped += 1;
        continue;
    }
    resolved += 1;

    if (!apply) continue;
    const { error: updateError } = await supabase
        .from("plans")
        .update(location)
        .eq("id", plan.id)
        .is("latitude", null)
        .is("longitude", null);
    if (updateError) {
        console.error("Coordinate update failed", safeError(updateError));
        continue;
    }
    updated += 1;
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned: plans?.length ?? 0, resolved, skipped, updated, failureStatuses }));
