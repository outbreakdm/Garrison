"use client";

import { usePathname } from "next/navigation";
import { toggleTheme } from "@/app/theme-actions";

/** Light or dark, and you stay on the page you were on (the action checks the path). */
export function ThemeToggle({ back, theme }: { back: string; theme: "dark" | "light" }) {
  const pathname = usePathname();
  return (
    <form action={toggleTheme}>
      <input type="hidden" name="back" value={pathname || back} />
      <button
        type="submit"
        className="g-btn g-btn--ghost"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        {theme === "dark" ? "Light" : "Dark"}
      </button>
    </form>
  );
}
