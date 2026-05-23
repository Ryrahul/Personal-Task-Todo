import { reorderTasks } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ ids: z.array(z.string().uuid()) });

export async function POST(request: Request) {
  const { ids } = schema.parse(await request.json());
  await reorderTasks(ids);
  return NextResponse.json({ ok: true });
}
