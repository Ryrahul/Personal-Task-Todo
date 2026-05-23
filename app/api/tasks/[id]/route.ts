import { deleteTask, updateTask } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "progress", "done"]).optional(),
  startDate: z.string().optional(),
  deadline: z.string().nullable().optional(),
  sortOrder: z.number().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const task = await updateTask(id, patchSchema.parse(await request.json()));
  return NextResponse.json({ task });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await deleteTask(id);
  return NextResponse.json({ ok: true });
}
