import { cookies } from "next/headers";

export async function currentTheme(): Promise<"dark" | "light"> {
  return (await cookies()).get("garrison_theme")?.value === "light" ? "light" : "dark";
}
