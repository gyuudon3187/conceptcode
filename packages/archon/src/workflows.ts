import { basename, relative } from "node:path"

import type { ArchonValidationFinding, ArchonWorkflow, ArchonWorkflowEntry, ArchonWorkflowNode } from "./types"

export const ARCHON_DEFAULT_WORKFLOW_INTERACTIVE = false
export const ARCHON_DEFAULT_WORKTREE_ENABLED = true

type YamlScalar = null | boolean | number | string
type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue }
type YamlObject = { [key: string]: YamlValue }
type YamlContainer = YamlObject | YamlValue[]

function parseScalar(rawValue: string): YamlScalar {
  const value = rawValue.trim()
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && value !== "") return numeric
  return value
}

function parseSimpleYaml(text: string): YamlObject {
  const root: YamlObject = {}
  const stack: Array<{ indent: number; value: YamlContainer; parent?: YamlObject | YamlValue[]; key?: string; arrayIndex?: number }> = [{ indent: -1, value: root }]
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "")
    if (!withoutComment.trim()) continue
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0
    const trimmed = withoutComment.trim()
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop()
    }
    const frame = stack[stack.length - 1]!
    if (trimmed.startsWith("- ")) {
      const itemText = trimmed.slice(2).trim()
      if (!Array.isArray(frame.value)) {
        if (frame.parent && frame.key) {
          const nextArray: YamlValue[] = []
          if (Array.isArray(frame.parent)) {
            const index = frame.arrayIndex ?? -1
            if (index >= 0) frame.parent[index] = nextArray
          } else {
            frame.parent[frame.key] = nextArray
          }
          frame.value = nextArray
        } else {
          continue
        }
      }
      if (!itemText) {
        const child: YamlObject = {}
        const index = frame.value.push(child) - 1
        stack.push({ indent, value: child, parent: frame.value, arrayIndex: index })
        continue
      }
      const separatorIndex = itemText.indexOf(":")
      if (separatorIndex !== -1) {
        const key = itemText.slice(0, separatorIndex).trim()
        const rawValue = itemText.slice(separatorIndex + 1).trim()
        const child: YamlObject = {}
        if (rawValue) {
          child[key] = parseScalar(rawValue)
        } else {
          child[key] = {}
        }
        const index = frame.value.push(child) - 1
        stack.push({ indent, value: child, parent: frame.value, arrayIndex: index })
        if (!rawValue) {
          stack.push({ indent: indent + 1, value: child[key] as YamlObject, parent: child, key })
        }
        continue
      }
      frame.value.push(parseScalar(itemText))
      continue
    }
    const separatorIndex = trimmed.indexOf(":")
    if (separatorIndex === -1 || Array.isArray(frame.value)) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    if (!rawValue) {
      const child: YamlObject = {}
      frame.value[key] = child
      stack.push({ indent, value: child, parent: frame.value, key })
      continue
    }
    frame.value[key] = parseScalar(rawValue)
  }
  return root
}

function asObject(value: YamlValue | undefined): YamlObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as YamlObject : {}
}

function asString(value: YamlValue | undefined): string | null {
  return typeof value === "string" ? value : null
}

function asBoolean(value: YamlValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null
}

function asStringList(value: YamlValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function isStringList(value: YamlValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function unsupportedKeys(keys: string[], allowed: Set<string>): string[] {
  return keys.filter((key) => !allowed.has(key)).sort((left, right) => left.localeCompare(right))
}

function parseWorkflowNodes(value: YamlValue | undefined): { nodes: ArchonWorkflowNode[]; readOnlyReason: string | null; parseError: string | null } {
  if (value === undefined) return { nodes: [], readOnlyReason: null, parseError: null }
  if (!Array.isArray(value)) {
    return { nodes: [], readOnlyReason: null, parseError: "Expected nodes to be a YAML list." }
  }
  const nodes: ArchonWorkflowNode[] = []
  for (const rawNode of value) {
    const node = asObject(rawNode)
    const nodeKeys = Object.keys(node)
    const supportedKeys = new Set(["id", "depends_on", "when", "trigger_rule", "context", "command", "prompt", "bash"])
    const extraKeys = unsupportedKeys(nodeKeys, supportedKeys)
    if (extraKeys.length > 0) {
      return { nodes: [], readOnlyReason: `Unsupported node fields: ${extraKeys.join(", ")}`, parseError: null }
    }
    const id = asString(node.id)
    if (!id) {
      return { nodes: [], readOnlyReason: null, parseError: "Each node must include a string id." }
    }
    const nodeKinds = ["command", "prompt", "bash"].filter((key) => typeof node[key] === "string") as Array<ArchonWorkflowNode["kind"]>
    if (nodeKinds.length !== 1) {
      return { nodes: [], readOnlyReason: null, parseError: `Node ${id} must include exactly one of command, prompt, or bash.` }
    }
    const kind = nodeKinds[0]!
    nodes.push({
      id,
      kind,
      body: asString(node[kind]) ?? "",
      dependsOn: asStringList(node.depends_on),
      when: asString(node.when),
      triggerRule: asString(node.trigger_rule),
      context: asString(node.context),
    })
  }
  return { nodes, readOnlyReason: null, parseError: null }
}

function metadataShapeFindings(payload: YamlObject, worktree: YamlObject): ArchonValidationFinding[] {
  const findings: ArchonValidationFinding[] = []
  if (payload.provider !== undefined && typeof payload.provider !== "string") {
    findings.push({ severity: "warning", message: "Workflow field provider should be a string." })
  }
  if (payload.model !== undefined && typeof payload.model !== "string") {
    findings.push({ severity: "warning", message: "Workflow field model should be a string." })
  }
  if (payload.interactive !== undefined && typeof payload.interactive !== "boolean") {
    findings.push({ severity: "warning", message: "Workflow field interactive should be a boolean." })
  }
  if (payload.tags !== undefined && !isStringList(payload.tags)) {
    findings.push({ severity: "warning", message: "Workflow field tags should be a list of strings." })
  }
  if (worktree.enabled !== undefined && typeof worktree.enabled !== "boolean") {
    findings.push({ severity: "warning", message: "Workflow field worktree.enabled should be a boolean." })
  }
  return findings
}

export function parseWorkflowFile(workspaceRoot: string, path: string, text: string): ArchonWorkflowEntry {
  const relativePath = relative(workspaceRoot, path)
  try {
    const payload = parseSimpleYaml(text)
    const supportedTopLevelKeys = new Set(["name", "description", "provider", "model", "interactive", "tags", "worktree", "nodes"])
    const extraKeys = unsupportedKeys(Object.keys(payload), supportedTopLevelKeys)
    if (extraKeys.length > 0) {
      return {
        path,
        relativePath,
        workflow: null,
        findings: [],
        readOnlyReason: `Unsupported workflow fields: ${extraKeys.join(", ")}`,
        parseError: null,
        referencedCommandNames: [],
      }
    }
    const { nodes, readOnlyReason, parseError } = parseWorkflowNodes(payload.nodes)
    if (parseError) {
      return {
        path,
        relativePath,
        workflow: null,
        findings: [],
        readOnlyReason: null,
        parseError,
        referencedCommandNames: [],
      }
    }
    const worktree = asObject(payload.worktree)
    const worktreeKeys = unsupportedKeys(Object.keys(worktree), new Set(["enabled"]))
    const findings = metadataShapeFindings(payload, worktree)
    const parsedInteractive = asBoolean(payload.interactive)
    const parsedWorktreeEnabled = asBoolean(worktree.enabled)
    const workflow: ArchonWorkflow = {
      path,
      relativePath,
      name: asString(payload.name) ?? basename(path, ".yaml"),
      description: asString(payload.description) ?? "",
      provider: asString(payload.provider),
      model: asString(payload.model),
      interactive: parsedInteractive ?? ARCHON_DEFAULT_WORKFLOW_INTERACTIVE,
      interactiveUsesDefault: parsedInteractive === null || parsedInteractive === ARCHON_DEFAULT_WORKFLOW_INTERACTIVE,
      tags: asStringList(payload.tags),
      worktreeEnabled: parsedWorktreeEnabled ?? ARCHON_DEFAULT_WORKTREE_ENABLED,
      worktreeEnabledUsesDefault: parsedWorktreeEnabled === null || parsedWorktreeEnabled === ARCHON_DEFAULT_WORKTREE_ENABLED,
      nodes,
    }
    const nextReadOnlyReason = readOnlyReason ?? (worktreeKeys.length > 0 ? `Unsupported worktree fields: ${worktreeKeys.join(", ")}` : null)
    return {
      path,
      relativePath,
      workflow,
      findings,
      readOnlyReason: nextReadOnlyReason,
      parseError: null,
      referencedCommandNames: workflow.nodes.filter((node) => node.kind === "command").map((node) => node.body),
    }
  } catch (error) {
    return {
      path,
      relativePath,
      workflow: null,
      findings: [],
      readOnlyReason: null,
      parseError: error instanceof Error ? error.message : String(error),
      referencedCommandNames: [],
    }
  }
}

function yamlScalar(value: string | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (value.length === 0) return '""'
  if (/^[A-Za-z0-9_./-]+$/.test(value)) return value
  return JSON.stringify(value)
}

export function serializeWorkflowFile(workflow: ArchonWorkflow): string {
  const lines = [
    `name: ${yamlScalar(workflow.name)}`,
    `description: ${yamlScalar(workflow.description)}`,
  ]
  if (workflow.provider) lines.push(`provider: ${yamlScalar(workflow.provider)}`)
  if (workflow.model) lines.push(`model: ${yamlScalar(workflow.model)}`)
  if (!workflow.interactiveUsesDefault) lines.push(`interactive: ${yamlScalar(workflow.interactive)}`)
  if (workflow.tags.length > 0) {
    lines.push("tags:")
    for (const tag of workflow.tags) lines.push(`  - ${yamlScalar(tag)}`)
  }
  if (!workflow.worktreeEnabledUsesDefault) {
    lines.push("worktree:")
    lines.push(`  enabled: ${yamlScalar(workflow.worktreeEnabled)}`)
  }
  lines.push("nodes:")
  for (const node of workflow.nodes) {
    lines.push(`  - id: ${yamlScalar(node.id)}`)
    lines.push(`    ${node.kind}: ${yamlScalar(node.body)}`)
    if (node.dependsOn.length > 0) {
      lines.push("    depends_on:")
      for (const dependency of node.dependsOn) lines.push(`      - ${yamlScalar(dependency)}`)
    }
    if (node.when) lines.push(`    when: ${yamlScalar(node.when)}`)
    if (node.triggerRule) lines.push(`    trigger_rule: ${yamlScalar(node.triggerRule)}`)
    if (node.context) lines.push(`    context: ${yamlScalar(node.context)}`)
  }
  return `${lines.join("\n")}\n`
}
