"use client";

import Script from "next/script";

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
    const initializeGoogle = () => {
        if (!window.google) return;

        window.google.accounts.id.initialize({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            ux_mode: "redirect",
            login_uri: `${window.location.origin}/auth/callback`,
        });

        const button = document.getElementById("google-sign-in-button");

        if (button) {
            window.google.accounts.id.renderButton(button, {
                theme: "outline",
                size: "large",
                text: "signin_with",
                shape: "rectangular",
            });
        }
    };

    return (
        <>
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={initializeGoogle}
            />

            <div id="google-sign-in-button"></div>
        </>
    );
}