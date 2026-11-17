import { redirect } from "next/navigation";

/** LFG templates is a tab of Groups and raids now; the old address still works. */
export default async function RallyTemplatesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  redirect(`/servers/${encodeURIComponent(guildId)}/rally?tab=templates`);
}
