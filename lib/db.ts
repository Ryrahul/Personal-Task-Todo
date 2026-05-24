import { neon } from "@neondatabase/serverless";
import { addDays, formatISO } from "date-fns";

const sql = neon(process.env.DATABASE_URL!);
let initialized = false;
let initializePromise: Promise<void> | null = null;

export type TaskStatus = "todo" | "progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type Project = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Task = {
  id: string;
  parent_task_id: string | null;
  parent_task_title: string | null;
  title: string;
  description: string | null;
  project_id: string | null;
  project: string | null;
  project_name: string | null;
  project_color: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string;
  deadline: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function todayDate() {
  const timeZone = process.env.APP_TIME_ZONE || "Asia/Kathmandu";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function ensureSchema() {
  if (initialized) return;
  if (initializePromise) return initializePromise;
  initializePromise = initializeSchema();
  try {
    await initializePromise;
    initialized = true;
  } finally {
    initializePromise = null;
  }
}

async function initializeSchema() {
  await sql`
    create table if not exists projects (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      color text not null default '#2563eb',
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists tasks (
      id uuid primary key default gen_random_uuid(),
      parent_task_id uuid references tasks(id) on delete cascade,
      title text not null,
      description text,
      project text,
      project_id uuid references projects(id) on delete set null,
      priority text not null default 'medium',
      status text not null default 'todo',
      start_date date not null default current_date,
      deadline date,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz
    )
  `;
  await sql`alter table tasks add column if not exists project_id uuid references projects(id) on delete set null`;
  await sql`alter table tasks add column if not exists parent_task_id uuid references tasks(id) on delete cascade`;
  await sql`
    insert into projects (name)
    select distinct trim(project)
    from tasks
    where project is not null and trim(project) <> ''
    on conflict (name) do nothing
  `;
  await sql`
    update tasks
    set project_id = projects.id
    from projects
    where tasks.project_id is null
      and tasks.project is not null
      and trim(tasks.project) = projects.name
  `;
}

export async function listTasks(date: string) {
  await ensureSchema();
  return await sql`
    select
      tasks.id,
      tasks.parent_task_id::text,
      parent_tasks.title as parent_task_title,
      tasks.title,
      tasks.description,
      tasks.project_id::text,
      projects.name as project,
      projects.name as project_name,
      projects.color as project_color,
      tasks.priority,
      tasks.status,
      tasks.start_date::text,
      tasks.deadline::text,
      tasks.sort_order,
      tasks.created_at::text,
      tasks.updated_at::text,
      tasks.completed_at::text
    from tasks
    left join projects on projects.id = tasks.project_id
    left join tasks parent_tasks on parent_tasks.id = tasks.parent_task_id
    where tasks.start_date <= ${date}::date
      and (
        tasks.deadline is null
        or tasks.deadline >= ${date}::date
        or tasks.status <> 'done'
      )
    order by
      case tasks.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
      tasks.sort_order asc,
      tasks.parent_task_id asc nulls first,
      tasks.created_at desc
  ` as unknown as Task[];
}

export async function listAllTasks(limit = 200) {
  await ensureSchema();
  return await sql`
    select
      tasks.id,
      tasks.parent_task_id::text,
      parent_tasks.title as parent_task_title,
      tasks.title,
      tasks.description,
      tasks.project_id::text,
      projects.name as project,
      projects.name as project_name,
      projects.color as project_color,
      tasks.priority,
      tasks.status,
      tasks.start_date::text,
      tasks.deadline::text,
      tasks.sort_order,
      tasks.created_at::text,
      tasks.updated_at::text,
      tasks.completed_at::text
    from tasks
    left join projects on projects.id = tasks.project_id
    left join tasks parent_tasks on parent_tasks.id = tasks.parent_task_id
    order by
      tasks.start_date desc,
      case tasks.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
      tasks.sort_order asc,
      tasks.parent_task_id asc nulls first
    limit ${limit}
  ` as unknown as Task[];
}

export async function listAllTaskDays() {
  await ensureSchema();
  const rows = await sql`
    select start_date::text, deadline::text
    from tasks
    order by start_date desc
  ` as unknown as { start_date: string; deadline: string | null }[];
  const days = new Set<string>();
  for (const row of rows) {
    const start = new Date(`${row.start_date}T00:00:00`);
    const end = new Date(`${row.deadline || row.start_date}T00:00:00`);
    for (let d = start; d <= end; d = addDays(d, 1)) {
      days.add(formatISO(d, { representation: "date" }));
    }
  }
  return [...days].sort().reverse();
}

export async function listProjects() {
  await ensureSchema();
  return await sql`
    select id::text, name, color, created_at::text
    from projects
    order by lower(name) asc
  ` as unknown as Project[];
}

export async function createProject(input: { name: string; color?: string | null }) {
  await ensureSchema();
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const rows = await sql`
    insert into projects (name, color)
    values (${name}, ${input.color || "#2563eb"})
    on conflict (name) do update set name = excluded.name
    returning id::text, name, color, created_at::text
  ` as unknown as Project[];
  return rows[0];
}

export async function getProjectById(id: string | null | undefined) {
  if (!id) return null;
  await ensureSchema();
  const rows = await sql`
    select id::text, name, color, created_at::text
    from projects
    where id = ${id}
  ` as unknown as Project[];
  return rows[0] || null;
}

export async function getProjectByName(name: string | null | undefined) {
  if (!name?.trim()) return null;
  await ensureSchema();
  const rows = await sql`
    select id::text, name, color, created_at::text
    from projects
    where lower(name) = lower(${name.trim()})
  ` as unknown as Project[];
  return rows[0] || null;
}

async function resolveProject(input: { projectId?: string | null; projectName?: string | null }) {
  if (input.projectId) {
    const project = await getProjectById(input.projectId);
    if (!project) throw new Error("Project does not exist");
    return project;
  }
  if (input.projectName) {
    const project = await getProjectByName(input.projectName);
    if (!project) throw new Error("Project does not exist");
    return project;
  }
  return null;
}

export async function createTask(input: {
  title: string;
  description?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  parentTaskId?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  startDate?: string;
  deadline?: string | null;
}) {
  await ensureSchema();
  const project = await resolveProject(input);
  const startDate = input.startDate || todayDate();
  const deadline = input.deadline || startDate;
  if (input.parentTaskId) {
    const parent = await getTask(input.parentTaskId);
    if (!parent) throw new Error("Parent task does not exist");
  }
  const rows = await sql`
    insert into tasks (parent_task_id, title, description, project_id, priority, status, start_date, deadline, sort_order)
    values (
      ${input.parentTaskId || null},
      ${input.title},
      ${input.description || null},
      ${project?.id || null},
      ${input.priority || "medium"},
      ${input.status || "todo"},
      ${startDate}::date,
      ${deadline}::date,
      extract(epoch from now())::integer
    )
    returning id
  ` as unknown as Task[];
  const created = await getTask(rows[0].id);
  if (!created) throw new Error("Task was not created");
  return created;
}

export async function updateTask(id: string, patch: Partial<{
  title: string;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
  parentTaskId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string;
  deadline: string | null;
  sortOrder: number;
}>) {
  await ensureSchema();
  const existingRows = await sql`
    select id, parent_task_id::text, title, description, project_id::text, priority, status, start_date::text, deadline::text, sort_order
    from tasks where id = ${id}
  ` as unknown as Pick<Task, "id" | "parent_task_id" | "title" | "description" | "project_id" | "priority" | "status" | "start_date" | "deadline" | "sort_order">[];
  const existing = existingRows[0];
  if (!existing) return undefined;
  const nextStatus = patch.status ?? existing.status;
  const projectPatchProvided = patch.projectId !== undefined || patch.projectName !== undefined;
  const project = projectPatchProvided ? await resolveProject({ projectId: patch.projectId, projectName: patch.projectName }) : null;
  if (patch.parentTaskId && patch.parentTaskId === id) throw new Error("A task cannot be its own parent");
  if (patch.parentTaskId) {
    const parent = await getTask(patch.parentTaskId);
    if (!parent) throw new Error("Parent task does not exist");
  }
  const rows = await sql`
    update tasks set
      parent_task_id = ${patch.parentTaskId === undefined ? existing.parent_task_id : patch.parentTaskId || null},
      title = ${patch.title ?? existing.title},
      description = ${patch.description === undefined ? existing.description : patch.description},
      project_id = ${projectPatchProvided ? project?.id || null : existing.project_id},
      priority = ${patch.priority ?? existing.priority},
      status = ${nextStatus},
      start_date = ${patch.startDate ?? existing.start_date}::date,
      deadline = ${patch.deadline === undefined ? existing.deadline : patch.deadline}::date,
      sort_order = ${patch.sortOrder ?? existing.sort_order},
      completed_at = case when ${nextStatus} = 'done' then coalesce(completed_at, now()) when ${nextStatus} in ('todo','progress') then null else completed_at end,
      updated_at = now()
    where id = ${id}
    returning id
  ` as unknown as Task[];
  await syncParentCompletion(rows[0].id);
  return await getTask(rows[0].id);
}

async function syncParentCompletion(taskId: string) {
  const parentRows = await sql`
    select parent_task_id::text
    from tasks
    where id = ${taskId}
  ` as unknown as { parent_task_id: string | null }[];
  const parentId = parentRows[0]?.parent_task_id;
  if (!parentId) return;

  const summaryRows = await sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'done')::int as done
    from tasks
    where parent_task_id = ${parentId}
  ` as unknown as { total: number; done: number }[];
  const summary = summaryRows[0];
  if (summary?.total && summary.total === summary.done) {
    await sql`
      update tasks
      set status = 'done',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where id = ${parentId}
    `;
  } else {
    await sql`
      update tasks
      set status = 'progress',
        completed_at = null,
        updated_at = now()
      where id = ${parentId} and status = 'done'
    `;
  }
}

export async function getTask(id: string) {
  await ensureSchema();
  const rows = await sql`
    select
      tasks.id,
      tasks.parent_task_id::text,
      parent_tasks.title as parent_task_title,
      tasks.title,
      tasks.description,
      tasks.project_id::text,
      projects.name as project,
      projects.name as project_name,
      projects.color as project_color,
      tasks.priority,
      tasks.status,
      tasks.start_date::text,
      tasks.deadline::text,
      tasks.sort_order,
      tasks.created_at::text,
      tasks.updated_at::text,
      tasks.completed_at::text
    from tasks
    left join projects on projects.id = tasks.project_id
    left join tasks parent_tasks on parent_tasks.id = tasks.parent_task_id
    where tasks.id = ${id}
  ` as unknown as Task[];
  return rows[0];
}

export async function deleteTask(id: string) {
  await ensureSchema();
  await sql`delete from tasks where id = ${id}`;
}

export async function reorderTasks(ids: string[]) {
  await ensureSchema();
  await Promise.all(ids.map((id, index) => sql`update tasks set sort_order = ${index}, updated_at = now() where id = ${id}`));
}
