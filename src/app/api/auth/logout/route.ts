
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
   const cookieStore=await cookies()
   cookieStore.delete("access_token")
   cookieStore.delete("myra_session")
   const appUrl=process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
   return NextResponse.redirect(appUrl)
}
