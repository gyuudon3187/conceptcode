import { describe, expect, test } from "bun:test"

import { applyCatalogValidation, extractWhenNodeReferences, validateWorkflow } from "./validate"
import type { ArchonWorkflow } from "./types"

function workflow(overrides: Partial<ArchonWorkflow> = {}): ArchonWorkflow {
  return {
    path: "/workspace/.archon/workflows/test.yaml",
    relativePath: ".archon/workflows/test.yaml",
    name: "Test Workflow",
    description: "",
    provider: null,
    model: null,
    interactive: false,
    interactiveUsesDefault: true,
    tags: [],
    worktreeEnabled: true,
    worktreeEnabledUsesDefault: true,
    nodes: [],
    ...overrides,
  }
}

describe("workflow validation", () => {
  test("detects dependency cycles", () => {
    const findings = validateWorkflow(workflow({
      nodes: [
        { id: "a", kind: "prompt", body: "A", dependsOn: ["c"], when: null, triggerRule: null, context: null },
        { id: "b", kind: "prompt", body: "B", dependsOn: ["a"], when: null, triggerRule: null, context: null },
        { id: "c", kind: "prompt", body: "C", dependsOn: ["b"], when: null, triggerRule: null, context: null },
      ],
    }), new Set())

    expect(findings.some((finding) => finding.message === "Dependency cycle detected: a -> c -> b -> a.")).toBe(true)
  })

  test("detects missing command references", () => {
    const findings = validateWorkflow(workflow({
      nodes: [{ id: "ship", kind: "command", body: "deploy", dependsOn: [], when: null, triggerRule: null, context: null }],
    }), new Set(["review"]))

    expect(findings).toContainEqual({ severity: "error", message: "Node ship references missing command deploy.", nodeId: "ship" })
  })

  test("extracts when references without reserved tokens", () => {
    expect(extractWhenNodeReferences("prep and not failed or ship_success")).toEqual(["prep", "ship_success"])
  })

  test("links reverse command references in the catalog", () => {
    const catalog = applyCatalogValidation({
      workflows: [{
        path: "/workspace/.archon/workflows/test.yaml",
        relativePath: ".archon/workflows/test.yaml",
        workflow: workflow({
          nodes: [{ id: "ship", kind: "command", body: "deploy", dependsOn: [], when: null, triggerRule: null, context: null }],
        }),
        findings: [],
        readOnlyReason: null,
        parseError: null,
        referencedCommandNames: ["deploy"],
      }],
      commands: [{
        path: "/workspace/.archon/commands/deploy.md",
        relativePath: ".archon/commands/deploy.md",
        command: {
          path: "/workspace/.archon/commands/deploy.md",
          relativePath: ".archon/commands/deploy.md",
          name: "deploy",
          description: null,
          argumentHint: null,
          body: "# Deploy\n",
        },
        findings: [],
        parseError: null,
        referencedByWorkflowPaths: [],
      }],
    })

    expect(catalog.commands[0]?.referencedByWorkflowPaths).toEqual([".archon/workflows/test.yaml"])
  })
})
