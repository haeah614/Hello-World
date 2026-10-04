"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export type PlaceLocation = { latitude: number; longitude: number };

export default function LeafletPlaceMap({ location, placeName }: { location: PlaceLocation; placeName: string }) {
    const center: [number, number] = [location.latitude, location.longitude];

    return (
        <MapContainer
            center={center}
            zoom={15}
            scrollWheelZoom={false}
            zoomControl={false}
            className="leaflet-place-map"
            aria-label={`OpenStreetMap showing ${placeName}`}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CircleMarker
                center={center}
                radius={8}
                pathOptions={{ color: "#36473b", weight: 3, fillColor: "#829887", fillOpacity: 1 }}
            >
                <Popup>{placeName}</Popup>
            </CircleMarker>
        </MapContainer>
    );
}
