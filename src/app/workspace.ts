import { appendFile } from "node:fs/promises"
import { join } from "node:path"

import type { ShellWorkspaceControllerDeps } from "agent-tui/types"

const DEBUG_WORKSPACE_TRANSITION = true
const WORKSPACE_DEBUG_LOG_PATH = join(process.cwd(), "workspace-transition-debug.log")

async function appendWorkspaceDebugLog(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!DEBUG_WORKSPACE_TRANSITION) return
  const line = `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`
  try {
    await appendFile(WORKSPACE_DEBUG_LOG_PATH, line, "utf8")
  } catch {
  }
}

function easeOutPower(progress: number, power: number): number {
  const clamped = Math.max(0, Math.min(1, progress))
  const normalizedPower = Math.max(1, power)
  const lateEaseStart = 0.72
  if (clamped <= lateEaseStart) {
    return clamped
  }
  const tailProgress = (clamped - lateEaseStart) / (1 - lateEaseStart)
  const easedTailProgress = 1 - ((1 - tailProgress) ** (1 / normalizedPower))
  return lateEaseStart + (easedTailProgress * (1 - lateEaseStart))
}

export function createWorkspaceController(deps: ShellWorkspaceControllerDeps) {
  const { shellState: state, redraw } = deps

  function desiredPromptPaneRatio(): number {
    if (state.layoutMode !== "wide") return 1
    return state.promptPaneMode === "expanded" ? state.uiLayoutConfig.expandedPromptRatio : state.uiLayoutConfig.collapsedPromptRatio
  }

  function stopPromptPaneAnimation(): void {
    if (state.promptPaneAnimationTimeout) {
      clearTimeout(state.promptPaneAnimationTimeout)
      state.promptPaneAnimationTimeout = null
    }
  }

  function stopWorkspaceTransition(): void {
    if (state.workspaceTransitionTimeout) {
      clearTimeout(state.workspaceTransitionTimeout)
      state.workspaceTransitionTimeout = null
    }
  }

  function finishWorkspaceTransition(nextFocus: boolean, openPromptEditorAfterTransition = false): void {
    stopWorkspaceTransition()
    stopPromptPaneAnimation()
    if (nextFocus && state.editorModal?.target.kind === "prompt") {
      deps.applyPromptEditorText()
      state.editorModal.renderable.blur()
      state.editorModal = null
    }
    state.workspaceTransition = null
    state.conceptNavigationFocused = nextFocus
    state.promptPaneMode = nextFocus ? "collapsed" : "expanded"
    state.promptPaneTargetRatio = desiredPromptPaneRatio()
    state.promptPaneRatio = state.promptPaneTargetRatio
    if (openPromptEditorAfterTransition && !nextFocus) {
      if (state.editorModal?.target.kind === "prompt") {
        state.editorModal.renderable.focus()
      } else {
        deps.openPromptEditor()
        return
      }
    }
    redraw()
  }

  function startWorkspaceTransition(nextFocus: boolean, openPromptEditorAfterTransition = false): void {
    if (state.layoutMode !== "wide") {
      finishWorkspaceTransition(nextFocus, openPromptEditorAfterTransition)
      return
    }
    stopWorkspaceTransition()
    state.workspaceTransition = {
      from: state.conceptNavigationFocused ? "concepts" : "session",
      to: nextFocus ? "concepts" : "session",
      progress: 0,
      startedAt: Date.now(),
      loggedFirstFrame: false,
    }
    void appendWorkspaceDebugLog("transition_start", {
      from: state.workspaceTransition.from,
      to: state.workspaceTransition.to,
       viewportWidth: deps.getViewport().width,
       viewportHeight: deps.getViewport().height,
      promptPaneRatio: state.promptPaneRatio,
      promptPaneTargetRatio: state.promptPaneTargetRatio,
      layoutMode: state.layoutMode,
    })
    const step = () => {
      const transition = state.workspaceTransition
      if (!transition) return
      const elapsed = Date.now() - transition.startedAt
      const linearProgress = Math.min(1, elapsed / state.uiLayoutConfig.workspaceTransitionDurationMs)
      transition.progress = easeOutPower(linearProgress, state.uiLayoutConfig.workspaceTransitionEndEasePower)
      if (transition.progress >= 1) {
        void appendWorkspaceDebugLog("transition_end", {
          from: transition.from,
          to: transition.to,
          progress: transition.progress,
          linearProgress,
          elapsed,
           viewportWidth: deps.getViewport().width,
           viewportHeight: deps.getViewport().height,
        })
        finishWorkspaceTransition(nextFocus, openPromptEditorAfterTransition)
        return
      }
      redraw()
      state.workspaceTransitionTimeout = setTimeout(step, state.uiLayoutConfig.workspaceTransitionStepMs)
    }
    redraw()
    state.workspaceTransitionTimeout = setTimeout(step, state.uiLayoutConfig.workspaceTransitionStepMs)
  }

  function animatePromptPane(): void {
    stopPromptPaneAnimation()
    if (state.layoutMode !== "wide") {
      state.promptPaneRatio = 1
      state.promptPaneTargetRatio = 1
      redraw()
      return
    }
    const step = () => {
      const delta = state.promptPaneTargetRatio - state.promptPaneRatio
      if (Math.abs(delta) <= state.uiLayoutConfig.promptAnimationEpsilon) {
        state.promptPaneRatio = state.promptPaneTargetRatio
        state.promptPaneAnimationTimeout = null
        redraw()
        return
      }
      state.promptPaneRatio += delta * state.uiLayoutConfig.promptAnimationLerp
      redraw()
      state.promptPaneAnimationTimeout = setTimeout(step, state.uiLayoutConfig.promptAnimationStepMs)
    }
    redraw()
    state.promptPaneAnimationTimeout = setTimeout(step, state.uiLayoutConfig.promptAnimationStepMs)
  }

  function refreshPromptPaneTarget(): void {
    const nextTarget = desiredPromptPaneRatio()
    if (state.layoutMode !== "wide") {
      stopPromptPaneAnimation()
      state.promptPaneTargetRatio = 1
      state.promptPaneRatio = 1
      return
    }
    if (Math.abs(nextTarget - state.promptPaneRatio) <= state.uiLayoutConfig.promptAnimationEpsilon) {
      stopPromptPaneAnimation()
      state.promptPaneTargetRatio = nextTarget
      state.promptPaneRatio = nextTarget
      return
    }
    if (Math.abs(nextTarget - state.promptPaneTargetRatio) <= state.uiLayoutConfig.promptAnimationEpsilon) {
      state.promptPaneTargetRatio = nextTarget
      return
    }
    state.promptPaneTargetRatio = nextTarget
    animatePromptPane()
  }

  function togglePaneFocus(): void {
    if (state.workspaceTransition) return
    if (state.editorModal?.target.kind === "prompt") {
      deps.applyPromptEditorText()
      state.editorModal.renderable.blur()
      state.editorModal = null
      startWorkspaceTransition(true)
      return
    }
    if (state.conceptNavigationFocused) {
      startWorkspaceTransition(false, true)
      return
    }
    deps.openPromptEditor()
  }

  function applyStartupPromptPaneRatio(): void {
    state.promptPaneTargetRatio = desiredPromptPaneRatio()
    state.promptPaneRatio = state.promptPaneTargetRatio
  }

  function handleResize(): void {
    if (!state.startupDrawComplete) {
      applyStartupPromptPaneRatio()
      redraw()
      state.startupDrawComplete = true
      return
    }
    refreshPromptPaneTarget()
    redraw()
  }

  return {
    applyStartupPromptPaneRatio,
    handleResize,
    refreshPromptPaneTarget,
    togglePaneFocus,
  }
}
