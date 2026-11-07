"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/security";

const THEME_COOKIE = "garrison_theme";

/** Flip between dark and light. A plain form post: works without JavaScript and under the strict CSP. */
export async function toggleTheme(form: FormData) {
  const store = await cookies();
  const next = store.get(THEME_COOKIE)?.value === "light" ? "dark" : "light";
  store.set(THEME_COOKIE, next, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 86_400,
  });
  const back = String(form.get("back") ?? "/");
  redirect(back === "/" ? "/" : safeNext(back, "/"));
}
