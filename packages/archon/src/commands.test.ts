import { describe, expect, test } from "bun:test"

import { parseCommandFile, serializeCommandFile } from "./commands"

const WORKSPACE_ROOT = "/workspace"

describe("command files", () => {
  test("parses frontmatter and body", () => {
    const entry = parseCommandFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/commands/review.md",
      [
        "---",
        'description: "Review the patch"',
        'argument-hint: "<pr-url>"',
        "---",
        "",
        "# Review",
        "Inspect the change.",
      ].join("\n"),
    )

    expect(entry.parseError).toBeNull()
    expect(entry.command).toMatchObject({
      name: "review",
      description: "Review the patch",
      argumentHint: "<pr-url>",
      body: "# Review\nInspect the change.",
    })
    expect(entry.findings).toEqual([])
  })

  test("serializes markdown with frontmatter", () => {
    const markdown = serializeCommandFile({
      path: "/workspace/.archon/commands/review.md",
      relativePath: ".archon/commands/review.md",
      name: "review",
      description: "Review the patch",
      argumentHint: "<pr-url>",
      body: "# Review\nInspect the change.\n",
    })

    expect(markdown).toBe(["---", 'description: "Review the patch"', 'argument-hint: "<pr-url>"', "---", "# Review", "Inspect the change.", ""].join("\n"))
  })

  test("warns when frontmatter is missing", () => {
    const entry = parseCommandFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/commands/review.md",
      "# Review\nInspect the change.\n",
    )

    expect(entry.parseError).toBeNull()
    expect(entry.findings.map((finding) => finding.message)).toEqual([
      "Command file is missing frontmatter.",
      "Command description is missing.",
    ])
  })

  test("warns on malformed and unsupported frontmatter lines", () => {
    const entry = parseCommandFile(
      WORKSPACE_ROOT,
      "/workspace/.archon/commands/review.md",
      [
        "---",
        "description Review the patch",
        "extra-field: yes",
        "---",
        "",
        "# Review",
      ].join("\n"),
    )

    expect(entry.parseError).toBeNull()
    expect(entry.findings.map((finding) => finding.message)).toEqual([
      "Malformed frontmatter lines: description Review the patch",
      "Command description is missing.",
      "Unsupported frontmatter fields: extra-field",
    ])
  })
})
