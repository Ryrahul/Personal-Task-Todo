import { createAzure } from "@ai-sdk/azure";
import { generateText, tool } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, createTask, getProjectByName, listAllTasks, listProjects, listTasks } from "@/lib/db";
import type { Task } from "@/lib/db";

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function editDistance(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, row) => [row, ...Array(b.length).fill(0)]);
  for (let column = 1; column <= b.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
  }
  return matrix[a.length][b.length];
}

async function resolveProjectName(input?: string | null) {
  if (!input?.trim()) return null;
  const exact = await getProjectByName(input);
  if (exact) return exact.name;

  const normalizedInput = normalizeName(input);
  const projects = await listProjects();
  const scored = projects
    .map((project) => {
      const normalizedProject = normalizeName(project.name);
      const distance = editDistance(normalizedInput, normalizedProject);
      const contains = normalizedProject.includes(normalizedInput) || normalizedInput.includes(normalizedProject);
      return { project, distance, contains };
    })
    .sort((a, b) => Number(b.contains) - Number(a.contains) || a.distance - b.distance);
  const best = scored[0];
  const allowedDistance = Math.max(1, Math.ceil(Math.max(normalizedInput.length, best?.project.name.length || 0) * 0.35));
  if (best && (best.contains || best.distance <= allowedDistance)) return best.project.name;
  return null;
}

function closestTaskTitle(input: string | null | undefined, tasks: Task[]) {
  if (!input?.trim()) return null;
  const normalizedInput = normalizeName(input);
  const scored = tasks
    .map((task) => {
      const normalizedTitle = normalizeName(task.title);
      const distance = editDistance(normalizedInput, normalizedTitle);
      const contains = normalizedTitle.includes(normalizedInput) || normalizedInput.includes(normalizedTitle);
      return { task, distance, contains };
    })
    .sort((a, b) => Number(b.contains) - Number(a.contains) || a.distance - b.distance);
  const best = scored[0];
  const allowedDistance = Math.max(2, Math.ceil(Math.max(normalizedInput.length, best?.task.title.length || 0) * 0.35));
  if (best && (best.contains || best.distance <= allowedDistance)) return best.task;
  return null;
}

export async function POST(request: Request) {
  const { message, date } = await request.json();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY;
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME || process.env.AZURE_RESOURCE_NAME;

  if (!apiKey || !resourceName || !deployment) {
    return NextResponse.json({
      reply: "Azure OpenAI is not configured yet. Add the API key, resource name, and deployment name in your environment."
    });
  }

  const azure = createAzure({ apiKey, resourceName });

  const result = await generateText({
    model: azure(deployment),
    system: `You are a concise personal task assistant. Today is ${date}.

You can add tasks and answer questions about the user's tasks.
Use listTasksForDate for day questions, listAllTasks or summarizeTasks for broad questions, and listProjects before assigning work to a project.
Tasks can only use existing projects. Project names from voice input may be misspelled, so use the closest existing project when it is obvious, for example "hyperse" can mean "Hyperce". If the user explicitly asks to create a project, call createProject. If adding a task clearly requires a project that does not exist, create it only when the user asked for that project in the same request; otherwise add the task without a project and mention that the project needs to be created.
When the user asks for a subtask, child task, "sub", or says a task should go under/inside another task, use addSubtask instead of addTask. Parent task names may be misspelled, so choose the closest existing parent task title.
If a user gives a deadline like "after 3 days", set startDate to today and deadline to the calculated final date so it appears across every day through that deadline.
Keep final replies short, specific, and useful.`,
    prompt: String(message || ""),
    maxSteps: 5,
    tools: {
      addTask: tool({
        description: "Add a top-level task to the user's todo system. Do not use this for subtasks or child tasks.",
        parameters: z.object({
          title: z.string().describe("Short action-oriented task title"),
          description: z.string().optional(),
          projectName: z.string().optional().describe("Existing project name only. Call listProjects first when unsure."),
          priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
          startDate: z.string().describe("YYYY-MM-DD"),
          deadline: z.string().nullable().optional().describe("YYYY-MM-DD or null")
        }),
        execute: async (input) => {
          const projectName = await resolveProjectName(input.projectName);
          const task = await createTask({ ...input, projectName, status: "todo" });
          return { id: task.id, title: task.title, project: task.project_name };
        }
      }),
      addSubtask: tool({
        description: "Add a subtask under an existing parent task. Use this when the user says subtask, sub, child task, under, inside, or otherwise implies the new task belongs beneath another task.",
        parameters: z.object({
          title: z.string().describe("Short action-oriented subtask title"),
          parentTaskTitle: z.string().describe("Closest existing parent task title. Misspellings are okay."),
          description: z.string().optional(),
          projectName: z.string().optional().describe("Existing project name only. If omitted, the parent task project is used."),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          startDate: z.string().optional().describe("YYYY-MM-DD. If omitted, the parent task start date is used."),
          deadline: z.string().nullable().optional().describe("YYYY-MM-DD or null. If omitted, the parent task deadline is used.")
        }),
        execute: async (input) => {
          const tasks = await listAllTasks(200);
          const parentTask = closestTaskTitle(input.parentTaskTitle, tasks);
          if (!parentTask) {
            return {
              error: "Parent task not found",
              availableParentTasks: tasks.slice(0, 20).map((task) => task.title)
            };
          }
          const projectName = input.projectName ? await resolveProjectName(input.projectName) : parentTask.project_name;
          const task = await createTask({
            title: input.title,
            description: input.description,
            projectName,
            parentTaskId: parentTask.id,
            priority: input.priority || parentTask.priority,
            status: parentTask.status,
            startDate: input.startDate || parentTask.start_date,
            deadline: input.deadline === undefined ? parentTask.deadline : input.deadline
          });
          return { id: task.id, title: task.title, parent: task.parent_task_title, project: task.project_name };
        }
      }),
      listTasksForDate: tool({
        description: "List tasks visible on a specific date.",
        parameters: z.object({
          date: z.string().describe("YYYY-MM-DD")
        }),
        execute: async ({ date }) => {
          const tasks = await listTasks(date);
          return tasks.map((task) => ({
            title: task.title,
            status: task.status,
            priority: task.priority,
            project: task.project_name,
            parent: task.parent_task_title,
            startDate: task.start_date,
            deadline: task.deadline,
            description: task.description
          }));
        }
      }),
      listAllTasks: tool({
        description: "List recent tasks across all days and projects.",
        parameters: z.object({
          limit: z.number().min(1).max(200).default(100)
        }),
        execute: async ({ limit }) => {
          const tasks = await listAllTasks(limit);
          return tasks.map((task) => ({
            title: task.title,
            status: task.status,
            priority: task.priority,
            project: task.project_name,
            parent: task.parent_task_title,
            startDate: task.start_date,
            deadline: task.deadline,
            completedAt: task.completed_at
          }));
        }
      }),
      summarizeTasks: tool({
        description: "Get tasks in a compact summary-friendly shape.",
        parameters: z.object({
          limit: z.number().min(1).max(200).default(100)
        }),
        execute: async ({ limit }) => {
          const tasks = await listAllTasks(limit);
          return {
            total: tasks.length,
            byStatus: {
              todo: tasks.filter((task) => task.status === "todo").length,
              progress: tasks.filter((task) => task.status === "progress").length,
              done: tasks.filter((task) => task.status === "done").length
            },
            tasks: tasks.map((task) => ({
              title: task.title,
              status: task.status,
              priority: task.priority,
              project: task.project_name,
              parent: task.parent_task_title,
              startDate: task.start_date,
              deadline: task.deadline
            }))
          };
        }
      }),
      listProjects: tool({
        description: "List available projects that tasks may be assigned to.",
        parameters: z.object({}),
        execute: async () => {
          return await listProjects();
        }
      }),
      createProject: tool({
        description: "Create a project only when the user explicitly asks for a project to be created or a new project is clearly required by their task request.",
        parameters: z.object({
          name: z.string(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb")
        }),
        execute: async (input) => {
          return await createProject(input);
        }
      })
    }
  });

  return NextResponse.json({ reply: result.text || "Done." });
}
