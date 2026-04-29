import type { ToolDef } from "../types"
import { createApplyPatchTool } from "./patch-tool"
import { createListDirTool, createReadFileTool, createReadManyTool, createStatTool, createTreeTool } from "./file-read-tools"
import { createEditFileTool, createWriteFileTool } from "./file-write-tools"

export function createNativeFileTools(): ToolDef[] {
  return [
    createReadFileTool(),
    createReadManyTool(),
    createListDirTool(),
    createTreeTool(),
    createStatTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createApplyPatchTool(),
  ]
}
