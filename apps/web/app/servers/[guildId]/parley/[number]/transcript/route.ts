import { getTicketByNumber, listTicketMessages } from "@garrison/db";
import { getDb } from "@/lib/db";
import { checkGuildAccess } from "@/lib/session";

/**
 * A ticket's transcript as a plain-text file, for keeping or sharing outside the
 * dashboard. Same gate as the ticket's page: anyone else gets a 404, so the
 * route never confirms which tickets exist. Staff notes are left out.
 */
export const dynamic = "force-dynamic";

const stamp = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guildId: string; number: string }> },
) {
  const { guildId, number: raw } = await params;
  const notFound = () => new Response("Not found", { status: 404 });
  const access = await checkGuildAccess(guildId);
  const number = Number(raw);
  if (!access || !Number.isInteger(number) || number < 1) return notFound();
  const db = await getDb();
  const ticket = await getTicketByNumber(db, access.guild.id, number);
  if (!ticket) return notFound();
  const lines = await listTicketMessages(db, ticket.id);

  const out = [
    `Ticket #${ticket.number} · ${ticket.topicLabel}`,
    `Server: ${access.guild.name}`,
    `Opened by ${ticket.openerName} (${ticket.openerId}) on ${stamp(ticket.openedAt)}`,
    ticket.claimedName ? `Claimed by ${ticket.claimedName}` : "Not claimed",
    ticket.closedAt
      ? `Closed by ${ticket.closedByName ?? "staff"} on ${stamp(ticket.closedAt)}${ticket.closeReason ? `: ${ticket.closeReason}` : ""}`
      : "Still open",
    "",
    ...ticket.answers.flatMap((a) => [`${a.question}`, `  ${a.answer.replace(/\n/g, "\n  ")}`]),
    ...(ticket.answers.length ? [""] : []),
    ...lines.map((m) => {
      if (m.kind === "event") return `[${stamp(m.createdAt)}] -- ${m.content}`;
      const marks = [
        m.staff ? "staff" : null,
        m.editedAt ? "edited" : null,
        m.deletedAt ? "deleted" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const files = m.attachments.map((a) => `  [file] ${a.name} ${a.url}`);
      return [
        `[${stamp(m.createdAt)}] ${m.authorName}${marks ? ` (${marks})` : ""}: ${m.content.replace(/\n/g, "\n  ")}`,
        ...files,
      ].join("\n");
    }),
    "",
  ].join("\n");

  return new Response(out, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="ticket-${String(ticket.number).padStart(4, "0")}.txt"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
