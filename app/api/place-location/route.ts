import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type PlaceLocation = { latitude: number; longitude: number };

function logGoogleFailure(operation: string, error: unknown) {
    const details = error instanceof Error && error.name === "TimeoutError" ? "timeout" : error instanceof Error && error.name === "SyntaxError" ? "response_parse_error" : error instanceof Error ? "network_error" : "request_failed";
    console.warn("SAGE Google Places request failed", { operation, reason: details });
}

function validLocation(value: unknown): value is PlaceLocation {
    if (!value || typeof value !== "object") return false;
    const location = value as Record<string, unknown>;
    return typeof location.latitude === "number" && Number.isFinite(location.latitude)
        && location.latitude >= -90 && location.latitude <= 90
        && typeof location.longitude === "number" && Number.isFinite(location.longitude)
        && location.longitude >= -180 && location.longitude <= 180;
}

export async function GET(request: Request) {
    const planId = new URL(request.url).searchParams.get("planId") ?? "";
    if (!uuidPattern.test(planId)) return Response.json({ location: null }, { status: 400 });
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return Response.json({ location: null }, { status: 503 });

    const supabase = await createClient();
    const { data: plan, error } = await supabase.from("plans").select("place_id").eq("id", planId).maybeSingle();
    if (error || !plan || typeof plan.place_id !== "string" || !plan.place_id) return Response.json({ location: null }, { status: 404 });

    try {
        const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(plan.place_id)}`, {
            headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location" },
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
            console.warn("SAGE Google Places upstream response", { operation: "place_location", status: response.status });
            return Response.json({ location: null }, { status: 502 });
        }
        const payload = await response.json() as { location?: unknown };
        return Response.json({ location: validLocation(payload.location) ? payload.location : null });
    } catch (error) {
        logGoogleFailure("place_location", error);
        return Response.json({ location: null }, { status: 502 });
    }
}
