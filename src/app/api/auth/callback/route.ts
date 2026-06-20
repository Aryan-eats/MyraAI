import { scalekit } from "@/lib/ScaleKit";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_MAX_AGE = 24 * 60 * 60 // 24 hours in seconds
const isProduction = process.env.NODE_ENV === "production"

export async function GET(req:NextRequest) {
    const {searchParams}=new URL(req.url)
    const code=searchParams.get("code")
    const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const redirectUri=`${appUrl}/api/auth/callback`

    if(!code){
        return NextResponse.json({message:"code is not found"},{status:400})
    }

    const session=await scalekit.authenticateWithCode(code,redirectUri)

    const response= NextResponse.redirect(appUrl)
    const cookieOptions = {
        httpOnly: true,
        maxAge: COOKIE_MAX_AGE,
        secure: isProduction,
        sameSite: "lax" as const,
        path: "/",
    }

    response.cookies.set("access_token", session.accessToken, cookieOptions)
    response.cookies.set("myra_session", session.accessToken, cookieOptions)

    return response
}
