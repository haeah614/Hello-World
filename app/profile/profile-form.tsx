"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { createClient } from "@/lib/supabase-client";

type ProfileFormProps = {
    userId: string;
    initialFirstName: string;
    initialLastName: string;
    initialAvatarPath: string | null;
};

const bucket = "profile-photos";

export default function ProfileForm({
    userId,
    initialFirstName,
    initialLastName,
    initialAvatarPath,
}: ProfileFormProps) {
    const [firstName, setFirstName] = useState(initialFirstName);
    const [lastName, setLastName] = useState(initialLastName);
    const [avatarPath, setAvatarPath] = useState(initialAvatarPath);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const supabase = createClient();
    const avatarUrl = avatarPath
        ? supabase.storage.from(bucket).getPublicUrl(avatarPath).data.publicUrl
        : null;

    async function saveProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setMessage("");

        const { error } = await supabase.from("profiles").update({
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
        }).eq("id", userId);

        setMessage(error ? `Could not save profile: ${error.message}` : "Profile saved.");
        setBusy(false);
    }

    async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        setMessage("");
        if (!file.type.startsWith("image/")) {
            setMessage("Choose an image file.");
            event.target.value = "";
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setMessage("Choose an image smaller than 5 MB.");
            event.target.value = "";
            return;
        }

        setBusy(true);
        const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
            contentType: file.type,
            upsert: false,
        });

        if (uploadError) {
            setMessage(`Could not upload photo: ${uploadError.message}`);
            setBusy(false);
            return;
        }

        const { error: updateError } = await supabase.from("profiles")
            .update({ avatar_path: path }).eq("id", userId);
        if (updateError) {
            setMessage(`Photo uploaded, but the profile could not be updated: ${updateError.message}`);
        } else {
            setAvatarPath(path);
            setMessage("Profile photo updated.");
        }
        setBusy(false);
        event.target.value = "";
    }

    return (
        <form className="profile-form" onSubmit={saveProfile}>
            <section className="profile-section" aria-labelledby="profile-info-heading">
                <div className="profile-section-heading">
                    <div>
                        <h2 id="profile-info-heading">Personal information</h2>
                        <p>Keep your account details up to date.</p>
                    </div>
                </div>
                <div className="profile-fields">
                    <label className="profile-field">
                        <span>First name</span>
                        <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                    </label>
                    <label className="profile-field">
                        <span>Last name</span>
                        <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
                    </label>
                </div>
                <button className="profile-save-button" type="submit" disabled={busy}>{busy ? "Working…" : "Save name"}</button>
            </section>

            <section className="profile-section profile-photo-section" aria-labelledby="profile-photo-heading">
                <div className="profile-section-heading">
                    <div>
                        <h2 id="profile-photo-heading">Profile photo</h2>
                        <p>Choose a clear image that represents you.</p>
                    </div>
                </div>
                <div className="profile-photo-content">
                    {avatarUrl ? (
                        <img className="profile-avatar" src={avatarUrl} alt="Your profile" width={120} height={120} />
                    ) : (
                        <div className="profile-avatar profile-avatar-empty" aria-label="No profile photo yet">Photo</div>
                    )}
                    <div className="profile-upload-box">
                        <label className="profile-upload-label" htmlFor="profile-photo-upload">Upload a new photo</label>
                        <input id="profile-photo-upload" className="profile-file-input" type="file" accept="image/*" onChange={uploadPhoto} disabled={busy} />
                        <small>Image files up to 5 MB.</small>
                    </div>
                </div>
            </section>

            {message && (
                <p className={`profile-message ${message.startsWith("Could not") || message.startsWith("Choose") || message.startsWith("Photo uploaded, but") ? "profile-message-error" : "profile-message-success"}`} role="status" aria-live="polite">
                    {message}
                </p>
            )}
        </form>
    );
}
