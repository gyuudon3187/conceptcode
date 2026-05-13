import { describe, expect, test } from "bun:test"

import { parseWorkflowFile, serializeWorkflowFile } from "./workflows"

const WORKSPACE_ROOT = "/workspace"

describe("workflow files", () => {
  test("parses supported metadata and nodes", () => {
    const entry = parseWorkflowFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/workflows/release.yaml",
      [
        "name: Release Flow",
        'description: "Ship the release"',
        "provider: openai",
        "model: gpt-5.4",
        "interactive: true",
        "tags:",
        "  - release",
        "  - prod",
        "worktree:",
        "  enabled: false",
        "nodes:",
        "  - id: prep",
        '    prompt: "Plan the release"',
        "  - id: ship",
        "    command: deploy",
        "    depends_on:",
        "      - prep",
        "    when: prep and not failed",
        "    trigger_rule: success",
        '    context: "prod"',
      ].join("\n"),
    )

    expect(entry.parseError).toBeNull()
    expect(entry.readOnlyReason).toBeNull()
    expect(entry.workflow).toMatchObject({
      name: "Release Flow",
      description: "Ship the release",
      provider: "openai",
      model: "gpt-5.4",
      interactive: true,
      interactiveUsesDefault: false,
      tags: ["release", "prod"],
      worktreeEnabled: false,
      worktreeEnabledUsesDefault: false,
    })
    expect(entry.workflow?.nodes).toEqual([
      {
        id: "prep",
        kind: "prompt",
        body: "Plan the release",
        dependsOn: [],
        when: null,
        triggerRule: null,
        context: null,
      },
      {
        id: "ship",
        kind: "command",
        body: "deploy",
        dependsOn: ["prep"],
        when: "prep and not failed",
        triggerRule: "success",
        context: "prod",
      },
    ])
  })

  test("serializes supported workflow fields", () => {
    const yaml = serializeWorkflowFile({
      path: "/workspace/.archon/workflows/release.yaml",
      relativePath: ".archon/workflows/release.yaml",
      name: "Release Flow",
      description: "Ship the release",
      provider: "openai",
      model: "gpt-5.4",
      interactive: true,
      interactiveUsesDefault: false,
      tags: ["release", "prod"],
      worktreeEnabled: false,
      worktreeEnabledUsesDefault: false,
      nodes: [
        {
          id: "prep",
          kind: "prompt",
          body: "Plan the release",
          dependsOn: [],
          when: null,
          triggerRule: null,
          context: null,
        },
        {
          id: "ship",
          kind: "command",
          body: "deploy",
          dependsOn: ["prep"],
          when: "prep and not failed",
          triggerRule: "success",
          context: "prod",
        },
      ],
    })

    expect(yaml).toContain("provider: openai")
    expect(yaml).toContain("model: gpt-5.4")
    expect(yaml).toContain("interactive: true")
    expect(yaml).toContain("tags:\n  - release\n  - prod")
    expect(yaml).toContain("worktree:\n  enabled: false")
    expect(yaml).toContain('when: "prep and not failed"')
  })

  test("marks unsupported workflow fields read only", () => {
    const entry = parseWorkflowFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/workflows/advanced.yaml",
      [
        "name: Advanced",
        "skills:",
        "  - review",
        "nodes: []",
      ].join("\n"),
    )

    expect(entry.workflow).toBeNull()
    expect(entry.readOnlyReason).toBe("Unsupported workflow fields: skills")
    expect(entry.parseError).toBeNull()
  })

  test("warns when supported metadata fields have invalid shapes", () => {
    const entry = parseWorkflowFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/workflows/invalid-shapes.yaml",
      [
        "name: Invalid Shapes",
        "provider: false",
        "model: true",
        "interactive: maybe",
        "tags: release",
        "worktree:",
        "  enabled: no",
      ].join("\n"),
    )

    expect(entry.parseError).toBeNull()
    expect(entry.workflow).not.toBeNull()
    expect(entry.findings.map((finding) => finding.message)).toEqual([
      "Workflow field provider should be a string.",
      "Workflow field model should be a string.",
      "Workflow field interactive should be a boolean.",
      "Workflow field tags should be a list of strings.",
      "Workflow field worktree.enabled should be a boolean.",
    ])
  })

  test("applies upstream default values when fields are omitted", () => {
    const entry = parseWorkflowFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/workflows/defaults.yaml",
      [
        "name: Defaults",
        "nodes:",
        "  - id: prep",
        '    prompt: "Plan the release"',
      ].join("\n"),
    )

    expect(entry.workflow).toMatchObject({
      interactive: false,
      interactiveUsesDefault: true,
      worktreeEnabled: true,
      worktreeEnabledUsesDefault: true,
    })
  })

  test("omits default-valued workflow fields from serialized yaml", () => {
    const yaml = serializeWorkflowFile({
      path: "/workspace/.archon/workflows/defaults.yaml",
      relativePath: ".archon/workflows/defaults.yaml",
      name: "Defaults",
      description: "",
      provider: null,
      model: null,
      interactive: false,
      interactiveUsesDefault: true,
      tags: [],
      worktreeEnabled: true,
      worktreeEnabledUsesDefault: true,
      nodes: [
        {
          id: "prep",
          kind: "prompt",
          body: "Plan the release",
          dependsOn: [],
          when: null,
          triggerRule: null,
          context: null,
        },
      ],
    })

    expect(yaml).not.toContain("interactive:")
    expect(yaml).not.toContain("worktree:")
  })
})
