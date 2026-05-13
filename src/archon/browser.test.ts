import { describe, expect, test } from "bun:test"

import { handleArchonBrowserKey } from "./browser"
import type { AppState } from "../core/types"

function createState(nodeIds: string[] = []): AppState {
  return {
    layoutMode: "wide",
    mainScrollTop: 7,
    archon: {
      workspaceRoot: "/workspace",
      catalog: {
        workflows: [{
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
        }],
        commands: [],
      },
      submode: "workflows",
      selectedWorkflowPath: "/workspace/.archon/workflows/release.yaml",
      selectedCommandPath: null,
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
  test("enter opens create-node modal for an empty workflow", async () => {
    const state = createState()
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.nodeModal?.kind).toBe("create-node")
    expect(state.archon.selectedWorkflowNodeId).toBeNull()
    expect(drawCalls.count).toBe(1)
  })

  test("right opens create-node modal for an empty workflow", async () => {
    const state = createState()
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "right" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.nodeModal?.kind).toBe("create-node")
    expect(state.mainScrollTop).toBe(0)
    expect(drawCalls.count).toBe(1)
  })

  test("enter still selects the first node when the workflow already has nodes", async () => {
    const state = createState(["plan"])
    const drawCalls = { count: 0 }

    const handled = await handleArchonBrowserKey(state, { name: "return" } as never, createDeps(drawCalls) as never)

    expect(handled).toBe(true)
    expect(state.archon.selectedWorkflowNodeId).toBe("plan")
    expect(state.archon.nodeModal).toBeNull()
    expect(drawCalls.count).toBe(1)
  })

  test("d prompts before deleting a selected workflow", async () => {
    const state = createState()
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
