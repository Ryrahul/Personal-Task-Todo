"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addDays, format, isToday, parseISO } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  CornerDownRight,
  GripVertical,
  Layers3,
  ListChecks,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Project, Task, TaskPriority, TaskStatus } from "@/lib/db";
import { cn } from "@/lib/utils";

const columns: { id: TaskStatus; label: string; icon: React.ElementType }[] = [
  { id: "todo", label: "Todo", icon: Circle },
  { id: "progress", label: "In progress", icon: Clock3 },
  { id: "done", label: "Done", icon: CheckCircle2 }
];

const projectColors = ["#2563eb", "#0891b2", "#059669", "#7c3aed", "#dc2626", "#ea580c", "#4f46e5", "#475569"];

const priorityClass: Record<TaskPriority, string> = {
  urgent: "border-red-200 bg-red-50 text-red-700",
  high: "border-amber-200 bg-amber-50 text-amber-800",
  medium: "border-sky-200 bg-sky-50 text-sky-800",
  low: "border-slate-200 bg-slate-50 text-slate-600"
};

const fieldClass = "h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/80";
const smallFieldClass = "h-9 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/80";
const priorityOptions: { value: TaskPriority; label: string; meta: string }[] = [
  { value: "urgent", label: "Urgent", meta: "Needs attention now" },
  { value: "high", label: "High", meta: "Important soon" },
  { value: "medium", label: "Medium", meta: "Normal priority" },
  { value: "low", label: "Low", meta: "Nice to have" }
];
const statusOptions: { value: TaskStatus; label: string; meta: string }[] = [
  { value: "todo", label: "Todo", meta: "Queued work" },
  { value: "progress", label: "In progress", meta: "Currently moving" },
  { value: "done", label: "Done", meta: "Completed work" }
];
const columnIds = columns.map((column) => column.id);

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: {
    resultIndex: number;
    results: {
      length: number;
      [index: number]: {
        isFinal: boolean;
        [index: number]: { transcript: string; confidence?: number };
      };
    };
  }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function Dashboard({
  initialDate,
  initialTasks,
  initialDays,
  initialProjects
}: {
  initialDate: string;
  initialTasks: Task[];
  initialDays: string[];
  initialProjects: Project[];
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [tasks, setTasks] = useState(initialTasks);
  const [days, setDays] = useState(initialDays);
  const [projects, setProjects] = useState(initialProjects);
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(projectColors[0]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chat, setChat] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Ask about today, a project, what is done, or tell me to add a task." }
  ]);
  const [listening, setListening] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceBaseRef = useRef("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    projectId: "",
    priority: "medium" as TaskPriority,
    status: "todo" as TaskStatus,
    startDate: "",
    deadline: ""
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === "done").length;
    const progress = tasks.filter((task) => task.status === "progress").length;
    return { total, done, progress, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  const dateLabel = isToday(parseISO(selectedDate)) ? "Today" : format(parseISO(selectedDate), "EEE, MMM d");
  const visibleDays = days.length ? days : [initialDate];
  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) : null;

  async function loadDate(date: string) {
    setSelectedDate(date);
    const response = await fetch(`/api/tasks?date=${date}`);
    const data = await response.json();
    setTasks(data.tasks);
    setDays(data.days.includes(initialDate) ? data.days : [initialDate, ...data.days]);
  }

  async function refreshProjects() {
    const response = await fetch("/api/projects");
    const data = await response.json();
    setProjects(data.projects);
    return data.projects as Project[];
  }

  async function createProjectInline() {
    if (!newProjectName.trim()) return;
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName.trim(), color: newProjectColor })
    });
    if (!response.ok) return;
    const data = await response.json();
    const nextProjects = await refreshProjects();
    setProjectId(data.project?.id || nextProjects.find((project) => project.name === newProjectName.trim())?.id || "");
    setNewProjectName("");
  }

  async function createFromForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        projectId: projectId || null,
        priority,
        startDate: form.get("startDate") || selectedDate,
        deadline: form.get("deadline") || null,
        description: form.get("description") || null
      })
    });
    if (response.ok) {
      event.currentTarget.reset();
      setProjectId("");
      setPriority("medium");
      await loadDate(selectedDate);
    }
  }

  async function createSubtask(parent: Task, title: string) {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        parentTaskId: parent.id,
        projectId: parent.project_id,
        priority: parent.priority,
        status: parent.status,
        startDate: parent.start_date,
        deadline: parent.deadline,
        description: null
      })
    });
    if (response.ok) await loadDate(selectedDate);
  }

  async function updateTaskLocal(id: string, patch: Partial<Task> & { startDate?: string; sortOrder?: number }) {
    setTasks((current) => current.map((task) => (task.id === id ? ({ ...task, ...patch } as Task) : task)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    await loadDate(selectedDate);
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setEditDraft({
      title: task.title,
      description: task.description || "",
      projectId: task.project_id || "",
      priority: task.priority,
      status: task.status,
      startDate: task.start_date,
      deadline: task.deadline || ""
    });
  }

  async function submitEditTask(event: React.FormEvent) {
    event.preventDefault();
    if (!editingTask) return;
    await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editDraft.title,
        description: editDraft.description || null,
        projectId: editDraft.projectId || null,
        priority: editDraft.priority,
        status: editDraft.status,
        startDate: editDraft.startDate,
        deadline: editDraft.deadline || null
      })
    });
    setEditingTask(null);
    await loadDate(selectedDate);
  }

  async function removeTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await loadDate(selectedDate);
  }

  function moveTaskForDrag(currentTasks: Task[], activeId: string, overId: string) {
    const activeTask = currentTasks.find((task) => task.id === activeId);
    if (!activeTask) return currentTasks;

    const overTask = currentTasks.find((task) => task.id === overId);
    const targetStatus = columnIds.includes(overId as TaskStatus)
      ? (overId as TaskStatus)
      : overTask?.status || activeTask.status;
    const activeIndex = currentTasks.findIndex((task) => task.id === activeId);

    if (overTask && activeTask.status === targetStatus) {
      const overIndex = currentTasks.findIndex((task) => task.id === overId);
      if (activeIndex === overIndex) return currentTasks;
      return arrayMove(currentTasks, activeIndex, overIndex);
    }

    const withoutActive = currentTasks.filter((task) => task.id !== activeId);
    const movedTask = { ...activeTask, status: targetStatus };
    if (overTask) {
      const overIndex = withoutActive.findIndex((task) => task.id === overId);
      return [...withoutActive.slice(0, overIndex), movedTask, ...withoutActive.slice(overIndex)];
    }

    const lastTargetIndex = withoutActive.map((task) => task.status).lastIndexOf(targetStatus);
    if (lastTargetIndex === -1) return [...withoutActive, movedTask];
    return [...withoutActive.slice(0, lastTargetIndex + 1), movedTask, ...withoutActive.slice(lastTargetIndex + 1)];
  }

  function onDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    setTasks((current) => moveTaskForDrag(current, String(active.id), String(over.id)));
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTaskId(null);
    if (!over) return;

    const next = moveTaskForDrag(tasks, String(active.id), String(over.id));
    const movedTask = next.find((task) => task.id === active.id);
    if (!movedTask) return;
    setTasks(next);

    await fetch(`/api/tasks/${movedTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: movedTask.status })
    });
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((task) => task.id) })
    });
  }

  async function sendChat(event?: React.FormEvent) {
    event?.preventDefault();
    if (!chat.trim() || sending) return;
    const prompt = chat.trim();
    setChat("");
    setSending(true);
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, date: selectedDate })
    });
    const data = await response.json();
    setMessages((current) => [...current, { role: "assistant", text: data.reply || "Done." }]);
    setSending(false);
    await Promise.all([loadDate(selectedDate), refreshProjects()]);
  }

  function startVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      setVoiceInterim("");
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    voiceBaseRef.current = chat.trim();
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) finalText = `${finalText} ${transcript}`.trim();
        else interimText = `${interimText} ${transcript}`.trim();
      }
      if (finalText) voiceBaseRef.current = `${voiceBaseRef.current} ${finalText}`.trim();
      setVoiceInterim(interimText);
      setChat(`${voiceBaseRef.current} ${interimText}`.trim());
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceInterim("");
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      setVoiceInterim("");
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm">
              <ListChecks className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-[0] text-slate-950 sm:text-base">Personal Task Todo</h1>
              <p className="truncate text-xs text-muted-foreground">{dateLabel} planner</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip text="Open the AI assistant">
              <button onClick={() => setAssistantOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300">
                <Sparkles className="h-4 w-4" /> Ask AI
              </button>
            </Tooltip>
            <Tooltip text="Sign out of this workspace">
              <button onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-[78px] xl:h-[calc(100vh-98px)]">
          <section className="rounded-lg border bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" />
              Days
            </div>
            <div className="grid gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                const date = addDays(parseISO(initialDate), -offset).toISOString().slice(0, 10);
                return (
                  <button key={date} onClick={() => loadDate(date)} className={cn("rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100", selectedDate === date && "bg-slate-950 text-white hover:bg-slate-950")}>
                    {offset === 0 ? "Today" : format(parseISO(date), "MMM d, yyyy")}
                  </button>
                );
              })}
              {visibleDays.filter((day) => day < initialDate).slice(0, 10).map((day) => (
                <button key={day} onClick={() => loadDate(day)} className={cn("rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100", selectedDate === day && "bg-slate-950 text-white hover:bg-slate-950")}>
                  {format(parseISO(day), "MMM d, yyyy")}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
              <Layers3 className="h-4 w-4 text-primary" />
              Projects
            </div>
            <div className="grid gap-2">
              {projects.length ? projects.slice(0, 8).map((project) => (
                <div key={project.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                  <span className="truncate">{project.name}</span>
                </div>
              )) : <p className="px-2 py-2 text-sm text-muted-foreground">Create a project with your first task.</p>}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold">Progress</span>
              <span className="text-muted-foreground">{stats.percent}%</span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-950" style={{ width: `${stats.percent}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="All" value={stats.total} />
              <Stat label="Doing" value={stats.progress} />
              <Stat label="Done" value={stats.done} />
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-5">
          <form key={selectedDate} onSubmit={createFromForm} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.75fr)_132px_150px_150px_96px]">
              <input name="title" placeholder="Add a task..." className={fieldClass} required />
              <SelectField
                label="Project"
                value={projectId}
                placeholder="No project"
                options={[{ value: "", label: "No project", meta: "Keep it uncategorized" }, ...projects.map((project) => ({ value: project.id, label: project.name, meta: "Project", color: project.color }))]}
                onChange={setProjectId}
              />
              <SelectField
                label="Priority"
                value={priority}
                options={priorityOptions}
                onChange={(value) => setPriority(value as TaskPriority)}
              />
              <input name="startDate" type="date" defaultValue={selectedDate} className={fieldClass} aria-label="Start date" />
              <input name="deadline" type="date" className={fieldClass} aria-label="Deadline" />
              <Tooltip text="Create task">
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </Tooltip>
            </div>

            <textarea name="description" placeholder="Notes, context, links..." className={cn(fieldClass, "mt-3 h-auto min-h-16 w-full resize-y py-2 leading-6")} />

            <div className="mt-3 flex flex-col gap-2 border-t pt-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="New project" className={cn(smallFieldClass, "flex-1")} />
                <div className="flex h-9 items-center gap-1 rounded-md border bg-white px-2">
                  {projectColors.map((color) => (
                    <Tooltip key={color} text={color}>
                      <button
                        type="button"
                        onClick={() => setNewProjectColor(color)}
                        className={cn("h-5 w-5 rounded-full border border-white ring-1 ring-slate-200 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-slate-950", newProjectColor === color && "ring-2 ring-slate-950")}
                        style={{ backgroundColor: color }}
                        aria-label={`Use project color ${color}`}
                      />
                    </Tooltip>
                  ))}
                </div>
              </div>
              <Tooltip text="Create and select this project">
                <button type="button" onClick={createProjectInline} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200">
                  <Plus className="h-4 w-4" /> Create project
                </button>
              </Tooltip>
            </div>
          </form>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveTaskId(null)}>
            <div className="task-grid grid gap-4">
              {columns.map((column) => {
                const columnTasks = tasks.filter((task) => task.status === column.id);
                const Icon = column.icon;
                return (
                  <SortableContext key={column.id} id={column.id} items={columnTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <ColumnDrop id={column.id}>
                      <div className="mb-3 flex items-center justify-between px-1">
                        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {column.label}</h2>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{columnTasks.length}</span>
                      </div>
                      <div className="grid gap-3">
                        {columnTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            childCount={tasks.filter((child) => child.parent_task_id === task.id).length}
                            onUpdate={updateTaskLocal}
                            onDelete={removeTask}
                            onEdit={openEditTask}
                            onCreateSubtask={createSubtask}
                          />
                        ))}
                      </div>
                    </ColumnDrop>
                  </SortableContext>
                );
              })}
            </div>
            <DragOverlay adjustScale={false} dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
              {activeTask ? (
                <TaskCardShell
                  task={activeTask}
                  childCount={tasks.filter((child) => child.parent_task_id === activeTask.id).length}
                  overlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      </div>

      {assistantOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Task assistant</h2>
                  <p className="text-xs text-muted-foreground">Voice or text, backed by your task list.</p>
                </div>
              </div>
              <Tooltip text="Close assistant">
                <button onClick={() => setAssistantOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200" aria-label="Close assistant">
                  <X className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="grid flex-1 gap-3 overflow-auto bg-slate-50 p-4">
              {messages.map((message, index) => (
                <div key={index} className={cn("max-w-[86%] rounded-lg border px-3 py-2 text-sm leading-6 shadow-sm", message.role === "assistant" ? "justify-self-start bg-white text-slate-700" : "justify-self-end border-slate-900 bg-slate-950 text-white")}>
                  {message.text}
                </div>
              ))}
              {sending ? <div className="max-w-[86%] justify-self-start rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm">Thinking...</div> : null}
            </div>
            <form onSubmit={sendChat} className="border-t bg-white p-3">
              <textarea value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Ask what is due today, summarize a project, or add a task..." className={cn(fieldClass, "h-auto min-h-20 w-full resize-none py-2 leading-6")} />
              {voiceInterim ? <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">Listening: {voiceInterim}</p> : null}
              <div className="mt-2 grid grid-cols-[40px_1fr] gap-2">
                <Tooltip text={listening ? "Listening" : "Use voice input"}>
                  <button type="button" onClick={startVoice} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200" aria-label="Voice input">
                    {listening ? <MicOff className="h-4 w-4 text-red-600" /> : <Mic className="h-4 w-4" />}
                  </button>
                </Tooltip>
                <Tooltip text="Send message to assistant">
                  <button disabled={sending} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60">
                    <Send className="h-4 w-4" /> Send
                  </button>
                </Tooltip>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingTask ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 px-3 py-4 backdrop-blur-sm sm:items-center">
          <form onSubmit={submitEditTask} className="w-full max-w-2xl overflow-hidden rounded-lg border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Edit task</h2>
                <p className="text-xs text-muted-foreground">{editingTask.parent_task_title ? `Subtask of ${editingTask.parent_task_title}` : "Update task details"}</p>
              </div>
              <Tooltip text="Close editor">
                <button type="button" onClick={() => setEditingTask(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200" aria-label="Close editor">
                  <X className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="grid gap-3 p-4">
              <input value={editDraft.title} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} className={fieldClass} required />
              <textarea value={editDraft.description} onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Notes, context, links..." className={cn(fieldClass, "h-auto min-h-24 w-full resize-y py-2 leading-6")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Project"
                  value={editDraft.projectId}
                  placeholder="No project"
                  options={[{ value: "", label: "No project", meta: "Keep it uncategorized" }, ...projects.map((project) => ({ value: project.id, label: project.name, meta: "Project", color: project.color }))]}
                  onChange={(value) => setEditDraft((draft) => ({ ...draft, projectId: value }))}
                />
                <SelectField
                  label="Priority"
                  value={editDraft.priority}
                  options={priorityOptions}
                  onChange={(value) => setEditDraft((draft) => ({ ...draft, priority: value as TaskPriority }))}
                />
                <SelectField
                  label="Status"
                  value={editDraft.status}
                  options={statusOptions}
                  onChange={(value) => setEditDraft((draft) => ({ ...draft, status: value as TaskStatus }))}
                />
                <input type="date" value={editDraft.startDate} onChange={(event) => setEditDraft((draft) => ({ ...draft, startDate: event.target.value }))} className={fieldClass} aria-label="Start date" />
                <input type="date" value={editDraft.deadline} onChange={(event) => setEditDraft((draft) => ({ ...draft, deadline: event.target.value }))} className={fieldClass} aria-label="Deadline" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-4 py-3">
              <button type="button" onClick={() => setEditingTask(null)} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
                Cancel
              </button>
              <button className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Save changes
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function ColumnDrop({ id, children }: { id: TaskStatus; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("min-h-[520px] rounded-lg border bg-white p-3 shadow-sm transition-all duration-200 ease-out", isOver && "scale-[1.01] border-slate-950 bg-slate-50/60 shadow-lg ring-4 ring-slate-200")}>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Tooltip({ text, children, disabled = false }: { text: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <span className="group relative inline-flex">
      {children}
      {disabled ? null : (
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:translate-y-0.5 group-hover:opacity-100 group-focus-within:translate-y-0.5 group-focus-within:opacity-100">
          {text}
        </span>
      )}
    </span>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  compact = false
}: {
  label: string;
  value: string;
  options: { value: string; label: string; meta?: string; color?: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="relative min-w-0">
      <Tooltip text={label} disabled={open}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white text-left text-sm text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-slate-200/80",
            compact ? "h-9 px-2" : "h-10 px-3"
          )}
          aria-label={label}
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} /> : null}
            <span className={cn("truncate", !selected && "text-slate-400")}>{selected?.label || placeholder || "Select"}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
        </button>
      </Tooltip>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-slate-50", option.value === value && "bg-slate-100")}
            >
              {option.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{option.label}</span>
                {option.meta ? <span className="block truncate text-xs text-muted-foreground">{option.meta}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskCardShell({ task, childCount, overlay = false }: { task: Task; childCount: number; overlay?: boolean }) {
  const isSubtask = Boolean(task.parent_task_id);
  return (
    <article className={cn("rounded-lg border bg-white p-3 shadow-sm", isSubtask && "border-slate-200 bg-slate-50/70", overlay && "w-[320px] rotate-[0.5deg] scale-[1.02] shadow-2xl ring-1 ring-slate-900/5")}>
      {isSubtask ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CornerDownRight className="h-3.5 w-3.5" />
          <span className="truncate">Subtask of {task.parent_task_title || "parent task"}</span>
        </div>
      ) : null}
      <div className="mb-3 flex items-start gap-2">
        <div className="mt-0.5 rounded-md p-0.5 text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold leading-6">{task.title}</h3>
          {task.description ? <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{task.description}</p> : null}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className={cn("rounded-md border px-2 py-1 text-xs font-semibold capitalize", priorityClass[task.priority])}>{task.priority}</span>
        {childCount ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
            <CornerDownRight className="h-3 w-3" />
            {childCount} subtask{childCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {task.project_name ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs font-medium text-slate-700">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.project_color || "#64748b" }} />
            {task.project_name}
          </span>
        ) : null}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>Starts {format(parseISO(task.start_date), "MMM d")}</span>
        {task.deadline ? <span>Deadline {format(parseISO(task.deadline), "MMM d, yyyy")}</span> : null}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  childCount,
  onUpdate,
  onDelete,
  onEdit,
  onCreateSubtask
}: {
  task: Task;
  childCount: number;
  onUpdate: (id: string, patch: Partial<Task> & { startDate?: string; sortOrder?: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (task: Task) => void;
  onCreateSubtask: (parent: Task, title: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const isSubtask = Boolean(task.parent_task_id);

  async function submitSubtask(event: React.FormEvent) {
    event.preventDefault();
    if (!subtaskTitle.trim()) return;
    await onCreateSubtask(task, subtaskTitle.trim());
    setSubtaskTitle("");
    setSubtaskOpen(false);
  }

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition || "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      className={cn(
        "rounded-lg border bg-white p-3 shadow-sm transition-[box-shadow,opacity,transform,background-color,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md",
        isSubtask && "border-slate-200 bg-slate-50/70",
        isDragging && "opacity-25 shadow-none"
      )}
    >
      {isSubtask ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CornerDownRight className="h-3.5 w-3.5" />
          <span className="truncate">Subtask of {task.parent_task_title || "parent task"}</span>
        </div>
      ) : null}
      <div className="mb-3 flex items-start gap-2">
        <Tooltip text="Drag to reorder">
          <button className="mt-0.5 rounded-md p-0.5 text-muted-foreground transition hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-4 focus:ring-slate-200" {...attributes} {...listeners} aria-label="Drag task">
            <GripVertical className="h-4 w-4" />
          </button>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold leading-6">{task.title}</h3>
          {task.description ? <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{task.description}</p> : null}
        </div>
        <Tooltip text="Edit task">
          <button onClick={() => onEdit(task)} className="rounded-md p-1 text-muted-foreground transition hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-4 focus:ring-slate-200" aria-label="Edit task">
            <Pencil className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip text="Delete task">
          <button onClick={() => onDelete(task.id)} className="rounded-md p-1 text-muted-foreground transition hover:bg-red-50 hover:text-destructive focus:outline-none focus:ring-4 focus:ring-red-100" aria-label="Delete task">
            <Trash2 className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className={cn("rounded-md border px-2 py-1 text-xs font-semibold capitalize", priorityClass[task.priority])}>{task.priority}</span>
        {childCount ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
            <CornerDownRight className="h-3 w-3" />
            {childCount} subtask{childCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {task.project_name ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs font-medium text-slate-700">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.project_color || "#64748b" }} />
            {task.project_name}
          </span>
        ) : null}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>Starts {format(parseISO(task.start_date), "MMM d")}</span>
        {task.deadline ? <span>Deadline {format(parseISO(task.deadline), "MMM d, yyyy")}</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SelectField
          label="Change priority"
          value={task.priority}
          options={priorityOptions}
          compact
          onChange={(value) => onUpdate(task.id, { priority: value as TaskPriority })}
        />
        <SelectField
          label="Change status"
          value={task.status}
          options={statusOptions}
          compact
          onChange={(value) => onUpdate(task.id, { status: value as TaskStatus })}
        />
      </div>
      {!isSubtask ? (
        <div className="mt-3 border-t pt-3">
          {subtaskOpen ? (
            <form onSubmit={submitSubtask} className="grid gap-2">
              <input
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Add a subtask..."
                className={smallFieldClass}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSubtaskOpen(false)} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button className="inline-flex h-8 items-center justify-center rounded-md bg-slate-950 px-2 text-xs font-semibold text-white transition hover:bg-slate-800">
                  Add subtask
                </button>
              </div>
            </form>
          ) : (
            <Tooltip text="Add a child task under this task">
              <button type="button" onClick={() => setSubtaskOpen(true)} className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200">
                <Plus className="h-3.5 w-3.5" />
                Subtask
              </button>
            </Tooltip>
          )}
        </div>
      ) : null}
    </article>
  );
}
