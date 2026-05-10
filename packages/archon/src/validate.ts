import type { ArchonCatalog, ArchonValidationFinding, ArchonWorkflow, ArchonWorkflowEntry } from "./types"

const RESERVED_WHEN_TOKENS = new Set(["and", "or", "not", "true", "false", "null", "success", "failed", "succeeded", "skipped", "completed"])

export function extractWhenNodeReferences(expression: string): string[] {
  const matches = expression.match(/[A-Za-z_][A-Za-z0-9_-]*/g) ?? []
  const unique = new Set<string>()
  for (const match of matches) {
    if (!RESERVED_WHEN_TOKENS.has(match)) unique.add(match)
  }
  return [...unique]
}

function detectDependencyCycle(workflow: ArchonWorkflow): string[] | null {
  const edges = new Map(workflow.nodes.map((node) => [node.id, node.dependsOn]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const visit = (nodeId: string): string[] | null => {
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId)
      return [...stack.slice(cycleStart), nodeId]
    }
    if (visited.has(nodeId)) return null
    visiting.add(nodeId)
    stack.push(nodeId)
    for (const dependency of edges.get(nodeId) ?? []) {
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(nodeId)
    visited.add(nodeId)
    return null
  }
  for (const node of workflow.nodes) {
    const cycle = visit(node.id)
    if (cycle) return cycle
  }
  return null
}

export function validateWorkflow(workflow: ArchonWorkflow, commandNames: Set<string>): ArchonValidationFinding[] {
  const findings: ArchonValidationFinding[] = []
  const ids = workflow.nodes.map((node) => node.id)
  const idCounts = new Map<string, number>()
  for (const id of ids) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      findings.push({ severity: "error", message: `Duplicate node id: ${id}`, nodeId: id })
    }
  }
  const idSet = new Set(ids)
  for (const node of workflow.nodes) {
    for (const dependency of node.dependsOn) {
      if (!idSet.has(dependency)) {
        findings.push({ severity: "error", message: `Node ${node.id} depends on missing node ${dependency}.`, nodeId: node.id })
      }
    }
    if (node.kind === "command" && !commandNames.has(node.body)) {
      findings.push({ severity: "error", message: `Node ${node.id} references missing command ${node.body}.`, nodeId: node.id })
    }
    if (node.when) {
      for (const reference of extractWhenNodeReferences(node.when)) {
        if (!idSet.has(reference)) {
          findings.push({ severity: "warning", message: `Node ${node.id} when expression references unknown node ${reference}.`, nodeId: node.id })
        }
      }
    }
  }
  const cycle = detectDependencyCycle(workflow)
  if (cycle) {
    findings.push({ severity: "error", message: `Dependency cycle detected: ${cycle.join(" -> ")}.` })
  }
  return findings
}

export function applyCatalogValidation(catalog: ArchonCatalog): ArchonCatalog {
  const commandNames = new Set(catalog.commands.flatMap((entry) => entry.command ? [entry.command.name] : []))
  const referencedByWorkflow = new Map<string, string[]>()
  const workflows: ArchonWorkflowEntry[] = catalog.workflows.map((entry) => {
    if (!entry.workflow) return entry
    const findings = [...entry.findings, ...validateWorkflow(entry.workflow, commandNames)]
    for (const commandName of entry.referencedCommandNames) {
      const existing = referencedByWorkflow.get(commandName) ?? []
      existing.push(entry.relativePath)
      referencedByWorkflow.set(commandName, existing)
    }
    return { ...entry, findings }
  })
  const commands = catalog.commands.map((entry) => ({
    ...entry,
    referencedByWorkflowPaths: entry.command ? (referencedByWorkflow.get(entry.command.name) ?? []).sort((left, right) => left.localeCompare(right)) : [],
  }))
  return { workflows, commands }
}
