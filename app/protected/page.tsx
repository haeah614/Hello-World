import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function ProtectedPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/");
    }

    const { data: movies, error } = await supabase
        .from("movies")
        .select("*")
        .order("year", { ascending: true });

    if (error) {
        return <main>Error: {error.message}</main>;
    }

    return (
        <main>
            <h1>My Protected Movies</h1>

            <p>Welcome! You are signed in with Google.</p>

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