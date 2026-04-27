import { readFile, stat, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

import type { CodingAgentTool } from "../types"
import type { CodingAgentHostEnvironment } from "./index"

const DEFAULT_READ_LIMIT = 250

function resolveWorkspacePath(environment: CodingAgentHostEnvironment, filePath: string): string {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(environment.workspaceRoot, filePath)
}

function isWithinWorkspace(environment: CodingAgentHostEnvironment, resolvedPath: string): boolean {
  const pathRelativeToWorkspace = relative(environment.workspaceRoot, resolvedPath)
  return pathRelativeToWorkspace === "" || (!pathRelativeToWorkspace.startsWith("..") && !isAbsolute(pathRelativeToWorkspace))
}

function numberedContent(lines: string[], startLine: number): string {
  return lines.map((line, index) => `${startLine + index}: ${line}`).join("\n")
}

function readWindow(input: Record<string, unknown>): { offset: number; limit: number } {
  const offset = typeof input.offset === "number" && Number.isInteger(input.offset) && input.offset > 0 ? input.offset : 1
  const limit = typeof input.limit === "number" && Number.isInteger(input.limit) && input.limit > 0 ? input.limit : DEFAULT_READ_LIMIT
  return { offset, limit }
}

export function createReadFileTool(environment: CodingAgentHostEnvironment): CodingAgentTool {
  return {
    name: "read_file",
    description: "Read a text file within the workspace with line-numbered slices",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        offset: { type: "number" },
        limit: { type: "number" },
      },
      required: ["filePath"],
    },
    async run(input) {
      const filePath = typeof input.filePath === "string" ? input.filePath.trim() : ""
      if (!filePath) {
        return { toolName: "read_file", output: "Missing required field: filePath", isError: true }
      }

      const resolvedPath = resolveWorkspacePath(environment, filePath)
      if (!isWithinWorkspace(environment, resolvedPath)) {
        return { toolName: "read_file", output: `Path is outside the workspace: ${filePath}`, isError: true }
      }

      try {
        const fileStat = await stat(resolvedPath)
        if (!fileStat.isFile()) {
          return { toolName: "read_file", output: `Path is not a file: ${filePath}`, isError: true }
        }

        const text = await readFile(resolvedPath, "utf8")
        const allLines = text.split("\n")
        const { offset, limit } = readWindow(input)
        const startIndex = offset - 1
        const visibleLines = allLines.slice(startIndex, startIndex + limit)
        const endLine = startIndex + visibleLines.length
        const truncated = startIndex + limit < allLines.length
        const payload = {
          path: relative(environment.workspaceRoot, resolvedPath) || filePath,
          startLine: offset,
          endLine,
          truncated,
          nextOffset: truncated ? endLine + 1 : undefined,
          content: numberedContent(visibleLines, offset),
        }
        return { toolName: "read_file", output: JSON.stringify(payload, null, 2) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { toolName: "read_file", output: `Failed to read file ${filePath}: ${message}`, isError: true }
      }
    },
  }
}

function countOccurrences(text: string, target: string): number {
  if (!target) {
    return 0
  }
  let count = 0
  let index = 0
  while (index <= text.length) {
    const nextIndex = text.indexOf(target, index)
    if (nextIndex === -1) {
      return count
    }
    count += 1
    index = nextIndex + target.length
  }
  return count
}

export function createEditFileTool(environment: CodingAgentHostEnvironment): CodingAgentTool {
  return {
    name: "edit",
    description: "Perform an exact-match text replacement in a workspace file",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        oldText: { type: "string" },
        newText: { type: "string" },
        expectedOccurrences: { type: "number" },
      },
      required: ["filePath", "oldText", "newText"],
    },
    async run(input) {
      const filePath = typeof input.filePath === "string" ? input.filePath.trim() : ""
      const oldText = typeof input.oldText === "string" ? input.oldText : ""
      const newText = typeof input.newText === "string" ? input.newText : ""
      const expectedOccurrences = typeof input.expectedOccurrences === "number" && Number.isInteger(input.expectedOccurrences) && input.expectedOccurrences > 0
        ? input.expectedOccurrences
        : 1

      if (!filePath) {
        return { toolName: "edit", output: "Missing required field: filePath", isError: true }
      }
      if (!oldText) {
        return { toolName: "edit", output: "Missing required field: oldText", isError: true }
      }
      if (expectedOccurrences !== 1) {
        return {
          toolName: "edit",
          output: "The edit tool currently supports only expectedOccurrences = 1",
          isError: true,
        }
      }

      const resolvedPath = resolveWorkspacePath(environment, filePath)
      if (!isWithinWorkspace(environment, resolvedPath)) {
        return { toolName: "edit", output: `Path is outside the workspace: ${filePath}`, isError: true }
      }

      try {
        const fileStat = await stat(resolvedPath)
        if (!fileStat.isFile()) {
          return { toolName: "edit", output: `Path is not a file: ${filePath}`, isError: true }
        }

        const text = await readFile(resolvedPath, "utf8")
        const occurrences = countOccurrences(text, oldText)
        if (occurrences === 0) {
          return { toolName: "edit", output: `Exact match not found in ${filePath}`, isError: true }
        }
        if (occurrences !== expectedOccurrences) {
          return {
            toolName: "edit",
            output: `Expected ${expectedOccurrences} occurrence(s) of the target text in ${filePath}, found ${occurrences}`,
            isError: true,
          }
        }

        const nextText = text.replace(oldText, newText)
        await writeFile(resolvedPath, nextText, "utf8")
        return {
          toolName: "edit",
          output: JSON.stringify({
            path: relative(environment.workspaceRoot, resolvedPath) || filePath,
            replacements: 1,
          }, null, 2),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { toolName: "edit", output: `Failed to edit file ${filePath}: ${message}`, isError: true }
      }
    },
  }
}
