import { readFile } from "node:fs/promises"

import type { AppState, KindDefinition, UiLayoutConfig } from "../core/types"
import { createSseChatTransport } from "../platform/chat"
import { EMPTY_PROMPT_TOKEN_BREAKDOWN } from "../prompt/payload"
import { loadSessions } from "../sessions/store"

export const DEFAULT_UI_LAYOUT_CONFIG: UiLayoutConfig = {
  collapsedPromptRatio: 0.34,
  conceptsToSessionTransitionCollapsedPromptRatio: 0.34,
  expandedPromptRatio: 0.58,
  conceptsToSessionTransitionExpandedPromptRatio: 0.58,
  conceptsToSessionRightStackStartWidthRatio: 1,
  conceptsToSessionDetailsHeightAcceleration: 1,
  promptAnimationEpsilon: 0.015,
  promptAnimationStepMs: 16,
  promptAnimationLerp: 0.28,
  workspaceTransitionStepMs: 16,
  workspaceTransitionDurationMs: 5000,
  workspaceTransitionAcceleration: 1.22,
  workspaceTransitionEndEasePower: 3,
  workspaceTransitionStaggerDelay: 0.115,
  workspaceTransitionFadeStart: 0.78,
  workspaceTransitionFadeEnd: 0.92,
  viewportHorizontalInset: 4,
  rootPadding: 1,
  interPaneGap: 1,
  minFrameWidth: 40,
  minFrameHeight: 12,
  minPromptPaneWidth: 28,
  minSidebarWidth: 24,
  supportHeight: 22,
  minPreviewHeight: 5,
  minPaneWidth: 8,
  minPaneHeight: 3,
  transitionChipWidth: 8,
  transitionChipHeight: 3,
}

export function parseArgs(argv: string[]): { conceptsPath: string; optionsPath?: string } {
  let conceptsPath: string | null = null
  let optionsPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--concepts-path") {
      const value = argv[index + 1]
      if (!value) throw new Error("Missing value for --concepts-path")
      conceptsPath = value
    }
    if (argv[index] === "--options-path") {
      const value = argv[index + 1]
      if (!value) throw new Error("Missing value for --options-path")
      optionsPath = value
    }
  }
  if (!conceptsPath) throw new Error("Expected --concepts-path <path>")
  return { conceptsPath, optionsPath }
}

export async function loadProjectPaths(cwd: string): Promise<{ projectFiles: string[]; projectDirectories: string[] }> {
  const trackedPaths = (await readFile(`${cwd}/.gitignore`, "utf8").catch(() => ""), await Bun.$`git ls-files -co --exclude-standard`.text())
  const projectFiles = trackedPaths.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean)
  const projectDirectories = [...new Set(projectFiles.flatMap((file) => {
    const parts = file.split("/")
    const directories: string[] = []
    for (let index = 1; index < parts.length; index += 1) {
      directories.push(parts.slice(0, index).join("/"))
    }
    return directories
  }))].sort((left, right) => left.localeCompare(right))
  return { projectFiles, projectDirectories }
}

type CreateInitialAppStateInput = {
  conceptsPath: string
  graphPayload: AppState["graphPayload"]
  nodes: AppState["nodes"]
  kindDefinitions: KindDefinition[]
  uiLayoutConfig?: Partial<UiLayoutConfig>
  dummyChatServerBaseUrl: string
  projectFiles: string[]
  projectDirectories: string[]
}

export async function createInitialAppState(input: CreateInitialAppStateInput): Promise<AppState> {
  const { sessions, activeSessionId } = await loadSessions(input.conceptsPath, "plan")
  const resolvedUiLayoutConfig: UiLayoutConfig = { ...DEFAULT_UI_LAYOUT_CONFIG, ...input.uiLayoutConfig }
  const initialNamespaceMode = input.nodes.has("root") ? "implementation" : "domain"
  const state: AppState = {
    jsonPath: input.conceptsPath,
    graphPayload: input.graphPayload,
    nodes: input.nodes,
    projectFiles: input.projectFiles,
    projectDirectories: input.projectDirectories,
    sourceFileCache: new Map(),
    conceptNamespaceMode: initialNamespaceMode,
    currentParentPath: initialNamespaceMode === "implementation" ? "root" : "domain",
    cursor: 0,
    kindDefinitions: input.kindDefinitions,
    createConceptModal: null,
    confirmModal: null,
    layoutMode: "wide",
    uiMode: "plan",
    inspector: null,
    mainScrollTop: 0,
    mainViewportHeight: 18,
    contextTitle: "Inspector",
    contextLegendItems: [],
    sessions,
    activeSessionId,
    promptPaneRatio: resolvedUiLayoutConfig.expandedPromptRatio,
    promptPaneTargetRatio: resolvedUiLayoutConfig.expandedPromptRatio,
    promptPaneMode: "expanded",
    uiLayoutConfig: resolvedUiLayoutConfig,
    promptScrollTop: 0,
    promptViewportHeight: 12,
    conceptNavigationFocused: false,
    startupDrawComplete: false,
    editorModal: null,
    sessionModal: null,
    pendingCtrlCExit: false,
    ctrlCExitTimeout: null,
    promptPaneAnimationTimeout: null,
    promptTokenBreakdown: EMPTY_PROMPT_TOKEN_BREAKDOWN,
    chatTransport: createSseChatTransport(input.dummyChatServerBaseUrl),
    activeResponseId: null,
    activeAssistantMessageId: null,
    workspaceTransition: null,
    workspaceTransitionTimeout: null,
  }
  return state
}
