import Link from "next/link"

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border bg-white p-8 shadow-xl" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Sign In</p>
        <h1 className="mt-2 text-2xl font-semibold">Continue with Scalekit</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Use your partner account to access dashboards, bots, and onboarding.
        </p>
        <Link
          href="/api/auth/login"
          className="mt-6 inline-flex rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
