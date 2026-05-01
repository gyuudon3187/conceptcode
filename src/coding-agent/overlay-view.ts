import type { ScopedContextTreeDirectory, ScopedContextTreeNode } from "coding-agent"

import type { ScopedContextModalState } from "../core/types"

function appendScopedContextTreeLines(lines: string[], nodes: ScopedContextTreeNode[], prefix = ""): void {
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1
    const branch = isLast ? "\\-- " : "+-- "
    if (node.kind === "directory") {
      lines.push(`${prefix}${branch}${node.name}/`)
      appendScopedContextTreeLines(lines, node.children, `${prefix}${isLast ? "    " : "|   "}`)
      return
    }
    const suffix = node.mode === "eager" ? " [loaded]" : node.description ? ` [lazy] ${node.description}` : " [lazy]"
    lines.push(`${prefix}${branch}${node.name}${suffix}`)
  })
}

function scopedContextTreeLines(tree: ScopedContextTreeDirectory[]): string[] {
  const lines: string[] = []
  appendScopedContextTreeLines(lines, tree)
  return lines
}

export function scopedContextOverlayLines(modal: ScopedContextModalState): string[] {
  const headerLines = [
    modal.activePaths.length > 0 ? `Active file references: ${modal.activePaths.join(", ")}` : "Active file references: none",
    modal.contextDirectories.length > 0 ? `Context directories: ${modal.contextDirectories.join(", ")}` : "Context directories: none",
    "",
    "Scoped context tree",
  ]
  const treeLines = modal.tree.length > 0 ? scopedContextTreeLines(modal.tree) : ["No scoped context files found."]
  return [...headerLines, ...treeLines]
}
