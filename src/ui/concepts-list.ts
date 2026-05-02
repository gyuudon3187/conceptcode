import type { Renderable, VNode, ScrollBoxRenderable } from "@opentui/core"
import { listLines as listLinesBase, renderConceptList as renderConceptListBase, scrollListForCursor } from "conceptcode/concepts-list"

import type { AppState, ListLine } from "../core/types"
import { COLORS } from "./theme"
import { truncateSingleLine } from "./text"

export { scrollListForCursor }

export function listLines(state: AppState): ListLine[] {
  return listLinesBase(state)
}

export function renderConceptList(state: AppState): Renderable | VNode<any, any[]> {
  return renderConceptListBase(state, { colors: COLORS, truncateSingleLine })
}
