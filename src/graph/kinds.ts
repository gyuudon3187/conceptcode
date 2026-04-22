import type { JsonValue } from "../core/types"
import type { GraphNamespace } from "./mutate"

const ROOT_KINDS = new Set([
  "module",
  "view",
  "layout",
  "region",
  "control",
  "behavior",
  "transition",
  "dataclass",
  "data_group",
  "concept",
  "guidance",
])

const DOMAIN_KINDS = new Set([
  "domain_area",
  "business_concept",
  "actor",
  "goal",
  "policy",
  "rule",
  "constraint",
  "state",
  "event",
  "workflow",
  "capability",
  "metric",
  "term",
])

export type KindValidationResult =
  | { status: "missing" }
  | { status: "invalid_type"; actualType: string }
  | { status: "known" }
  | { status: "cross_namespace_mismatch"; actualKind: string; expectedNamespace: GraphNamespace }
  | { status: "unknown"; actualKind: string }

function namespaceKindSet(namespace: GraphNamespace): Set<string> {
  return namespace === "root" ? ROOT_KINDS : DOMAIN_KINDS
}

function otherNamespace(namespace: GraphNamespace): GraphNamespace {
  return namespace === "root" ? "domain" : "root"
}

export function validateConceptKind(namespace: GraphNamespace, kind: JsonValue | undefined): KindValidationResult {
  if (kind == null) return { status: "missing" }
  if (typeof kind !== "string") {
    return { status: "invalid_type", actualType: Array.isArray(kind) ? "array" : typeof kind }
  }

  if (namespaceKindSet(namespace).has(kind)) {
    return { status: "known" }
  }
  const expectedNamespace = otherNamespace(namespace)
  if (namespaceKindSet(expectedNamespace).has(kind)) {
    return { status: "cross_namespace_mismatch", actualKind: kind, expectedNamespace }
  }
  return { status: "unknown", actualKind: kind }
}
