import { describe, expect, test } from "bun:test"

import { renderArchonPrimaryPane, renderArchonSupportTopPane } from "./render"
import type { ArchonRenderColors, ArchonWorkflowNode } from "./types"

const COLORS: ArchonRenderColors = {
  accent: "accent",
  accentSoft: "accentSoft",
  border: "border",
  error: "error",
  muted: "muted",
  selectedBg: "selectedBg",
  selectedFg: "selectedFg",
  text: "text",
  warning: "warning",
}

function createWorkflowState(options: { nodes?: ArchonWorkflowNode[]; selectedWorkflowNodeId?: string | null } = {}) {
  const { nodes = [], selectedWorkflowNodeId = null } = options
  return {
    submode: "workflows" as const,
    selectedWorkflowPath: "/workspace/.archon/workflows/release.yaml",
    selectedCommandPath: null,
    workflowNodesOpen: true,
    selectedWorkflowNodeId,
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
          nodes,
        },
        findings: [],
        readOnlyReason: null,
        parseError: null,
        referencedCommandNames: [],
      }],
      commands: [],
    },
  }
}

function collectTextContent(node: unknown): string[] {
  if (!node || typeof node !== "object") return []
  const current = "props" in node && node.props && typeof node.props === "object" && "content" in node.props && typeof node.props.content === "string"
    ? [node.props.content]
    : []
  const children = "children" in node && Array.isArray(node.children) ? node.children.flatMap((child) => collectTextContent(child)) : []
  return [...current, ...children]
}

function findNodeWithContent(node: unknown, content: string): any | null {
  if (!node || typeof node !== "object") return null
  if ("props" in node && node.props && typeof node.props === "object" && "content" in node.props && node.props.content === content) {
    return node
  }
  if (!("children" in node) || !Array.isArray(node.children)) return null
  for (const child of node.children) {
    const match = findNodeWithContent(child, content)
    if (match) return match
  }
  return null
}

describe("archon render", () => {
  test("renders workflow nodes with box-drawing tree connectors", () => {
    const rendered = renderArchonPrimaryPane(createWorkflowState({ nodes: [
      { id: "plan", kind: "command", body: "", dependsOn: [], when: null, triggerRule: null, context: null },
      { id: "build", kind: "bash", body: "", dependsOn: ["plan"], when: null, triggerRule: null, context: null },
      { id: "ship", kind: "command", body: "", dependsOn: ["build"], when: null, triggerRule: null, context: null },
    ] }), COLORS)

    expect(collectTextContent(rendered)).toEqual(expect.arrayContaining([
      "Release",
      "├─ ",
      "plan (command)",
      "build (bash)",
      "└─ ",
      "ship (command)",
      "Esc/h back to workflows",
    ]))
  })

  test("highlights the selected node row without losing the tree connector", () => {
    const rendered = renderArchonPrimaryPane(createWorkflowState({
      nodes: [
        { id: "plan", kind: "command", body: "", dependsOn: [], when: null, triggerRule: null, context: null },
        { id: "build", kind: "bash", body: "", dependsOn: ["plan"], when: null, triggerRule: null, context: null },
      ],
      selectedWorkflowNodeId: "build",
    }), COLORS)

    expect(findNodeWithContent(rendered, "└─ ")?.props?.fg).toBe("muted")
    expect(findNodeWithContent(rendered, "build (bash)")?.props?.fg).toBe("selectedFg")
  })

  test("renders the empty workflow hint as part of the tree", () => {
    const rendered = renderArchonPrimaryPane(createWorkflowState(), COLORS)

    expect(collectTextContent(rendered)).toEqual(expect.arrayContaining([
      "Release",
      "└─ No nodes yet. Press n to create the first node.",
    ]))
  })

  test("support pane calls out when viewing nodes inside the workflow", () => {
    const rendered = renderArchonSupportTopPane(createWorkflowState({
      nodes: [{ id: "plan", kind: "command", body: "draft prompt", dependsOn: [], when: null, triggerRule: null, context: null }],
      selectedWorkflowNodeId: "plan",
    }), COLORS)

    expect(collectTextContent(rendered)).toEqual(expect.arrayContaining([
      "plan",
      "draft prompt",
      "Behavior",
      "Runs: command",
      "Depends on: none",
    ]))
  })

  test("support pane hides workflow inventory details while a node is selected", () => {
    const rendered = renderArchonSupportTopPane(createWorkflowState({
      nodes: [{ id: "plan", kind: "prompt", body: "line 1", dependsOn: ["setup"], when: "$setup.output.ok", triggerRule: null, context: "shared" }],
      selectedWorkflowNodeId: "plan",
    }), COLORS)

    const text = collectTextContent(rendered)
    expect(text).not.toContain("Nodes: 1")
    expect(text).not.toContain("Viewing nodes inside this workflow.")
    expect(text).not.toContain("Command refs: none")
    expect(text).not.toContain("Hint: Press n to create the first node.")
    expect(text).not.toContain("Status: editable subset detected.")
    expect(text).not.toContain("Esc/h back to workflows")
    expect(text).not.toContain("Workflow: Release")
    expect(text).not.toContain("prompt node in Release")
    expect(text).toEqual(expect.arrayContaining([
      "When: $setup.output.ok",
      "Context: shared",
    ]))
  })
})
