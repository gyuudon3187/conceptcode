import { Box, Text, TextAttributes, type Renderable, type VNode } from "@opentui/core"

type SymphonyState = {
  layoutMode: "wide" | "narrow"
}

export function renderSymphonyPrimaryPane(state: SymphonyState): Renderable | VNode<any, any[]> {
  const titleWidth = state.layoutMode === "wide" ? 34 : 22
  const rows = [
    ["Movement I", "Opening texture"],
    ["Movement II", "Counterpoint sketch"],
    ["Motif Library", "Recurring fragments"],
    ["Tempo Map", "Pacing experiments"],
    ["Orchestration", "Section colors"],
    ["Transitions", "Bridges and swells"],
  ]
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Text({ content: "DUMMY FEATURE", fg: "#b48ead", attributes: TextAttributes.BOLD }),
    Text({ content: "A placeholder feature package that replaces only the large left pane.", fg: "#a7b1bf" }),
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      ...rows.map(([label, description]) => Box(
        { width: "100%", paddingX: 1, backgroundColor: "#1b1f2a", flexDirection: "row", justifyContent: "space-between" },
        Text({ content: label.padEnd(titleWidth, " "), fg: "#e5e9f0", attributes: TextAttributes.BOLD }),
        Text({ content: description, fg: "#88c0d0" }),
      )),
    ),
    Box(
      { width: "100%", flexGrow: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end" },
      Text({ content: "Dummy pane only", fg: "#4c566a" }),
    ),
  )
}

export function renderSymphonySupportTopPane(): Renderable | VNode<any, any[]> {
  return Box(
    { width: "100%", height: "100%", flexDirection: "column", gap: 1 },
    Text({ content: "Symphony", fg: "#b48ead", attributes: TextAttributes.BOLD }),
    Text({ content: "No feature-specific details panel is defined yet.", fg: "#a7b1bf" }),
  )
}
