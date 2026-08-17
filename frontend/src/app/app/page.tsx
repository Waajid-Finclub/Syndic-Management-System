import { redirect } from "next/navigation";

/** /app is not a screen — the app starts at Home. */
export default function ResidentIndex() {
  redirect("/app/home");
}
