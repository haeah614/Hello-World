import LoginButton from "./login-button";
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

            <LoginButton />

            <table style={{ borderCollapse: "collapse", marginTop: "20px" }}>
                <thead>
                <tr>
                    <th
                        style={{
                            padding: "10px 20px",
                            borderBottom: "2px solid #ccc",
                            textAlign: "left",
                        }}
                    >
                        Movie
                    </th>
                    <th
                        style={{
                            padding: "10px 20px",
                            borderBottom: "2px solid #ccc",
                            textAlign: "left",
                        }}
                    >
                        Year
                    </th>
                </tr>
                </thead>

                <tbody>
                {movies?.map((movie) => (
                    <tr key={movie.id}>
                        <td
                            style={{
                                padding: "10px 20px",
                                borderBottom: "1px solid #ddd",
                            }}
                        >
                            {movie.title}
                        </td>
                        <td
                            style={{
                                padding: "10px 20px",
                                borderBottom: "1px solid #ddd",
                            }}
                        >
                            {movie.year}
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </main>
    );
}