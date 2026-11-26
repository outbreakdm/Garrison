/**
 * Clickable command mentions. `</lfg create:123>` shows as a blue chip that fills in
 * the command when someone presses it, so "post one with /lfg create" is one tap.
 * Discord gives the ids once the bot is ready. Before then, or for a command it
 * doesn't list, the name is shown as code, the way it was before.
 */
const ids = new Map<string, string>();

export function rememberCommandIds(list: Iterable<{ name: string; id: string }>) {
  ids.clear();
  for (const c of list) ids.set(c.name, c.id);
}

/** "lfg create" → a clickable /lfg create. */
export function slash(path: string) {
  const id = ids.get(path.split(" ")[0] ?? "");
  return id ? `</${path}:${id}>` : `\`/${path}\``;
}
