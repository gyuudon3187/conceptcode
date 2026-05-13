import { describe, expect, test } from "bun:test"

import { moveSelection } from "./state"
import type { ArchonState } from "./types"

function createState(): ArchonState {
  return {
    workspaceRoot: "/workspace",
    catalog: {
      workflows: [{
        path: "/workspace/.archon/workflows/alpha.yaml",
        relativePath: ".archon/workflows/alpha.yaml",
        workflow: {
          path: "/workspace/.archon/workflows/alpha.yaml",
          relativePath: ".archon/workflows/alpha.yaml",
          name: "Alpha",
          description: "First workflow",
          provider: null,
          model: null,
          interactive: false,
          interactiveUsesDefault: true,
          tags: [],
          worktreeEnabled: true,
          worktreeEnabledUsesDefault: true,
          nodes: [],
        },
        findings: [],
        readOnlyReason: null,
        parseError: null,
        referencedCommandNames: [],
      }, {
        path: "/workspace/.archon/workflows/beta.yaml",
        relativePath: ".archon/workflows/beta.yaml",
        workflow: {
          path: "/workspace/.archon/workflows/beta.yaml",
          relativePath: ".archon/workflows/beta.yaml",
          name: "Beta",
          description: "Second workflow",
          provider: null,
          model: null,
          interactive: false,
          interactiveUsesDefault: true,
          tags: [],
          worktreeEnabled: true,
          worktreeEnabledUsesDefault: true,
          nodes: [],
        },
        findings: [],
        readOnlyReason: null,
        parseError: null,
        referencedCommandNames: [],
      }],
      commands: [{
        path: "/workspace/.archon/commands/review.md",
        relativePath: ".archon/commands/review.md",
        command: {
          path: "/workspace/.archon/commands/review.md",
          relativePath: ".archon/commands/review.md",
          name: "review",
          description: null,
          argumentHint: null,
          body: "# Review\n",
        },
        findings: [],
        parseError: null,
        referencedByWorkflowPaths: [],
      }, {
        path: "/workspace/.archon/commands/ship.md",
        relativePath: ".archon/commands/ship.md",
        command: {
          path: "/workspace/.archon/commands/ship.md",
          relativePath: ".archon/commands/ship.md",
          name: "ship",
          description: null,
          argumentHint: null,
          body: "# Ship\n",
        },
        findings: [],
        parseError: null,
        referencedByWorkflowPaths: [],
      }],
    },
    submode: "workflows",
    selectedWorkflowPath: "/workspace/.archon/workflows/alpha.yaml",
    selectedCommandPath: "/workspace/.archon/commands/review.md",
    workflowNodesOpen: false,
    selectedWorkflowNodeId: null,
    dirtyPaths: [],
    pendingDeletePaths: [],
    metadataModal: null,
    nodeModal: null,
  }
}

describe("archon selection", () => {
  test("wraps workflow selection from bottom to top and top to bottom", () => {
    const state = createState()

    state.selectedWorkflowPath = "/workspace/.archon/workflows/beta.yaml"
    expect(moveSelection(state, 1)).toBe(true)
    expect(state.selectedWorkflowPath).toBe("/workspace/.archon/workflows/alpha.yaml")

    expect(moveSelection(state, -1)).toBe(true)
    expect(state.selectedWorkflowPath).toBe("/workspace/.archon/workflows/beta.yaml")
  })

  test("wraps command selection from bottom to top and top to bottom", () => {
    const state = createState()
    state.submode = "commands"
    state.selectedCommandPath = "/workspace/.archon/commands/ship.md"

    expect(moveSelection(state, 1)).toBe(true)
    expect(state.selectedCommandPath).toBe("/workspace/.archon/commands/review.md")

    expect(moveSelection(state, -1)).toBe(true)
    expect(state.selectedCommandPath).toBe("/workspace/.archon/commands/ship.md")
  })

  test("moving workflow selection after closing node view clears node selection", () => {
    const state = createState()
    state.workflowNodesOpen = true
    state.selectedWorkflowNodeId = "build"
    state.catalog.workflows[0]!.workflow!.nodes = [
      { id: "build", kind: "command", body: "", dependsOn: [], when: null, triggerRule: null, context: null },
    ]
    state.workflowNodesOpen = false
    state.selectedWorkflowNodeId = null

    expect(moveSelection(state, 1)).toBe(true)
    expect(state.selectedWorkflowPath).toBe("/workspace/.archon/workflows/beta.yaml")
    expect(state.workflowNodesOpen).toBe(false)
    expect(state.selectedWorkflowNodeId).toBeNull()
  })

  test("moving in an open node view selects the first node before advancing", () => {
    const state = createState()
    state.workflowNodesOpen = true
    state.catalog.workflows[0]!.workflow!.nodes = [
      { id: "build", kind: "command", body: "", dependsOn: [], when: null, triggerRule: null, context: null },
      { id: "ship", kind: "command", body: "", dependsOn: [], when: null, triggerRule: null, context: null },
    ]

    expect(moveSelection(state, 1)).toBe(true)
    expect(state.selectedWorkflowNodeId).toBe("build")

    expect(moveSelection(state, 1)).toBe(true)
    expect(state.selectedWorkflowNodeId).toBe("ship")
  })
})
