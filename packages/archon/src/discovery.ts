import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { parseCommandFile } from "./commands"
import type { ArchonCatalog } from "./types"
import { applyCatalogValidation } from "./validate"
import { parseWorkflowFile } from "./workflows"

async function recursiveFiles(root: string, extension: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await recursiveFiles(fullPath, extension))
      continue
    }
    if (entry.isFile() && fullPath.endsWith(extension)) {
      files.push(fullPath)
    }
  }
  return files.sort((left, right) => left.localeCompare(right))
}

export async function discoverArchonCatalog(workspaceRoot: string): Promise<ArchonCatalog> {
  const workflowPaths = await recursiveFiles(join(workspaceRoot, ".archon/workflows"), ".yaml")
  const commandPaths = await recursiveFiles(join(workspaceRoot, ".archon/commands"), ".md")
  const workflows = await Promise.all(workflowPaths.map(async (path) => parseWorkflowFile(workspaceRoot, path, await readFile(path, "utf8"))))
  const commands = await Promise.all(commandPaths.map(async (path) => parseCommandFile(workspaceRoot, path, await readFile(path, "utf8"))))
  return applyCatalogValidation({ workflows, commands })
}
