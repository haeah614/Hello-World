import { supabase } from "@/lib/supabase";

export default async function Home() {
    const { data: movies, error } = await supabase
        .from("movies")
        .select("*")
        .order("year", { ascending: true });

    if (error) {
        return <main>Error: {error.message}</main>;
    }

    return (
        <main>
            <h1>My Favorite Movies</h1>

            <ul>
                {movies?.map((movie) => (
                    <li key={movie.id}>
                        {movie.title} ({movie.year})
                    </li>
                ))}
            </ul>
        </main>
    );
}