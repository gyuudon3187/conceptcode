import { readFileSync } from "node:fs"
import { extname } from "node:path"

import {
  asMetadataObject,
  bulletList,
  loadConceptGraph as loadConceptGraphBase,
  sourceLinesForNode,
  sourcePathForNode,
} from "conceptcode/model"

type JsonPrimitive = null | boolean | number | string
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

function asObject(value: JsonValue | undefined): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, JsonValue>
  return {}
}

function parseScalarYamlValue(rawValue: string): JsonValue {
  const value = rawValue.trim()
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1)
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && value !== "") return numeric
  return value
}

type YamlContainer = Record<string, JsonValue> | JsonValue[]

function parseSimpleYaml(text: string): Record<string, JsonValue> {
  const root: Record<string, JsonValue> = {}
  const stack: Array<{ indent: number; value: YamlContainer; parent?: Record<string, JsonValue>; key?: string }> = [{ indent: -1, value: root }]
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "")
    if (!withoutComment.trim()) continue
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0
    const trimmed = withoutComment.trim()
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const frame = stack[stack.length - 1]!
    if (trimmed.startsWith("- ")) {
      const itemValue = parseScalarYamlValue(trimmed.slice(2))
      if (!Array.isArray(frame.value)) {
        if (!frame.parent || !frame.key) continue
        const nextArray: JsonValue[] = []
        frame.parent[frame.key] = nextArray
        frame.value = nextArray
      }
      frame.value.push(itemValue)
      continue
    }
    const separatorIndex = trimmed.indexOf(":")
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    if (Array.isArray(frame.value)) continue
    if (!rawValue) {
      const child: Record<string, JsonValue> = {}
      frame.value[key] = child
      stack.push({ indent, value: child, parent: frame.value, key })
      continue
    }
    frame.value[key] = parseScalarYamlValue(rawValue)
  }
  return root
}

function optionsPayloadFromPath(optionsPath: string): JsonValue {
  const text = readFileSync(optionsPath, "utf8")
  const extension = extname(optionsPath).toLowerCase()
  return extension === ".yaml" || extension === ".yml" ? parseSimpleYaml(text) : JSON.parse(text) as JsonValue
}

function primaryFeatureConfigFromOptions(optionsPath: string | undefined): { enabledPrimaryFeatureIds: string[]; initialPrimaryFeatureId: string } {
  if (!optionsPath) {
    return { enabledPrimaryFeatureIds: ["conceptcode"], initialPrimaryFeatureId: "conceptcode" }
  }
  const payload = optionsPayloadFromPath(optionsPath)
  const root = asObject(payload)
  const features = asObject(root.features)
  const enabledList = Array.isArray(features.enabled_primary_features)
    ? features.enabled_primary_features.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : []
  const enabledPrimaryFeatureIds = enabledList.length > 0 ? enabledList : ["conceptcode"]
  const requestedInitial = typeof features.initial_primary_feature === "string" ? features.initial_primary_feature : enabledPrimaryFeatureIds[0]!
  const initialPrimaryFeatureId = enabledPrimaryFeatureIds.includes(requestedInitial) ? requestedInitial : enabledPrimaryFeatureIds[0]!
  return { enabledPrimaryFeatureIds, initialPrimaryFeatureId }
}

export { asMetadataObject, bulletList, sourceLinesForNode, sourcePathForNode }

export function loadConceptGraph(jsonPath: string, optionsPath?: string) {
  return {
    ...loadConceptGraphBase(jsonPath, optionsPath),
    primaryFeatureConfig: primaryFeatureConfigFromOptions(optionsPath),
  }
}
