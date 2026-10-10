import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PlacePhoto = {
    name?: unknown;
    authorAttributions?: Array<{ displayName?: unknown; uri?: unknown }>;
    googleMapsUri?: unknown;
};

type PlaceLocation = { latitude: number; longitude: number };

let googleBackoffUntil = 0;
let googleBackoffMs = 0;

function noteQuotaFailure(response: Response) {
    if (response.status !== 429) return;
    googleBackoffMs = Math.min(10 * 60 * 1000, googleBackoffMs ? googleBackoffMs * 2 : 30 * 1000);
    googleBackoffUntil = Date.now() + googleBackoffMs;
    console.warn("SAGE Google Places rate limited", { operation: "place_photo", status: response.status, backoffSeconds: googleBackoffMs / 1000 });
}

function noteGoogleFailure(operation: string, error: unknown) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : error instanceof Error && error.name === "SyntaxError" ? "response_parse_error" : error instanceof Error ? "network_error" : "request_failed";
    console.warn("SAGE Google Places request failed", { operation, reason });
}

function noPhoto(status = 404, location?: PlaceLocation | null) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (location) {
        headers.set("X-Place-Latitude", String(location.latitude));
        headers.set("X-Place-Longitude", String(location.longitude));
        headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(JSON.stringify({ location }), { status, headers });
    }
    return new Response(null, { status, headers });
}

function photoFailure(location?: PlaceLocation | null) {
    return noPhoto(404, location);
}

function safeMapsUri(value: unknown) {
    if (typeof value !== "string") return "";
    try {
        const uri = new URL(value.startsWith("//") ? `https:${value}` : value);
        return uri.protocol === "https:" && ["maps.google.com", "www.google.com", "google.com"].includes(uri.hostname)
            ? uri.toString()
            : "";
    } catch {
        return "";
    }
}

function isGoogleImageUrl(url: URL) {
    return url.protocol === "https:" && url.hostname.endsWith(".googleusercontent.com");
}

async function fetchGoogleImage(initialUrl: URL): Promise<{ response: Response } | { failure: "image_host_or_redirect_validation" | "image_fetch_failure" }> {
    let currentUrl = initialUrl;
    for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
        if (!isGoogleImageUrl(currentUrl)) return { failure: "image_host_or_redirect_validation" };
        let response: Response;
        try {
            response = await fetch(currentUrl, {
                cache: "no-store",
                redirect: "manual",
                signal: AbortSignal.timeout(15000),
            });
        } catch {
            return { failure: "image_fetch_failure" };
        }
        if (response.status < 300 || response.status >= 400) return { response };

        const location = response.headers.get("location");
        if (!location || redirectCount === 4) return { failure: "image_host_or_redirect_validation" };
        try {
            currentUrl = new URL(location, currentUrl);
        } catch {
            return { failure: "image_host_or_redirect_validation" };
        }
    }
    return { failure: "image_host_or_redirect_validation" };
}

export async function GET(request: Request) {
    const planId = new URL(request.url).searchParams.get("planId") ?? "";
    if (!uuidPattern.test(planId)) return noPhoto(400);

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        console.warn("SAGE Google Places configuration missing", { operation: "place_photo" });
        return noPhoto(503);
    }
    if (googleBackoffUntil > Date.now()) return noPhoto(503);

    const supabase = await createClient();
    const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("place_id")
        .eq("id", planId)
        .maybeSingle();
    if (planError) return photoFailure();
    if (!plan) return photoFailure();
    const placeId = plan.place_id;
    if (typeof placeId !== "string" || !placeId) return photoFailure();

    let placeLocation: PlaceLocation | null = null;
    try {
        const placeResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
            headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "location",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
        });
        if (!placeResponse.ok) {
            noteQuotaFailure(placeResponse);
            if (placeResponse.status !== 429) console.warn("SAGE Google Places upstream response", { operation: "place_photo_location", status: placeResponse.status });
            return photoFailure();
        }

        const place = await placeResponse.json() as { location?: { latitude?: unknown; longitude?: unknown } };
        const latitude = place.location?.latitude;
        const longitude = place.location?.longitude;
        if (typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
            placeLocation = { latitude, longitude };
        }

        const photoResponse = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
            headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "photos.name,photos.authorAttributions,photos.googleMapsUri",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
        });
        if (!photoResponse.ok) {
            noteQuotaFailure(photoResponse);
            if (photoResponse.status !== 429) console.warn("SAGE Google Places upstream response", { operation: "place_photo_metadata", status: photoResponse.status });
            return photoFailure(placeLocation);
        }

        const photoData = await photoResponse.json() as { photos?: PlacePhoto[] };
        const photo = photoData.photos?.find((candidate) => typeof candidate.name === "string");
        if (!photo || typeof photo.name !== "string") return photoFailure(placeLocation);

        const prefix = `places/${placeId}/photos/`;
        if (!photo.name.startsWith(prefix) || !photo.name.slice(prefix.length) || photo.name.slice(prefix.length).includes("/")) return photoFailure(placeLocation);

        const photoPath = photo.name.split("/").map(encodeURIComponent).join("/");
        const mediaResponse = await fetch(`https://places.googleapis.com/v1/${photoPath}/media?maxWidthPx=960&maxHeightPx=640&skipHttpRedirect=true`, {
            headers: { "X-Goog-Api-Key": apiKey },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
        });
        if (!mediaResponse.ok) {
            noteQuotaFailure(mediaResponse);
            if (mediaResponse.status !== 429) console.warn("SAGE Google Places upstream response", { operation: "place_photo_media", status: mediaResponse.status });
            return photoFailure(placeLocation);
        }

        const media = await mediaResponse.json() as { photoUri?: unknown };
        if (typeof media.photoUri !== "string") return photoFailure(placeLocation);
        let imageUrl: URL;
        try {
            imageUrl = new URL(media.photoUri);
        } catch {
            return photoFailure(placeLocation);
        }
        if (!isGoogleImageUrl(imageUrl)) return photoFailure(placeLocation);

        const imageResult = await fetchGoogleImage(imageUrl);
        if ("failure" in imageResult) return photoFailure(placeLocation);
        const imageResponse = imageResult.response;
        if (!imageResponse.ok || !imageResponse.body) return photoFailure(placeLocation);
        const contentType = imageResponse.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) return photoFailure(placeLocation);

        googleBackoffMs = 0;
        googleBackoffUntil = 0;

        const attributions = (photo.authorAttributions ?? [])
            .filter((item): item is { displayName: string; uri?: unknown } => typeof item.displayName === "string")
            .slice(0, 5)
            .map((item) => ({ displayName: item.displayName.slice(0, 140), uri: safeMapsUri(item.uri) }));
        const headers = new Headers({
            "Content-Type": contentType,
            "Cache-Control": "no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
        });
        const photoMapsUri = safeMapsUri(photo.googleMapsUri);
        if (attributions.length) headers.set("X-Photo-Attributions", encodeURIComponent(JSON.stringify(attributions)));
        if (photoMapsUri) headers.set("X-Photo-Maps-Uri", photoMapsUri);
        if (placeLocation) {
            headers.set("X-Place-Latitude", String(placeLocation.latitude));
            headers.set("X-Place-Longitude", String(placeLocation.longitude));
        }

        return new Response(imageResponse.body, { headers });
    } catch (error) {
        noteGoogleFailure("place_photo", error);
        return noPhoto(404, placeLocation);
    }
}
