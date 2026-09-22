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