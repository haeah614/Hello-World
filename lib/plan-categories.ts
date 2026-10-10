// Exact Google Places type mappings. Never infer from names, descriptions, or
// array position: place_types is multi-valued, not an ordered primary type.
// Generic food/store/tourist_attraction/establishment tags are not enough.
// Reference: https://developers.google.com/maps/documentation/places/web-service/place-types
export const planCategories = [
    { id: "food", label: "Food", types: [
        "restaurant", "meal_takeaway", "food_court", "bakery", "pastry_shop",
        "deli", "diner", "sandwich_shop", "bagel_shop", "dessert_shop",
        "ice_cream_shop", "donut_shop", "bar_and_grill", "gastropub", "bistro",
        "american_restaurant", "asian_restaurant", "australian_restaurant",
        "barbecue_restaurant", "brazilian_restaurant", "breakfast_restaurant",
        "brunch_restaurant", "buffet_restaurant", "chinese_restaurant",
        "dessert_restaurant", "eastern_european_restaurant", "european_restaurant",
        "fast_food_restaurant", "fine_dining_restaurant", "french_restaurant",
        "greek_restaurant", "hamburger_restaurant", "indian_restaurant",
        "indonesian_restaurant", "italian_restaurant", "japanese_restaurant",
        "japanese_izakaya_restaurant", "korean_restaurant", "korean_barbecue_restaurant",
        "latin_american_restaurant", "lebanese_restaurant", "mediterranean_restaurant",
        "mexican_restaurant", "middle_eastern_restaurant", "pizza_restaurant",
        "ramen_restaurant", "seafood_restaurant", "spanish_restaurant", "steak_house",
        "sushi_restaurant", "tapas_restaurant", "thai_restaurant", "turkish_restaurant",
        "vegan_restaurant", "vegetarian_restaurant", "vietnamese_restaurant",
    ] },
    { id: "coffee", label: "Coffee & Cafés", types: [
        "cafe", "coffee_shop", "coffee_roastery", "coffee_stand", "tea_house",
        "cat_cafe", "dog_cafe",
    ] },
    { id: "bars", label: "Bars", types: [
        "bar", "cocktail_bar", "wine_bar", "sports_bar", "lounge_bar", "hookah_bar",
        "pub", "irish_pub", "beer_garden", "brewpub", "bar_and_grill", "gastropub",
    ] },
    { id: "arts", label: "Arts & Culture", types: [
        "museum", "art_museum", "history_museum", "art_gallery", "art_studio",
        "performing_arts_theater", "movie_theater", "opera_house", "concert_hall",
        "philharmonic_hall", "amphitheatre", "live_music_venue", "cultural_center",
        "cultural_landmark", "historical_place", "historical_landmark", "monument",
        "sculpture", "library", "book_store",
    ] },
    { id: "outdoors", label: "Outdoors", types: [
        "park", "city_park", "state_park", "national_park", "dog_park", "garden",
        "botanical_garden", "hiking_area", "beach", "picnic_ground", "plaza",
        "wildlife_park", "wildlife_refuge", "cycling_park", "skateboard_park",
    ] },
    { id: "activities", label: "Activities", types: [
        "bowling_alley", "video_arcade", "amusement_center", "amusement_park",
        "aquarium", "zoo", "water_park", "miniature_golf_course", "go_karting_venue",
        "paintball_center", "indoor_playground", "adventure_sports_center",
        "sports_activity_location", "sports_complex", "swimming_pool",
        "ice_skating_rink", "karaoke", "comedy_club", "dance_hall", "night_club",
        "planetarium", "observation_deck",
    ] },
] as const;

export type PlanCategory = "" | typeof planCategories[number]["id"];
type TypedPlace = { place_types?: readonly string[] | null };

export function matchesPlanCategory(plan: TypedPlace, category: PlanCategory): boolean {
    if (category === "") return true;
    const types: readonly string[] = planCategories.find((item) => item.id === category)?.types ?? [];
    return (plan.place_types ?? []).some((type) => types.includes(type));
}

// Preserve feed ranking; callers apply the existing display limit AFTER filtering.
export function filterPlansByCategory<T extends TypedPlace>(plans: T[], category: PlanCategory): T[] {
    return plans.filter((plan) => matchesPlanCategory(plan, category));
}
