import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

export default async function ProtectedPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/");
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.first_name?.trim() || !profile?.last_name?.trim()) {
        redirect("/profile");
    }

    const { data: movies, error } = await supabase
        .from("movies")
        .select("*")
        .order("year", { ascending: true });

    if (error) {
        return <main>Error: {error.message}</main>;
    }

    return (
        <main className="protected-page">
            <nav className="protected-page-nav" aria-label="Account navigation">
                <Link className="profile-back-link" href="/">← Back to SAGE</Link>
                <div>
                    <Link className="profile-back-link" href="/profile">Edit Profile</Link>
                    <form action="/auth/signout" method="post">
                        <button className="profile-back-link" type="submit">Sign Out</button>
                    </form>
                </div>
            </nav>
            <h1>My Protected Movies</h1>

            <p>Welcome, {profile.first_name} {profile.last_name}! You are signed in with Google.</p>

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
