import { createSession, setSessionCookie } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { username, password } = await request.json();
  const valid =
    username === process.env.AUTH_USERNAME &&
    password === process.env.AUTH_PASSWORD;

  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await setSessionCookie(await createSession());
  return NextResponse.json({ ok: true });
}
