export type { EffectivePromptTokenBreakdown } from "conceptcode/payload"

import {
  EMPTY_PROMPT_TOKEN_BREAKDOWN,
  buildClipboardPayload as buildClipboardPayloadBase,
  buildEffectivePrompt as buildEffectivePromptBase,
  clipboardSelection as clipboardSelectionBase,
  countEffectivePromptTokens as countEffectivePromptTokensBase,
  effectivePromptTokenBreakdown as effectivePromptTokenBreakdownBase,
  referencedConceptPaths,
  renderClipboardBlockWithContext,
} from "conceptcode/payload"

import type { AppState } from "../core/types"
import { activeSession } from "../sessions/store"

const payloadDeps = { activeSession }

export { EMPTY_PROMPT_TOKEN_BREAKDOWN, referencedConceptPaths, renderClipboardBlockWithContext }

export async function buildEffectivePrompt(state: AppState, currentPath: string): Promise<string> {
  return buildEffectivePromptBase(state, payloadDeps, currentPath)
}

export async function effectivePromptTokenBreakdown(state: AppState, currentPath: string) {
  return effectivePromptTokenBreakdownBase(state, payloadDeps, currentPath)
}

export async function countEffectivePromptTokens(state: AppState, currentPath: string): Promise<number> {
  return countEffectivePromptTokensBase(state, payloadDeps, currentPath)
}

export async function buildClipboardPayload(state: AppState, currentPath: string): Promise<string> {
  return buildClipboardPayloadBase(state, payloadDeps, currentPath)
}

export function clipboardSelection(state: AppState, currentPath: string): { paths: string[]; count: number } {
  return clipboardSelectionBase(state, payloadDeps, currentPath)
}
