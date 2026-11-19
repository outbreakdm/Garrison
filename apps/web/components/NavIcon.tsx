/**
 * The menu's icons: Garrison's own line drawings on a 20-point grid, drawn in the text color
 * so the current page's white pill turns them dark with its label. Decorative: the label
 * beside each one says the same thing.
 */
const PATHS = {
  overview: "M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z",
  ai: "M10 2.5l1.6 4.3 4.4 1.7-4.4 1.7-1.6 4.3-1.6-4.3L4 8.5l4.4-1.7zM15.5 13.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z",
  insights: "M3 16.5h14M5 12.5l3.5-4 3 2.5 4.5-5.5M13 5.5h3v3",
  settings: "M3 6h7M14 6h3M3 14h3M10 14h7",
  moderation: "M5 17.5v-15M5 3.5h10l-2.2 3.75L15 11H5",
  security: "M10 2.5l6 2.3v4.7c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V4.8zM7.5 10l1.8 1.8 3.2-3.6",
  logs: "M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 9.5h5M7.5 12.5h5M7.5 15h3",
  welcome: "M11 3h5.5v14H11M3 10h9.5M9 6.5l3.5 3.5L9 13.5",
  roles: "M3 3h6.5l7.5 7.5-6.5 6.5L3 9.5zM6.5 5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  leveling: "M5 8l5-4 5 4M5 12l5-4 5 4M5 16l5-4 5 4",
  giveaways:
    "M3 7.5h14v3H3zM4.5 10.5v6.5h11v-6.5M10 7.5V17M10 7.5C9 5 6 4 6 5.6 6 7 10 7.5 10 7.5zM10 7.5c1-2.5 4-3.5 4-1.9 0 1.4-4 1.9-4 1.9z",
  starboard: "M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z",
  suggestions:
    "M7.5 14.5h5M8.25 17h3.5M10 2.5a5 5 0 0 0-3 9c.6.5 1 1.2 1 2v1h4v-1c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z",
  tickets:
    "M3 5.5h14v3a1.5 1.5 0 0 0 0 3v3H3v-3a1.5 1.5 0 0 0 0-3zM12.5 5.5v1.5M12.5 9.25v1.5M12.5 13v1.5",
  messages: "M3.5 4h13v9.5h-7l-4 3.5v-3.5h-2z",
  alerts:
    "M6.6 13.4a4.8 4.8 0 0 1 0-6.8M13.4 6.6a4.8 4.8 0 0 1 0 6.8M4.2 15.8a8.2 8.2 0 0 1 0-11.6M15.8 4.2a8.2 8.2 0 0 1 0 11.6M10 8.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z",
  groups:
    "M7.5 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM2.5 16.5c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5M13.5 5.5a2 2 0 1 1 0 4M14.5 12.2c1.6.4 2.7 1.9 3 4.3",
  stats: "M3 8v4h2.5L9 15V5L5.5 8zM12.5 7h4M12.5 10h4M12.5 13h4",
  economy:
    "M10 3.5c3.6 0 6.5 1.3 6.5 3s-2.9 3-6.5 3-6.5-1.3-6.5-3 2.9-3 6.5-3zM3.5 6.5v3.5c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V6.5M3.5 10v3.5c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V10",
  invites:
    "M8.5 11.5a3 3 0 0 0 4.2 0l2.8-2.8a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.8 2.8a3 3 0 0 0 4.2 4.2l1-1",
  voice: "M4 13.5V11a6 6 0 0 1 12 0v2.5M4 12.5h2.5V17H4zM13.5 12.5H16V17h-2.5z",
  accounts:
    "M6.2 6.5h7.6a3.5 3.5 0 0 1 3.4 4.3l-.8 3.4a1.8 1.8 0 0 1-3 .8L12 13.5H8L6.6 15a1.8 1.8 0 0 1-3-.8l-.8-3.4a3.5 3.5 0 0 1 3.4-4.3zM6.5 9v3M5 10.5h3M12.75 9.75h.01M14.25 11.25h.01",
  plan: "M3 5h14v10H3zM3 8.5h14M6 12h3",
  help: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM7.8 7.9a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.3M10 14.2h.01",
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="g-nav__icon"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
      {name === "settings" ? (
        <>
          <circle cx="12" cy="6" r="2" />
          <circle cx="8" cy="14" r="2" />
        </>
      ) : null}
    </svg>
  );
}
