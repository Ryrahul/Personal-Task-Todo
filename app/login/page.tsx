"use client";

import { LockKeyhole } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    setLoading(false);
    if (response.ok) {
      window.location.href = "/";
      return;
    }
    setError("That username or password did not match.");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f7f4ec_0%,#eef5f3_48%,#f8eee4_100%)] px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-lg border bg-card shadow-soft md:grid-cols-[1fr_0.9fr]">
          <div className="flex min-h-[560px] flex-col justify-between bg-[#153a3a] p-8 text-white md:p-12">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white/12">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="max-w-lg">
              <p className="mb-4 text-sm uppercase tracking-[0.18em] text-orange-200">Personal Task Todo</p>
              <h1 className="text-4xl font-semibold leading-tight md:text-6xl">A calm control room for every day&apos;s work.</h1>
              <p className="mt-5 max-w-md text-base leading-7 text-white/75">
                Plan by deadline, sort by priority, drag work through progress, and let AI capture tasks from natural language.
              </p>
            </div>
          </div>
          <form onSubmit={submit} className="flex flex-col justify-center gap-5 p-8 md:p-12">
            <div>
              <h2 className="text-2xl font-semibold">Sign in</h2>
              <p className="mt-2 text-sm text-muted-foreground">Protected with a simple username and password for deployment.</p>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Username
              <input name="username" className="h-11 rounded-md border bg-white px-3 outline-none ring-primary/20 focus:ring-4" autoComplete="username" required />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Password
              <input name="password" type="password" className="h-11 rounded-md border bg-white px-3 outline-none ring-primary/20 focus:ring-4" autoComplete="current-password" required />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button disabled={loading} className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
              {loading ? "Checking..." : "Enter workspace"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
