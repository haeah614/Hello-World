import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
    const formData = await request.formData();
    const credential = formData.get("credential");

    console.log("Google credential received:", !!credential);

    if (!credential || typeof credential !== "string") {
        return NextResponse.redirect(new URL("/", request.url));
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: credential,
    });

    if (error) {
        return new NextResponse(`Authentication error: ${error.message}`, {
            status: 400,
        });
    }

    return NextResponse.redirect(new URL("/protected", request.url), 303);
}