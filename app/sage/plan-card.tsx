"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

type PlaceLocation = { latitude: number; longitude: number };

const LeafletPlaceMap = dynamic(() => import("./leaflet-place-map"), {
    ssr: false,
    loading: () => <div className="place-map-placeholder" aria-hidden="true" />,
});

export type PlanCardData = {
    id: string;
    title: string;
    description: string;
    why_it_fits: string;
    place_name: string;
    address: string | null;
    rating: number | null;
    review_count: number | null;
    price_level: number | null;
    place_url: string | null;
    latitude?: number | null;
    longitude?: number | null;
    location?: PlaceLocation | null;
    upvoteCount: number;
    hasVoted?: boolean;
    created_at?: string;
};

type PhotoAttribution = { displayName: string; uri?: string };

const priceLabels = ["Free", "$", "$$", "$$$", "$$$$"];

export default function PlanCard({ plan, authenticated }: { plan: PlanCardData; authenticated: boolean }) {
    const cardRef = useRef<HTMLElement>(null);
    const [photo, setPhoto] = useState<{ src: string; attributions: PhotoAttribution[]; mapsUrl?: string } | null>(null);
    const [resolvedLocation, setResolvedLocation] = useState<PlaceLocation | null>(null);
    const persistedLocation = typeof plan.latitude === "number" && Number.isFinite(plan.latitude) && typeof plan.longitude === "number" && Number.isFinite(plan.longitude)
        ? { latitude: plan.latitude, longitude: plan.longitude }
        : null;
    const hasTransientLocation = Boolean(plan.location);
    const hasPersistedLocation = Boolean(persistedLocation);
    const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">(hasTransientLocation || hasPersistedLocation ? "ready" : "loading");
    const mapLocation = plan.location ?? persistedLocation ?? resolvedLocation;
    const [count, setCount] = useState(plan.upvoteCount);
    const propHasVoted = Boolean(plan.hasVoted);
    const [voteState, setVoteState] = useState({ propHasVoted, voted: propHasVoted });
    if (voteState.propHasVoted !== propHasVoted) setVoteState({ propHasVoted, voted: propHasVoted });
    const voted = voteState.voted;
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;

        const controller = new AbortController();
        let objectUrl = "";
        let requested = false;
        const loadPhoto = async () => {
            if (requested) return;
            requested = true;
            try {
                let locationResolved = hasTransientLocation || hasPersistedLocation;
                if (!locationResolved && plan.address) {
                    const geocodeResponse = await fetch(`/api/geocode?address=${encodeURIComponent(plan.address)}`, { signal: controller.signal, cache: "no-store" });
                    if (geocodeResponse.ok) {
                        const result = await geocodeResponse.json() as { location?: PlaceLocation | null };
                        const location = result.location;
                        if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
                            setResolvedLocation(location);
                            setMapState("ready");
                            locationResolved = true;
                        }
                    }
                }
                const response = await fetch(`/api/place-photo?planId=${encodeURIComponent(plan.id)}`, { signal: controller.signal, cache: "no-store" });
                if (!locationResolved) setMapState("unavailable");
                if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return;
                const mapsUrl = response.headers.get("X-Photo-Maps-Uri");
                if (!mapsUrl) return;
                const blob = await response.blob();
                objectUrl = URL.createObjectURL(blob);
                let attributions: PhotoAttribution[] = [];
                try {
                    const encodedAttributions = response.headers.get("X-Photo-Attributions");
                    const decoded = encodedAttributions ? JSON.parse(decodeURIComponent(encodedAttributions)) as unknown : [];
                    if (Array.isArray(decoded)) {
                        attributions = decoded.filter((item): item is PhotoAttribution => Boolean(item && typeof item === "object" && "displayName" in item && typeof item.displayName === "string"));
                    }
                } catch {
                    attributions = [];
                }
                setPhoto({
                    src: objectUrl,
                    attributions,
                    mapsUrl,
                });
            } catch {
                if (!controller.signal.aborted && !hasTransientLocation && !hasPersistedLocation) setMapState("unavailable");
                // Photo loading is optional; keep the existing card when it is unavailable.
            }
        };

        if ("IntersectionObserver" in window) {
            const observer = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    observer.disconnect();
                    void loadPhoto();
                }
            }, { rootMargin: "180px" });
            observer.observe(card);
            return () => {
                observer.disconnect();
                controller.abort();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
            };
        }

        void loadPhoto();
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [plan.id, plan.place_url, plan.address, plan.location?.latitude, plan.location?.longitude, plan.latitude, plan.longitude, hasTransientLocation, hasPersistedLocation]);

    async function vote() {
        if (!authenticated) {
            setMessage("Sign in to add your vote.");
            return;
        }
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch("/api/vote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id, value: 1 }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "Could not save your vote.");
            if (typeof result.hasVoted !== "boolean") throw new Error("Could not update your vote. Please try again.");
            setCount(typeof result.upvotes === "number" ? result.upvotes : Math.max(0, count + (result.hasVoted ? 1 : -1)));
            setVoteState({ propHasVoted, voted: result.hasVoted });
            setMessage(result.hasVoted ? "Your vote is on the board." : "Your vote was removed.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save your vote.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <article className="plan-card" ref={cardRef}>
            {photo && <figure className="plan-photo">
                <Image src={photo.src} alt={`A Google Places photo of ${plan.place_name}`} fill sizes="(max-width: 700px) 100vw, 33vw" unoptimized />
                <figcaption>
                    {photo.attributions.length > 0 && <span>Photo by {photo.attributions.map((attribution, index) => <span key={`${attribution.displayName}-${index}`}>
                        {index > 0 && ", "}{attribution.uri
                            ? <a href={attribution.uri} target="_blank" rel="noreferrer">{attribution.displayName}</a>
                            : attribution.displayName}
                    </span>)}</span>}
                    {photo.mapsUrl && <a href={photo.mapsUrl} target="_blank" rel="noreferrer">Google Maps</a>}
                    {!photo.mapsUrl && <span>Google Maps</span>}
                </figcaption>
            </figure>}
            <div className="plan-card-topline"><span className="real-label"><i /> REAL PLACE</span><span className="community-label">COMMUNITY PICK</span></div>
            <h3>{plan.title}</h3>
            <p className="plan-description">{plan.description}</p>
            <div className="place-panel">
                <div className="place-monogram">{plan.place_name.slice(0, 1)}</div>
                <div className="place-copy"><span className="place-tag">THE PLACE</span><strong>{plan.place_name}</strong><span>{plan.address || "Address not provided by place listing"}</span>
                    <div className="place-facts">
                        {plan.rating !== null && <span>★ {plan.rating.toFixed(1)}{plan.review_count !== null ? ` · ${plan.review_count.toLocaleString()} reviews` : ""}</span>}
                        {plan.price_level !== null && <span>{priceLabels[plan.price_level] ?? "Price not listed"}</span>}
                        {plan.rating === null && plan.price_level === null && <span>Details unavailable</span>}
                    </div>
                </div>
            </div>
            <div className="place-map-frame" aria-label={`Map for ${plan.place_name}`}>
                {mapState === "ready" && mapLocation
                    ? <LeafletPlaceMap location={mapLocation} placeName={plan.place_name} />
                    : <div className={`place-map-placeholder${mapState === "unavailable" ? " is-unavailable" : ""}`} role={mapState === "unavailable" ? "status" : undefined}>
                        {mapState === "unavailable" ? "Map location unavailable" : "Finding this place on the map…"}
                    </div>}
            </div>
            <div className="ai-note"><span>THE SAGE NOTE</span><p>{plan.why_it_fits}</p></div>
            <div className="plan-card-footer">
                {plan.place_url ? <a className="place-link" href={plan.place_url} target="_blank" rel="noreferrer">View place ↗</a> : <span className="place-link-muted">Place details</span>}
                <button className={`vote-button${voted ? " is-voted" : ""}`} type="button" onClick={vote} disabled={busy} aria-pressed={voted}>{voted ? "✓ I’d go" : "I’d go"} <span>↑ {count}</span></button>
            </div>
            {message && <p className="vote-message" role="status">{message}</p>}
        </article>
    );
}
