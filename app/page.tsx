import { redirect } from "next/navigation";
import { getWeekStart, formatWeekParam } from "@/lib/weeks";

export default function Home() {
  const monday = getWeekStart(new Date());
  redirect(`/week?w=${formatWeekParam(monday)}`);
}
