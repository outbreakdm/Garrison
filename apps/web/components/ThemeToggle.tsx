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
        className="g-btn g-btn--ghost theme-btn"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        <svg
          className="theme-btn__icon"
          viewBox="0 0 16 16"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {theme === "dark" ? (
            <path d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
          ) : (
            <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
          )}
        </svg>
        <span className="theme-btn__text">{theme === "dark" ? "Light" : "Dark"}</span>
      </button>
    </form>
  );
}
