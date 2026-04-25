import type { JsonValue } from "../core/types"
import { childEntries, conceptAtPath, visitConcepts, type GraphNamespace, type JsonObject } from "./mutate"
import { validateConceptKind } from "./kinds"
import { analyzePathRewrites, collectSubtreePathRewrites, type PathRewriteImpact } from "./rewrite-paths"

export type InboundReference = {
  fromPath: string
  namespace: GraphNamespace
}

export type DeleteConceptPreflight = {
  conceptPath: string
  exists: boolean
  directChildCount: number
  descendantCount: number
  inboundReferenceCount: number
  referencingPaths: string[]
  referencingNamespaces: GraphNamespace[]
  subtreeDeletion: boolean
}

export type RestructureConceptPreflight = {
  conceptPath: string
  exists: boolean
  targetPath: string | null
  directChildCount: number
  descendantCount: number
  subtreePathRewrites: Array<{ fromPath: string; toPath: string }>
  relatedPathRewrites: PathRewriteImpact["relatedPathRewrites"]
}

export type MergeConflictField = {
  field: string
  survivorValue: JsonValue
  removedValue: JsonValue
}

export type MergeChildCollision = {
  childKey: string
  survivorPath: string
  removedPath: string
}

export type MergeConceptPreflight = {
  survivorPath: string
  removedPath: string
  survivorExists: boolean
  removedExists: boolean
  samePath: boolean
  directChildCount: number
  descendantCount: number
  fieldConflicts: MergeConflictField[]
  childCollisions: MergeChildCollision[]
  rewriteCount: number
  relatedPathRewriteCount: number
  subtreePathRewrites: Array<{ fromPath: string; toPath: string }>
  relatedPathRewrites: PathRewriteImpact["relatedPathRewrites"]
}

export type SplitTargetPlan = {
  childKey: string
  targetPath: string
  childExists: boolean
  directChildCount: number
  descendantCount: number
  subtreePathRewrites: Array<{ fromPath: string; toPath: string }>
}

export type SplitConceptPreflight = {
  conceptPath: string
  exists: boolean
  preserveOriginal: boolean
  directChildCount: number
  descendantCount: number
  requestedTargetCount: number
  requestedChildCount: number
  untouchedChildKeys: string[]
  targetPlans: SplitTargetPlan[]
  relatedPathRewriteCount: number
  relatedPathRewrites: PathRewriteImpact["relatedPathRewrites"]
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function countDescendants(node: JsonObject): { directChildCount: number; descendantCount: number } {
  const children = childEntries(node)
  let descendantCount = children.length
  for (const [, child] of children) {
    descendantCount += countDescendants(child).descendantCount
  }
  return { directChildCount: children.length, descendantCount }
}

function jsonValuesEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function collectInboundReferences(node: JsonObject, currentPath: string, targetPath: string, references: InboundReference[]): void {
  const relatedPaths = node.related_paths
  if (Array.isArray(relatedPaths) && relatedPaths.includes(targetPath)) {
    const namespace = currentPath.startsWith("domain.") ? "domain" : "impl"
    references.push({ fromPath: currentPath, namespace })
  }
  for (const [childKey, child] of childEntries(node)) {
    collectInboundReferences(child, `${currentPath}.${childKey}`, targetPath, references)
  }
}

export function deleteConceptPreflight(graph: JsonObject, conceptPath: string): DeleteConceptPreflight {
  const concept = conceptAtPath(graph, conceptPath)
  if (!concept) {
    return {
      conceptPath,
      exists: false,
      directChildCount: 0,
      descendantCount: 0,
      inboundReferenceCount: 0,
      referencingPaths: [],
      referencingNamespaces: [],
      subtreeDeletion: false,
    }
  }

  const { directChildCount, descendantCount } = countDescendants(concept)
  const references: InboundReference[] = []

  if (isObject(graph.impl)) {
    collectInboundReferences(graph.impl, "impl", conceptPath, references)
  }
  if (isObject(graph.domain)) {
    collectInboundReferences(graph.domain, "domain", conceptPath, references)
  }

  return {
    conceptPath,
    exists: true,
    directChildCount,
    descendantCount,
    inboundReferenceCount: references.length,
    referencingPaths: references.map((reference) => reference.fromPath),
    referencingNamespaces: [...new Set(references.map((reference) => reference.namespace))],
    subtreeDeletion: descendantCount > 0,
  }
}

export function restructureConceptPreflight(graph: JsonObject, conceptPath: string, targetPath: string): RestructureConceptPreflight {
  const concept = conceptAtPath(graph, conceptPath)
  if (!concept) {
    return {
      conceptPath,
      exists: false,
      targetPath: null,
      directChildCount: 0,
      descendantCount: 0,
      subtreePathRewrites: [],
      relatedPathRewrites: [],
    }
  }

  const { directChildCount, descendantCount } = countDescendants(concept)
  const subtreePathRewrites = collectSubtreePathRewrites(concept, conceptPath, targetPath)
  const impact = analyzePathRewrites(graph, subtreePathRewrites)

  return {
    conceptPath,
    exists: true,
    targetPath,
    directChildCount,
    descendantCount,
    subtreePathRewrites,
    relatedPathRewrites: impact.relatedPathRewrites,
  }
}

export function mergeConceptPreflight(graph: JsonObject, survivorPath: string, removedPath: string): MergeConceptPreflight {
  const survivor = conceptAtPath(graph, survivorPath)
  const removed = conceptAtPath(graph, removedPath)
  const samePath = survivorPath === removedPath

  if (!survivor || !removed || samePath) {
    return {
      survivorPath,
      removedPath,
      survivorExists: Boolean(survivor),
      removedExists: Boolean(removed),
      samePath,
      directChildCount: 0,
      descendantCount: 0,
      fieldConflicts: [],
      childCollisions: [],
      rewriteCount: 0,
      relatedPathRewriteCount: 0,
      subtreePathRewrites: [],
      relatedPathRewrites: [],
    }
  }

  const { directChildCount, descendantCount } = countDescendants(removed)
  const subtreePathRewrites = collectSubtreePathRewrites(removed, removedPath, survivorPath)
  const impact = analyzePathRewrites(graph, subtreePathRewrites)
  const fieldConflicts: MergeConflictField[] = []
  const childCollisions: MergeChildCollision[] = []

  for (const [field, removedValue] of Object.entries(removed)) {
    if (field === "children") continue
    const survivorValue = survivor[field]
    if (survivorValue === undefined || jsonValuesEqual(survivorValue, removedValue)) continue
    fieldConflicts.push({ field, survivorValue, removedValue })
  }

  const survivorChildren = childEntries(survivor)
  const survivorChildKeys = new Set(survivorChildren.map(([childKey]) => childKey))
  for (const [childKey] of childEntries(removed)) {
    if (!survivorChildKeys.has(childKey)) continue
    childCollisions.push({
      childKey,
      survivorPath: `${survivorPath}.${childKey}`,
      removedPath: `${removedPath}.${childKey}`,
    })
  }

  return {
    survivorPath,
    removedPath,
    survivorExists: true,
    removedExists: true,
    samePath: false,
    directChildCount,
    descendantCount,
    fieldConflicts,
    childCollisions,
    rewriteCount: subtreePathRewrites.length,
    relatedPathRewriteCount: impact.relatedPathRewrites.length,
    subtreePathRewrites,
    relatedPathRewrites: impact.relatedPathRewrites,
  }
}

export function splitConceptPreflight(
  graph: JsonObject,
  conceptPath: string,
  targetChildKeys: Record<string, string[]>,
  preserveOriginal: boolean,
): SplitConceptPreflight {
  const concept = conceptAtPath(graph, conceptPath)
  if (!concept) {
    return {
      conceptPath,
      exists: false,
      preserveOriginal,
      directChildCount: 0,
      descendantCount: 0,
      requestedTargetCount: 0,
      requestedChildCount: 0,
      untouchedChildKeys: [],
      targetPlans: [],
      relatedPathRewriteCount: 0,
      relatedPathRewrites: [],
    }
  }

  const { directChildCount, descendantCount } = countDescendants(concept)
  const touchedChildKeys = new Set<string>()
  const targetPlans: SplitTargetPlan[] = []
  const allRewrites: Array<{ fromPath: string; toPath: string }> = []

  for (const [targetPath, childKeys] of Object.entries(targetChildKeys)) {
    let targetDirectChildCount = 0
    let targetDescendantCount = 0
    const targetRewrites: Array<{ fromPath: string; toPath: string }> = []

    for (const childKey of childKeys) {
      touchedChildKeys.add(childKey)
      const childPath = `${conceptPath}.${childKey}`
      const child = conceptAtPath(graph, childPath)
      if (!child) continue
      const counts = countDescendants(child)
      targetDirectChildCount += 1
      targetDescendantCount += counts.descendantCount
      const rewrittenPath = `${targetPath}.${childKey}`
      const childRewrites = collectSubtreePathRewrites(child, childPath, rewrittenPath)
      targetRewrites.push(...childRewrites)
      allRewrites.push(...childRewrites)
    }

    targetPlans.push({
      childKey: targetPath.split(".").at(-1) ?? targetPath,
      targetPath,
      childExists: Boolean(conceptAtPath(graph, targetPath)),
      directChildCount: targetDirectChildCount,
      descendantCount: targetDescendantCount,
      subtreePathRewrites: targetRewrites,
    })
  }

  const untouchedChildKeys = childEntries(concept)
    .map(([childKey]) => childKey)
    .filter((childKey) => !touchedChildKeys.has(childKey))
  const impact = analyzePathRewrites(graph, allRewrites)

  return {
    conceptPath,
    exists: true,
    preserveOriginal,
    directChildCount,
    descendantCount,
    requestedTargetCount: Object.keys(targetChildKeys).length,
    requestedChildCount: touchedChildKeys.size,
    untouchedChildKeys,
    targetPlans,
    relatedPathRewriteCount: impact.relatedPathRewrites.length,
    relatedPathRewrites: impact.relatedPathRewrites,
  }
}

export type ValidationSeverity = "error" | "warning"

export type ValidateGraphFinding = {
  severity: ValidationSeverity
  path: string
  fields: string[]
  message: string
  suggestedFixSkill: string | null
}

export type ValidateGraphResult = {
  graphPath: string
  findingCount: number
  errorCount: number
  warningCount: number
  findings: ValidateGraphFinding[]
}

const DOMAIN_FORBIDDEN_FIELDS = new Set(["implemented", "loc", "exploration_coverage", "summary_confidence"])
const SUSPICIOUS_CHILD_KEY = /[A-Z\s]|[^a-z0-9_-]/

function pushFinding(
  findings: ValidateGraphFinding[],
  severity: ValidationSeverity,
  path: string,
  fields: string[],
  message: string,
  suggestedFixSkill: string | null,
): void {
  findings.push({ severity, path, fields, message, suggestedFixSkill })
}

function isScore(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function skillForNamespace(namespace: GraphNamespace): string {
  return namespace === "impl" ? "/consolidate" : "/elaborate"
}

function validateRelatedPaths(graph: JsonObject, findings: ValidateGraphFinding[]): void {
  visitConcepts(graph, ({ path, node }) => {
    const relatedPaths = node.related_paths
    if (relatedPaths == null) return
    if (!Array.isArray(relatedPaths)) {
      pushFinding(findings, "error", path, ["related_paths"], "related_paths must be an array of concept paths.", "/link")
      return
    }
    for (const relatedPath of relatedPaths) {
      if (typeof relatedPath !== "string") {
        pushFinding(findings, "error", path, ["related_paths"], "related_paths entries must be strings.", "/link")
        continue
      }
      if (!conceptAtPath(graph, relatedPath)) {
        pushFinding(findings, "error", path, ["related_paths"], `related_paths references missing concept: ${relatedPath}.`, "/link")
      }
    }
  })
}

export function validateGraph(graph: JsonObject, graphPath: string): ValidateGraphResult {
  const findings: ValidateGraphFinding[] = []

  visitConcepts(graph, ({ path, key, namespace, node }) => {
    if (typeof node.summary !== "string" || !node.summary.trim()) {
      pushFinding(findings, "warning", path, ["summary"], "Concept summary is missing or empty.", skillForNamespace(namespace))
    }

    if (path !== namespace && SUSPICIOUS_CHILD_KEY.test(key)) {
      pushFinding(findings, "warning", path, ["children"], `Child key looks suspicious for a stable path segment: ${key}.`, "/rename")
    }

    if (namespace === "domain") {
      for (const field of DOMAIN_FORBIDDEN_FIELDS) {
        if (field in node) {
          pushFinding(findings, "error", path, [field], `Domain concepts must not include ${field}.`, "/move")
        }
      }
    }

    const kindResult = validateConceptKind(namespace, node.kind)
    if (kindResult.status === "invalid_type") {
      pushFinding(findings, "error", path, ["kind"], `kind must be a string when provided, got ${kindResult.actualType}.`, skillForNamespace(namespace))
    } else if (kindResult.status === "cross_namespace_mismatch") {
      pushFinding(findings, "error", path, ["kind"], `kind belongs to the ${kindResult.expectedNamespace} namespace, not ${namespace}.`, "/move")
    } else if (kindResult.status === "unknown") {
      pushFinding(findings, "warning", path, ["kind"], `Unknown kind value: ${kindResult.actualKind}.`, skillForNamespace(namespace))
    }

    const explorationCoverage = node.exploration_coverage
    if (explorationCoverage != null) {
      if (!isScore(explorationCoverage) || explorationCoverage < 0 || explorationCoverage > 1) {
        pushFinding(findings, "error", path, ["exploration_coverage"], "exploration_coverage must be a number from 0 to 1.", "/consolidate")
      }
    }

    const summaryConfidence = node.summary_confidence
    if (summaryConfidence != null) {
      if (!isScore(summaryConfidence) || summaryConfidence < 0 || summaryConfidence > 1) {
        pushFinding(findings, "error", path, ["summary_confidence"], "summary_confidence must be a number from 0 to 1.", skillForNamespace(namespace))
      } else if (isScore(explorationCoverage) && summaryConfidence > explorationCoverage) {
        pushFinding(findings, "warning", path, ["summary_confidence", "exploration_coverage"], "summary_confidence should not exceed exploration_coverage.", "/consolidate")
      }
    }
  })

  validateRelatedPaths(graph, findings)

  const errorCount = findings.filter((finding) => finding.severity === "error").length
  const warningCount = findings.length - errorCount
  return {
    graphPath,
    findingCount: findings.length,
    errorCount,
    warningCount,
    findings,
  }
}
