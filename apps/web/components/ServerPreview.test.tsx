import type { QmEdit } from "@garrison/db";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ServerLayout } from "@/lib/discord";
import { previewServer } from "@/lib/qm-preview";
import { ServerPreview } from "./ServerPreview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/servers/[guildId]/quartermaster/actions", () => ({
  handEdit: async () => ({ ok: true }),
}));

const layout: ServerLayout = {
  loose: [],
  categories: [
    {
      id: "100000000000000001",
      name: "Info",
      channels: [
        { id: "200000000000000001", name: "general", kind: "text", locked: false },
        { id: "200000000000000002", name: "Lobby", kind: "voice", locked: false },
      ],
    },
  ],
  roles: [
    { id: "300000000000000001", name: "Mods", color: 0, managed: false, permissions: "8" },
    { id: "300000000000000002", name: "Members", color: 0, managed: false, permissions: "0" },
  ],
};
const edits: QmEdit[] = [
  { kind: "edit_channel", id: "200000000000000001", was: "general", name: "lounge", by: "admin" },
];
const edit = {
  guildId: "900000000000000000",
  version: "v1",
  locked: { "300000000000000001": "Has staff powers: change it in Server Settings → Roles." },
};
const html = (withEdit: boolean) =>
  renderToStaticMarkup(
    <ServerPreview
      name="Test"
      preview={previewServer(layout, [], "900000000000000000", [], edits)}
      planned
      edit={withEdit ? edit : undefined}
    />,
  );

describe("the Your server tree", () => {
  it("marks lists and rows for dragging, with rename and Move up / down", () => {
    const out = html(true);
    expect(out).toContain('data-list="channels" data-parent="100000000000000001"');
    expect(out).toContain('data-item="200000000000000001" data-kind="text" draggable="true"');
    expect(out).toContain('data-item="200000000000000002" data-kind="voice"');
    expect(out).toContain('data-list="categories"');
    expect(out).toContain('data-drop="100000000000000001"');
    expect(out).toContain('aria-label="Rename #lounge"');
    expect(out).toContain('aria-label="Move #lounge up"');
  });

  it("shows a rename with the old name for Now, and locks staff roles", () => {
    const out = html(true);
    expect(out).toContain(">lounge<");
    expect(out).toContain('class="sp-row__name sp-before">general<');
    expect(out).toContain(">Renamed<");
    // Mods can't be dragged or renamed, and says why.
    expect(out).toContain('title="Has staff powers: change it in Server Settings → Roles."');
    expect(out).not.toContain('data-item="300000000000000001"');
    expect(out).toContain('data-item="300000000000000002"');
  });

  it("draws nothing to edit without the workspace", () => {
    const out = html(false);
    expect(out).not.toContain("data-item=");
    expect(out).not.toContain("sp-tool");
    expect(out).toContain(">lounge<");
  });
});
