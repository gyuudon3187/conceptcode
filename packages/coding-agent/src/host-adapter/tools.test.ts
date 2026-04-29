import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createHostToolRegistry, DefaultPermissionPolicy, InMemoryToolAuditSink } from "./index"
import { READ_BEFORE_WRITE_ERROR, WRITE_CHANGED_SINCE_READ_ERROR } from "./read-before-write"

const workspaces: string[] = []

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "coding-agent-tools-"))
  workspaces.push(workspace)
  return workspace
}

async function createRegistry(workspaceRoot: string, options?: Parameters<typeof createHostToolRegistry>[0]) {
  return createHostToolRegistry({
    workspaceRoot,
    mode: "build-edit",
    allowSystemBinaries: true,
    ...(options ?? {}),
  })
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("host tools", () => {
  test("normalizes paths and paginates file reads", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, "nested"), { recursive: true })
    await writeFile(join(workspace, "file.txt"), "one\ntwo\nthree\nfour\nfive")
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, cwd: join(workspace, "nested") })

    const result = await registry.runTool({ toolName: "read_file", input: { path: "../file.txt", offset: 2, limit: 2 } })

    expect(result.isError).toBeUndefined()
    expect(result.output).toContain("2: two")
    expect(result.output).toContain("3: three")
    expect(result.metadata?.path).toBe("file.txt")
    expect(result.metadata?.nextOffset).toBe(4)
    expect(result.metadata?.truncated).toBe(true)
  })

  test("denies symlinks that resolve outside the workspace", async () => {
    const workspace = await createWorkspace()
    const outsideRoot = await createWorkspace()
    await writeFile(join(outsideRoot, "outside.txt"), "secret")
    await symlink(join(outsideRoot, "outside.txt"), join(workspace, "linked.txt"))
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "read_file", input: { path: "linked.txt" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("outside the workspace")
  })

  test("lists directories in sorted paginated order", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, "b-dir"))
    await mkdir(join(workspace, "a-dir"))
    await writeFile(join(workspace, "c-file.txt"), "hi")
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "list_dir", input: { path: ".", limit: 2 } })

    expect(result.output.split("\n")).toEqual(["a-dir/", "b-dir/"])
    expect(result.metadata?.nextOffset).toBe(3)
  })

  test("detects binary file reads", async () => {
    const workspace = await createWorkspace()
    await Bun.write(join(workspace, "blob.bin"), new Uint8Array([0, 159, 146, 150]))
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "read_file", input: { path: "blob.bin" } })

    expect(result.output).toContain("Binary file")
    expect(result.metadata?.binary).toBe(true)
  })

  test("writes files inside the workspace", async () => {
    const workspace = await createWorkspace()
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "write_file", input: { path: "notes/out.txt", content: "hello" } })

    expect(result.isError).toBeUndefined()
    expect(await readFile(join(workspace, "notes/out.txt"), "utf8")).toBe("hello")
  })

  test("denies overwriting an existing file before reading it", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "notes.txt"), "before")
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "write_file", input: { path: "notes.txt", content: "after" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain(READ_BEFORE_WRITE_ERROR)
    expect(await readFile(join(workspace, "notes.txt"), "utf8")).toBe("before")
  })

  test("allows overwriting an existing file after reading it", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "notes.txt"), "before")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "notes.txt" } })
    const result = await registry.runTool({ toolName: "write_file", input: { path: "notes.txt", content: "after" } })

    expect(result.isError).toBeUndefined()
    expect(await readFile(join(workspace, "notes.txt"), "utf8")).toBe("after")
  })

  test("denies overwriting an existing file after it changes post-read", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "notes.txt"), "before")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "notes.txt" } })
    await writeFile(join(workspace, "notes.txt"), "someone else changed this")
    const result = await registry.runTool({ toolName: "write_file", input: { path: "notes.txt", content: "after" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain(WRITE_CHANGED_SINCE_READ_ERROR)
    expect(await readFile(join(workspace, "notes.txt"), "utf8")).toBe("someone else changed this")
  })

  test("denies writes outside the workspace", async () => {
    const workspace = await createWorkspace()
    const outsideRoot = await createWorkspace()
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "write_file", input: { path: join(outsideRoot, "nope.txt"), content: "x" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("outside the workspace")
  })

  test("edits files with exact replacement", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "edit.txt"), "alpha\nbeta\ngamma")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "edit.txt" } })

    const result = await registry.runTool({ toolName: "edit_file", input: { path: "edit.txt", old: "beta", new: "BETA" } })

    expect(result.isError).toBeUndefined()
    expect(await readFile(join(workspace, "edit.txt"), "utf8")).toContain("BETA")
    expect(result.output).toContain("Changed around line")
  })

  test("denies edits after the file changes post-read", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "edit.txt"), "alpha\nbeta\ngamma")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "edit.txt" } })
    await writeFile(join(workspace, "edit.txt"), "alpha\nBETA by someone else\ngamma")
    const result = await registry.runTool({ toolName: "edit_file", input: { path: "edit.txt", old: "BETA by someone else", new: "BETA" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain(WRITE_CHANGED_SINCE_READ_ERROR)
  })

  test("fails edit when old text is missing", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "edit.txt"), "alpha")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "edit.txt" } })

    const result = await registry.runTool({ toolName: "edit_file", input: { path: "edit.txt", old: "beta", new: "BETA" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("Exact match not found")
  })

  test("fails edit when replacement is ambiguous", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "edit.txt"), "same\nsame")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "edit.txt" } })

    const result = await registry.runTool({ toolName: "edit_file", input: { path: "edit.txt", old: "same", new: "diff" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("ambiguous")
  })

  test("applies structured patches", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "old.txt"), "before")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "old.txt" } })

    const patch = [
      "*** Begin Patch",
      "*** Add File: new.txt",
      "+hello",
      "*** Update File: old.txt",
      "@@",
      "-before",
      "+after",
      "*** End Patch",
    ].join("\n")
    const result = await registry.runTool({ toolName: "apply_patch", input: { patch } })

    expect(result.isError).toBeUndefined()
    expect(await readFile(join(workspace, "new.txt"), "utf8")).toBe("hello")
    expect(await readFile(join(workspace, "old.txt"), "utf8")).toBe("after")
  })

  test("denies patch updates for unread existing files", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "old.txt"), "before")
    const registry = await createRegistry(workspace)

    const patch = [
      "*** Begin Patch",
      "*** Update File: old.txt",
      "@@",
      "-before",
      "+after",
      "*** End Patch",
    ].join("\n")
    const result = await registry.runTool({ toolName: "apply_patch", input: { patch } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain(READ_BEFORE_WRITE_ERROR)
    expect(await readFile(join(workspace, "old.txt"), "utf8")).toBe("before")
  })

  test("denies patch updates after the file changes post-read", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "old.txt"), "before")
    const registry = await createRegistry(workspace)

    await registry.runTool({ toolName: "read_file", input: { path: "old.txt" } })
    await writeFile(join(workspace, "old.txt"), "someone else changed this")
    const patch = [
      "*** Begin Patch",
      "*** Update File: old.txt",
      "@@",
      "-someone else changed this",
      "+after",
      "*** End Patch",
    ].join("\n")
    const result = await registry.runTool({ toolName: "apply_patch", input: { patch } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain(WRITE_CHANGED_SINCE_READ_ERROR)
    expect(await readFile(join(workspace, "old.txt"), "utf8")).toBe("someone else changed this")
  })

  test("fails invalid patches cleanly", async () => {
    const workspace = await createWorkspace()
    const registry = await createRegistry(workspace)

    const result = await registry.runTool({ toolName: "apply_patch", input: { patch: "*** Begin Patch\n*** End Patch broken" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("Patch must start")
  })

  test("uses native fallback for glob and grep when ripgrep is disabled", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, "src"))
    await writeFile(join(workspace, "src", "one.ts"), "export const one = 1\n")
    await writeFile(join(workspace, "src", "two.ts"), "export const two = 2\n")
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, allowSystemBinaries: false })

    const globResult = await registry.runTool({ toolName: "glob", input: { pattern: "src/*.ts" } })
    const grepResult = await registry.runTool({ toolName: "grep", input: { pattern: "export const", include: "src/*.ts" } })

    expect(globResult.metadata?.backend).toBe("native")
    expect(globResult.output).toContain("src/one.ts")
    expect(grepResult.metadata?.backend).toBe("native")
    expect(grepResult.output).toContain("src/one.ts:1: export const one = 1")
  })

  test("uses ripgrep backend when available", async () => {
    const workspace = await createWorkspace()
    await mkdir(join(workspace, "src"))
    await writeFile(join(workspace, "src", "one.ts"), "needle\n")
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, allowSystemBinaries: true })

    const result = await registry.runTool({ toolName: "grep", input: { pattern: "needle", path: "src" } })
    const backend = String(result.metadata?.backend ?? "")
    if (!backend.startsWith("ripgrep:")) {
      return
    }

    expect(result.output).toContain("one.ts:1: needle")
  })

  test("times out shell commands", async () => {
    const workspace = await createWorkspace()
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, mode: "autonomous" })

    const result = await registry.runTool({ toolName: "shell", input: { command: "sleep 1", timeoutMs: 10 } })

    expect(result.metadata?.timedOut).toBe(true)
    expect(result.metadata?.exitCode).toBeNull()
  })

  test("truncates shell output", async () => {
    const workspace = await createWorkspace()
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, mode: "autonomous" })

    const result = await registry.runTool({ toolName: "shell", input: { command: "printf 'x%.0s' {1..50000}" } })

    expect(result.metadata?.truncated).toBe(true)
  })

  test("enforces shell permission decisions", async () => {
    const workspace = await createWorkspace()
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, mode: "build-edit" })

    const result = await registry.runTool({ toolName: "shell", input: { command: "echo hello" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("requires approval")
  })

  test("enforces read-only mode for writes", async () => {
    const workspace = await createWorkspace()
    const registry = await createRegistry(workspace, {
      workspaceRoot: workspace,
      mode: "read-only",
      permissions: new DefaultPermissionPolicy({ mode: "read-only" }),
    })

    const result = await registry.runTool({ toolName: "write_file", input: { path: "blocked.txt", content: "x" } })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("not allowed in read-only mode")
  })

  test("records audit log entries", async () => {
    const workspace = await createWorkspace()
    await writeFile(join(workspace, "audit.txt"), "audit")
    const audit = new InMemoryToolAuditSink()
    const registry = await createRegistry(workspace, { workspaceRoot: workspace, audit })

    await registry.runTool({ toolName: "read_file", input: { path: "audit.txt" } })

    expect(audit.entries).toHaveLength(1)
    expect(audit.entries[0]?.toolId).toBe("read_file")
    expect(audit.entries[0]?.filesRead).toContain(join(workspace, "audit.txt"))
  })
})
