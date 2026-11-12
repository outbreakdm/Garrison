/** A short random ID for things saved in a list (templates, menus, messages): 10 of [a-z0-9]. */
export function newId(random: () => number = Math.random) {
  let id = "";
  for (let i = 0; i < 10; i++)
    id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}
