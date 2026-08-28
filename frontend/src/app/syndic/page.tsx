import { redirect } from "next/navigation";

/** /syndic is not a screen — the console starts at the dashboard. */
export default function SyndicIndex() {
  redirect("/syndic/dashboard");
}
