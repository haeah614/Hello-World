import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/");

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("first_name,last_name,avatar_path")
        .eq("id", user.id)
        .maybeSingle();

    return (
        <main className="profile-page">
            <div className="profile-card">
                <header className="profile-header">
                    <span className="profile-kicker">Account settings</span>
                    <h1>Your profile</h1>
                    <p>Manage the name and photo shown with your account.</p>
                    <div className="profile-account">Signed in as <strong>{user.email}</strong></div>
                </header>
                {error ? (
                    <p className="profile-alert" role="alert">Could not load your profile: {error.message}. Run the Assignment 3 SQL migration in Supabase, then refresh.</p>
                ) : !profile ? (
                    <p className="profile-alert" role="alert">Your profile row is missing. Run the Assignment 3 SQL migration and sign in again.</p>
                ) : (
                    <ProfileForm
                        userId={user.id}
                        initialFirstName={profile.first_name ?? ""}
                        initialLastName={profile.last_name ?? ""}
                        initialAvatarPath={profile.avatar_path}
                    />
                )}
                <footer className="profile-footer">
                    <Link className="profile-back-link" href="/protected">← Back to protected movies</Link>
                </footer>
            </div>
        </main>
    );
}
