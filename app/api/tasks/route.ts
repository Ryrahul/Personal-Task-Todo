import { createTask, listAllTaskDays, listTasks, todayDate } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "progress", "done"]).default("todo"),
  startDate: z.string().optional(),
  deadline: z.string().optional().nullable()
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || todayDate();
  const [tasks, days] = await Promise.all([listTasks(date), listAllTaskDays()]);
  return NextResponse.json({ tasks, days });
}

export async function POST(request: Request) {
  const input = taskSchema.parse(await request.json());
  const task = await createTask(input);
  return NextResponse.json({ task }, { status: 201 });
}
