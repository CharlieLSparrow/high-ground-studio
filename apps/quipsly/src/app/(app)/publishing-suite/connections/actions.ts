"use server";

import { redirect } from "next/navigation";

export async function connectTwitterAction() {
  redirect("/api/connections/twitter/authorize");
}

export async function connectYouTubeAction() {
  redirect("/api/connections/youtube/authorize");
}
