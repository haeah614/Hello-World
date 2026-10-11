export type PlaceCoordinates = { latitude: number; longitude: number };

export function validCoordinatePair(latitude: unknown, longitude: unknown): boolean {
    return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function readPlaceCoordinates(place: Record<string, unknown>): PlaceCoordinates | null {
    const location = place.location && typeof place.location === "object" ? place.location as Record<string, unknown> : null;
    return location && validCoordinatePair(location.latitude, location.longitude)
        ? { latitude: location.latitude as number, longitude: location.longitude as number }
        : null;
}

export function coordinateRowsForPlaces<T extends { place_id: string }>(rows: T[], places: Map<string, PlaceCoordinates | null>) {
    return rows.map((row) => {
        const location = places.get(row.place_id) ?? null;
        return { ...row, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null };
    });
}
