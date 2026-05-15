import type { KeyEvent } from "@opentui/core"

import { serializeCommandFile } from "./commands"
import { renderArchonMetadataModal, renderArchonNodeModal } from "./render"
import { applyCatalogValidation } from "./validate"
import { ARCHON_DEFAULT_WORKFLOW_INTERACTIVE, ARCHON_DEFAULT_WORKTREE_ENABLED, serializeWorkflowFile } from "./workflows"
import type { ArchonMetadataEditorState, ArchonMetadataFieldKey, ArchonMetadataModalState, ArchonRenderColors, ArchonState, ArchonWorkflow, ArchonWorkflowNode, ArchonWorkflowNodeKind } from "./types"
import { clearDirtyPaths, clearPendingDeletes, markPathDirty, markPendingDelete, selectedCommand, selectedWorkflow, selectedWorkflowNode } from "./state"

export type ArchonBufferTarget = {
  kind: "feature-buffer"
  featureId: "archon"
  targetId: "command-body"
  path: string
}

export type ArchonSavePlan = {
  writes: Array<{ path: string; contents: string }>
  deletes: string[]
}

const COMMAND_BODY_TEMPLATES = {
  basic: "# Command\n\n## Goal\n- Describe the task clearly.\n\n## Inputs\n- $ARGUMENTS\n\n## Output\n- Return the requested result.\n",
  investigation: "# Investigation Command\n\n## Goal\n- Investigate the reported behavior and identify the root cause.\n\n## Steps\n1. Reproduce the issue.\n2. Inspect the relevant implementation.\n3. Summarize likely causes and evidence.\n\n## Inputs\n- $ARGUMENTS\n",
  implementation: "# Implementation Command\n\n## Goal\n- Implement the requested change safely and minimally.\n\n## Steps\n1. Inspect the relevant code paths.\n2. Apply the smallest correct change.\n3. Run focused verification and summarize outcomes.\n\n## Inputs\n- $ARGUMENTS\n",
  review: "# Review Command\n\n## Goal\n- Review the changes for correctness, regressions, and missing coverage.\n\n## Focus\n- Bugs\n- Behavioral risks\n- Missing tests\n\n## Inputs\n- $ARGUMENTS\n",
  handoff: "# Handoff Command\n\n## Goal\n- Package the current state for the next engineer or agent.\n\n## Include\n- What changed\n- What remains open\n- Relevant files and commands\n- Risks or follow-up checks\n\n## Inputs\n- $ARGUMENTS\n",
} as const

type CommandBodyTemplateId = keyof typeof COMMAND_BODY_TEMPLATES

const COMMAND_BODY_TEMPLATE_IDS = Object.keys(COMMAND_BODY_TEMPLATES) as CommandBodyTemplateId[]

const KNOWN_PROVIDERS = ["", "openai", "anthropic", "google", "openrouter", "xai"]

const KNOWN_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ["gpt-5.4", "gpt-5", "gpt-5-mini", "gpt-4.1"],
  anthropic: ["claude-opus-4.1", "claude-sonnet-4", "claude-3.7-sonnet"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  openrouter: ["openai/gpt-5", "anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
  xai: ["grok-4", "grok-3"],
}

type MetadataValues = ReturnType<typeof createEmptyMetadataValues>

type MetadataEnumOption = {
  value: string
  label: string
  description?: string
}

type MetadataEnumField = "provider" | "model" | "interactive" | "worktreeEnabled" | "bodyTemplate"

type MetadataTextField = "fileName" | "name" | "description" | "argumentHint"

function sanitizeFileName(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase().replace(/[^a-z0-9._/-]+/g, "-").replace(/-+/g, "-").replace(/^[-/]+|[-/]+$/g, "")
  return trimmed || fallback
}

function relativePathFromAbsolute(state: Pick<ArchonState, "workspaceRoot">, path: string): string {
  return path.replace(`${state.workspaceRoot}/`, "")
}

function workflowPathFor(state: Pick<ArchonState, "workspaceRoot">, fileName: string): string {
  const safeName = sanitizeFileName(fileName, "workflow")
  return `${state.workspaceRoot}/.archon/workflows/${safeName.endsWith(".yaml") ? safeName : `${safeName}.yaml`}`
}

function commandPathFor(state: Pick<ArchonState, "workspaceRoot">, fileName: string): string {
  const safeName = sanitizeFileName(fileName, "command")
  return `${state.workspaceRoot}/.archon/commands/${safeName.endsWith(".md") ? safeName : `${safeName}.md`}`
}

function revalidateInMemoryCatalog(state: ArchonState): void {
  state.catalog = applyCatalogValidation({
    workflows: state.catalog.workflows.map((entry) => ({ ...entry, findings: [] })),
    commands: state.catalog.commands.map((entry) => ({ ...entry, findings: entry.findings.filter((finding) => finding.message.startsWith("Command body") || finding.message.startsWith("Unsupported frontmatter")) })),
  })
}

function renameWorkflowEntry(state: ArchonState, oldPath: string, newPath: string): void {
  const entry = state.catalog.workflows.find((item) => item.path === oldPath)
  if (!entry?.workflow || oldPath === newPath) return
  entry.path = newPath
  entry.relativePath = relativePathFromAbsolute(state, newPath)
  entry.workflow.path = newPath
  entry.workflow.relativePath = entry.relativePath
  state.selectedWorkflowPath = newPath
  clearDirtyPaths(state, [oldPath])
  markPathDirty(state, newPath)
  markPendingDelete(state, oldPath)
}

function renameCommandEntry(state: ArchonState, oldPath: string, newPath: string): void {
  const entry = state.catalog.commands.find((item) => item.path === oldPath)
  if (!entry?.command || oldPath === newPath) return
  entry.path = newPath
  entry.relativePath = relativePathFromAbsolute(state, newPath)
  entry.command.path = newPath
  entry.command.relativePath = entry.relativePath
  state.selectedCommandPath = newPath
  clearDirtyPaths(state, [oldPath])
  markPathDirty(state, newPath)
  markPendingDelete(state, oldPath)
}

function availableWorkflowDependencyIds(workflow: ArchonWorkflow, excludingId?: string): string[] {
  return workflow.nodes.map((node) => node.id).filter((id) => id !== excludingId)
}

function createEmptyMetadataValues() {
  return {
    fileName: "",
    name: "",
    description: "",
    provider: "",
    model: "",
    interactive: "default",
    tags: [],
    worktreeEnabled: "default",
    argumentHint: "",
    bodyTemplate: "basic",
  }
}

function defaultableBooleanEnumOptions(field: "interactive" | "worktreeEnabled"): MetadataEnumOption[] {
  const defaultValue = defaultBooleanValue(field)
  return defaultValue
    ? [{ value: "default", label: "true (default)" }, { value: "false", label: "false" }]
    : [{ value: "default", label: "false (default)" }, { value: "true", label: "true" }]
}

function availableWorkflowTags(state: Pick<ArchonState, "catalog">): string[] {
  return [...new Set(
    state.catalog.workflows.flatMap((entry) => entry.workflow?.tags ?? []),
  )].sort((left, right) => left.localeCompare(right))
}

function availableWorkflowTagsForModal(state: ArchonState): string[] {
  return normalizeTags([
    ...availableWorkflowTags(state),
    ...(state.metadataModal?.kind.includes("workflow") ? state.metadataModal.values.tags : []),
  ])
}

function fuzzyOptionScore(candidate: string, query: string): number {
  if (!query) return 1
  const normalizedCandidate = candidate.toLowerCase()
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 1
  if (normalizedCandidate.includes(normalizedQuery)) return 100 - normalizedCandidate.indexOf(normalizedQuery)
  let queryIndex = 0
  let score = 0
  for (let index = 0; index < normalizedCandidate.length && queryIndex < normalizedQuery.length; index += 1) {
    if (normalizedCandidate[index] === normalizedQuery[queryIndex]) {
      score += 2
      queryIndex += 1
    }
  }
  return queryIndex === normalizedQuery.length ? score : 0
}

function metadataFieldIsEnum(field: ArchonMetadataFieldKey): field is MetadataEnumField {
  return field === "provider" || field === "model" || field === "interactive" || field === "worktreeEnabled" || field === "bodyTemplate"
}

function metadataFieldIsText(field: ArchonMetadataFieldKey): field is MetadataTextField {
  return field === "fileName" || field === "name" || field === "description" || field === "argumentHint"
}

function metadataEnumOptions(state: Pick<ArchonState, "catalog" | "metadataModal">, field: MetadataEnumField): MetadataEnumOption[] {
  const modal = state.metadataModal
  const provider = modal?.values.provider.trim().toLowerCase() ?? ""
  if (field === "interactive") {
    return defaultableBooleanEnumOptions("interactive")
  }
  if (field === "worktreeEnabled") {
    return defaultableBooleanEnumOptions("worktreeEnabled")
  }
  if (field === "bodyTemplate") {
    return COMMAND_BODY_TEMPLATE_IDS.map((value) => ({ value, label: value, description: `${value} template` }))
  }
  if (field === "provider") {
    const discoveredProviders = state.catalog.workflows.flatMap((entry) => entry.workflow?.provider ? [entry.workflow.provider] : [])
    return normalizeTags([...KNOWN_PROVIDERS, ...discoveredProviders]).map((value) => ({ value, label: value || "none" }))
  }
  if (field === "model") {
    return compatibleModelValues(state).map((value) => ({ value, label: value || "none" }))
  }
  return []
}

function compatibleModelValues(state: Pick<ArchonState, "catalog" | "metadataModal">): string[] {
  const provider = state.metadataModal?.values.provider.trim().toLowerCase() ?? ""
  const discoveredModels = state.catalog.workflows.flatMap((entry) => {
    if (!entry.workflow?.model) return []
    if (!provider) return [entry.workflow.model]
    return (entry.workflow.provider ?? "").trim().toLowerCase() === provider ? [entry.workflow.model] : []
  })
  const providerModels = provider ? (KNOWN_MODELS_BY_PROVIDER[provider] ?? []) : Object.values(KNOWN_MODELS_BY_PROVIDER).flatMap((models) => models)
  return normalizeTags(["", ...providerModels, ...discoveredModels])
}

function resetIncompatibleDependentMetadataValues(state: ArchonState, field: ArchonMetadataFieldKey): void {
  const modal = state.metadataModal
  if (!modal || field !== "provider") return
  if (!compatibleModelValues(state).includes(modal.values.model)) modal.values.model = ""
}

function filteredMetadataEnumOptions(state: Pick<ArchonState, "catalog" | "metadataModal">, editor: Extract<ArchonMetadataEditorState, { kind: "enum" }>): MetadataEnumOption[] {
  const normalizedQuery = editor.query.trim().toLowerCase()
  const options = metadataEnumOptions(state, editor.field)
    .map((option) => ({ option, score: Math.max(fuzzyOptionScore(option.label, normalizedQuery), fuzzyOptionScore(option.description ?? "", normalizedQuery)) }))
    .filter(({ score }) => normalizedQuery.length === 0 || score > 0)
    .sort((left, right) => right.score - left.score || left.option.label.localeCompare(right.option.label))
    .map(({ option }) => option)
  return options.length > 0 ? options : metadataEnumOptions(state, editor.field)
}

function selectedMetadataEnumOption(state: Pick<ArchonState, "catalog" | "metadataModal">, editor: Extract<ArchonMetadataEditorState, { kind: "enum" }>): MetadataEnumOption | null {
  const options = filteredMetadataEnumOptions(state, editor)
  if (options.length === 0) return null
  const index = Math.max(0, Math.min(editor.selectedIndex, options.length - 1))
  return options[index] ?? null
}

function clampMetadataEditorSelection(state: ArchonState): void {
  const editor = state.metadataModal?.editor
  if (!editor) return
  if (editor.kind === "enum") {
    const maxIndex = Math.max(0, filteredMetadataEnumOptions(state, editor).length - 1)
    editor.selectedIndex = Math.max(0, Math.min(editor.selectedIndex, maxIndex))
    return
  }
  if (editor.kind === "tags") {
    const maxIndex = availableWorkflowTagsForModal(state).length
    editor.selectedIndex = Math.max(0, Math.min(editor.selectedIndex, maxIndex))
  }
}

function formatModalDefaultableBoolean(field: "interactive" | "worktreeEnabled", value: boolean, usesDefault: boolean): string {
  if (usesDefault || value === defaultBooleanValue(field)) return "default"
  return String(value)
}

function defaultBooleanValue(field: "interactive" | "worktreeEnabled"): boolean {
  return field === "interactive" ? ARCHON_DEFAULT_WORKFLOW_INTERACTIVE : ARCHON_DEFAULT_WORKTREE_ENABLED
}

function parseDefaultableBoolean(field: "interactive" | "worktreeEnabled", value: string): { value: boolean; usesDefault: boolean } {
  const normalized = value.trim().toLowerCase()
  const defaultValue = defaultBooleanValue(field)
  if (normalized === "" || normalized === "default") {
    return { value: defaultValue, usesDefault: true }
  }
  if (normalized === "true") {
    return { value: true, usesDefault: defaultValue === true }
  }
  if (normalized === "false") {
    return { value: false, usesDefault: defaultValue === false }
  }
  return { value: defaultValue, usesDefault: true }
}

function currentMetadataField(state: Pick<ArchonState, "metadataModal">): ArchonMetadataFieldKey | null {
  const modal = state.metadataModal
  if (!modal || modal.actionIndex !== null) return null
  return metadataFieldOrder(modal)[modal.fieldIndex] ?? null
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].sort((left, right) => left.localeCompare(right))
}

function toggleMetadataTag(state: ArchonState): boolean {
  const modal = state.metadataModal
  const editor = modal?.editor
  if (!modal || !editor || editor.kind !== "tags") return false
  const existingTags = availableWorkflowTagsForModal(state)
  if (editor.selectedIndex < existingTags.length) {
    const tag = existingTags[editor.selectedIndex]
    if (!tag) return false
    modal.values.tags = normalizeTags(
      modal.values.tags.includes(tag)
        ? modal.values.tags.filter((item) => item !== tag)
        : [...modal.values.tags, tag],
    )
    return true
  }
  const draft = editor.query.trim()
  if (!draft) return false
  modal.values.tags = normalizeTags([...modal.values.tags, draft])
  editor.query = ""
  return true
}

function cycleMetadataValue(state: ArchonState, delta: number): boolean {
  const modal = state.metadataModal
  if (!modal) return false
  const field = metadataFieldOrder(modal)[modal.fieldIndex]
  if (!field || !metadataFieldIsEnum(field)) return false
  const options = metadataEnumOptions(state, field)
  if (options.length === 0) return false
  const currentValue = modal.values[field]
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === currentValue))
  const nextIndex = (currentIndex + delta % options.length + options.length) % options.length
  modal.values[field] = options[nextIndex]?.value ?? options[0]?.value ?? ""
  resetIncompatibleDependentMetadataValues(state, field)
  return true
}

function commandBodyTemplate(templateId: string): string {
  return COMMAND_BODY_TEMPLATES[(COMMAND_BODY_TEMPLATE_IDS.includes(templateId as CommandBodyTemplateId) ? templateId : "basic") as CommandBodyTemplateId]
}

function metadataFieldOrder(state: ArchonMetadataModalState): ArchonMetadataFieldKey[] {
  if (state.kind === "create-workflow" || state.kind === "edit-workflow") {
    return ["name", "description", "provider", "model", "interactive", "tags", "worktreeEnabled"]
  }
  if (state.kind === "create-command") {
    return ["fileName", "name", "description", "argumentHint", "bodyTemplate"]
  }
  return ["fileName", "name", "description", "argumentHint"]
}

function metadataHasActions(modal: ArchonMetadataModalState): boolean {
  return modal.kind === "create-workflow" || modal.kind === "create-command"
}

function nodeFieldOrder(): Array<keyof NonNullable<ArchonState["nodeModal"]>["values"]> {
  return ["id", "kind", "body", "dependsOn", "when", "triggerRule", "context"]
}

function isNodeTextField(state: Pick<ArchonState, "nodeModal">, field: keyof NonNullable<ArchonState["nodeModal"]>["values"]): field is "id" | "body" | "when" {
  if (field === "body") return state.nodeModal?.values.kind !== "command"
  return field === "id" || field === "when"
}

function nodeFieldIsEnum(state: Pick<ArchonState, "nodeModal">, field: keyof NonNullable<ArchonState["nodeModal"]>["values"]): field is "kind" | "body" | "triggerRule" | "context" {
  if (field === "body") return state.nodeModal?.values.kind === "command"
  return field === "kind" || field === "triggerRule" || field === "context"
}

type NodeEnumField = Extract<keyof NonNullable<ArchonState["nodeModal"]>["values"], "kind" | "body" | "triggerRule" | "context">

const NODE_TRIGGER_RULE_OPTIONS = ["", "all_success", "one_success", "none_failed_min_one_success", "all_done"] as const
const NODE_CONTEXT_OPTIONS = ["", "fresh", "shared"] as const

function nodeFieldEnabled(state: ArchonState, field: keyof NonNullable<ArchonState["nodeModal"]>["values"]): boolean {
  const modal = state.nodeModal
  if (!modal) return false
  if (field === "when") return modal.values.dependsOn.length > 0
  if (field === "triggerRule") return modal.values.dependsOn.length > 1
  return true
}

function nodeEnumOptions(state: ArchonState, field: NodeEnumField): Array<{ value: string; label: string; description?: string }> {
  const currentValue = state.nodeModal?.values[field] ?? ""
  if (field === "kind") {
    return [
      { value: "command", label: "command", description: "Runs a named Archon command" },
      { value: "prompt", label: "prompt", description: "Runs an inline AI prompt" },
      { value: "bash", label: "bash", description: "Runs a shell script" },
    ]
  }
  if (field === "body") {
    const options = state.catalog.commands
      .filter((entry) => entry.command)
      .map((entry) => ({
        value: entry.command!.name,
        label: entry.command!.name,
        description: entry.command!.description || entry.relativePath,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
    return options.some((option) => option.value === currentValue) || currentValue === ""
      ? options
      : [{ value: currentValue, label: `${currentValue} (existing)`, description: "Preserved from the current workflow" }, ...options]
  }
  if (field === "triggerRule") {
    const options = [
      { value: "", label: "default", description: "Use the default all_success behavior" },
      { value: "all_success", label: "all_success", description: "All dependencies must succeed" },
      { value: "one_success", label: "one_success", description: "Any one dependency may succeed" },
      { value: "none_failed_min_one_success", label: "none_failed_min_one_success", description: "No dependency may fail, and one must succeed" },
      { value: "all_done", label: "all_done", description: "Run after all dependencies finish" },
    ]
    return options.some((option) => option.value === currentValue) || currentValue === ""
      ? options
      : [{ value: currentValue, label: `${currentValue} (existing)`, description: "Preserved from the current workflow" }, ...options]
  }
  const options = [
    { value: "", label: "default", description: "Use Archon's normal context inheritance" },
    { value: "fresh", label: "fresh", description: "Start a fresh agent session for this node" },
    { value: "shared", label: "shared", description: "Reuse context from the preceding execution path" },
  ]
  return options.some((option) => option.value === currentValue) || currentValue === ""
    ? options
    : [{ value: currentValue, label: `${currentValue} (existing)`, description: "Preserved from the current workflow" }, ...options]
}

function filteredNodeEnumOptions(state: ArchonState, editor: Extract<NonNullable<ArchonState["nodeModal"]>["editor"], { kind: "enum" }>): Array<{ value: string; label: string; description?: string }> {
  const normalizedQuery = editor.query.trim().toLowerCase()
  const options = nodeEnumOptions(state, editor.field)
    .map((option) => ({ option, score: Math.max(fuzzyOptionScore(option.label, normalizedQuery), fuzzyOptionScore(option.description ?? "", normalizedQuery)) }))
    .filter(({ score }) => normalizedQuery.length === 0 || score > 0)
    .sort((left, right) => right.score - left.score || left.option.label.localeCompare(right.option.label))
    .map(({ option }) => option)
  return options.length > 0 ? options : nodeEnumOptions(state, editor.field)
}

function normalizeDependentNodeValues(state: ArchonState): void {
  const modal = state.nodeModal
  if (!modal) return
  if (modal.values.dependsOn.length === 0) modal.values.when = ""
  if (modal.values.dependsOn.length <= 1) modal.values.triggerRule = ""
}

function nodeValidationErrors(state: ArchonState): string[] {
  const modal = state.nodeModal
  const workflow = selectedWorkflow(state)?.workflow
  if (!modal || !workflow) return []
  const errors: string[] = []
  const nextId = modal.values.id.trim()
  const nextBody = modal.values.body.trim()
  if (!nextId) errors.push("ID is required.")
  if (!nextBody) errors.push(`${modal.values.kind === "command" ? "Command" : modal.values.kind === "prompt" ? "Prompt" : "Bash script"} is required.`)
  const duplicate = workflow.nodes.find((node) => node.id === nextId)
  const editingCurrent = modal.kind === "edit-node" ? selectedWorkflowNode(state)?.id : null
  if (nextId && duplicate && duplicate.id !== editingCurrent) errors.push(`Node ID \"${nextId}\" already exists in this workflow.`)
  if (modal.values.when.trim() && modal.values.dependsOn.length === 0) errors.push("When requires at least one dependency.")
  if (modal.values.triggerRule.trim() && modal.values.dependsOn.length <= 1) errors.push("Trigger Rule requires at least two dependencies.")
  if (modal.values.kind === "command") {
    const availableCommands = new Set(nodeEnumOptions(state, "body").map((option) => option.value))
    if (nextBody && !availableCommands.has(nextBody)) errors.push(`Unknown command: ${nextBody}`)
  }
  if (modal.values.context && !NODE_CONTEXT_OPTIONS.includes(modal.values.context as (typeof NODE_CONTEXT_OPTIONS)[number])) errors.push(`Unknown context value: ${modal.values.context}`)
  if (modal.values.triggerRule && !NODE_TRIGGER_RULE_OPTIONS.includes(modal.values.triggerRule as (typeof NODE_TRIGGER_RULE_OPTIONS)[number])) errors.push(`Unknown trigger rule: ${modal.values.triggerRule}`)
  return errors
}

function canSaveNodeModal(state: ArchonState): boolean {
  return nodeValidationErrors(state).length === 0
}

function currentNodeField(state: Pick<ArchonState, "nodeModal">): keyof NonNullable<ArchonState["nodeModal"]>["values"] | null {
  const modal = state.nodeModal
  if (!modal || modal.actionIndex !== null) return null
  return nodeFieldOrder()[modal.fieldIndex] ?? null
}

function nodeKindOptions(): ArchonWorkflowNodeKind[] {
  return ["command", "prompt", "bash"]
}

function availableNodeDependencyIds(state: ArchonState): string[] {
  const modal = state.nodeModal
  const workflow = selectedWorkflow(state)?.workflow
  if (!modal || !workflow) return []
  return availableWorkflowDependencyIds(workflow, modal.kind === "edit-node" ? selectedWorkflowNode(state)?.id : undefined)
}

export function openCreateItemModal(state: ArchonState): void {
  state.metadataModal = state.submode === "workflows"
    ? { kind: "create-workflow", fieldIndex: 0, actionIndex: null, editor: null, values: createEmptyMetadataValues() }
    : { kind: "create-command", fieldIndex: 0, actionIndex: null, editor: null, values: createEmptyMetadataValues() }
}

export function openEditItemModal(state: ArchonState): void {
  if (state.submode === "workflows") {
    const selected = selectedWorkflow(state)
    if (!selected?.workflow) return
    state.metadataModal = {
      kind: "edit-workflow",
      fieldIndex: 0,
      actionIndex: null,
      editor: null,
      values: {
        ...createEmptyMetadataValues(),
        name: selected.workflow.name,
        description: selected.workflow.description,
        provider: selected.workflow.provider ?? "",
        model: selected.workflow.model ?? "",
        interactive: formatModalDefaultableBoolean("interactive", selected.workflow.interactive, selected.workflow.interactiveUsesDefault),
        tags: [...selected.workflow.tags],
        worktreeEnabled: formatModalDefaultableBoolean("worktreeEnabled", selected.workflow.worktreeEnabled, selected.workflow.worktreeEnabledUsesDefault),
      },
    }
    return
  }
  const selected = selectedCommand(state)
  if (!selected?.command) return
  state.metadataModal = {
    kind: "edit-command",
    fieldIndex: 1,
    actionIndex: null,
    editor: null,
    values: {
      ...createEmptyMetadataValues(),
      fileName: selected.relativePath.replace(/^\.archon\/commands\//, "").replace(/\.md$/, ""),
      name: selected.command.name,
      description: selected.command.description ?? "",
      argumentHint: selected.command.argumentHint ?? "",
    },
  }
}

function updateMetadataValue(state: ArchonState, field: Exclude<ArchonMetadataFieldKey, "tags">, value: string): boolean {
  const modal = state.metadataModal
  if (!modal) return false
  modal.values[field] = value as MetadataValues[typeof field]
  resetIncompatibleDependentMetadataValues(state, field)
  return true
}

export function openMetadataFieldEditor(state: ArchonState): boolean {
  const modal = state.metadataModal
  if (!modal) return false
  const field = metadataFieldOrder(modal)[modal.fieldIndex]
  if (!field) return false
  if (field === "tags") {
    modal.editor = { kind: "tags", query: "", selectedIndex: 0 }
    return true
  }
  if (metadataFieldIsEnum(field)) {
    const options = metadataEnumOptions(state, field)
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === modal.values[field]))
    modal.editor = { kind: "enum", field, query: "", selectedIndex }
    clampMetadataEditorSelection(state)
    return true
  }
  if (!metadataFieldIsText(field)) return false
  modal.editor = { kind: "text", field, draft: modal.values[field] }
  return true
}

function openMetadataFieldEditorWithInput(state: ArchonState, input: string): boolean {
  const modal = state.metadataModal
  if (!modal) return false
  const field = currentMetadataField(state)
  if (!field || !metadataFieldIsText(field)) return false
  modal.editor = { kind: "text", field, draft: input }
  return true
}

function closeMetadataFieldEditor(state: ArchonState): boolean {
  const modal = state.metadataModal
  if (!modal?.editor) return false
  modal.editor = null
  return true
}

function applyMetadataFieldEditor(state: ArchonState): boolean {
  const modal = state.metadataModal
  const editor = modal?.editor
  if (!modal || !editor) return false
  if (editor.kind === "text") {
    updateMetadataValue(state, editor.field, editor.draft)
    modal.editor = null
    return true
  }
  if (editor.kind === "enum") {
    const selected = selectedMetadataEnumOption(state, editor)
    if (!selected) return false
    updateMetadataValue(state, editor.field, selected.value)
    modal.editor = null
    return true
  }
  modal.editor = null
  return true
}

export function appendMetadataInput(state: ArchonState, input: string): boolean {
  const modal = state.metadataModal
  const editor = modal?.editor
  if (!modal || !editor) return false
  if (editor.kind === "text") {
    editor.draft = input === "backspace" ? editor.draft.slice(0, -1) : `${editor.draft}${input}`
    return true
  }
  if (editor.kind === "tags") {
    if (input === "backspace") {
      editor.query = editor.query.slice(0, -1)
      return true
    }
    editor.query += input
    return true
  }
  editor.query = input === "backspace" ? editor.query.slice(0, -1) : `${editor.query}${input}`
  editor.selectedIndex = 0
  clampMetadataEditorSelection(state)
  return true
}

export function moveMetadataField(state: ArchonState, delta: number): void {
  const modal = state.metadataModal
  if (!modal) return
  modal.actionIndex = null
  const count = metadataFieldOrder(modal).length
  modal.fieldIndex = (modal.fieldIndex + delta + count) % count
}

function moveMetadataSelection(state: ArchonState, delta: number): void {
  const modal = state.metadataModal
  if (!modal) return
  const fieldCount = metadataFieldOrder(modal).length
  if (!metadataHasActions(modal)) {
    modal.actionIndex = null
    modal.fieldIndex = (modal.fieldIndex + delta + fieldCount) % fieldCount
    return
  }
  const totalCount = fieldCount + 1
  const currentIndex = modal.actionIndex === null ? modal.fieldIndex : fieldCount
  const nextIndex = (currentIndex + delta + totalCount) % totalCount
  if (nextIndex === fieldCount) {
    modal.actionIndex = delta > 0 ? 0 : 1
    return
  }
  modal.fieldIndex = nextIndex
  modal.actionIndex = null
}

function moveMetadataAction(state: ArchonState, delta: number): boolean {
  const modal = state.metadataModal
  if (!modal || modal.actionIndex === null) return false
  modal.actionIndex = (((modal.actionIndex + delta) % 2) + 2) % 2 as 0 | 1
  return true
}

function applyMetadataAction(state: ArchonState): boolean {
  const modal = state.metadataModal
  if (!modal || modal.actionIndex === null) return false
  if (modal.actionIndex === 0) {
    applyMetadataModal(state)
    return true
  }
  state.metadataModal = null
  return true
}

function moveMetadataEditorSelection(state: ArchonState, delta: number): boolean {
  const editor = state.metadataModal?.editor
  if (!editor) return false
  if (editor.kind === "enum") {
    const options = filteredMetadataEnumOptions(state, editor)
    if (options.length === 0) return false
    editor.selectedIndex = (editor.selectedIndex + delta % options.length + options.length) % options.length
    return true
  }
  if (editor.kind === "tags") {
    const count = availableWorkflowTagsForModal(state).length + 1
    if (count <= 0) return false
    editor.selectedIndex = (editor.selectedIndex + delta % count + count) % count
    return true
  }
  return false
}

export function applyMetadataModal(state: ArchonState): void {
  const modal = state.metadataModal
  if (!modal) return
  if (modal.kind === "create-workflow") {
    const interactive = parseDefaultableBoolean("interactive", modal.values.interactive)
    const worktreeEnabled = parseDefaultableBoolean("worktreeEnabled", modal.values.worktreeEnabled)
    const path = workflowPathFor(state, modal.values.name)
    const workflow = {
      path,
      relativePath: relativePathFromAbsolute(state, path),
      name: modal.values.name || "New workflow",
      description: modal.values.description,
      provider: modal.values.provider.trim() || null,
      model: modal.values.model.trim() || null,
      interactive: interactive.value,
      interactiveUsesDefault: interactive.usesDefault,
      tags: normalizeTags(modal.values.tags),
      worktreeEnabled: worktreeEnabled.value,
      worktreeEnabledUsesDefault: worktreeEnabled.usesDefault,
      nodes: [],
    }
    state.catalog.workflows = [...state.catalog.workflows, { path, relativePath: workflow.relativePath, workflow, findings: [], readOnlyReason: null, parseError: null, referencedCommandNames: [] }].sort((l, r) => l.relativePath.localeCompare(r.relativePath))
    state.selectedWorkflowPath = path
    state.selectedWorkflowNodeId = null
    markPathDirty(state, path)
  } else if (modal.kind === "edit-workflow") {
    const selected = selectedWorkflow(state)
    if (selected?.workflow) {
      const interactive = parseDefaultableBoolean("interactive", modal.values.interactive)
      const worktreeEnabled = parseDefaultableBoolean("worktreeEnabled", modal.values.worktreeEnabled)
      selected.workflow.name = modal.values.name || selected.workflow.name
      selected.workflow.description = modal.values.description
      selected.workflow.provider = modal.values.provider.trim() || null
      selected.workflow.model = modal.values.model.trim() || null
      selected.workflow.interactive = interactive.value
      selected.workflow.interactiveUsesDefault = interactive.usesDefault
      selected.workflow.tags = normalizeTags(modal.values.tags)
      selected.workflow.worktreeEnabled = worktreeEnabled.value
      selected.workflow.worktreeEnabledUsesDefault = worktreeEnabled.usesDefault
      markPathDirty(state, selected.path)
    }
  } else if (modal.kind === "create-command") {
    const path = commandPathFor(state, modal.values.fileName || modal.values.name)
    const command = {
      path,
      relativePath: relativePathFromAbsolute(state, path),
      name: modal.values.name || sanitizeFileName(modal.values.fileName, "command"),
      description: modal.values.description || null,
      argumentHint: modal.values.argumentHint || null,
      body: commandBodyTemplate(modal.values.bodyTemplate),
    }
    state.catalog.commands = [...state.catalog.commands, { path, relativePath: command.relativePath, command, findings: [], parseError: null, referencedByWorkflowPaths: [] }].sort((l, r) => l.relativePath.localeCompare(r.relativePath))
    state.selectedCommandPath = path
    markPathDirty(state, path)
  } else {
    const selected = selectedCommand(state)
    if (selected?.command) {
      const nextPath = commandPathFor(state, modal.values.fileName || modal.values.name || selected.command.name)
      renameCommandEntry(state, selected.path, nextPath)
      selected.command.name = modal.values.name || selected.command.name
      selected.command.description = modal.values.description || null
      selected.command.argumentHint = modal.values.argumentHint || null
      markPathDirty(state, nextPath)
    }
  }
  state.metadataModal = null
  revalidateInMemoryCatalog(state)
}

export function openCreateNodeModal(state: ArchonState): void {
  const workflow = selectedWorkflow(state)?.workflow
  if (!workflow) return
  state.nodeModal = { kind: "create-node", fieldIndex: 0, actionIndex: null, editor: null, values: { id: "", kind: "command", body: "", when: "", triggerRule: "", context: "", dependsOn: [] } }
}

export function openEditNodeModal(state: ArchonState): void {
  const node = selectedWorkflowNode(state)
  if (!node) return
  state.nodeModal = { kind: "edit-node", fieldIndex: 0, actionIndex: null, editor: null, values: { id: node.id, kind: node.kind, body: node.body, when: node.when ?? "", triggerRule: node.triggerRule ?? "", context: node.context ?? "", dependsOn: [...node.dependsOn] } }
}

export function moveNodeField(state: ArchonState, delta: number): void {
  const modal = state.nodeModal
  if (!modal) return
  modal.actionIndex = null
  const count = nodeFieldOrder().length
  modal.fieldIndex = (modal.fieldIndex + delta + count) % count
}

function moveNodeSelection(state: ArchonState, delta: number): void {
  const modal = state.nodeModal
  if (!modal) return
  const fieldCount = nodeFieldOrder().length
  const totalCount = fieldCount + 1
  const currentIndex = modal.actionIndex === null ? modal.fieldIndex : fieldCount
  const nextIndex = (currentIndex + delta + totalCount) % totalCount
  if (nextIndex === fieldCount) {
    modal.actionIndex = delta > 0 ? 0 : 1
    return
  }
  modal.fieldIndex = nextIndex
  modal.actionIndex = null
}

function moveNodeAction(state: ArchonState, delta: number): boolean {
  const modal = state.nodeModal
  if (!modal || modal.actionIndex === null) return false
  modal.actionIndex = (((modal.actionIndex + delta) % 2) + 2) % 2 as 0 | 1
  return true
}

function applyNodeAction(state: ArchonState): boolean {
  const modal = state.nodeModal
  if (!modal || modal.actionIndex === null) return false
  if (modal.actionIndex === 0) {
    applyNodeModal(state)
    return true
  }
  state.nodeModal = null
  return true
}

function closeNodeFieldEditor(state: ArchonState): boolean {
  const modal = state.nodeModal
  if (!modal?.editor) return false
  modal.editor = null
  return true
}

function openNodeFieldEditor(state: ArchonState): boolean {
  const modal = state.nodeModal
  if (!modal) return false
  const field = nodeFieldOrder()[modal.fieldIndex]
  if (!field) return false
  if (!nodeFieldEnabled(state, field)) return false
  if (field === "dependsOn") {
    modal.editor = { kind: "dependsOn", selectedIndex: 0 }
    clampNodeEditorSelection(state)
    return true
  }
  if (nodeFieldIsEnum(state, field)) {
    const options = nodeEnumOptions(state, field)
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === modal.values[field]))
    modal.editor = { kind: "enum", field, query: "", selectedIndex }
    clampNodeEditorSelection(state)
    return true
  }
  if (!isNodeTextField(state, field)) return false
  modal.editor = { kind: "text", field, draft: modal.values[field] }
  return true
}

function openNodeFieldEditorWithInput(state: ArchonState, input: string): boolean {
  const modal = state.nodeModal
  if (!modal) return false
  const field = currentNodeField(state)
  if (!field || !nodeFieldEnabled(state, field)) return false
  if (nodeFieldIsEnum(state, field)) {
    const options = nodeEnumOptions(state, field)
    const currentValue = modal.values[field]
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === currentValue))
    modal.editor = { kind: "enum", field, query: input, selectedIndex }
    clampNodeEditorSelection(state)
    return true
  }
  if (!isNodeTextField(state, field)) return false
  modal.editor = { kind: "text", field, draft: input }
  return true
}

function applyNodeFieldEditor(state: ArchonState): boolean {
  const modal = state.nodeModal
  const editor = modal?.editor
  if (!modal || !editor) return false
  if (editor.kind === "text") {
    modal.values[editor.field] = editor.draft
    modal.editor = null
    return true
  }
  if (editor.kind === "enum") {
    const selected = filteredNodeEnumOptions(state, editor)[editor.selectedIndex]
    if (!selected) return false
    modal.values[editor.field] = selected.value as never
    modal.editor = null
    return true
  }
  modal.editor = null
  return true
}

function clampNodeEditorSelection(state: ArchonState): void {
  const editor = state.nodeModal?.editor
  if (!editor) return
  if (editor.kind === "enum") {
    editor.selectedIndex = Math.max(0, Math.min(editor.selectedIndex, filteredNodeEnumOptions(state, editor).length - 1))
    return
  }
  if (editor.kind === "dependsOn") {
    const maxIndex = Math.max(0, availableNodeDependencyIds(state).length - 1)
    editor.selectedIndex = Math.max(0, Math.min(editor.selectedIndex, maxIndex))
  }
}

function moveNodeEditorSelection(state: ArchonState, delta: number): boolean {
  const editor = state.nodeModal?.editor
  if (!editor) return false
  if (editor.kind === "enum") {
    const options = filteredNodeEnumOptions(state, editor)
    if (options.length === 0) return false
    editor.selectedIndex = (editor.selectedIndex + delta % options.length + options.length) % options.length
    return true
  }
  if (editor.kind === "dependsOn") {
    const ids = availableNodeDependencyIds(state)
    if (ids.length === 0) return false
    editor.selectedIndex = (editor.selectedIndex + delta % ids.length + ids.length) % ids.length
    return true
  }
  return false
}

function cycleNodeValue(state: ArchonState, delta: number): boolean {
  const modal = state.nodeModal
  if (!modal) return false
  const field = nodeFieldOrder()[modal.fieldIndex]
  if (!field || !nodeFieldIsEnum(state, field) || !nodeFieldEnabled(state, field)) return false
  const options = nodeEnumOptions(state, field)
  if (options.length === 0) return false
  const currentIndex = Math.max(0, options.findIndex((option) => option.value === modal.values[field]))
  modal.values[field] = (options[(currentIndex + delta % options.length + options.length) % options.length]?.value ?? options[0]?.value ?? "") as never
  return true
}

export function moveNodeDependencyCursor(state: ArchonState, delta: number): void {
  const modal = state.nodeModal
  const ids = availableNodeDependencyIds(state)
  if (!modal) return
  if (ids.length === 0) {
    if (modal.editor?.kind === "dependsOn") modal.editor.selectedIndex = 0
    return
  }
  if (modal.editor?.kind === "dependsOn") {
    modal.editor.selectedIndex = (modal.editor.selectedIndex + delta % ids.length + ids.length) % ids.length
  }
}

export function appendNodeInput(state: ArchonState, input: string): boolean {
  const modal = state.nodeModal
  const editor = modal?.editor
  if (!modal || !editor) return false
  if (editor.kind === "enum") {
    editor.query = input === "backspace" ? editor.query.slice(0, -1) : `${editor.query}${input}`
    editor.selectedIndex = 0
    clampNodeEditorSelection(state)
    return true
  }
  if (editor.kind !== "text") return false
  const current = editor.draft
  if (input === "backspace") {
    editor.draft = current.slice(0, -1)
    return true
  }
  editor.draft = `${current}${input}`
  return true
}

export function toggleNodeDependency(state: ArchonState): boolean {
  const modal = state.nodeModal
  const dependencyIds = availableNodeDependencyIds(state)
  if (!modal || modal.editor?.kind !== "dependsOn") return false
  const dependencyId = dependencyIds[modal.editor.selectedIndex]
  if (!dependencyId) return false
  modal.values.dependsOn = modal.values.dependsOn.includes(dependencyId)
    ? modal.values.dependsOn.filter((id) => id !== dependencyId)
    : [...modal.values.dependsOn, dependencyId].sort((l, r) => l.localeCompare(r))
  normalizeDependentNodeValues(state)
  return true
}

export function applyNodeModal(state: ArchonState): void {
  const modal = state.nodeModal
  const selected = selectedWorkflow(state)
  const workflow = selected?.workflow
  if (!modal || !workflow || !selected) return
  if (!canSaveNodeModal(state)) return
  const nextNode: ArchonWorkflowNode = {
    id: modal.values.id.trim(),
    kind: modal.values.kind,
    body: modal.values.body.trim(),
    dependsOn: [...modal.values.dependsOn],
    when: modal.values.when.trim() || null,
    triggerRule: modal.values.triggerRule.trim() || null,
    context: modal.values.context.trim() || null,
  }
  if (modal.kind === "create-node") {
    workflow.nodes.push(nextNode)
  } else {
    const existing = selectedWorkflowNode(state)
    if (!existing) return
    const index = workflow.nodes.findIndex((node) => node.id === existing.id)
    if (index >= 0) workflow.nodes[index] = nextNode
    for (const node of workflow.nodes) {
      node.dependsOn = node.dependsOn.map((dependency) => dependency === existing.id ? nextNode.id : dependency)
    }
  }
  state.selectedWorkflowNodeId = nextNode.id
  state.nodeModal = null
  markPathDirty(state, selected.path)
  revalidateInMemoryCatalog(state)
}

export function deleteWorkflowNodeById(state: ArchonState, workflowPath: string, nodeId: string): boolean {
  const workflowEntry = state.catalog.workflows.find((entry) => entry.path === workflowPath)
  const workflow = workflowEntry?.workflow
  if (!workflowEntry || !workflow) return false
  const index = workflow.nodes.findIndex((node) => node.id === nodeId)
  if (index === -1) return false
  workflow.nodes.splice(index, 1)
  for (const node of workflow.nodes) node.dependsOn = node.dependsOn.filter((dependency) => dependency !== nodeId)
  state.selectedWorkflowPath = workflowPath
  state.selectedWorkflowNodeId = workflow.nodes[Math.min(index, workflow.nodes.length - 1)]?.id ?? null
  markPathDirty(state, workflowPath)
  revalidateInMemoryCatalog(state)
  return true
}

export function moveSelectedWorkflowNode(state: ArchonState, delta: number): boolean {
  const selected = selectedWorkflow(state)
  const workflow = selected?.workflow
  const nodeId = state.selectedWorkflowNodeId
  if (!selected || !workflow || !nodeId) return false
  const index = workflow.nodes.findIndex((node) => node.id === nodeId)
  if (index === -1) return false
  const nextIndex = Math.max(0, Math.min(workflow.nodes.length - 1, index + delta))
  if (nextIndex === index) return false
  const [node] = workflow.nodes.splice(index, 1)
  workflow.nodes.splice(nextIndex, 0, node)
  markPathDirty(state, selected.path)
  revalidateInMemoryCatalog(state)
  return true
}

export function openCommandBodyEditor(state: ArchonState): { target: ArchonBufferTarget; initialText: string } | null {
  const selected = selectedCommand(state)
  if (!selected?.command) return null
  return {
    target: { kind: "feature-buffer", featureId: "archon", targetId: "command-body", path: selected.path },
    initialText: selected.command.body,
  }
}

export function applyFeatureBufferText(state: ArchonState, target: { targetId?: string; path?: string }, text: string): boolean {
  if (target.targetId !== "command-body" || !target.path) return false
  const entry = state.catalog.commands.find((item) => item.path === target.path)
  if (!entry?.command) return false
  entry.command.body = text
  markPathDirty(state, entry.path)
  return true
}

export function buildSavePlan(state: ArchonState): ArchonSavePlan {
  const writes = state.dirtyPaths.flatMap((path) => {
    const workflowEntry = state.catalog.workflows.find((entry) => entry.path === path)
    if (workflowEntry?.workflow) return [{ path, contents: serializeWorkflowFile(workflowEntry.workflow) }]
    const commandEntry = state.catalog.commands.find((entry) => entry.path === path)
    if (commandEntry?.command) return [{ path, contents: serializeCommandFile(commandEntry.command) }]
    return []
  })
  const deletes = state.pendingDeletePaths.filter((path) => !state.dirtyPaths.includes(path))
  return { writes, deletes }
}

export function renderFeatureOverlays(state: ArchonState, layoutMode: "wide" | "narrow", colors: ArchonRenderColors) {
  const metadataEnumOptionsForRender = state.metadataModal?.editor?.kind === "enum"
    ? filteredMetadataEnumOptions(state, state.metadataModal.editor).map((option) => ({ label: option.label, description: option.description }))
    : []
  return [
    ...(state.metadataModal ? renderArchonMetadataModal(layoutMode, state.metadataModal, colors, availableWorkflowTagsForModal(state), metadataEnumOptionsForRender) : []),
    ...(state.nodeModal ? renderArchonNodeModal(layoutMode, state.nodeModal, colors, state) : []),
  ]
}

export function handleModalKey(state: ArchonState, key: KeyEvent): boolean {
  if (state.metadataModal) {
    const editor = state.metadataModal.editor
    if (editor) {
      if (key.name === "escape") return closeMetadataFieldEditor(state)
      if (key.name === "return") return applyMetadataFieldEditor(state)
      if ((editor.kind === "enum" || editor.kind === "tags") && (key.name === "down" || key.name === "j" || (key.ctrl && key.name === "n"))) {
        moveMetadataEditorSelection(state, 1)
        return true
      }
      if ((editor.kind === "enum" || editor.kind === "tags") && (key.name === "up" || key.name === "k" || (key.ctrl && key.name === "p"))) {
        moveMetadataEditorSelection(state, -1)
        return true
      }
      if (editor.kind === "tags" && key.name === "space") return toggleMetadataTag(state)
      if (key.name === "backspace") return appendMetadataInput(state, "backspace")
      if (key.name === "space") return appendMetadataInput(state, " ")
      if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) return appendMetadataInput(state, key.sequence)
      return true
    }
    if (key.name === "escape") {
      state.metadataModal = null
      return true
    }
    if (key.ctrl && key.name === "return") {
      applyMetadataModal(state)
      return true
    }
    if (key.name === "tab") {
      moveMetadataField(state, key.shift ? -1 : 1)
      return true
    }
    if (key.name === "j" || key.name === "down") {
      moveMetadataSelection(state, 1)
      return true
    }
    if (key.name === "k" || key.name === "up") {
      moveMetadataSelection(state, -1)
      return true
    }
    if (state.metadataModal.actionIndex !== null && (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right")) {
      moveMetadataAction(state, key.name === "l" || key.name === "right" ? 1 : -1)
      return true
    }
    if (state.metadataModal.actionIndex !== null && key.name === "return") return applyMetadataAction(state)
    if (key.name === "return") return openMetadataFieldEditor(state)
    if (currentMetadataField(state) && (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right")) {
      cycleMetadataValue(state, key.name === "l" || key.name === "right" ? 1 : -1)
      return true
    }
    if (key.ctrl && (key.name === "j" || key.name === "k")) {
      cycleMetadataValue(state, key.name === "j" ? 1 : -1)
      return true
    }
    if (typeof key.sequence === "string" && /^[a-z0-9]$/i.test(key.sequence) && !key.ctrl && !key.meta) {
      return openMetadataFieldEditorWithInput(state, key.sequence)
    }
    return true
  }
  if (state.nodeModal) {
    const editor = state.nodeModal.editor
    if (editor) {
      if (key.name === "escape") return closeNodeFieldEditor(state)
      if (key.name === "return") return applyNodeFieldEditor(state)
      if ((editor.kind === "enum" || editor.kind === "dependsOn") && (key.name === "down" || key.name === "j" || (key.ctrl && key.name === "n"))) {
        return moveNodeEditorSelection(state, 1)
      }
      if ((editor.kind === "enum" || editor.kind === "dependsOn") && (key.name === "up" || key.name === "k" || (key.ctrl && key.name === "p"))) {
        return moveNodeEditorSelection(state, -1)
      }
      if (editor.kind === "dependsOn" && key.name === "space") return toggleNodeDependency(state)
      if (key.name === "backspace") return appendNodeInput(state, "backspace")
      if (key.name === "space") return appendNodeInput(state, " ")
      if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) return appendNodeInput(state, key.sequence)
      return true
    }
    if (key.name === "escape") {
      state.nodeModal = null
      return true
    }
    if (key.ctrl && key.name === "return") {
      applyNodeModal(state)
      return true
    }
    if (key.name === "tab") {
      moveNodeField(state, key.shift ? -1 : 1)
      return true
    }
    if (key.name === "j" || key.name === "down") {
      moveNodeSelection(state, 1)
      return true
    }
    if (key.name === "k" || key.name === "up") {
      moveNodeSelection(state, -1)
      return true
    }
    if (state.nodeModal.actionIndex !== null && (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right")) {
      moveNodeAction(state, key.name === "l" || key.name === "right" ? 1 : -1)
      return true
    }
    if (state.nodeModal.actionIndex !== null && key.name === "return") return applyNodeAction(state)
    if (key.name === "return") {
      return openNodeFieldEditor(state)
    }
    if (currentNodeField(state) && (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right")) {
      return cycleNodeValue(state, key.name === "l" || key.name === "right" ? 1 : -1)
    }
    if (key.ctrl && (key.name === "j" || key.name === "k")) {
      return cycleNodeValue(state, key.name === "j" ? 1 : -1)
    }
    if (typeof key.sequence === "string" && /^[a-z0-9]$/i.test(key.sequence) && !key.ctrl && !key.meta) {
      return openNodeFieldEditorWithInput(state, key.sequence)
    }
    if (key.name === "space") {
      return true
    }
    return true
  }
  return false
}
