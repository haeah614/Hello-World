"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SaveButton({ planId, authenticated, initialSaved = false }: { planId: string; authenticated: boolean; initialSaved?: boolean | null }) {
    const router = useRouter();
    const [state, setState] = useState({ initialSaved, saved: initialSaved });
    if (state.initialSaved !== initialSaved) setState({ initialSaved, saved: initialSaved });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [needsLogin, setNeedsLogin] = useState(false);

    async function toggleSave() {
        if (!authenticated) {
            setMessage("Sign in with Google using the navigation above to save places.");
            setNeedsLogin(true);
            return;
        }
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch("/api/saved", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId, saved: !state.saved }),
            });
            const result = await response.json();
            if (response.status === 401) setNeedsLogin(true);
            if (!response.ok) throw new Error(result.error || "Couldn’t update saved places.");
            setState({ initialSaved, saved: result.saved });
            setMessage(result.saved ? "Saved to My Saved Places." : "Removed from My Saved Places.");
            router.refresh();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Couldn’t update saved places. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    return <div className="save-control">
        <button type="button" className={`save-button${state.saved ? " is-saved" : ""}`} aria-pressed={Boolean(state.saved)} disabled={busy || state.saved === null} onClick={toggleSave}>
            <svg width="16" height="18" viewBox="0 0 16 18" fill={state.saved ? "currentColor" : "none"} aria-hidden="true"><path d="M3 2h10v14l-5-3-5 3V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            {busy ? "Saving…" : state.saved === null ? "Saves unavailable" : state.saved ? "Saved" : "Save for later"}
        </button>
        {message && <p className="save-message" role="status">{message} {needsLogin && <Link href="/">Go to sign in</Link>}</p>}
    </div>;
}
