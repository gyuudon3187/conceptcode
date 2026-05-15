import type { KeyEvent } from "@opentui/core"

import { moveSelectedWorkflowNode, openCommandBodyEditor, openCreateItemModal, openCreateNodeModal, openEditItemModal, openEditNodeModal, selectedCommand, selectedWorkflow } from "archon"

import { saveArchonChanges, showArchonError, showArchonSaveResult } from "./commands"
import { applyArchonSelectionChange, cycleArchonSubmode, moveArchonSelection } from "../core/state"
import type { AppState } from "../core/types"
import type { FeatureBrowserCommandDeps } from "../features/types"

export async function handleArchonBrowserKey(state: AppState, key: KeyEvent, deps: FeatureBrowserCommandDeps): Promise<boolean> {
  if (key.ctrl && key.name === "return") {
    try {
      const dirtyCount = state.archon.dirtyPaths.length
      await saveArchonChanges(state)
      showArchonSaveResult(state, dirtyCount)
    } catch (error) {
      showArchonError(state, error)
    }
    deps.draw()
    return true
  }
  if (key.name === "tab") {
    key.preventDefault()
    key.stopPropagation()
    cycleArchonSubmode(state)
    deps.draw()
    return true
  }
  if (key.name === "j" || key.name === "down") {
    if (moveArchonSelection(state, 1)) deps.draw()
    return true
  }
  if (key.name === "k" || key.name === "up") {
    if (moveArchonSelection(state, -1)) deps.draw()
    return true
  }
  if (key.name === "pagedown") {
    if (moveArchonSelection(state, deps.pageSize(state.layoutMode))) deps.draw()
    return true
  }
  if (key.name === "pageup") {
    if (moveArchonSelection(state, -deps.pageSize(state.layoutMode))) deps.draw()
    return true
  }
  if (key.name === "home" || key.name === "g") {
    if (moveArchonSelection(state, Number.MIN_SAFE_INTEGER)) deps.draw()
    return true
  }
  if (key.name === "end" || (key.shift && key.name === "g")) {
    if (moveArchonSelection(state, Number.MAX_SAFE_INTEGER)) deps.draw()
    return true
  }
  if (key.name === "return" && state.archon.submode === "commands") {
    if (state.archon.catalog.commands.length === 0) {
      openCreateItemModal(state.archon)
      deps.draw()
      return true
    }
    const editor = openCommandBodyEditor(state.archon)
    if (editor) {
      deps.openBufferEditor(editor.target, editor.initialText)
      deps.draw()
    }
    return true
  }
  if (key.name === "return" && state.archon.submode === "workflows") {
    const workflow = selectedWorkflow(state.archon)?.workflow
    if (!workflow) {
      openCreateItemModal(state.archon)
      deps.draw()
      return true
    }
    if (state.archon.selectedWorkflowNodeId) {
      openEditNodeModal(state.archon)
    } else if (!state.archon.workflowNodesOpen) {
      state.archon.workflowNodesOpen = true
      state.archon.selectedWorkflowNodeId = workflow.nodes[0]?.id ?? null
    } else if (workflow.nodes.length > 0) {
      state.archon.selectedWorkflowNodeId = workflow.nodes[0]?.id ?? null
    }
    deps.draw()
    return true
  }
  if (key.name === "h" || key.name === "left" || key.name === "escape" || key.name === "l" || key.name === "right" || key.name === "return") {
    if (state.archon.submode === "workflows") {
      if (key.name === "h" || key.name === "left" || key.name === "escape") {
        state.archon.selectedWorkflowNodeId = null
        state.archon.workflowNodesOpen = false
      }
      if (key.name === "l" || key.name === "right") {
        const workflow = selectedWorkflow(state.archon)?.workflow
        if (!state.archon.workflowNodesOpen) {
          state.archon.workflowNodesOpen = !!workflow
          state.archon.selectedWorkflowNodeId = workflow?.nodes[0]?.id ?? null
        } else if (!state.archon.selectedWorkflowNodeId) state.archon.selectedWorkflowNodeId = workflow?.nodes[0]?.id ?? null
      }
    }
    applyArchonSelectionChange(state)
    deps.draw()
    return true
  }
  if (key.name === "n") {
    if (state.archon.submode === "workflows" && state.archon.workflowNodesOpen) {
      openCreateNodeModal(state.archon)
      deps.draw()
      return true
    }
    openCreateItemModal(state.archon)
    deps.draw()
    return true
  }
  if (key.name === "e") {
    if (state.archon.submode === "commands" && (key.ctrl || key.shift)) {
      const editor = openCommandBodyEditor(state.archon)
      if (editor) {
        deps.openBufferEditor(editor.target, editor.initialText)
        deps.draw()
      }
      return true
    }
    if (state.archon.submode === "workflows" && state.archon.selectedWorkflowNodeId) {
      openEditNodeModal(state.archon)
      deps.draw()
      return true
    }
    openEditItemModal(state.archon)
    deps.draw()
    return true
  }
  if (key.name === "d") {
    const workflowEntry = selectedWorkflow(state.archon)
    const commandEntry = selectedCommand(state.archon)
    if (state.archon.submode === "workflows" && state.archon.selectedWorkflowNodeId) {
      const node = workflowEntry?.workflow?.nodes.find((item) => item.id === state.archon.selectedWorkflowNodeId)
      if (workflowEntry && node) {
        state.confirmModal = { kind: "archon-delete", title: "Delete Workflow Node", message: [`Delete node "${node.id}" from workflow "${workflowEntry.workflow?.name ?? workflowEntry.relativePath}"?`], confirmLabel: "deletes this node", targetPath: workflowEntry.path, targetType: "workflow-node", targetNodeId: node.id }
      }
    } else if (state.archon.submode === "workflows") {
      if (workflowEntry) {
        state.confirmModal = { kind: "archon-delete", title: "Delete Workflow", message: [`Delete workflow "${workflowEntry.workflow?.name ?? workflowEntry.relativePath}"?`], confirmLabel: "deletes this workflow", targetPath: workflowEntry.path, targetType: "workflow" }
      }
    } else if (commandEntry) {
      state.confirmModal = { kind: "archon-delete", title: "Delete Command", message: [`Delete command "${commandEntry.command?.name ?? commandEntry.relativePath}"?`], confirmLabel: "deletes this command", targetPath: commandEntry.path, targetType: "command" }
    }
    deps.draw()
    return true
  }
  if (state.archon.submode === "workflows" && state.archon.selectedWorkflowNodeId && key.shift && key.name === "k") {
    if (moveSelectedWorkflowNode(state.archon, -1)) deps.draw()
    return true
  }
  if (state.archon.submode === "workflows" && state.archon.selectedWorkflowNodeId && key.shift && key.name === "j") {
    if (moveSelectedWorkflowNode(state.archon, 1)) deps.draw()
    return true
  }
  return false
}
