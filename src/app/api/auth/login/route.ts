import { scalekit } from "@/lib/ScaleKit";
import { NextResponse } from "next/server";

export async function GET() {
    const redirectUri=`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`
    const url=scalekit.getAuthorizationUrl(redirectUri)
    return NextResponse.redirect(url)
} 
