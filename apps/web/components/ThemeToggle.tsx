import { toggleTheme } from "@/app/theme-actions";

export function ThemeToggle({ back, theme }: { back: string; theme: "dark" | "light" }) {
  return (
    <form action={toggleTheme}>
      <input type="hidden" name="back" value={back} />
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
