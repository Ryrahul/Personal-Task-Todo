import { isAuthed } from "@/lib/auth";
import { listAllTaskDays, listProjects, listTasks, todayDate } from "@/lib/db";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  if (!(await isAuthed())) redirect("/login");
  const today = todayDate();
  const [tasks, days, projects] = await Promise.all([listTasks(today), listAllTaskDays(), listProjects()]);
  return <Dashboard initialDate={today} initialTasks={tasks} initialDays={days.includes(today) ? days : [today, ...days]} initialProjects={projects} />;
}
