import { createProject, listProjects } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const projectSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable()
});

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const input = projectSchema.parse(await request.json());
  const project = await createProject(input);
  return NextResponse.json({ project }, { status: 201 });
}
