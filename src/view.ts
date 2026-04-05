import { type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes } from "@opentui/core"

import { bulletList } from "./model"
import { bufferModalCategories, bufferModalItems, bufferedConceptForPath, currentNode, selectedBufferModalTarget, visiblePaths } from "./state"
import type { AppState, BufferModalCategory, CreateConceptModalState, ListLine, MainLine, StatusTone } from "./types"

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
    const bufferedConcept = bufferedConceptForPath(state, path)
    const buffered = Boolean(bufferedConcept)
    const stateLabel = node.isDraft ? "new" : bufferedConcept?.action === "delete" ? "del" : buffered ? "buf" : undefined
    return {
      title: node.title,
      kindLabel: node.kind,
      stateLabel,
      selected,
      buffered,
      tone: node.isDraft ? "draft" : bufferedConcept?.action === "delete" ? "delete" : undefined,
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
    title: item.tone === "delete" ? COLORS.error : item.tone === "draft" ? COLORS.warning : COLORS.text,
    kind: COLORS.muted,
    badge: item.tone === "delete" ? COLORS.error : item.tone === "draft" ? COLORS.warning : item.buffered ? COLORS.accentSoft : COLORS.border,
  }
}

export function mainLines(state: AppState): MainLine[] {
  const node = currentNode(state)
  const lines: MainLine[] = [
    { content: node.title, role: "title" },
    { content: "", role: "body" },
  ]
  if (node.isDraft) {
    lines.push({ content: "draft", role: "section" }, { content: "This concept was created in the TUI and is not yet part of the source concept graph.", role: "body" }, { content: "", role: "body" })
  }
  if (node.summary) {
    lines.push({ content: "summary", role: "section" }, { content: node.summary, role: "body" }, { content: "", role: "body" })
  }
  for (const key of ["why_it_exists", "state_predicate"] as const) {
    const value = node.metadata[key]
    if (typeof value === "string" && value) {
      lines.push({ content: key, role: "section" }, { content: value, role: "body" }, { content: "", role: "body" })
    }
  }
  for (const [label, values] of [["aliases", bulletList(node.metadata.aliases)]] as const) {
    if (values.length > 0) {
      lines.push({ content: label, role: "section" })
      for (const item of values) {
        lines.push({ content: `- ${item}`, role: "body" })
      }
      lines.push({ content: "", role: "body" })
    }
  }
  return lines
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
  return state.pendingCopyChoice ? COLORS.warning : toneColor(state.status.tone)
}

function truncateSingleLine(text: string, width: number): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= width) {
    return compact
  }
  return `${compact.slice(0, Math.max(0, width - 3))}...`
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
    let remaining = source
    while (remaining.length > width) {
      flattened.push(remaining.slice(0, width))
      remaining = remaining.slice(width)
    }
    flattened.push(remaining)
  }
  if (flattened.length <= maxLines) {
    return [...flattened, ...Array.from({ length: Math.max(0, maxLines - flattened.length) }, () => "")].slice(0, maxLines)
  }
  const visible = flattened.slice(0, maxLines)
  visible[maxLines - 1] = truncateSingleLine(visible[maxLines - 1], width)
  if (visible[maxLines - 1].length >= 3) {
    visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, Math.max(0, width - 3))}...`
  }
  return visible
}

function clampVisibleWindow(cursor: number, total: number, maxVisible: number): { start: number; end: number } {
  if (total <= maxVisible) {
    return { start: 0, end: total }
  }
  const half = Math.floor(maxVisible / 2)
  let start = Math.max(0, cursor - half)
  const maxStart = Math.max(0, total - maxVisible)
  if (start > maxStart) {
    start = maxStart
  }
  return { start, end: Math.min(total, start + maxVisible) }
}

function createFormField(label: string, value: string, selected: boolean, placeholder: string): Renderable | VNode<any, any[]> {
  return Box(
    {
      width: "100%",
      flexDirection: "column",
      gap: 0,
    },
    Text({ content: label, fg: COLORS.accentSoft, attributes: TextAttributes.BOLD }),
    Box(
      {
        width: "100%",
        paddingX: 1,
        backgroundColor: selected ? COLORS.selectedBg : COLORS.panel,
      },
      Text({ content: value || placeholder, fg: selected ? COLORS.selectedFg : value ? COLORS.text : COLORS.muted, attributes: selected ? TextAttributes.BOLD : 0 }),
    ),
  )
}

function renderCreateConceptModal(state: AppState, modal: CreateConceptModalState): Array<Renderable | VNode<any, any[]>> {
  if (modal.step === "details") {
    return [
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
      Box(
        {
          position: "absolute",
          top: state.layoutMode === "wide" ? 5 : 4,
          left: state.layoutMode === "wide" ? "50%" : 2,
          width: state.layoutMode === "wide" ? 72 : "92%",
          padding: 1,
          backgroundColor: COLORS.panelSoft,
          borderStyle: "rounded",
          borderColor: COLORS.borderActive,
          marginLeft: state.layoutMode === "wide" ? -36 : undefined,
          flexDirection: "column",
          gap: 1,
        },
        Text({ content: "New Concept", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        createFormField("Name", modal.draft.title, modal.fieldIndex === 0, "Type the display name"),
        createFormField("Summary", modal.draft.summary, modal.fieldIndex === 1, "Type a short summary"),
        Text({ content: "Type to edit. Tab/Ctrl+J/Ctrl+K changes field. Enter continues. Esc/Ctrl+Q cancels.", fg: COLORS.muted }),
      ),
    ]
  }

  if (modal.step === "pick-kind") {
    const query = modal.kindQuery.trim().toLowerCase()
    const rankedOptions = state.kindDefinitions
      .map((item) => ({ item, score: fuzzyKindScore(item.kind, query) }))
      .filter((entry) => query.length === 0 || entry.score > 0)
      .sort((left, right) => right.score - left.score || left.item.kind.localeCompare(right.item.kind))
      .map((entry) => entry.item)
    const options = [{ kind: "<new kind>", description: "Create a new kind with its own semantic description.", source: "session" as const }, ...rankedOptions]
    const maxVisibleOptions = state.layoutMode === "wide" ? 4 : 2
    const { start, end } = clampVisibleWindow(modal.kindCursor, options.length, maxVisibleOptions)
    const visibleOptions = options.slice(start, end)
    return [
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
      Box(
        {
          position: "absolute",
          top: state.layoutMode === "wide" ? 2 : 2,
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
        Text({ content: "Select Kind", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
        createFormField("Search", modal.kindQuery, false, "Type to fuzzy search kinds"),
        Text({ content: `Showing ${start + 1}-${end} of ${options.length}`, fg: COLORS.muted }),
        ...visibleOptions.map((option, visibleIndex) =>
          Box(
            {
              width: "100%",
              paddingX: 1,
              flexDirection: "column",
              backgroundColor: start + visibleIndex === modal.kindCursor ? COLORS.selectedBg : COLORS.panel,
            },
            Text({ content: option.kind, fg: start + visibleIndex === modal.kindCursor ? COLORS.selectedFg : COLORS.text, attributes: start + visibleIndex === modal.kindCursor ? TextAttributes.BOLD : 0 }),
            Text({ content: truncateSingleLine(option.description || "(no description provided)", state.layoutMode === "wide" ? 72 : 52), fg: start + visibleIndex === modal.kindCursor ? COLORS.selectedFg : COLORS.muted }),
          ),
        ),
        Text({ content: "Type to search, Ctrl+J/Ctrl+K move, Enter selects, Esc/Ctrl+Q cancels", fg: COLORS.muted }),
      ),
    ]
  }

  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      {
        position: "absolute",
        top: state.layoutMode === "wide" ? 5 : 4,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: state.layoutMode === "wide" ? 76 : "92%",
        padding: 1,
        backgroundColor: COLORS.panelSoft,
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        marginLeft: state.layoutMode === "wide" ? -38 : undefined,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: "Define New Kind", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
      createFormField("Kind Name", modal.draft.newKindName, modal.fieldIndex === 0, "Type the kind name"),
      createFormField("Kind Description", modal.draft.newKindDescription, modal.fieldIndex === 1, "Describe this kind's semantics"),
        Text({ content: "Type to edit. Tab/Ctrl+J/Ctrl+K changes field. Enter continues. Esc/Ctrl+Q cancels.", fg: COLORS.muted }),
    ),
  ]
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
      Text({ content: `Enter ${state.confirmModal.confirmLabel}. Esc/Ctrl+Q cancels.`, fg: COLORS.muted }),
    ),
  ]
}

function bufferModalCategoryMeta(category: BufferModalCategory): { title: string; color: string; empty: string; deleteLabel?: boolean } {
  if (category === "deleted") {
    return { title: "Deleted Concepts", color: COLORS.error, empty: "No deleted concepts", deleteLabel: true }
  }
  if (category === "created") {
    return { title: "Created Concepts", color: COLORS.warning, empty: "No created concepts" }
  }
  return { title: "Buffered Concepts", color: COLORS.accent, empty: "No buffered concepts" }
}

function renderBufferCategoryPane(state: AppState, category: BufferModalCategory, maxVisible: number, paneHeight: number, showRange: boolean): Renderable | VNode<any, any[]> {
  const meta = bufferModalCategoryMeta(category)
  const items = bufferModalItems(state, category)
  const activePane = state.bufferModal.activeCategory === category
  const focusInPane = state.bufferModal.focus === "categories" && activePane
  const cursor = state.bufferModal.cursors[category] ?? 0
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
      width: state.layoutMode === "wide" ? 22 : "100%",
      flexGrow: state.layoutMode === "wide" ? 1 : 0,
      height: paneHeight,
      padding: 1,
      backgroundColor: activePane ? COLORS.panel : "#171d22",
      borderStyle: "rounded",
      borderColor: activePane ? COLORS.borderActive : COLORS.border,
      flexDirection: "column",
      gap: 1,
    },
    Text({ content: meta.title, fg: meta.color, attributes: TextAttributes.BOLD }),
    ...(items.length === 0
      ? [Text({ content: meta.empty, fg: COLORS.muted })]
      : [
          ...(showRange ? [Text({ content: `Showing ${start + 1}-${end} of ${items.length}`, fg: COLORS.muted })] : []),
          Box(
            { width: "100%", flexDirection: "column", gap: 0 },
            ...visibleItems.flatMap((path, visibleIndex) => {
              const selected = focusInPane && start + visibleIndex === cursor
              return [
                Box(
                  {
                    width: "100%",
                    paddingX: 1,
                    backgroundColor: selected ? COLORS.selectedBg : activePane ? COLORS.panelSoft : COLORS.panel,
                  },
                  Text({
                    content: meta.deleteLabel ? `${path} [delete]` : path,
                    fg: selected ? COLORS.selectedFg : meta.color,
                    attributes: selected ? TextAttributes.BOLD : 0,
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

function visibleBufferModalCategories(state: AppState): BufferModalCategory[] {
  return bufferModalCategories().filter((category) => bufferModalItems(state, category).length > 0)
}

function bufferModalLayout(state: AppState, visibleCategories: BufferModalCategory[]): {
  top: number
  height: number
  paneVisibleRows: number
  paneHeight: number
  renderCategories: BufferModalCategory[]
  promptPreviewLines: number
  showRange: boolean
} {
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
  const footerHeight = state.layoutMode === "wide" ? 2 : 3
  const modalPaddingAndBorders = 4
  const renderCategories = state.layoutMode === "wide"
    ? visibleCategories
    : visibleCategories.filter((category) => category === state.bufferModal.activeCategory)
  const categoryContainerGap = renderCategories.length > 0 ? 1 : 0
  const paneHeaderRows = renderCategories.length > 0 ? 2 : 0
  const paneFrameRows = renderCategories.length > 0 ? 3 : 0
  const desiredPaneContentRows = renderCategories.reduce((maxRows, category) => {
    const rows = bufferModalItems(state, category).reduce((total, path) => total + (state.conceptNotes[path]?.trim() ? 2 : 1), 0)
    return Math.max(maxRows, rows)
  }, 0)
  const desiredPaneVisibleRows = renderCategories.length === 0
    ? 0
    : Math.max(2, Math.min(state.layoutMode === "wide" ? 8 : 6, desiredPaneContentRows))
  const desiredPaneHeight = renderCategories.length === 0
    ? 0
    : desiredPaneVisibleRows + paneHeaderRows + paneFrameRows + 1
  const paneArea = Math.max(0, availableHeight - promptHeight - footerHeight - modalPaddingAndBorders - categoryContainerGap)
  const paneHeight = renderCategories.length === 0
    ? 0
    : Math.min(paneArea, Math.max(8, desiredPaneHeight))
  const paneVisibleRows = renderCategories.length === 0
    ? 0
    : Math.max(2, paneHeight - paneHeaderRows - paneFrameRows - 1)
  const showRange = renderCategories.some((category) => bufferModalItems(state, category).some((path) => state.conceptNotes[path]?.trim())
    ? bufferModalItems(state, category).reduce((total, path) => total + (state.conceptNotes[path]?.trim() ? 2 : 1), 0) > paneVisibleRows
    : bufferModalItems(state, category).length > paneVisibleRows)
  const computedHeight = renderCategories.length === 0
    ? promptHeight + footerHeight + modalPaddingAndBorders
    : promptHeight + footerHeight + modalPaddingAndBorders + categoryContainerGap + paneHeight
  return {
    top,
    height: Math.min(availableHeight, Math.max(minModalHeight, computedHeight)),
    paneVisibleRows,
    paneHeight,
    renderCategories,
    promptPreviewLines,
    showRange,
  }
}

function bufferModalHelpText(state: AppState, renderedCategoryCount: number, promptSelected: boolean): string {
  if (renderedCategoryCount === 0) {
    return "Enter edits prompt"
  }
  if (renderedCategoryCount === 1) {
    return promptSelected ? "j/down enters pane; Enter edits" : "j/k move; Enter edits"
  }
  if (promptSelected) {
    return state.layoutMode === "wide"
      ? "Prompt selected. j/down enters the active concept pane."
      : "j/down enters pane; h/l switch; Enter edits"
  }
  return state.layoutMode === "wide"
    ? "h/l or arrows switch panes. j/k or arrows move. Enter edits."
    : "h/l switch panes; j/k move; Enter edits"
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

export function repaint(state: AppState, listScroll: ScrollBoxRenderable, mainScroll: ScrollBoxRenderable, root: { getChildren: () => Renderable[]; add: (child: Renderable | VNode<any, any[]>, index?: number) => number }): void {
  const listItems = listLines(state)
  const mainItems = mainLines(state)

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

  replaceChildren(
    mainScroll,
    Box(
      { width: "100%", flexDirection: "column", gap: 0 },
      ...mainItems.map((line) =>
        Text({
          content: line.content,
          fg: line.role === "title" ? COLORS.accent : line.role === "section" ? COLORS.accentSoft : line.role === "muted" ? COLORS.muted : COLORS.text,
          attributes: line.role === "title" || line.role === "section" ? TextAttributes.BOLD : 0,
        }),
      ),
    ),
  )

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
      title: "Context",
      padding: 1,
      backgroundColor: COLORS.panel,
    },
    mainScroll,
  )

  const overlays: Array<Renderable | VNode<any, any[]>> = []

  if (state.showBufferModal) {
    const visibleCategories = visibleBufferModalCategories(state)
    const layout = bufferModalLayout(state, visibleCategories)
    const promptSelected = selectedBufferModalTarget(state).kind === "prompt"
    overlays.push(
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
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
        Text({ content: "Prompt Editor", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
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
        ...(visibleCategories.length > 0
          ? [
              Box(
                {
                  width: "100%",
                  flexDirection: state.layoutMode === "wide" ? "row" : "column",
                  gap: 1,
                },
                ...layout.renderCategories.map((category) => renderBufferCategoryPane(state, category, layout.paneVisibleRows, layout.paneHeight, layout.showRange)),
              ),
            ]
          : []),
        Text({ content: bufferModalHelpText(state, layout.renderCategories.length, promptSelected), fg: COLORS.muted }),
      ),
    )
  }

  if (state.editorModal) {
    overlays.push(
      Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000066" }),
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
          content: state.editorModal.target.kind === "prompt" ? "Edit Prompt" : `Edit Context: ${state.editorModal.target.path}`,
          fg: COLORS.accent,
          attributes: TextAttributes.BOLD,
        }),
        Box(
          {
            width: "100%",
            minHeight: 8,
            backgroundColor: COLORS.panelSoft,
            flexDirection: "column",
          },
          state.editorModal.renderable,
        ),
        Text({ content: "Esc/Ctrl+Q cancels, Ctrl+Enter saves, Ctrl+G opens $EDITOR", fg: COLORS.muted }),
      ),
    )
  }

  if (state.createConceptModal) {
    overlays.push(...renderCreateConceptModal(state, state.createConceptModal))
  }

  overlays.push(...renderConfirmModal(state))

  replaceChildren(
    root,
    Box(
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
        },
        Box(
          { width: "100%", flexDirection: state.layoutMode === "wide" ? "row" : "column", justifyContent: "space-between" },
          Text({ content: "setsumei", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
          Text({ content: currentNode(state).path, fg: COLORS.muted }),
        ),
      ),
      Box(
        {
          width: "100%",
          flexGrow: 1,
          flexDirection: state.layoutMode === "wide" ? "row" : "column",
          gap: 1,
        },
        sidebar,
        context,
      ),
      ...overlays,
      Box(
        {
          width: "100%",
          borderStyle: "rounded",
          borderColor: statusPaneColor(state),
          paddingX: 1,
          paddingY: 1,
          backgroundColor: COLORS.panel,
        },
        Text({ content: state.status.message, fg: statusPaneColor(state) }),
      ),
    ),
  )

  scrollListForCursor(state, listScroll)
  state.mainViewportHeight = Math.max(8, mainScroll.viewport.height || (state.layoutMode === "wide" ? 18 : 12))
  mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
}
