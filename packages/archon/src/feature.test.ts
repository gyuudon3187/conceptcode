import { describe, expect, test } from "bun:test"

import { applyMetadataModal, buildSavePlan, handleModalKey, openCreateItemModal, openCreateNodeModal, openEditItemModal } from "./feature"
import type { ArchonState } from "./types"

function createState(): ArchonState {
  return {
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
      }],
    },
    submode: "workflows",
    selectedWorkflowPath: "/workspace/.archon/workflows/release.yaml",
    selectedCommandPath: "/workspace/.archon/commands/review.md",
    selectedWorkflowNodeId: null,
    dirtyPaths: [],
    pendingDeletePaths: [],
    metadataModal: null,
    nodeModal: null,
  }
}

describe("feature metadata and save planning", () => {
  test("creates workflow path from name slug", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    expect(state.metadataModal.values.interactive).toBe("default")
    expect(state.metadataModal.values.worktreeEnabled).toBe("default")
    state.metadataModal.values.name = "Release Checks"

    applyMetadataModal(state)

    expect(state.selectedWorkflowPath).toBe("/workspace/.archon/workflows/release-checks.yaml")
    expect(state.catalog.workflows.some((entry) => entry.path === "/workspace/.archon/workflows/release-checks.yaml")).toBe(true)
  })

  test("edits workflow metadata fields", () => {
    const state = createState()

    openEditItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.values.provider = "openai"
    state.metadataModal.values.model = "gpt-5.4"
    state.metadataModal.values.interactive = "true"
    state.metadataModal.values.tags = ["release", "prod"]
    state.metadataModal.values.worktreeEnabled = "false"

    applyMetadataModal(state)

    expect(state.catalog.workflows[0]?.workflow).toMatchObject({
      provider: "openai",
      model: "gpt-5.4",
      interactive: true,
      interactiveUsesDefault: false,
      tags: ["prod", "release"],
      worktreeEnabled: false,
      worktreeEnabledUsesDefault: false,
    })
    expect(state.dirtyPaths).toEqual(["/workspace/.archon/workflows/release.yaml"])
  })

  test("resets an incompatible model when the provider changes", () => {
    const state = createState()

    openEditItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.values.provider = "google"
    state.metadataModal.values.model = "gemini-2.5-pro"
    state.metadataModal.fieldIndex = 2

    handleModalKey(state, { name: "right" } as never)

    expect(state.metadataModal.values.provider).toBe("openai")
    expect(state.metadataModal.values.model).toBe("")
  })

  test("creates commands from a body template", () => {
    const state = createState()
    state.submode = "commands"

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.values.name = "investigate"
    state.metadataModal.values.bodyTemplate = "investigation"

    applyMetadataModal(state)

    const created = state.catalog.commands.find((entry) => entry.command?.name === "investigate")?.command
    expect(created?.body).toContain("# Investigation Command")
    expect(created?.body).toContain("## Steps")
  })

  test("retains custom tags in the workflow modal state", () => {
    const state = createState()

    openEditItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.values.tags = ["release", "prod"]

    applyMetadataModal(state)

    expect(state.catalog.workflows[0]?.workflow?.tags).toEqual(["prod", "release"])
  })

  test("typing an alphanumeric character opens a text editor seeded with that input", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")

    handleModalKey(state, { name: "a", sequence: "a" } as never)

    expect(state.metadataModal.values.name).toBe("")
    expect(state.metadataModal.editor).toEqual({ kind: "text", field: "name", draft: "a" })
  })

  test("opens a text editor for free-text fields and commits on enter", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")

    handleModalKey(state, { name: "return" } as never)
    handleModalKey(state, { name: "R", sequence: "R" } as never)
    handleModalKey(state, { name: "e", sequence: "e" } as never)
    handleModalKey(state, { name: "l", sequence: "l" } as never)
    handleModalKey(state, { name: "return" } as never)

    expect(state.metadataModal.values.name).toBe("Rel")
    expect(state.metadataModal.editor).toBeNull()
  })

  test("cycles enum fields from the outer modal with h and l", () => {
    const state = createState()

    openEditItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 4

    handleModalKey(state, { name: "l", sequence: "l" } as never)
    expect(state.metadataModal.values.interactive).toBe("true")

    handleModalKey(state, { name: "h", sequence: "h" } as never)
    expect(state.metadataModal.values.interactive).toBe("default")
  })

  test("cycles enum fields from the outer modal with left and right arrows", () => {
    const state = createState()

    openEditItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 4

    handleModalKey(state, { name: "right" } as never)
    expect(state.metadataModal.values.interactive).toBe("true")

    handleModalKey(state, { name: "left" } as never)
    expect(state.metadataModal.values.interactive).toBe("default")
  })

  test("moves metadata field selection with j and k", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")

    handleModalKey(state, { name: "j", sequence: "j" } as never)
    expect(state.metadataModal.fieldIndex).toBe(1)

    handleModalKey(state, { name: "k", sequence: "k" } as never)
    expect(state.metadataModal.fieldIndex).toBe(0)
  })

  test("moves from the last create field into action buttons and wraps back to the top field", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 6

    handleModalKey(state, { name: "j", sequence: "j" } as never)
    expect(state.metadataModal.actionIndex).toBe(0)

    handleModalKey(state, { name: "j", sequence: "j" } as never)
    expect(state.metadataModal.actionIndex).toBeNull()
    expect(state.metadataModal.fieldIndex).toBe(0)
  })

  test("switches between save and cancel with h and l when actions are focused", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 6
    handleModalKey(state, { name: "j", sequence: "j" } as never)

    handleModalKey(state, { name: "l", sequence: "l" } as never)
    expect(state.metadataModal.actionIndex).toBe(1)

    handleModalKey(state, { name: "h", sequence: "h" } as never)
    expect(state.metadataModal.actionIndex).toBe(0)
  })

  test("switches between save and cancel with left and right arrows when actions are focused", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 6
    handleModalKey(state, { name: "j", sequence: "j" } as never)

    handleModalKey(state, { name: "right" } as never)
    expect(state.metadataModal.actionIndex).toBe(1)

    handleModalKey(state, { name: "left" } as never)
    expect(state.metadataModal.actionIndex).toBe(0)
  })

  test("enter on cancel closes the create modal", () => {
    const state = createState()

    openCreateItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 6
    handleModalKey(state, { name: "j", sequence: "j" } as never)
    handleModalKey(state, { name: "l", sequence: "l" } as never)

    handleModalKey(state, { name: "return" } as never)
    expect(state.metadataModal).toBeNull()
  })

  test("opens enum editors with fuzzy search and ctrl+n/p selection", () => {
    const state = createState()

    openEditItemModal(state)
    if (!state.metadataModal) throw new Error("metadata modal was not opened")
    state.metadataModal.fieldIndex = 2

    handleModalKey(state, { name: "return" } as never)
    handleModalKey(state, { name: "o", sequence: "o" } as never)
    handleModalKey(state, { name: "p", sequence: "p" } as never)
    handleModalKey(state, { name: "n", ctrl: true } as never)
    handleModalKey(state, { name: "p", ctrl: true } as never)
    handleModalKey(state, { name: "return" } as never)

    expect(state.metadataModal.values.provider).toBe("openai")
    expect(state.metadataModal.editor).toBeNull()
  })

  test("typing an alphanumeric character opens a node text editor seeded with that input", () => {
    const state = createState()

    openCreateNodeModal(state)
    if (!state.nodeModal) throw new Error("node modal was not opened")

    handleModalKey(state, { name: "a", sequence: "a" } as never)

    expect(state.nodeModal.values.id).toBe("")
    expect(state.nodeModal.editor).toEqual({ kind: "text", field: "id", draft: "a" })
  })

  test("opens a text editor for node fields and commits on enter", () => {
    const state = createState()

    openCreateNodeModal(state)
    if (!state.nodeModal) throw new Error("node modal was not opened")

    handleModalKey(state, { name: "return" } as never)
    handleModalKey(state, { name: "p", sequence: "p" } as never)
    handleModalKey(state, { name: "l", sequence: "l" } as never)
    handleModalKey(state, { name: "a", sequence: "a" } as never)
    handleModalKey(state, { name: "n", sequence: "n" } as never)
    handleModalKey(state, { name: "return" } as never)

    expect(state.nodeModal.values.id).toBe("plan")
    expect(state.nodeModal.editor).toBeNull()
  })

  test("cycles node kind from the outer modal with left and right arrows", () => {
    const state = createState()

    openCreateNodeModal(state)
    if (!state.nodeModal) throw new Error("node modal was not opened")
    state.nodeModal.fieldIndex = 1

    handleModalKey(state, { name: "right" } as never)
    expect(state.nodeModal.values.kind).toBe("prompt")

    handleModalKey(state, { name: "left" } as never)
    expect(state.nodeModal.values.kind).toBe("command")
  })

  test("moves from the last node field into action buttons and wraps back to the top field", () => {
    const state = createState()

    openCreateNodeModal(state)
    if (!state.nodeModal) throw new Error("node modal was not opened")
    state.nodeModal.fieldIndex = 6

    handleModalKey(state, { name: "j", sequence: "j" } as never)
    expect(state.nodeModal.actionIndex).toBe(0)

    handleModalKey(state, { name: "j", sequence: "j" } as never)
    expect(state.nodeModal.actionIndex).toBeNull()
    expect(state.nodeModal.fieldIndex).toBe(0)
  })

  test("switches between node save and cancel with left and right arrows when actions are focused", () => {
    const state = createState()

    openCreateNodeModal(state)
    if (!state.nodeModal) throw new Error("node modal was not opened")
    state.nodeModal.fieldIndex = 6
    handleModalKey(state, { name: "j", sequence: "j" } as never)

    handleModalKey(state, { name: "right" } as never)
    expect(state.nodeModal.actionIndex).toBe(1)

    handleModalKey(state, { name: "left" } as never)
    expect(state.nodeModal.actionIndex).toBe(0)
  })

  test("enter on node cancel closes the modal", () => {
    const state = createState()

    openCreateNodeModal(state)
    if (!state.nodeModal) throw new Error("node modal was not opened")
    state.nodeModal.fieldIndex = 6
    handleModalKey(state, { name: "j", sequence: "j" } as never)
    handleModalKey(state, { name: "right" } as never)

    handleModalKey(state, { name: "return" } as never)
    expect(state.nodeModal).toBeNull()
  })

  test("builds save plans for writes and deletes", () => {
    const state = createState()
    state.catalog.workflows[0]!.workflow!.provider = "openai"
    state.dirtyPaths = ["/workspace/.archon/workflows/release.yaml"]
    state.pendingDeletePaths = ["/workspace/.archon/commands/review.md"]

    const plan = buildSavePlan(state)

    expect(plan.deletes).toEqual(["/workspace/.archon/commands/review.md"])
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0]?.contents).toContain("provider: openai")
  })
})
