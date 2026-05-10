import type { KeyEvent } from "@opentui/core"

import { serializeCommandFile } from "./commands"
import { renderArchonMetadataModal, renderArchonNodeModal } from "./render"
import { applyCatalogValidation } from "./validate"
import { serializeWorkflowFile } from "./workflows"
import type { ArchonRenderColors, ArchonState, ArchonWorkflow, ArchonWorkflowNode } from "./types"
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

function metadataFieldOrder(state: NonNullable<ArchonState["metadataModal"]>): Array<keyof NonNullable<ArchonState["metadataModal"]>["values"]> {
  return state.kind.includes("workflow") ? ["fileName", "name", "description"] : ["fileName", "name", "description", "argumentHint"]
}

function nodeFieldOrder(): Array<keyof NonNullable<ArchonState["nodeModal"]>["values"]> {
  return ["id", "kind", "body", "dependsOn", "when", "triggerRule", "context"]
}

function isNodeTextField(field: keyof NonNullable<ArchonState["nodeModal"]>["values"]): field is "id" | "body" | "when" | "triggerRule" | "context" {
  return field === "id" || field === "body" || field === "when" || field === "triggerRule" || field === "context"
}

export function openCreateItemModal(state: ArchonState): void {
  state.metadataModal = state.submode === "workflows"
    ? { kind: "create-workflow", fieldIndex: 0, values: { fileName: "", name: "", description: "", argumentHint: "" } }
    : { kind: "create-command", fieldIndex: 0, values: { fileName: "", name: "", description: "", argumentHint: "" } }
}

export function openEditItemModal(state: ArchonState): void {
  if (state.submode === "workflows") {
    const selected = selectedWorkflow(state)
    if (!selected?.workflow) return
    state.metadataModal = {
      kind: "edit-workflow",
      fieldIndex: 1,
      values: {
        fileName: selected.relativePath.replace(/^\.archon\/workflows\//, "").replace(/\.yaml$/, ""),
        name: selected.workflow.name,
        description: selected.workflow.description,
        argumentHint: "",
      },
    }
    return
  }
  const selected = selectedCommand(state)
  if (!selected?.command) return
  state.metadataModal = {
    kind: "edit-command",
    fieldIndex: 1,
    values: {
      fileName: selected.relativePath.replace(/^\.archon\/commands\//, "").replace(/\.md$/, ""),
      name: selected.command.name,
      description: selected.command.description ?? "",
      argumentHint: selected.command.argumentHint ?? "",
    },
  }
}

export function appendMetadataInput(state: ArchonState, input: string): boolean {
  const modal = state.metadataModal
  if (!modal) return false
  const field = metadataFieldOrder(modal)[modal.fieldIndex]
  if (!field) return false
  if (input === "backspace") {
    modal.values[field] = modal.values[field].slice(0, -1)
    return true
  }
  modal.values[field] += input
  return true
}

export function moveMetadataField(state: ArchonState, delta: number): void {
  const modal = state.metadataModal
  if (!modal) return
  const count = metadataFieldOrder(modal).length
  modal.fieldIndex = (modal.fieldIndex + delta + count) % count
}

export function applyMetadataModal(state: ArchonState): void {
  const modal = state.metadataModal
  if (!modal) return
  if (modal.kind === "create-workflow") {
    const path = workflowPathFor(state, modal.values.fileName || modal.values.name)
    const workflow = {
      path,
      relativePath: relativePathFromAbsolute(state, path),
      name: modal.values.name || "New workflow",
      description: modal.values.description,
      provider: null,
      model: null,
      interactive: null,
      tags: [],
      worktreeEnabled: null,
      nodes: [],
    }
    state.catalog.workflows = [...state.catalog.workflows, { path, relativePath: workflow.relativePath, workflow, findings: [], readOnlyReason: null, parseError: null, referencedCommandNames: [] }].sort((l, r) => l.relativePath.localeCompare(r.relativePath))
    state.selectedWorkflowPath = path
    state.selectedWorkflowNodeId = null
    markPathDirty(state, path)
  } else if (modal.kind === "edit-workflow") {
    const selected = selectedWorkflow(state)
    if (selected?.workflow) {
      const nextPath = workflowPathFor(state, modal.values.fileName || modal.values.name || selected.workflow.name)
      renameWorkflowEntry(state, selected.path, nextPath)
      selected.workflow.name = modal.values.name || selected.workflow.name
      selected.workflow.description = modal.values.description
      markPathDirty(state, nextPath)
    }
  } else if (modal.kind === "create-command") {
    const path = commandPathFor(state, modal.values.fileName || modal.values.name)
    const command = {
      path,
      relativePath: relativePathFromAbsolute(state, path),
      name: modal.values.name || sanitizeFileName(modal.values.fileName, "command"),
      description: modal.values.description || null,
      argumentHint: modal.values.argumentHint || null,
      body: "# Command\n",
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
  state.nodeModal = { kind: "create-node", fieldIndex: 0, dependencyCursor: 0, values: { id: "", kind: "command", body: "", when: "", triggerRule: "", context: "", dependsOn: [] } }
}

export function openEditNodeModal(state: ArchonState): void {
  const node = selectedWorkflowNode(state)
  if (!node) return
  state.nodeModal = { kind: "edit-node", fieldIndex: 0, dependencyCursor: 0, values: { id: node.id, kind: node.kind, body: node.body, when: node.when ?? "", triggerRule: node.triggerRule ?? "", context: node.context ?? "", dependsOn: [...node.dependsOn] } }
}

export function moveNodeField(state: ArchonState, delta: number): void {
  const modal = state.nodeModal
  if (!modal) return
  const count = nodeFieldOrder().length
  modal.fieldIndex = (modal.fieldIndex + delta + count) % count
}

export function moveNodeDependencyCursor(state: ArchonState, delta: number): void {
  const modal = state.nodeModal
  const workflow = selectedWorkflow(state)?.workflow
  if (!modal || !workflow) return
  const ids = availableWorkflowDependencyIds(workflow, modal.kind === "edit-node" ? selectedWorkflowNode(state)?.id : undefined)
  if (ids.length === 0) {
    modal.dependencyCursor = 0
    return
  }
  modal.dependencyCursor = (modal.dependencyCursor + delta % ids.length + ids.length) % ids.length
}

export function appendNodeInput(state: ArchonState, input: string): boolean {
  const modal = state.nodeModal
  if (!modal) return false
  const field = nodeFieldOrder()[modal.fieldIndex]
  if (!field || field === "dependsOn") return false
  if (field === "kind") {
    if (input === "cycle") {
      modal.values.kind = modal.values.kind === "command" ? "prompt" : modal.values.kind === "prompt" ? "bash" : "command"
      return true
    }
    return false
  }
  if (!isNodeTextField(field)) return false
  const current = modal.values[field]
  if (input === "backspace") {
    modal.values[field] = current.slice(0, -1)
    return true
  }
  modal.values[field] = `${current}${input}`
  return true
}

export function toggleNodeDependency(state: ArchonState): boolean {
  const modal = state.nodeModal
  const workflow = selectedWorkflow(state)?.workflow
  if (!modal || !workflow) return false
  const dependencyIds = availableWorkflowDependencyIds(workflow, modal.kind === "edit-node" ? selectedWorkflowNode(state)?.id : undefined)
  const dependencyId = dependencyIds[modal.dependencyCursor]
  if (!dependencyId) return false
  modal.values.dependsOn = modal.values.dependsOn.includes(dependencyId)
    ? modal.values.dependsOn.filter((id) => id !== dependencyId)
    : [...modal.values.dependsOn, dependencyId].sort((l, r) => l.localeCompare(r))
  return true
}

export function applyNodeModal(state: ArchonState): void {
  const modal = state.nodeModal
  const selected = selectedWorkflow(state)
  const workflow = selected?.workflow
  if (!modal || !workflow || !selected) return
  const nextNode: ArchonWorkflowNode = {
    id: modal.values.id.trim() || `node-${workflow.nodes.length + 1}`,
    kind: modal.values.kind,
    body: modal.values.body,
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
  return [
    ...(state.metadataModal ? renderArchonMetadataModal(layoutMode, state.metadataModal, colors) : []),
    ...(state.nodeModal ? renderArchonNodeModal(layoutMode, state.nodeModal, colors, state) : []),
  ]
}

export function handleModalKey(state: ArchonState, key: KeyEvent): boolean {
  if (state.metadataModal) {
    if (key.name === "escape") {
      state.metadataModal = null
      return true
    }
    if (key.name === "tab") {
      moveMetadataField(state, key.shift ? -1 : 1)
      return true
    }
    if (key.name === "return") {
      applyMetadataModal(state)
      return true
    }
    if (key.name === "backspace") return appendMetadataInput(state, "backspace")
    if (key.name === "space") return appendMetadataInput(state, " ")
    if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) return appendMetadataInput(state, key.sequence)
    return true
  }
  if (state.nodeModal) {
    if (key.name === "escape") {
      state.nodeModal = null
      return true
    }
    if (key.name === "tab") {
      moveNodeField(state, key.shift ? -1 : 1)
      return true
    }
    if (key.name === "return") {
      applyNodeModal(state)
      return true
    }
    if (state.nodeModal.fieldIndex === 3 && (key.name === "j" || key.name === "down")) {
      moveNodeDependencyCursor(state, 1)
      return true
    }
    if (state.nodeModal.fieldIndex === 3 && (key.name === "k" || key.name === "up")) {
      moveNodeDependencyCursor(state, -1)
      return true
    }
    if (state.nodeModal.fieldIndex === 3 && key.name === "space") return toggleNodeDependency(state)
    if (key.ctrl && key.name === "j") return appendNodeInput(state, "cycle")
    if (key.name === "backspace") return appendNodeInput(state, "backspace")
    if (key.name === "space") return appendNodeInput(state, " ")
    if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) return appendNodeInput(state, key.sequence)
    return true
  }
  return false
}
