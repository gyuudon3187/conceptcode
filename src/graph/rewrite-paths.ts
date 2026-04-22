import { isObject, visitConcepts, type JsonObject } from "./mutate"

export type PathRewrite = {
  fromPath: string
  toPath: string
}

export type PathRewriteImpact = {
  rewrittenConceptPaths: string[]
  relatedPathRewrites: Array<{
    fromPath: string
    namespace: "root" | "domain"
    before: string[]
    after: string[]
  }>
}

function rewritePathValue(path: string, rewrites: PathRewrite[]): string {
  let next = path
  for (const rewrite of rewrites) {
    if (next === rewrite.fromPath) {
      next = rewrite.toPath
      continue
    }
    const prefix = `${rewrite.fromPath}.`
    if (next.startsWith(prefix)) {
      next = `${rewrite.toPath}${next.slice(rewrite.fromPath.length)}`
    }
  }
  return next
}

export function collectSubtreePathRewrites(node: JsonObject, fromPath: string, toPath: string): PathRewrite[] {
  const rewrites: PathRewrite[] = [{ fromPath, toPath }]
  for (const [childKey, child] of Object.entries(node.children ?? {})) {
    if (!isObject(child)) continue
    rewrites.push(...collectSubtreePathRewrites(child, `${fromPath}.${childKey}`, `${toPath}.${childKey}`))
  }
  return rewrites
}

export function analyzePathRewrites(graph: JsonObject, rewrites: PathRewrite[]): PathRewriteImpact {
  const rewrittenConceptPaths = rewrites.map((rewrite) => rewrite.toPath)
  const relatedPathRewrites: PathRewriteImpact["relatedPathRewrites"] = []

  visitConcepts(graph, ({ path, namespace, node }) => {
    const relatedPaths = node.related_paths
    if (!Array.isArray(relatedPaths)) return
    const before = relatedPaths.filter((value): value is string => typeof value === "string")
    const after = before.map((value) => rewritePathValue(value, rewrites))
    if (after.length !== before.length || after.some((value, index) => value !== before[index])) {
      relatedPathRewrites.push({ fromPath: path, namespace, before, after })
    }
  })

  return { rewrittenConceptPaths, relatedPathRewrites }
}

function rewriteRelatedPathsInNode(node: JsonObject, rewrites: PathRewrite[]): void {
  const relatedPaths = node.related_paths
  if (Array.isArray(relatedPaths)) {
    node.related_paths = relatedPaths
      .flatMap((value) => (typeof value === "string" ? [rewritePathValue(value, rewrites)] : []))
  }
  const children = node.children
  if (!isObject(children)) return
  for (const child of Object.values(children)) {
    if (isObject(child)) rewriteRelatedPathsInNode(child, rewrites)
  }
}

export function applyPathRewrites(graph: JsonObject, rewrites: PathRewrite[]): void {
  if (isObject(graph.root)) {
    rewriteRelatedPathsInNode(graph.root, rewrites)
  }
  if (isObject(graph.domain)) {
    rewriteRelatedPathsInNode(graph.domain, rewrites)
  }
}
