"use client";

import Script from "next/script";
import { useRef, useState } from "react";

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: {
                        client_id: string;
                        ux_mode: "redirect";
                        login_uri: string;
                    }) => void;
                    renderButton: (
                        parent: HTMLElement,
                        options: {
                            theme: string;
                            size: string;
                            text: string;
                            shape: string;
                        }
                    ) => void;
                };
            };
        };
    }
}

export default function LoginButton() {
    const buttonRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const initializeGoogle = () => {
        if (!window.google || !buttonRef.current || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
            setStatus("error");
            return;
        }
        try {
            window.google.accounts.id.initialize({
                client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
                ux_mode: "redirect",
                login_uri: `${window.location.origin}/auth/callback`,
            });

            const button = buttonRef.current;
            button.replaceChildren();
            window.google.accounts.id.renderButton(button, {
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
            });
            setStatus("ready");
        } catch {
            setStatus("error");
        }
    };

    return (
        <div className="google-login">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onReady={initializeGoogle}
                onError={() => setStatus("error")}
            />

            <div ref={buttonRef} />
            {status === "loading" && <p role="status">Loading Google sign-in…</p>}
            {status === "error" && <p role="alert">Google sign-in couldn’t load. Please reload the page and check that your browser allows Google sign-in.</p>}
        </div>
    );
}
