import { type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes, TextNodeRenderable, type TextChunk } from "@opentui/core"

import { getSnippetSyntaxStyle, buildContextPreview, type PreviewLegendItem } from "./snippet"
import { bufferModalItems, bufferedConceptForPath, currentNode, selectedBufferModalTarget, visiblePaths } from "./state"
import type { AppState, CreateConceptModalState, ListLine, StatusTone } from "./types"

export const COLORS = {
  bg: "#111417",
  panel: "#1b2228",
  panelSoft: "#202930",
  border: "#38505f",
  borderActive: "#d08770",
  accent: "#88c0d0",
  accentSoft: "#8fbcbb",
  text: "#e5e9f0",
  muted: "#9aa7b0",
  success: "#a3be8c",
  warning: "#ebcb8b",
  error: "#bf616a",
  selectedFg: "#101418",
  selectedBg: "#f2cc8f",
} as const

function maxVisibleAliasSuggestions(): number {
  const viewportHeight = process.stdout.rows || 24
  return viewportHeight <= 32 ? 3 : 4
}

let contextRenderVersion = 0
let contextPreviewKey: string | null = null

function contextKeyForNode(path: string, loc: { file: string; startLine: number; endLine: number } | null, summary: string): string {
  if (!loc) {
    return `${path}::no-loc::${summary}`
  }
  return `${path}::${loc.file}:${loc.startLine}-${loc.endLine}::${summary}`
}

function textNodesForChunks(chunks: TextChunk[]): TextNodeRenderable[] {
  return chunks.map((chunk) => TextNodeRenderable.fromString(chunk.text, {
    fg: chunk.fg,
    bg: chunk.bg,
    attributes: chunk.attributes,
  }))
}

function renderLegendFooter(items: PreviewLegendItem[]): Renderable | VNode<any, any[]> {
  if (items.length === 0) {
    return Box({ width: "100%" })
  }
  const nodes: Array<Renderable | VNode<any, any[]>> = []
  items.forEach((item, index) => {
    if (index > 0) {
      nodes.push(Text({ content: "  ·  ", fg: COLORS.border }))
    }
    nodes.push(Text({ content: item.kindLabel, fg: item.color, attributes: TextAttributes.BOLD }))
  })
  return Box(
    {
      position: "absolute",
      right: 1,
      bottom: 0,
    },
    Box(
      {
        borderStyle: "rounded",
        borderColor: COLORS.border,
        backgroundColor: COLORS.panel,
        paddingX: 1,
        paddingY: 0,
        flexDirection: "row",
        flexWrap: "wrap",
      },
      ...nodes,
    ),
  )
}

export function renderStatusPane(state: AppState): Renderable | VNode<any, any[]> {
  return Box(
    {
      width: "100%",
      borderStyle: "rounded",
      borderColor: statusPaneColor(state),
      paddingX: 1,
      paddingY: 1,
      backgroundColor: COLORS.panel,
    },
    Text({ content: state.status.message, fg: statusPaneColor(state) }),
  )
}

export function renderFrame(
  state: AppState,
  listScroll: ScrollBoxRenderable,
  mainScroll: ScrollBoxRenderable,
  statusPane: Renderable | VNode<any, any[]>,
): Renderable | VNode<any, any[]> {
  const selectedNode = currentNode(state)
  const sidebar = Box(
    {
      width: state.layoutMode === "wide" ? 44 : "100%",
      flexShrink: 0,
      flexDirection: "column",
    },
    Box(
      {
        flexGrow: 1,
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        title: `Concepts                         nav: ${conceptMovementIndicator(state)}`,
        padding: 1,
        backgroundColor: COLORS.panel,
      },
      listScroll,
    ),
  )

  const context = Box(
    {
      flexGrow: 1,
      borderStyle: "rounded",
      borderColor: COLORS.border,
      title: state.contextTitle || (selectedNode.loc ? `Context ${selectedNode.loc.file}:${selectedNode.loc.startLine}-${selectedNode.loc.endLine}` : "Context"),
      padding: 1,
      backgroundColor: COLORS.panel,
    },
    Box(
      { width: "100%", height: "100%", flexDirection: "column" },
      Box({ width: "100%", height: "100%" }, mainScroll),
      renderLegendFooter(state.contextLegendItems ?? []),
    ),
  )

  const overlays: Array<Renderable | VNode<any, any[]>> = []
  const statusPaneHeight = 5
  const modalBackdrop = state.preserveStatusAboveModal
    ? Box(
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          bottom: statusPaneHeight,
          backgroundColor: "#00000088",
        },
      )
    : null

  if (state.showBufferModal) {
    const layout = bufferModalLayout(state)
    const promptSelected = selectedBufferModalTarget(state).kind === "prompt"
    overlays.push(
      ...(modalBackdrop ? [modalBackdrop] : [Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" })]),
      Box(
        {
          position: "absolute",
          top: layout.top,
          left: state.layoutMode === "wide" ? "50%" : 2,
          width: state.layoutMode === "wide" ? 108 : "94%",
          height: layout.height,
          padding: 1,
          backgroundColor: COLORS.panelSoft,
          borderStyle: "rounded",
          borderColor: COLORS.borderActive,
          marginLeft: state.layoutMode === "wide" ? -54 : undefined,
          flexDirection: "column",
          gap: 1,
        },
        Text({ content: "Prompt", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        (() => {
          const promptLines = state.promptText.trim()
            ? truncatePreviewLines(state.promptText, layout.promptPreviewLines, state.layoutMode === "wide" ? 64 : 48)
            : Array.from({ length: layout.promptPreviewLines }, () => "")
          return Box(
            {
              width: "100%",
              paddingX: 1,
              paddingY: 0,
              backgroundColor: promptSelected ? COLORS.selectedBg : COLORS.panel,
              flexDirection: "column",
            },
            ...promptLines.map((line) =>
              Text({
                content: line,
                fg: promptSelected ? COLORS.selectedFg : state.promptText.trim() ? COLORS.text : COLORS.muted,
                attributes: promptSelected ? TextAttributes.BOLD : 0,
              }),
            ),
          )
        })(),
        ...(layout.hasItems
          ? [
              Box(
                {
                  width: "100%",
                  flexDirection: "column",
                },
                renderSelectedConceptsPane(state, layout.paneVisibleRows, layout.paneHeight, layout.showRange),
              ),
            ]
          : []),
        Box(
          {
            width: "100%",
            paddingX: 1,
          },
          Text({ content: bufferModalHelpText(layout.hasItems, promptSelected), fg: COLORS.muted }),
        ),
      ),
    )
  }

  if (state.editorModal) {
    const aliasSuggestion = state.editorModal.aliasSuggestion
    const maxVisibleSuggestions = maxVisibleAliasSuggestions()
    const aliasMatches = aliasSuggestion
      ? Object.keys(state.aliasPaths)
          .sort((left, right) => left.localeCompare(right))
          .filter((alias) => aliasSuggestion.query.length === 0 || alias.slice(1).toLowerCase().includes(aliasSuggestion.query.toLowerCase()))
      : []
    overlays.push(
      ...(modalBackdrop ? [modalBackdrop] : [Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000066" })]),
      Box(
        {
          position: "absolute",
          top: state.layoutMode === "wide" ? 7 : 5,
          left: state.layoutMode === "wide" ? "50%" : 2,
          width: state.layoutMode === "wide" ? 84 : "94%",
          padding: 1,
          backgroundColor: COLORS.panel,
          borderStyle: "rounded",
          borderColor: COLORS.borderActive,
          marginLeft: state.layoutMode === "wide" ? -42 : undefined,
          flexDirection: "column",
          gap: 1,
        },
        Text({
          content: state.editorModal.target.kind === "prompt" ? "Edit Prompt" : `Edit Note: ${state.editorModal.target.path}`,
          fg: COLORS.accent,
          attributes: TextAttributes.BOLD,
        }),
        Box(
          {
            width: "100%",
            minHeight: state.editorModal.visibleLineCount + 2,
            maxHeight: state.editorModal.visibleLineCount + 2,
            backgroundColor: COLORS.panelSoft,
            flexDirection: "column",
          },
          state.editorModal.renderable,
        ),
        ...(aliasSuggestion && aliasMatches.length > 0
          ? [
              Box(
                {
                  width: "100%",
                  padding: 1,
                  paddingX: 1,
                  backgroundColor: "#171d22",
                  borderStyle: "rounded",
                  borderColor: COLORS.warning,
                  flexDirection: "column",
                },
                ...aliasMatches.slice(
                  aliasSuggestion.visibleStartIndex,
                  aliasSuggestion.visibleStartIndex + maxVisibleSuggestions,
                ).map((alias, index) => {
                  const absoluteIndex = aliasSuggestion.visibleStartIndex + index
                  const selected = absoluteIndex === aliasSuggestion.selectedIndex
                  return Box(
                    {
                      width: "100%",
                      paddingX: 1,
                      backgroundColor: selected ? COLORS.selectedBg : "#171d22",
                      flexDirection: "row",
                      justifyContent: "space-between",
                    },
                    Text({ content: alias, fg: selected ? COLORS.selectedFg : COLORS.warning, attributes: TextAttributes.BOLD }),
                    Text({ content: state.aliasPaths[alias] ?? "", fg: selected ? COLORS.selectedFg : COLORS.muted }),
                  )
                }),
              ),
            ]
          : []),
      ),
    )
  }

  if (state.createConceptModal) {
    overlays.push(...renderCreateConceptModal(state, state.createConceptModal))
  }

  overlays.push(...renderConfirmModal(state))

  return Box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: COLORS.bg,
      padding: 1,
      gap: 1,
    },
    Box(
      {
        width: "100%",
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        paddingX: 2,
        paddingY: 1,
        backgroundColor: COLORS.panel,
        flexDirection: "row",
        justifyContent: "space-between",
      },
      Box(
        { flexDirection: "row" },
        Text({ content: "anchor", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      ),
      Text({ content: truncateFromStart(selectedNode.path, state.layoutMode === "wide" ? 56 : 28), fg: COLORS.muted }),
    ),
    ...(state.layoutMode === "wide"
      ? [Box({ width: "100%", flexGrow: 1, flexDirection: "row", gap: 1 }, sidebar, context)]
      : [sidebar, context]),
    statusPane,
    ...overlays,
  )
}

export function replaceChildren(
  renderable: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number },
  child: Renderable | VNode<any, any[]>,
): void {
  for (const existing of renderable.getChildren()) {
    existing.destroy()
  }
  renderable.add(child)
}

export function listLines(state: AppState): ListLine[] {
  const visible = visiblePaths(state)
  if (visible.length === 0) {
    return [{ title: `(no child concepts under ${state.currentParentPath})`, kindLabel: "", selected: false, buffered: false, empty: true }]
  }
  return visible.map((path, index) => {
    const node = state.nodes.get(path)!
    const selected = index === state.cursor
    const buffered = Boolean(bufferedConceptForPath(state, path))
    const stateLabel = node.isDraft ? "new" : buffered ? "sel" : undefined
    return {
      title: node.title,
      kindLabel: node.kind ?? "(no kind)",
      stateLabel,
      selected,
      buffered,
      tone: node.isDraft ? "draft" : undefined,
    }
  })
}

function conceptMovementIndicator(state: AppState): string {
  const node = currentNode(state)
  const canMoveLeft = Boolean(state.nodes.get(state.currentParentPath)?.parentPath)
  const canMoveRight = node.childPaths.length > 0
  if (!canMoveLeft && !canMoveRight) {
    return "--"
  }
  return `${canMoveLeft ? "<" : " "}${canMoveRight ? ">" : " "}`
}

function conceptRowColors(item: ListLine): { background: string; title: string; kind: string; badge: string } {
  if (item.selected) {
    return {
      background: COLORS.selectedBg,
      title: COLORS.selectedFg,
      kind: COLORS.selectedFg,
      badge: COLORS.selectedFg,
    }
  }
  if (item.empty) {
    return {
      background: COLORS.panel,
      title: COLORS.muted,
      kind: COLORS.muted,
      badge: COLORS.muted,
    }
  }
  return {
    background: item.buffered ? COLORS.panelSoft : COLORS.panel,
    title: item.tone === "draft" ? COLORS.warning : COLORS.text,
    kind: COLORS.muted,
    badge: item.tone === "draft" ? COLORS.warning : item.buffered ? COLORS.accentSoft : COLORS.border,
  }
}

export function scrollListForCursor(state: AppState, listScroll: ScrollBoxRenderable): void {
  const halfViewport = Math.max(2, Math.floor((listScroll.viewport.height || 10) / 2))
  const target = Math.max(0, state.cursor - halfViewport)
  listScroll.scrollTo({ x: 0, y: target })
}

export function toneColor(tone: StatusTone): string {
  if (tone === "success") return COLORS.success
  if (tone === "warning") return COLORS.warning
  if (tone === "error") return COLORS.error
  return COLORS.accent
}

function statusPaneColor(state: AppState): string {
  return toneColor(state.status.tone)
}

function truncateSingleLine(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) {
    return compact
  }
  return `${compact.slice(0, Math.max(0, width - 3))}...`
}

function truncateFromStart(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) {
    return compact
  }
  if (width <= 3) {
    return compact.slice(Math.max(0, compact.length - width))
  }
  return `...${compact.slice(Math.max(0, compact.length - (width - 3)))}`
}

function truncatePreviewLines(text: string, maxLines: number, width: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").split("\n")
  const flattened: string[] = []
  for (const line of normalized) {
    const source = line || ""
    if (source.length === 0) {
      flattened.push("")
      continue
    }
    for (let index = 0; index < source.length; index += width) {
      flattened.push(source.slice(index, index + width))
    }
  }
  return flattened.slice(0, maxLines)
}

function bufferModalLayout(state: AppState): {
  top: number
  height: number
  paneVisibleRows: number
  paneHeight: number
  promptPreviewLines: number
  showRange: boolean
  hasItems: boolean
} {
  const items = bufferModalItems(state)
  const top = 4
  const viewportHeight = process.stdout.rows || (state.layoutMode === "wide" ? 32 : 24)
  const outerPadding = 2
  const statusPaneHeight = 5
  const gapAboveStatus = 1
  const minModalHeight = state.layoutMode === "wide" ? 14 : 12
  const narrowExtraStretch = state.layoutMode === "wide" ? 0 : 2
  const availableHeight = Math.max(minModalHeight, viewportHeight - top - outerPadding - statusPaneHeight - gapAboveStatus + narrowExtraStretch + 1)
  const promptPreviewLines = Math.max(1, Math.min(4, state.promptText.replace(/\r\n/g, "\n").split("\n").length))
  const promptHeight = 2 + promptPreviewLines
  const footerHeight = 2
  const modalPaddingAndBorders = 4
  const paneHeaderRows = items.length > 0 ? 3 : 0
  const paneFrameRows = items.length > 0 ? 3 : 0
  const desiredPaneContentRows = items.reduce((total, path) => total + (state.conceptNotes[path]?.trim() ? 2 : 1), 0)
  const desiredPaneVisibleRows = items.length === 0 ? 0 : Math.max(2, Math.min(state.layoutMode === "wide" ? 8 : 6, desiredPaneContentRows))
  const desiredPaneHeight = items.length === 0 ? 0 : desiredPaneVisibleRows + paneHeaderRows + paneFrameRows + 1
  const paneArea = Math.max(0, availableHeight - promptHeight - footerHeight - modalPaddingAndBorders - (items.length > 0 ? 1 : 0))
  const paneHeight = items.length === 0 ? 0 : Math.min(paneArea, Math.max(8, desiredPaneHeight))
  const paneVisibleRows = items.length === 0 ? 0 : Math.max(2, paneHeight - paneHeaderRows - paneFrameRows - 1)
  const showRange = items.some((path) => state.conceptNotes[path]?.trim())
    ? desiredPaneContentRows > paneVisibleRows
    : items.length > paneVisibleRows
  const computedHeight = items.length === 0
    ? promptHeight + footerHeight + modalPaddingAndBorders
    : promptHeight + footerHeight + modalPaddingAndBorders + 1 + paneHeight
  return {
    top,
    height: Math.min(availableHeight, Math.max(minModalHeight, computedHeight)),
    paneVisibleRows,
    paneHeight,
    promptPreviewLines,
    showRange,
    hasItems: items.length > 0,
  }
}

function bufferModalHelpText(_hasItems: boolean, _promptSelected: boolean): string {
  return "Enter -> Edit  Esc -> Close"
}

function renderSelectedConceptsPane(state: AppState, maxVisible: number, paneHeight: number, showRange: boolean): Renderable | VNode<any, any[]> {
  const items = bufferModalItems(state)
  const focusInPane = state.bufferModal.focus === "categories"
  const cursor = state.bufferModal.conceptCursor
  const itemHeights = items.map((path) => (state.conceptNotes[path]?.trim() ? 2 : 1))
  const boundedCursor = Math.max(0, Math.min(cursor, Math.max(0, items.length - 1)))
  let start = boundedCursor
  let end = boundedCursor + 1
  let usedRows = itemHeights[boundedCursor] ?? 0
  while (start > 0 && usedRows + itemHeights[start - 1] <= maxVisible) {
    start -= 1
    usedRows += itemHeights[start]
  }
  while (end < items.length && usedRows + itemHeights[end] <= maxVisible) {
    usedRows += itemHeights[end]
    end += 1
  }
  const visibleItems = items.slice(start, end)

  return Box(
    {
      width: "100%",
      height: paneHeight,
      padding: 1,
      backgroundColor: COLORS.panel,
      borderStyle: "rounded",
      borderColor: COLORS.borderActive,
      title: "Selection",
      flexDirection: "column",
      gap: 1,
    },
    ...(items.length === 0
      ? [Text({ content: "No selected concepts", fg: COLORS.muted })]
      : [
          ...(showRange ? [Text({ content: `Showing ${start + 1}-${end} of ${items.length}`, fg: COLORS.muted })] : []),
          Box(
            { width: "100%", flexDirection: "column", gap: 0 },
            ...visibleItems.flatMap((path, visibleIndex) => {
              const selected = focusInPane && start + visibleIndex === cursor
              const isDraft = Boolean(state.nodes.get(path)?.isDraft)
              return [
                Box(
                  {
                    width: "100%",
                    paddingX: 1,
                    backgroundColor: selected ? COLORS.selectedBg : COLORS.panelSoft,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  },
                  Box(
                    { flexDirection: "row", gap: 1, flexGrow: 1 },
                    Text({ content: path, fg: selected ? COLORS.selectedFg : COLORS.accent, attributes: selected ? TextAttributes.BOLD : 0 }),
                    ...(state.conceptAliases[path]
                      ? [
                          Text({
                            content: `(${state.conceptAliases[path]})`,
                            fg: selected ? COLORS.selectedFg : COLORS.warning,
                            attributes: TextAttributes.BOLD,
                          }),
                        ]
                      : []),
                  ),
                  Text({
                    content: isDraft ? "new" : "",
                    fg: selected ? COLORS.selectedFg : COLORS.warning,
                    attributes: isDraft ? TextAttributes.BOLD : 0,
                  }),
                ),
                ...(state.conceptNotes[path]?.trim()
                  ? [
                      Box(
                        {
                          width: "100%",
                          marginLeft: 1,
                          paddingX: 1,
                          backgroundColor: selected ? COLORS.panelSoft : "#171d22",
                        },
                        Box(
                          { width: "100%", flexDirection: "row", gap: 1 },
                          Text({ content: selected ? "|" : ":", fg: selected ? COLORS.accent : COLORS.border }),
                          Text({
                            content: truncateSingleLine(state.conceptNotes[path]!.trim(), state.layoutMode === "wide" ? 16 : 38),
                            fg: selected ? COLORS.accentSoft : COLORS.muted,
                            attributes: selected ? TextAttributes.BOLD : 0,
                          }),
                        ),
                      ),
                    ]
                  : []),
              ]
            }),
          ),
        ]),
  )
}

function renderCreateConceptModal(state: AppState, modal: CreateConceptModalState): Array<Renderable | VNode<any, any[]>> {
  const options = createKindOptions(state, modal.kindQuery)
  const selectedOption = options[Math.max(0, Math.min(modal.kindCursor, Math.max(0, options.length - 1)))]
  const visibleOptions = options.slice(0, state.layoutMode === "wide" ? 8 : 6)
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      {
        position: "absolute",
        top: state.layoutMode === "wide" ? 5 : 3,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 84 : "94%",
        padding: 1,
        backgroundColor: COLORS.panelSoft,
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        marginLeft: state.layoutMode === "wide" ? -42 : undefined,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: "Add Draft Concept", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      Text({ content: modal.fieldIndex === 0 ? `Name: ${modal.draft.title || ""}` : `Name: ${modal.draft.title || ""}`, fg: modal.fieldIndex === 0 ? COLORS.selectedBg : COLORS.text }),
      Text({ content: modal.fieldIndex === 1 ? `Kind: ${selectedOption?.kind ?? (modal.kindQuery || "None")}` : `Kind: ${selectedOption?.kind ?? (modal.kindQuery || "None")}`, fg: modal.fieldIndex === 1 ? COLORS.selectedBg : COLORS.text }),
      ...(modal.kindExpanded
        ? [
            Box(
              {
                width: "100%",
                padding: 1,
                backgroundColor: COLORS.panel,
                borderStyle: "rounded",
                borderColor: COLORS.warning,
                flexDirection: "column",
              },
              ...visibleOptions.map((option, index) => {
                const selected = index === Math.max(0, Math.min(modal.kindCursor, visibleOptions.length - 1))
                return Box(
                  {
                    width: "100%",
                    paddingX: 1,
                    backgroundColor: selected ? COLORS.selectedBg : COLORS.panel,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  },
                  Text({ content: option.kind, fg: selected ? COLORS.selectedFg : COLORS.text, attributes: selected ? TextAttributes.BOLD : 0 }),
                  Text({ content: option.description, fg: selected ? COLORS.selectedFg : COLORS.muted }),
                )
              }),
            ),
          ]
        : []),
      Text({ content: modal.fieldIndex === 2 ? `Summary: ${modal.draft.summary || ""}` : `Summary: ${modal.draft.summary || ""}`, fg: modal.fieldIndex === 2 ? COLORS.selectedBg : COLORS.text }),
      Text({ content: modal.kindExpanded ? "Type -> Filter  Arrows -> Move  Enter -> Close  Esc -> Close" : "Tab -> Next  Shift+Tab -> Prev  Enter -> Open/Create  Esc -> Close", fg: COLORS.muted }),
    ),
  ]
}

function createKindOptions(state: AppState, query: string): Array<{ kind: string; description: string }> {
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = state.kindDefinitions
    .filter((item) => normalizedQuery.length === 0 || fuzzyKindScore(item.kind, normalizedQuery) > 0)
    .sort((left, right) => {
      const leftScore = fuzzyKindScore(left.kind, normalizedQuery)
      const rightScore = fuzzyKindScore(right.kind, normalizedQuery)
      return rightScore - leftScore || left.kind.localeCompare(right.kind)
    })
    .map((item) => ({ kind: item.kind, description: item.description }))
  return [{ kind: "None", description: "Create this concept without assigning a kind." }, ...filtered]
}

function fuzzyKindScore(candidate: string, query: string): number {
  if (!query) {
    return 1
  }
  const normalizedCandidate = candidate.toLowerCase()
  if (normalizedCandidate.includes(query)) {
    return 100 - normalizedCandidate.indexOf(query)
  }
  let queryIndex = 0
  let score = 0
  for (let index = 0; index < normalizedCandidate.length && queryIndex < query.length; index += 1) {
    if (normalizedCandidate[index] === query[queryIndex]) {
      score += 2
      queryIndex += 1
    }
  }
  return queryIndex === query.length ? score : 0
}

function renderConfirmModal(state: AppState): Array<Renderable | VNode<any, any[]>> {
  if (!state.confirmModal) {
    return []
  }
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      {
        position: "absolute",
        top: state.layoutMode === "wide" ? 8 : 6,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 74 : "92%",
        padding: 1,
        backgroundColor: COLORS.panelSoft,
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        marginLeft: state.layoutMode === "wide" ? -37 : undefined,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: state.confirmModal.title, fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      ...state.confirmModal.message.map((line) => Text({ content: line, fg: COLORS.text })),
      Text({ content: `Enter -> Remove  Esc -> Close`, fg: COLORS.muted }),
    ),
  ]
}

export function repaint(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, root: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number }): void {
  const listItems = listLines(state)
  const selectedNode = currentNode(state)
  const nextContextKey = contextKeyForNode(selectedNode.path, selectedNode.loc, selectedNode.summary)
  const shouldRefreshContext = contextPreviewKey !== nextContextKey
  const renderVersion = shouldRefreshContext ? (contextRenderVersion += 1) : contextRenderVersion

  replaceChildren(
    listScroll,
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      ...listItems.map((item) => {
        const colors = conceptRowColors(item)
        const titleWidth = state.layoutMode === "wide" ? 28 : 22
        const kindWidth = state.layoutMode === "wide" ? 12 : 10
        return Box(
          {
            width: "100%",
            paddingX: 1,
            backgroundColor: colors.background,
            flexDirection: "row",
            justifyContent: "space-between",
          },
          Box(
            { flexDirection: "row", gap: 1, flexGrow: 1 },
            Text({ content: item.stateLabel ? item.stateLabel.padEnd(3, " ") : " · ", fg: colors.badge, attributes: item.selected || Boolean(item.stateLabel) ? TextAttributes.BOLD : 0 }),
            Text({ content: truncateSingleLine(item.title, titleWidth), fg: colors.title, attributes: item.selected ? TextAttributes.BOLD : 0 }),
          ),
          Text({ content: item.kindLabel ? truncateSingleLine(item.kindLabel, kindWidth) : "", fg: colors.kind, attributes: item.selected ? TextAttributes.BOLD : 0 }),
        )
      }),
    ),
  )

  if (shouldRefreshContext) {
    contextPreviewKey = nextContextKey
    void buildContextPreview(state, selectedNode).then(async (preview) => {
      if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) {
        return
      }
      state.contextTitle = preview.title
      state.contextLegendItems = preview.legendItems ?? []
      if (preview.useSyntaxStyle) {
        await getSnippetSyntaxStyle()
        if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) {
          return
        }
      }
      replaceChildren(
        mainScroll,
        Box(
          { width: "100%", flexDirection: "column", gap: 0 },
          ...(selectedNode.summary
            ? [
                Text({ content: selectedNode.summary, fg: COLORS.text }),
                Text({ content: "", fg: COLORS.text }),
              ]
            : []),
          Box(
            { width: "100%", flexDirection: "column", gap: 0 },
            ...preview.lines.map((line) =>
              Text({}, ...textNodesForChunks(line.chunks)),
            ),
          ),
        ),
      )
      mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
      replaceChildren(root, renderFrame(state, listScroll, mainScroll, renderStatusPane(state)))
    })
  }

  replaceChildren(root, renderFrame(state, listScroll, mainScroll, renderStatusPane(state)))
}
