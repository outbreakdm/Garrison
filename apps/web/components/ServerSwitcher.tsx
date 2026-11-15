/**
 * The current server and a menu of the others. A details menu, so switching needs no
 * JavaScript. `card` is the rail's version: the server's initial, its name and a hint.
 */
export function ServerSwitcher({
  guild,
  guilds,
  variant = "button",
}: {
  guild: { id: string; name: string };
  guilds: { id: string; name: string }[];
  variant?: "button" | "card";
}) {
  const initial = guild.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <details className={`switcher switcher--${variant}`}>
      {variant === "card" ? (
        <summary className="switcher__card">
          <span className="switcher__mark" aria-hidden="true">
            {initial}
          </span>
          <span className="switcher__text">
            <span className="switcher__name">{guild.name}</span>
            <span className="switcher__hint">Switch server</span>
          </span>
        </summary>
      ) : (
        <summary className="g-btn g-btn--secondary">
          <span className="switcher__name">{guild.name}</span>
        </summary>
      )}
      <div className="switcher__menu" role="menu">
        {guilds.map((g) => (
          <a
            key={g.id}
            role="menuitem"
            href={`/servers/${g.id}`}
            aria-current={g.id === guild.id ? "true" : undefined}
          >
            {g.name}
          </a>
        ))}
        <a role="menuitem" href="/servers">
          All servers
        </a>
      </div>
    </details>
  );
}
