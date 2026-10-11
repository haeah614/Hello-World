import { createClient } from "@/lib/supabase-server";
import { coordinateRowsForPlaces, readPlaceCoordinates, validCoordinatePair } from "@/lib/coordinate-persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

type Constraints = { budget?: string; duration?: string; neighborhood?: string; mood?: string; company?: string; extra?: string };
type AddressComponent = { longText?: unknown; shortText?: unknown; types?: unknown };
type Place = { id: string; name: string; address: string | null; rating: number | null; reviewCount: number | null; priceLevel: number | null; types: string[]; mapsUrl: string | null; location: { latitude: number; longitude: number } | null; hasPhoto: boolean; rawPhotoEntryCount: number; usablePhotoNameCount: number };
type Suggestion = { title: string; description: string; whyItFits: string; placeId: string };
const placesFieldMask = "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.googleMapsUri,places.photos";
const placeTypePattern = /\b(caf(?:e|es|é)|coffee|bookstore|bookshop|restaurant|food hall|bar|museum|gallery|park|garden|market|bakery|theater|theatre|cinema|movie|concert|live music|bowling|arcade|library|zoo|aquarium|landmark|museum|shopping)\b/i;
const transientGeminiStatuses = new Set([408, 429, 500, 503, 504]);
const geminiAttemptTimeoutMs = 8000;
const geminiTotalBudgetMs = 30000;
type GeminiResult = { response: Response; model: string };

class GeminiTimeoutError extends Error {
    constructor() {
        super("Gemini request timed out");
        this.name = "GeminiTimeoutError";
    }
}

function bad(message: string, status: number) { return Response.json({ error: message }, { status }); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function databaseFailure(error: unknown) {
    if (!error || typeof error !== "object") return { code: "unknown", status: "unknown", message: "unknown" };
    const value = error as { code?: unknown; status?: unknown; message?: unknown };
    return {
        code: typeof value.code === "string" ? value.code.slice(0, 40) : "unknown",
        status: typeof value.status === "number" ? value.status : "unknown",
        message: typeof value.message === "string" ? value.message.replace(/[\r\n\t]+/g, " ").slice(0, 160) : "unknown",
    };
}
const plusCodePattern = /\b[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,}\b/i;

function placeAddress(place: Record<string, unknown>, placeName: string) {
    const formattedAddress = typeof place.formattedAddress === "string" ? place.formattedAddress.trim() : "";
    if (formattedAddress && !plusCodePattern.test(formattedAddress)) return formattedAddress;
    const components = Array.isArray(place.addressComponents) ? place.addressComponents as AddressComponent[] : [];
    const locality = components.find((component) => Array.isArray(component.types) && component.types.some((type) => ["locality", "postal_town", "sublocality", "administrative_area_level_2"].includes(type)))?.longText;
    return typeof locality === "string" && locality.trim() ? `${placeName}, ${locality.trim()}` : placeName;
}
async function fetchGemini(model: string, apiKey: string, requestBody: Record<string, unknown>, timeoutMs: number) {
    try {
        return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify(requestBody),
        });
    } catch (error) {
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
            throw new GeminiTimeoutError();
        }
        throw error;
    }
}

async function discardGeminiResponse(response: Response) {
    try { await response.body?.cancel(); } catch { /* Ignore cleanup errors before retrying. */ }
}

async function requestGeminiWithFallback(primaryModel: string, apiKey: string, requestBody: Record<string, unknown>): Promise<GeminiResult> {
    const fallbackModel = "gemini-3.5-flash-lite";
    const deadline = Date.now() + geminiTotalBudgetMs;
    let model = primaryModel;
    let response: Response | undefined;
    let timedOut = false;

    const makeAttempt = async (attemptModel: string) => {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new GeminiTimeoutError();
        try {
            response = await fetchGemini(attemptModel, apiKey, requestBody, Math.min(geminiAttemptTimeoutMs, remainingMs));
            timedOut = false;
            return;
        } catch (error) {
            if (!(error instanceof GeminiTimeoutError)) throw error;
            response = undefined;
            timedOut = true;
        }
    };

    await makeAttempt(primaryModel);

    for (let retry = 0; retry < 2 && (timedOut || (response !== undefined && transientGeminiStatuses.has(response.status))); retry += 1) {
        if (response) {
            await discardGeminiResponse(response);
        }
        const backoffMs = 300 * (2 ** retry) + Math.floor(Math.random() * 201);
        if (Date.now() + backoffMs >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        await makeAttempt(primaryModel);
    }

    const primaryStillTransient = timedOut || (response !== undefined && transientGeminiStatuses.has(response.status));
    if (primaryStillTransient && Date.now() < deadline) {
        if (response) {
            await discardGeminiResponse(response);
        }
        model = fallbackModel;
        await makeAttempt(model);
    }

    if (!response) throw new GeminiTimeoutError();
    return { response, model };
}

function parsePlaces(data: { places?: Array<Record<string, unknown>> }): Place[] {
    return (data.places ?? []).flatMap((place) => {
        const id = typeof place.id === "string" ? place.id : "";
        const displayName = place.displayName && typeof place.displayName === "object" ? (place.displayName as { text?: unknown }).text : "";
        if (!id || typeof displayName !== "string") return [];
        const location = readPlaceCoordinates(place);
        const rawPhotos = Array.isArray(place.photos) ? place.photos : [];
        const usablePhotoNameCount = rawPhotos.filter((photo) => Boolean(
            photo && typeof photo === "object" && "name" in photo && typeof photo.name === "string" && photo.name.trim(),
        )).length;
        const photoPrefix = `places/${id}/photos/`;
        const hasPhoto = rawPhotos.some((photo) => {
            if (!photo || typeof photo !== "object" || !("name" in photo) || typeof photo.name !== "string") return false;
            const resource = photo.name as string;
            return resource.startsWith(photoPrefix) && resource.length > photoPrefix.length && !resource.slice(photoPrefix.length).includes("/");
        });
        const price = typeof place.priceLevel === "string" ? ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(place.priceLevel) : -1;
        return [{ id, name: displayName, address: placeAddress(place, displayName) || null, rating: typeof place.rating === "number" ? place.rating : null, reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null, priceLevel: price >= 0 ? price : null, types: Array.isArray(place.types) ? place.types.filter((v): v is string => typeof v === "string") : [], mapsUrl: typeof place.googleMapsUri === "string" ? place.googleMapsUri : null, location, hasPhoto, rawPhotoEntryCount: rawPhotos.length, usablePhotoNameCount }];
    });
}

function fallbackPlaceQueries(prompt: string, constraints: Constraints): string[] {
    const context = [prompt, ...Object.values(constraints)].join(" ").toLowerCase();
    const categories: string[] = [];
    const add = (category: string) => { if (!categories.includes(category)) categories.push(category); };
    const area = constraints.neighborhood && !/surprise|anywhere/i.test(constraints.neighborhood)
        ? `${constraints.neighborhood}, New York City`
        : /columbia|dorm/i.test(context) ? "near Columbia University, New York City" : "New York City";

    if (/caf(?:e|es|é)|coffee/.test(context)) add("cafes and coffee shops");
    if (/bookstore|bookshop|book|read|study/.test(context)) add("bookstores and reading cafes");
    if (/restaurant|food|eat|dinner|lunch|brunch/.test(context)) add("restaurants and food halls");
    if (/bar|pub|cocktail/.test(context)) add("bars and pubs");
    if (/museum|gallery|art|culture/.test(context)) add("museums and art galleries");
    if (/park|garden|outdoor|outside|walk|nature/.test(context)) add("parks and gardens");
    if (/market|bakery|shopping/.test(context)) add("markets and bakeries");
    if (/theater|theatre|cinema|movie/.test(context)) add("theaters and cinemas");

    if (/tonight|evening|after dark|at night|fun/.test(context)) {
        add("live music venues and comedy clubs");
        add("movie theaters and bowling alleys");
        add("arcades and entertainment venues");
    }
    if (/friend|friends|date|group|together/.test(context)) {
        add("bowling alleys and arcades");
        add("casual restaurants and food halls");
    }
    if (/quiet|low.key|study|read|book|dorm|afternoon|coffee|cafe/.test(context)) {
        add("bookstores and cafes");
        add("libraries and museums");
    }
    if (/outdoor|outside|walk|nature|park|garden|sun/.test(context)) {
        add("parks and gardens");
        add("waterfront walks and public plazas");
    }
    if (/food|eat|dinner|lunch|brunch|budget|under \$|\$\d/.test(context)) {
        add("casual restaurants and food halls");
        add("markets and bakeries");
    }
    if (categories.length < 3) {
        for (const category of ["parks and gardens", "museums and cultural attractions", "bookstores and coffee shops"]) add(category);
    }

    return categories.slice(0, 3).map((category) => `${category} in ${area}`);
}

async function searchPlaces(query: string, apiKey: string, pageSize: number) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": placesFieldMask },
        body: JSON.stringify({ textQuery: query, pageSize, locationBias: { circle: { center: { latitude: 40.8075, longitude: -73.9626 }, radius: 18000 } }, languageCode: "en" }),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { status: response.status, places: [] as Place[] };
    return { status: null, places: parsePlaces(await response.json() as { places?: Array<Record<string, unknown>> }) };
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return bad("Sign in to create a SAGE plan.", 401);

    let body: { prompt?: unknown; constraints?: unknown };
    try { body = await request.json(); } catch { return bad("Please submit a valid plan request.", 400); }
    const prompt = text(body.prompt, 1000);
    if (prompt.length < 8) return bad("Tell us a little more about the kind of plan you want.", 400);
    const raw = body.constraints && typeof body.constraints === "object" ? body.constraints as Record<string, unknown> : {};
    const constraints: Constraints = {
        budget: text(raw.budget, 80), duration: text(raw.duration, 80), neighborhood: text(raw.neighborhood, 100),
        mood: text(raw.mood, 100), company: text(raw.company, 80), extra: text(raw.extra, 300),
    };

    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!placesKey || !geminiKey) return bad("Plan generation needs server configuration. Add GOOGLE_PLACES_API_KEY and GEMINI_API_KEY to the server environment, then try again.", 503);

    try {
        const searchText = [prompt, constraints.neighborhood, "New York City"].filter(Boolean).join(" ");
        const primarySearch = await searchPlaces(searchText, placesKey, 12);
        if (primarySearch.status === 429) {
            return bad("NYC place search has reached its daily limit. Try again later, or use the community board for existing plans.", 503);
        }
        if (primarySearch.status !== null) {
            return bad("The NYC place search is temporarily unavailable. Please try again shortly.", 502);
        }
        const isBroadPrompt = !placeTypePattern.test([prompt, ...Object.values(constraints)].join(" "));
        const placesById = new Map((isBroadPrompt ? primarySearch.places.slice(0, 5) : primarySearch.places).map((place) => [place.id, place]));
        if (isBroadPrompt || placesById.size < 3) {
            for (const query of fallbackPlaceQueries(prompt, constraints)) {
                const fallbackSearch = await searchPlaces(query, placesKey, 5);
                if (fallbackSearch.status !== null) {
                    if (fallbackSearch.status === 429) return bad("NYC place search has reached its daily limit. Try again later, or use the community board for existing plans.", 503);
                    return bad("The NYC place search is temporarily unavailable. Please try again shortly.", 502);
                }
                for (const place of fallbackSearch.places) {
                    if (!placesById.has(place.id)) placesById.set(place.id, place);
                }
            }
        }
        const allPlaces = [...placesById.values()];
        const photoPlaces = allPlaces.filter((place) => place.hasPhoto);
        const rankedPlaces = photoPlaces.length >= 3
            ? photoPlaces
            : [...photoPlaces, ...allPlaces.filter((place) => !place.hasPhoto)];
        const places = rankedPlaces.slice(0, 18);
        if (!places.length) return bad("We couldn’t find real NYC places for that request. Try a broader activity or neighborhood.", 422);
        const primaryModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
        const requestBody = {
            systemInstruction: { parts: [{ text: "You are SAGE, a thoughtful NYC local editor helping a Columbia student make real plans. Only recommend places from the supplied candidates. Never invent or alter place names, facts, prices, addresses, ratings, IDs or links. Prefer candidates marked photoAvailable when they fit the request; use candidates without photos only when needed as fallbacks. Return 3 distinct suggestions when possible, each referencing one supplied placeId exactly. Editorial, concise, useful, grounded. If candidates do not fit, still choose the nearest relevant options and be transparent in whyItFits." }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify({ request: prompt, constraints, placeCandidates: places.map(({ id, name, address, rating, reviewCount, priceLevel, types, hasPhoto }) => ({ id, name, address, rating, reviewCount, priceLevel, types, photoAvailable: hasPhoto })) }) }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { suggestions: { type: "ARRAY", minItems: 1, maxItems: 3, items: { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" }, whyItFits: { type: "STRING" }, placeId: { type: "STRING" } }, required: ["title", "description", "whyItFits", "placeId"], propertyOrdering: ["title", "description", "whyItFits", "placeId"] } } }, required: ["suggestions"], propertyOrdering: ["suggestions"] }, temperature: 0.6 },
        };
        const aiResult = await requestGeminiWithFallback(primaryModel, geminiKey, requestBody);
        const aiResponse = aiResult.response;
        if (!aiResponse.ok) {
            if (aiResponse.status === 429) return bad("SAGE planning has reached its temporary usage limit. Please try again later.", 503);
            if ([408, 500, 503, 504].includes(aiResponse.status)) return bad("SAGE planning is temporarily busy. Please try again shortly.", 502);
            return bad("SAGE couldn’t finish shaping your ideas. Please try again shortly.", 502);
        }
        const aiData = await aiResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const output = aiData.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        let parsed: { suggestions?: unknown };
        try { parsed = JSON.parse(output) as { suggestions?: unknown }; } catch { return bad("SAGE returned an unusable result. Please try again.", 502); }
        if (!Array.isArray(parsed.suggestions)) return bad("SAGE returned an unusable result. Please try again.", 502);
        const byId = new Map(places.map((place) => [place.id, place]));
        const suggestions: Suggestion[] = parsed.suggestions.slice(0, 3).flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const value = item as Record<string, unknown>;
            const placeId = text(value.placeId, 200);
            if (!byId.has(placeId)) return [];
            const title = text(value.title, 100), description = text(value.description, 280), whyItFits = text(value.whyItFits, 350);
            if (!title || !description || !whyItFits) return [];
            return [{ title, description, whyItFits, placeId }];
        });
        if (!suggestions.length) return bad("SAGE couldn’t match its suggestions to the real place results. Please try again.", 502);

        const { data: generation, error: generationError } = await supabase.from("generations").insert({ user_id: user.id, prompt, constraints, provider: "google-gemini", model: aiResult.model }).select("id").single();
        if (generationError || !generation) {
            if (generationError) console.error("SAGE generation save failed", JSON.stringify({ code: generationError.code, message: generationError.message.slice(0, 160) }));
            return bad("We couldn’t save your plan. Please try again.", 500);
        }
        const rows = suggestions.map((suggestion) => {
            const place = byId.get(suggestion.placeId)!;
            return { generation_id: generation.id, user_id: user.id, title: suggestion.title, description: suggestion.description, why_it_fits: suggestion.whyItFits, place_id: place.id, place_name: place.name, address: place.address, rating: place.rating, review_count: place.reviewCount, price_level: place.priceLevel, place_url: place.mapsUrl, place_types: place.types };
        });
        const coordinateRows = coordinateRowsForPlaces(rows, new Map(places.map((place) => [place.id, place.location])));
        const planSelect = "id,title,description,why_it_fits,place_id,place_name,address,rating,review_count,price_level,place_url,latitude,longitude";
        const { data: savedPlans, error: planError } = await supabase.from("plans").insert(coordinateRows).select(planSelect);
        if (planError || !savedPlans) {
            console.error("SAGE coordinate plan save failed", JSON.stringify({
                error: databaseFailure(planError),
                planCount: coordinateRows.length,
                coordinatesProvided: coordinateRows.filter((row) => row.latitude !== null && row.longitude !== null).length,
            }));
            await supabase.from("generations").delete().eq("id", generation.id);
            return bad("We couldn’t save your plan. Please try again.", 500);
        }
        const expectedCoordinates = new Map(coordinateRows.map((row) => [row.place_id, row]));
        const lostCoordinates = savedPlans.filter((plan) => {
            const expected = expectedCoordinates.get(plan.place_id);
            return expected && validCoordinatePair(expected.latitude, expected.longitude) && !validCoordinatePair(plan.latitude, plan.longitude);
        });
        if (lostCoordinates.length) {
            console.error("SAGE coordinate plan save returned missing coordinates", JSON.stringify({ planCount: savedPlans.length, lostCount: lostCoordinates.length }));
            await supabase.from("generations").delete().eq("id", generation.id);
            return bad("We couldn’t save complete place details. Please try again.", 500);
        }
        return Response.json({ generationId: generation.id, plans: savedPlans.map((plan) => ({ ...plan, location: byId.get(plan.place_id)?.location ?? null })) });
    } catch {
        return bad("SAGE is having trouble reaching its planning services. Please try again shortly.", 502);
    }
}
