import { describe, expect, test } from "bun:test"

import { handleArchonBrowserKey } from "./browser"
import type { AppState } from "../core/types"

function createState(options: { nodeIds?: string[]; workflows?: boolean; commands?: boolean; submode?: "workflows" | "commands" } = {}): AppState {
  const { nodeIds = [], workflows = true, commands = false, submode = "workflows" } = options
  return {
    layoutMode: "wide",
    mainScrollTop: 7,
    archon: {
      workspaceRoot: "/workspace",
      catalog: {
        workflows: workflows ? [{
          path: "/workspace/.archon/workflows/release.yaml",
          relativePath: ".archon/workflows/release.yaml",
          workflow: {
            path: "/workspace/.archon/workflows/release.yaml",
            relativePath: ".archon/workflows/release.yaml",
            name: "Release",
            description: "Ship it",
            provider: null,
            model: null,
            interactive: false,
            interactiveUsesDefault: true,
            tags: [],
            worktreeEnabled: true,
            worktreeEnabledUsesDefault: true,
            nodes: nodeIds.map((id) => ({ id, kind: "command", body: "", dependsOn: [], when: null, triggerRule: null, context: null })),
          },
          findings: [],
          readOnlyReason: null,
          parseError: null,
          referencedCommandNames: [],
        }] : [],
        commands: commands ? [{
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
        }] : [],
      },
      submode,
      selectedWorkflowPath: workflows ? "/workspace/.archon/workflows/release.yaml" : null,
      selectedCommandPath: commands ? "/workspace/.archon/commands/review.md" : null,
      workflowNodesOpen: false,
      selectedWorkflowNodeId: null,
      dirtyPaths: [],
      pendingDeletePaths: [],
      metadataModal: null,
      nodeModal: null,
    },
  } as unknown as AppState
}

function createDeps(drawCalls: { count: number }) {
  return {
    renderer: () => ({}),
    draw: () => { drawCalls.count += 1 },
    copyWithStatus: async () => {},
    openBufferEditor: () => {},
    openInspector: () => {},
    openScopedContextModal: async () => {},
    cycleConceptNamespaceMode: () => {},
    pageSize: () => 10,
    buildPromptEditorDeps: () => ({
      redraw: () => {},
      refreshPromptTokenBreakdown: () => {},
      refreshPromptScroll: () => {},
      schedulePromptScrollSync: () => {},
      refreshPromptPaneTarget: () => {},
    }),
  }
}

describe("archon browser workflow nodes", () => {
  test("enter opens create-workflow modal when no workflows exist", async () => {
    const state = createState({ workflows: false })
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.metadataModal?.kind).toBe("create-workflow")
    expect(drawCalls.count).toBe(1)
  })

  test("enter opens create-command modal when no commands exist", async () => {
    const state = createState({ workflows: false, submode: "commands" })
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.metadataModal?.kind).toBe("create-command")
    expect(drawCalls.count).toBe(1)
  })

  test("enter opens the workflow node view for an empty workflow", async () => {
    const state = createState({})
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.workflowNodesOpen).toBe(true)
    expect(state.archon.nodeModal).toBeNull()
    expect(state.archon.selectedWorkflowNodeId).toBeNull()
    expect(drawCalls.count).toBe(1)
  })

  test("right opens the workflow node view for an empty workflow", async () => {
    const state = createState({})
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "right" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.workflowNodesOpen).toBe(true)
    expect(state.archon.nodeModal).toBeNull()
    expect(state.mainScrollTop).toBe(0)
    expect(drawCalls.count).toBe(1)
  })

  test("enter opens node view before selecting a node", async () => {
    const state = createState({ nodeIds: ["plan"] })
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.workflowNodesOpen).toBe(true)
    expect(state.archon.selectedWorkflowNodeId).toBeNull()
    expect(state.archon.nodeModal).toBeNull()
    expect(drawCalls.count).toBe(1)
  })

  test("pressing enter again in node view selects the first node", async () => {
    const state = createState({ nodeIds: ["plan"] })
    const drawCalls = { count: 0 }

    await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)
    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.selectedWorkflowNodeId).toBe("plan")
  })

  test("d prompts before deleting a selected workflow", async () => {
    const state = createState({})
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "d" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.confirmModal).toMatchObject({
      kind: "archon-delete",
      title: "Delete Workflow",
      targetType: "workflow",
      targetPath: "/workspace/.archon/workflows/release.yaml",
    })
    expect(drawCalls.count).toBe(1)
  })
})
