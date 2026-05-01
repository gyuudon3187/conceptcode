import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createLocalFileSystemBackend } from "./host-adapter"
import {
  buildScopedContextTree,
  parseMarkdownFrontmatter,
  renderScopedContextBlock,
  renderScopedContextDisplayLines,
  resolveScopedContextFiles,
  resolveScopedContextView,
} from "./context-files"

const workspaces: string[] = []

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "coding-agent-context-"))
  workspaces.push(workspace)
  return workspace
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("scoped context files", () => {
  test("parses optional description frontmatter and strips it from the body", () => {
    expect(parseMarkdownFrontmatter("# Plain\nbody")).toEqual({ description: null, body: "# Plain\nbody" })
    expect(parseMarkdownFrontmatter(["---", "description: Use this when editing APIs.", "---", "# API", "Details", ""].join("\n"))).toEqual({
      description: "Use this when editing APIs.",
      body: "# API\nDetails\n",
    })
  })

  test("collects eager and lazy context files from cwd and referenced path ancestors", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", "feature"), { recursive: true })
    await writeFile(join(workspace, ".coding-agent", "contexts", "repo.md"), "# Repo\nRoot guidance\n")
    await writeFile(join(workspace, "src", ".coding-agent", "contexts", "api.md"), [
      "---",
      "description: Read this when working on API handlers.",
      "---",
      "# API Guide",
      "Internal details",
      "",
    ].join("\n"))

    const context = await resolveScopedContextFiles({
      workspaceRoot: workspace,
      cwd: join(workspace, "src"),
      activePaths: ["src/feature/file.ts"],
      fs: createLocalFileSystemBackend(),
    })

    expect(context.contextDirectories).toEqual([
      ".coding-agent/contexts",
      "src/.coding-agent/contexts",
    ])
    expect(context.eagerFiles).toEqual([
      {
        path: ".coding-agent/contexts/repo.md",
        scopeRoot: ".",
        content: "# Repo\nRoot guidance\n",
      },
    ])
    expect(context.lazyFiles).toEqual([
      {
        path: "src/.coding-agent/contexts/api.md",
        scopeRoot: "src",
        description: "Read this when working on API handlers.",
      },
    ])
  })

  test("renders eager bodies and lazy descriptions separately", () => {
    const rendered = renderScopedContextBlock({
      eagerFiles: [{ path: ".coding-agent/contexts/repo.md", scopeRoot: ".", content: "# Repo\nRoot guidance\n" }],
      lazyFiles: [{ path: "src/.coding-agent/contexts/api.md", scopeRoot: "src", description: "Read this when working on API handlers." }],
      contextDirectories: [".coding-agent/contexts", "src/.coding-agent/contexts"],
    })

    expect(rendered).toContain("[SCOPED CONTEXT]")
    expect(rendered).toContain("### `.coding-agent/contexts/repo.md`")
    expect(rendered).toContain("Root guidance")
    expect(rendered).toContain("`src/.coding-agent/contexts/api.md`: Read this when working on API handlers.")
    expect(rendered).not.toContain("Internal details")
  })

  test("builds a hierarchical tree for scoped context directories and files", () => {
    const tree = buildScopedContextTree({
      eagerFiles: [{ path: ".coding-agent/contexts/repo.md", scopeRoot: ".", content: "# Repo\nRoot guidance\n" }],
      lazyFiles: [{ path: "src/.coding-agent/contexts/api.md", scopeRoot: "src", description: "Read this when working on API handlers." }],
      contextDirectories: [".coding-agent/contexts", "src/.coding-agent/contexts"],
    })

    expect(tree).toEqual([
      {
        kind: "directory",
        name: ".coding-agent",
        path: ".coding-agent",
        children: [
          {
            kind: "directory",
            name: "contexts",
            path: ".coding-agent/contexts",
            children: [
              {
                kind: "file",
                name: "repo.md",
                path: ".coding-agent/contexts/repo.md",
                scopeRoot: ".",
                mode: "eager",
                description: null,
              },
            ],
          },
        ],
      },
      {
        kind: "directory",
        name: "src",
        path: "src",
        children: [
          {
            kind: "directory",
            name: ".coding-agent",
            path: "src/.coding-agent",
            children: [
              {
                kind: "directory",
                name: "contexts",
                path: "src/.coding-agent/contexts",
                children: [
                  {
                    kind: "file",
                    name: "api.md",
                    path: "src/.coding-agent/contexts/api.md",
                    scopeRoot: "src",
                    mode: "lazy",
                    description: "Read this when working on API handlers.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  test("resolves a scoped context view from active paths", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", ".coding-agent", "contexts"), { recursive: true })
    await mkdir(join(workspace, "src", "feature"), { recursive: true })
    await writeFile(join(workspace, ".coding-agent", "contexts", "repo.md"), "# Repo\nRoot guidance\n")
    await writeFile(join(workspace, "src", ".coding-agent", "contexts", "api.md"), [
      "---",
      "description: Read this when working on API handlers.",
      "---",
      "# API Guide",
      "Internal details",
      "",
    ].join("\n"))

    const view = await resolveScopedContextView({
      workspaceRoot: workspace,
      cwd: join(workspace, "src"),
      activePaths: ["src/feature/file.ts"],
      fs: createLocalFileSystemBackend(),
    })

    expect(view.activePaths).toEqual(["src/feature/file.ts"])
    expect(view.scopedContext.contextDirectories).toEqual([
      ".coding-agent/contexts",
      "src/.coding-agent/contexts",
    ])
    expect(view.scopedContextTree).toEqual(buildScopedContextTree(view.scopedContext))
  })

  test("renders scoped context display lines with headers and tree", () => {
    expect(renderScopedContextDisplayLines({
      activePaths: ["src/feature/file.ts"],
      contextDirectories: [".coding-agent/contexts", "src/.coding-agent/contexts"],
      tree: buildScopedContextTree({
        eagerFiles: [{ path: ".coding-agent/contexts/repo.md", scopeRoot: ".", content: "# Repo\nRoot guidance\n" }],
        lazyFiles: [{ path: "src/.coding-agent/contexts/api.md", scopeRoot: "src", description: "Read this when working on API handlers." }],
        contextDirectories: [".coding-agent/contexts", "src/.coding-agent/contexts"],
      }),
    })).toEqual([
      "Active file references: src/feature/file.ts",
      "Context directories: .coding-agent/contexts, src/.coding-agent/contexts",
      "",
      "Scoped context tree",
      "+-- .coding-agent/",
      "|   \\-- contexts/",
      "|       \\-- repo.md [loaded]",
      "\\-- src/",
      "    \\-- .coding-agent/",
      "        \\-- contexts/",
      "            \\-- api.md [lazy] Read this when working on API handlers.",
    ])
  })
})
