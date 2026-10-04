"use client";

import Link from "next/link";
import { useState } from "react";

const stations = [
    { name: "125 St", x: 25, y: 9, side: "right", context: "A little farther uptown, with Harlem close by.", categories: ["Coffee", "Food", "Outdoors"] },
    { name: "116 St–Columbia University", shortName: "116 St · Columbia", x: 32, y: 22, side: "left", context: "Near Columbia University.", categories: ["Coffee", "Study", "Food", "Outdoors"] },
    { name: "110 St", x: 38, y: 35, side: "right", context: "Between campus and the park side of the neighborhood.", categories: ["Coffee", "Food", "Outdoors"] },
    { name: "103 St", x: 44, y: 48, side: "left", context: "A neighborhood stop along Broadway.", categories: ["Coffee", "Food", "Study"] },
    { name: "96 St", x: 50, y: 61, side: "right", context: "A good starting point for the Upper West Side.", categories: ["Coffee", "Food", "Outdoors"] },
    { name: "86 St", x: 57, y: 74, side: "left", context: "Explore a little farther downtown.", categories: ["Coffee", "Food", "Study"] },
    { name: "72 St", x: 64, y: 87, side: "right", context: "A downtown stop for a change of pace.", categories: ["Coffee", "Food", "Outdoors"] },
] as const;

export default function ExploreNearColumbia() {
    const [selectedStation, setSelectedStation] = useState(1);
    const station = stations[selectedStation];

    return (
        <section className="explore-section explore-hero" aria-labelledby="explore-heading">
            <div className="explore-heading">
                <p className="eyebrow">Explore near Columbia</p>
                <h2 id="explore-heading">Pick a stop. See what’s worth doing nearby.</h2>
            </div>
            <div className="explore-composition">
                <div className="station-map-plot" role="group" aria-label="Choose a subway stop near Columbia">
                    <svg className="station-routes" viewBox="0 0 600 440" preserveAspectRatio="none" aria-hidden="true">
                        <path className="station-route station-route-underlay" d="M150 38 C165 80 177 100 190 100 S211 145 225 160 S245 207 260 220 S282 268 300 280 S324 326 340 340 S368 389 385 402" />
                        <path className="station-route station-route-main" d="M150 38 C165 80 177 100 190 100 S211 145 225 160 S245 207 260 220 S282 268 300 280 S324 326 340 340 S368 389 385 402" />
                        <path className="station-route station-route-branch" d="M72 154 C132 156 172 150 225 160 S333 180 410 181" />
                        <path className="station-route station-route-branch" d="M185 284 C236 279 269 278 300 280 S384 296 445 294" />
                    </svg>
                    {stations.map((item, index) => (
                        <button
                            key={item.name}
                            type="button"
                            className={`station-button station-label-${item.side}${selectedStation === index ? " is-selected" : ""}`}
                            style={{ left: `${item.x}%`, top: `${item.y}%` }}
                            aria-label={`Explore around ${item.name}`}
                            aria-pressed={selectedStation === index}
                            onClick={() => setSelectedStation(index)}
                        >
                            <span className="station-dot" aria-hidden="true" />
                            <span className="station-name">{"shortName" in item ? item.shortName : item.name}</span>
                        </button>
                    ))}
                    <p className="station-map-caption">BROADWAY · UPPER WEST SIDE</p>
                </div>
                <aside className="station-panel" aria-live="polite" aria-atomic="true">
                    <div className="station-detail">
                        <p className="eyebrow">Selected stop</p>
                        <h3>{station.name}</h3>
                        <p className="station-context">{station.context}</p>
                    </div>
                    <div className="station-panel-actions">
                        <nav className="station-categories" aria-label={`Explore categories near ${station.name}`}>
                            {station.categories.map((category) => (
                                <Link key={category} href={`/create?idea=${encodeURIComponent(`${category} near ${station.name}`)}`} className="station-category">
                                    {category}
                                </Link>
                            ))}
                        </nav>
                        <Link className="station-explore-link" href={`/create?idea=${encodeURIComponent(`Explore near ${station.name}`)}`}>Explore nearby <span aria-hidden="true">→</span></Link>
                    </div>
                </aside>
            </div>
        </section>
    );
}
