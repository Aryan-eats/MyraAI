import { NextResponse } from "next/server"
import { getSession } from "./lib/getSession"

export async function proxy() {
  const session = await getSession()
  if (!session) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    return NextResponse.redirect(new URL("/login", appUrl))
  }

  return NextResponse.next()
}

export const middleware = proxy

export const config = {
  matcher: "/dashboard/:path*",
}
