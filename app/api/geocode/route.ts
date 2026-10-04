import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Location = { latitude: number; longitude: number };
type CacheEntry = { location: Location | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

function validLocation(value: unknown): value is { lat: string; lon: string } {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return typeof item.lat === "string" && typeof item.lon === "string"
        && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
        && Number(item.lat) >= -90 && Number(item.lat) <= 90
        && Number(item.lon) >= -180 && Number(item.lon) <= 180;
}

function normalizeAddress(address: string) {
    return address
        .replace(/\s+#\s*[\w-]+/gi, "")
        .replace(/\b(?:suite|ste|apartment|apt|unit)\.?\s*#?\s*[\w-]+/gi, "")
        .replace(/\b\d+(?:st|nd|rd|th)\s+floor\b/gi, "")
        .replace(/\bfloor\s*#?\s*[\w-]+/gi, "")
        .replace(/\s+\d+FL(?:\s+[A-Z0-9-]+)?(?=\s*,|$)/gi, "")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .replace(/\s+,/g, ",")
        .trim()
        .replace(/^,\s*|,\s*$/g, "");
}

async function waitForRateLimit() {
    const wait = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
}

export async function GET(request: Request) {
    const address = new URL(request.url).searchParams.get("address")?.trim().slice(0, 300) ?? "";
    if (!address) return NextResponse.json({ location: null }, { status: 400 });
    const normalizedAddress = normalizeAddress(address);
    const addresses = normalizedAddress.toLowerCase() === address.toLowerCase()
        ? [address]
        : [address, normalizedAddress];
    const result = requestQueue.then(async () => {
        for (const candidate of addresses) {
            const key = candidate.toLowerCase();
            const cached = cache.get(key);
            if (cached && cached.expiresAt > Date.now()) {
                if (cached.location) return cached.location;
                continue;
            }

            await waitForRateLimit();
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(candidate)}`, {
                    headers: {
                        "User-Agent": "SAGE NYC student project/1.0",
                        ...(process.env.NEXT_PUBLIC_SITE_URL ? { Referer: process.env.NEXT_PUBLIC_SITE_URL } : {}),
                    },
                    signal: AbortSignal.timeout(8000),
                    cache: "no-store",
                });
                if (!response.ok) return null;
                const entries = await response.json() as unknown;
                const location = Array.isArray(entries) && entries[0] && validLocation(entries[0])
                    ? { latitude: Number(entries[0].lat), longitude: Number(entries[0].lon) }
                    : null;
                cache.set(key, { location, expiresAt: Date.now() + 86_400_000 });
                if (location) return location;
            } catch {
                return null;
            }
        }
        return null;
    });
    requestQueue = result.then(() => undefined, () => undefined);
    const location = await result;
    return NextResponse.json({ location });
}
