import { type Renderable, type VNode, Box, ScrollBoxRenderable, Text, TextAttributes, Code, type TextChunk } from "@opentui/core"

import { getSnippetSyntaxStyle, buildSnippetPreview } from "./snippet"
import { bufferModalCategories, bufferModalItems, bufferedConceptForPath, currentNode, selectedBufferModalTarget, visibleBufferModalCategories, visiblePaths } from "./state"
import type { AppState, BufferModalCategory, CreateConceptModalState, ListLine, StatusTone } from "./types"

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

let contextRenderVersion = 0
let contextPreviewKey: string | null = null

function contextKeyForNode(path: string, loc: { file: string; startLine: number; endLine: number } | null, summary: string): string {
  if (!loc) {
    return `${path}::no-loc::${summary}`
  }
  return `${path}::${loc.file}:${loc.startLine}-${loc.endLine}::${summary}`
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
      title: selectedNode.loc ? `Context ${selectedNode.loc.file}:${selectedNode.loc.startLine}-${selectedNode.loc.endLine}` : "Context",
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
    const hasCategory = Boolean(layout.selectedCategory)
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
        ...(layout.selectedCategory
          ? [
              renderBufferCategorySwitcher(state, visibleCategories),
              Box(
                {
                  width: "100%",
                  flexDirection: "column",
                },
                renderBufferCategoryPane(state, layout.selectedCategory, layout.paneVisibleRows, layout.paneHeight, layout.showRange),
              ),
            ]
          : []),
        Box(
          {
            width: "100%",
            paddingX: 1,
          },
          Text({ content: bufferModalHelpText(state, hasCategory, promptSelected), fg: COLORS.muted }),
        ),
      ),
    )
  }

  if (state.editorModal) {
    const aliasSuggestion = state.editorModal.aliasSuggestion
    const aliasMatches = aliasSuggestion
      ? Object.keys(state.aliasPaths)
          .sort((left, right) => left.localeCompare(right))
          .filter((alias) => aliasSuggestion.query.length === 0 || alias.slice(1).toLowerCase().includes(aliasSuggestion.query.toLowerCase()))
      : []
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
        ...(aliasSuggestion && aliasMatches.length > 0
          ? [
              Box(
                {
                  width: "100%",
                  maxHeight: 6,
                  paddingX: 1,
                  paddingY: 0,
                  backgroundColor: "#171d22",
                  borderStyle: "rounded",
                  borderColor: COLORS.warning,
                  flexDirection: "column",
                },
                ...aliasMatches.slice(0, 6).map((alias, index) => {
                  const selected = index === aliasSuggestion.selectedIndex
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
        Text({ content: "Esc/Ctrl+Q cancels, Enter saves, Shift+Enter adds newline, Ctrl+G opens $EDITOR, Ctrl+H/Ctrl+L retypes existing concepts", fg: COLORS.muted }),
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
      },
      Box(
        { width: "100%", flexDirection: state.layoutMode === "wide" ? "row" : "column", justifyContent: "space-between" },
        Text({ content: "⚓", fg: COLORS.accent, attributes: TextAttributes.BOLD }),
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
    statusPane,
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
    const bufferedConcept = bufferedConceptForPath(state, path)
    const buffered = Boolean(bufferedConcept)
    const stateLabel = node.isDraft ? "new" : bufferedConcept?.action === "delete" ? "del" : buffered ? "buf" : undefined
    return {
      title: node.title,
      kindLabel: node.kind ?? "(no kind)",
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

function createFormField(label: string, value: string, selected: boolean, placeholder: string, detail?: string): Renderable | VNode<any, any[]> {
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
    ...(detail ? [Text({ content: detail, fg: COLORS.muted })] : []),
  )
}

function renderCreateConceptModal(state: AppState, modal: CreateConceptModalState): Array<Renderable | VNode<any, any[]>> {
  const query = modal.kindQuery.trim().toLowerCase()
  const filteredOptions = state.kindDefinitions
    .map((item) => ({ item, score: fuzzyKindScore(item.kind, query) }))
    .filter((entry) => query.length === 0 || entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.kind.localeCompare(right.item.kind))
    .map((entry) => entry.item)
  const noneOption = { kind: "None", description: "Create this concept without assigning a kind.", source: "options" as const }
  const options = query.length === 0 || fuzzyKindScore(noneOption.kind, query) > 0 ? [noneOption, ...filteredOptions] : filteredOptions
  const selectedKind = options[Math.max(0, Math.min(modal.kindCursor, Math.max(0, options.length - 1)))] ?? null
  const exactQueryMatch = state.kindDefinitions.find((item) => item.kind.toLowerCase() === query) ?? null
  const selectedKindLabel = selectedKind?.kind ?? exactQueryMatch?.kind ?? (modal.kindQuery.trim() ? modal.kindQuery.trim() : "No kind")
  const pathPreviewBase = modal.draft.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "new_concept"
  const pathPreview = `${state.currentParentPath}.${pathPreviewBase}`
  const viewportHeight = process.stdout.rows || 24
  const maxVisibleOptions = viewportHeight <= 32 ? 2 : 4
  const { start, end } = clampVisibleWindow(modal.kindCursor, options.length, maxVisibleOptions)
  const visibleOptions = options.slice(start, end)
  const optionRows = modal.fieldIndex === 1 && modal.kindExpanded
    ? options.length === 0
      ? [
          Box(
            {
              width: "100%",
              paddingX: 1,
              flexDirection: "column",
              backgroundColor: COLORS.panel,
            },
            Text({ content: modal.kindQuery.trim() ? "No kinds match this search yet." : "No kinds available.", fg: COLORS.warning, attributes: TextAttributes.BOLD }),
            Text({ content: "Backspace edits the search. Left closes the list. Right clears the search.", fg: COLORS.muted }),
          ),
        ]
      : [
          Text({ content: `Showing ${start + 1}-${end} of ${options.length}`, fg: COLORS.muted }),
          ...visibleOptions.map((option, visibleIndex) => {
            const selected = start + visibleIndex === modal.kindCursor
            return Box(
              {
                width: "100%",
                paddingX: 1,
                flexDirection: "column",
                backgroundColor: selected ? COLORS.selectedBg : COLORS.panel,
              },
              Text({ content: option.kind, fg: selected ? COLORS.selectedFg : COLORS.text, attributes: selected ? TextAttributes.BOLD : 0 }),
              Text({ content: truncateSingleLine(option.description || "(no description provided)", state.layoutMode === "wide" ? 76 : 54), fg: selected ? COLORS.selectedFg : COLORS.muted }),
            )
          }),
        ]
    : []
  const modalTop = state.layoutMode === "wide" ? 3 : 0
  const modalWidth = state.layoutMode === "wide" ? 88 : "94%"
  return [
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000088" }),
    Box(
      {
        position: "absolute",
        top: modalTop,
        left: state.layoutMode === "wide" ? "50%" : 2,
        width: modalWidth,
        maxHeight: state.layoutMode === "wide" ? undefined : "74%",
        padding: 1,
        backgroundColor: COLORS.panelSoft,
        borderStyle: "rounded",
        borderColor: COLORS.borderActive,
        title: "New Concept",
        marginLeft: state.layoutMode === "wide" ? -44 : undefined,
        flexDirection: "column",
        gap: 1,
      },
      createFormField("Concept name", modal.draft.title, modal.fieldIndex === 0, "Type the concept name"),
      createFormField("Kind (optional)", selectedKindLabel, modal.fieldIndex === 1, state.kindDefinitions.length === 0 ? "No kinds available" : "Press Enter to browse kinds", `Path preview: ${pathPreview}`),
      ...optionRows,
      createFormField("Short summary", modal.draft.summary, modal.fieldIndex === 2, "Explain why this concept matters"),
      Text({ content: modal.fieldIndex === 1 && modal.kindExpanded ? "Type to search kinds. Up/Down move. Enter confirms. Left closes. Right clears the search." : "Tab/Shift+Tab or Up/Down move between fields. Enter creates, or opens kind choices. Esc cancels.", fg: COLORS.muted }),
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

function bufferCategoryLabelColor(category: BufferModalCategory): string {
  if (category === "deleted") {
    return COLORS.error
  }
  if (category === "created") {
    return COLORS.warning
  }
  return COLORS.accent
}

function bufferPaneTitle(state: AppState): string {
  const right = state.bufferModal.mode === "retyping" ? "mode: Retyping" : "mode: Displaying"
  const width = state.layoutMode === "wide" ? 100 : 44
  const spaces = Math.max(1, width - "Concepts".length - right.length)
  return `Concepts${" ".repeat(spaces)}${right}`
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
      width: "100%",
      height: paneHeight,
      padding: 1,
      backgroundColor: activePane ? COLORS.panel : "#171d22",
      borderStyle: "rounded",
      borderColor: activePane ? COLORS.borderActive : COLORS.border,
      title: bufferPaneTitle(state),
      flexDirection: "column",
      gap: 1,
    },
    ...(items.length === 0
      ? [Text({ content: meta.empty, fg: COLORS.muted })]
      : [
          ...(showRange ? [Text({ content: `Showing ${start + 1}-${end} of ${items.length}`, fg: COLORS.muted })] : []),
          Box(
            { width: "100%", flexDirection: "column", gap: 0 },
            ...visibleItems.flatMap((path, visibleIndex) => {
              const selected = focusInPane && start + visibleIndex === cursor
              const retypePreview = selected && state.bufferModal.mode === "retyping" && state.bufferModal.retypeTargetCategory
                ? `-> ${state.bufferModal.retypeTargetCategory}`
                : null
              return [
                Box(
                  {
                    width: "100%",
                    paddingX: 1,
                    backgroundColor: selected ? COLORS.selectedBg : activePane ? COLORS.panelSoft : COLORS.panel,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  },
                  Box(
                    { flexDirection: "row", gap: 1, flexGrow: 1 },
                    Text({ content: path, fg: selected ? COLORS.selectedFg : meta.color, attributes: selected ? TextAttributes.BOLD : 0 }),
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
                    content: retypePreview ?? "",
                    fg: selected ? COLORS.selectedFg : COLORS.muted,
                    attributes: selected && retypePreview ? TextAttributes.BOLD : 0,
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

function renderBufferCategorySwitcher(state: AppState, visibleCategories: BufferModalCategory[]): Renderable | VNode<any, any[]> {
  if (state.bufferModal.mode === "retyping") {
    const displayCategories = bufferModalCategories().filter((category) => bufferModalItems(state, category).length > 0)
    const current = visibleCategories.includes(state.bufferModal.activeCategory) ? state.bufferModal.activeCategory : visibleCategories[0] ?? null
    const activeIndex = visibleCategories.indexOf(current ?? visibleCategories[0] ?? "buffered")
    const leftCandidate = activeIndex > 0 ? visibleCategories[activeIndex - 1] : null
    const rightCandidate = activeIndex >= 0 && activeIndex < visibleCategories.length - 1 ? visibleCategories[activeIndex + 1] : null
    const left = leftCandidate && displayCategories.includes(leftCandidate) ? leftCandidate : null
    const right = rightCandidate && displayCategories.includes(rightCandidate) ? rightCandidate : null
    const width = state.layoutMode === "wide" ? 92 : 56
    const thirdWidth = Math.floor(width / 3)

    return Box(
      {
        width,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        alignSelf: "center",
      },
      Box(
        { width: thirdWidth, justifyContent: "center", alignItems: "center" },
        Text({ content: left ? `${left}  <` : "", fg: COLORS.muted }),
      ),
      Box(
        { width: thirdWidth, justifyContent: "center", alignItems: "center" },
        Text({ content: current ?? "", fg: current ? bufferCategoryLabelColor(current) : COLORS.accent, attributes: TextAttributes.BOLD }),
      ),
      Box(
        { width: width - thirdWidth * 2, justifyContent: "center", alignItems: "center" },
        Text({ content: right ? `>  ${right}` : "", fg: COLORS.muted }),
      ),
    )
  }
  if (visibleCategories.length <= 1) {
    return Box(
      {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        paddingX: 1,
      },
      Text({ content: visibleCategories[0] ?? "", fg: visibleCategories[0] ? bufferCategoryLabelColor(visibleCategories[0]) : COLORS.accent, attributes: TextAttributes.BOLD }),
    )
  }
  const activeIndex = visibleCategories.indexOf(state.bufferModal.activeCategory)
  const left = activeIndex > 0 ? visibleCategories[activeIndex - 1] : null
  const current = activeIndex >= 0 ? visibleCategories[activeIndex] : null
  const right = activeIndex >= 0 && activeIndex < visibleCategories.length - 1 ? visibleCategories[activeIndex + 1] : null
  const width = state.layoutMode === "wide" ? 92 : 56
  const thirdWidth = Math.floor(width / 3)

  return Box(
    {
      width,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
    },
    Box(
      { width: thirdWidth, justifyContent: "center", alignItems: "center" },
      Text({ content: left ? `${left}  <` : "", fg: COLORS.muted }),
    ),
    Box(
      { width: thirdWidth, justifyContent: "center", alignItems: "center" },
      Text({ content: current ?? "", fg: current ? bufferCategoryLabelColor(current) : COLORS.accent, attributes: TextAttributes.BOLD }),
    ),
    Box(
      { width: width - thirdWidth * 2, justifyContent: "center", alignItems: "center" },
      Text({ content: right ? `>  ${right}` : "", fg: COLORS.muted }),
    ),
  )
}

function bufferModalLayout(state: AppState, visibleCategories: BufferModalCategory[]): {
  top: number
  height: number
  paneVisibleRows: number
  paneHeight: number
  selectedCategory: BufferModalCategory | null
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
  const footerHeight = 2
  const modalPaddingAndBorders = 4
  const selectedCategory = visibleCategories.includes(state.bufferModal.activeCategory) ? state.bufferModal.activeCategory : visibleCategories[0] ?? null
  const categoryContainerGap = selectedCategory ? 1 : 0
  const paneHeaderRows = selectedCategory ? 3 : 0
  const paneFrameRows = selectedCategory ? 3 : 0
  const desiredPaneContentRows = selectedCategory
    ? bufferModalItems(state, selectedCategory).reduce((total, path) => total + (state.conceptNotes[path]?.trim() ? 2 : 1), 0)
    : 0
  const desiredPaneVisibleRows = !selectedCategory
    ? 0
    : Math.max(2, Math.min(state.layoutMode === "wide" ? 8 : 6, desiredPaneContentRows))
  const desiredPaneHeight = !selectedCategory
    ? 0
    : desiredPaneVisibleRows + paneHeaderRows + paneFrameRows + 1
  const paneArea = Math.max(0, availableHeight - promptHeight - footerHeight - modalPaddingAndBorders - categoryContainerGap)
  const paneHeight = !selectedCategory
    ? 0
    : Math.min(paneArea, Math.max(8, desiredPaneHeight))
  const paneVisibleRows = !selectedCategory
    ? 0
    : Math.max(2, paneHeight - paneHeaderRows - paneFrameRows - 1)
  const showRange = selectedCategory
    ? (bufferModalItems(state, selectedCategory).some((path) => state.conceptNotes[path]?.trim())
        ? bufferModalItems(state, selectedCategory).reduce((total, path) => total + (state.conceptNotes[path]?.trim() ? 2 : 1), 0) > paneVisibleRows
        : bufferModalItems(state, selectedCategory).length > paneVisibleRows)
    : false
  const computedHeight = !selectedCategory
    ? promptHeight + footerHeight + modalPaddingAndBorders
    : promptHeight + footerHeight + modalPaddingAndBorders + categoryContainerGap + paneHeight
  return {
    top,
    height: Math.min(availableHeight, Math.max(minModalHeight, computedHeight)),
    paneVisibleRows,
    paneHeight,
    selectedCategory,
    promptPreviewLines,
    showRange,
  }
}

function bufferModalHelpText(state: AppState, hasCategory: boolean, promptSelected: boolean): string {
  if (state.bufferModal.mode === "retyping") {
    return "Tab next target, Shift+Tab exit, Enter apply, Esc cancel"
  }
  if (!hasCategory) {
    return "Enter edits prompt"
  }
  if (promptSelected) {
    return "j/down enters pane; h/l switch concept type; Enter edits prompt"
  }
  return "h/l switch concept type; j/k move; Enter edits; Tab retype"
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
    void buildSnippetPreview(state, selectedNode).then(async (preview) => {
      if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) {
        return
      }
      const syntaxStyle = await getSnippetSyntaxStyle()
      if (renderVersion !== contextRenderVersion || contextPreviewKey !== nextContextKey) {
        return
      }
      const content = preview.lines.map((line) => line.chunks.map((chunk) => chunk.text).join("")).join("\n")
      replaceChildren(
        mainScroll,
        Box(
          { width: "100%", flexDirection: "column", gap: 0 },
          ...(selectedNode.summary
            ? [
                Text({ content: "Summary", fg: COLORS.accentSoft, attributes: TextAttributes.BOLD }),
                Text({ content: selectedNode.summary, fg: COLORS.text }),
                Text({ content: "", fg: COLORS.text }),
              ]
            : []),
          Code({
            width: "100%",
            flexGrow: 1,
            content,
            filetype: "text",
            syntaxStyle,
            wrapMode: "none",
            drawUnstyledText: true,
            onChunks: (_chunks) => {
              const flattened = preview.lines.flatMap((line, index) => {
                const withNewline = index === preview.lines.length - 1 ? line.chunks : [...line.chunks, { __isChunk: true, text: "\n" } satisfies TextChunk]
                return withNewline
              })
              return flattened
            },
          }),
        ),
      )
    })
  }

  replaceChildren(
    root,
    renderFrame(state, listScroll, mainScroll, renderStatusPane(state)),
  )

  scrollListForCursor(state, listScroll)
  state.mainViewportHeight = Math.max(8, mainScroll.viewport.height || (state.layoutMode === "wide" ? 18 : 12))
  mainScroll.scrollTo({ x: 0, y: state.mainScrollTop })
}
