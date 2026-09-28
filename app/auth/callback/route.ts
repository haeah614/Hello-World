import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
    const formData = await request.formData();
    const credential = formData.get("credential");

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.redirect(new URL("/", request.url), 303);
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();

    const destination = profile?.first_name?.trim() && profile?.last_name?.trim()
        ? "/protected"
        : "/profile";
    return NextResponse.redirect(new URL(destination, request.url), 303);
}
