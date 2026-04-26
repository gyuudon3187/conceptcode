import { createTimeline, engine, type Timeline } from "@opentui/core"
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

  type TimelineStateKey = "promptPaneAnimationTimeline" | "workspaceTransitionTimeline"

  function stopTimeline(key: TimelineStateKey): void {
    const timeline = state[key]
    if (!timeline) return
    timeline.pause()
    engine.unregister(timeline)
    state[key] = null
  }

  function startTimeline(options: {
    key: TimelineStateKey
    duration: number
    configure: (timeline: Timeline) => void
    onComplete: (timeline: Timeline) => void
  }): void {
    stopTimeline(options.key)
    const timeline = createTimeline({
      autoplay: false,
      duration: options.duration,
      onComplete: () => {
        if (state[options.key] !== timeline) return
        options.onComplete(timeline)
      },
    })
    options.configure(timeline)
    state[options.key] = timeline
    redraw()
    timeline.play()
  }

  function desiredPromptPaneRatio(): number {
    if (state.layoutMode !== "wide") return 1
    return state.promptPaneMode === "expanded" ? state.uiLayoutConfig.expandedPromptRatio : state.uiLayoutConfig.collapsedPromptRatio
  }

  function stopPromptPaneAnimation(): void {
    stopTimeline("promptPaneAnimationTimeline")
  }

  function stopWorkspaceTransition(): void {
    stopTimeline("workspaceTransitionTimeline")
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
    const progressState = { value: 0 }
    startTimeline({
      key: "workspaceTransitionTimeline",
      duration: state.uiLayoutConfig.workspaceTransitionDurationMs,
      configure: (timeline) => {
        timeline.add(progressState, {
          duration: state.uiLayoutConfig.workspaceTransitionDurationMs,
          value: 1,
          ease: "linear",
          onUpdate: () => {
            const transition = state.workspaceTransition
            if (!transition || state.workspaceTransitionTimeline !== timeline) return
            transition.progress = easeOutPower(progressState.value, state.uiLayoutConfig.workspaceTransitionEndEasePower)
            redraw()
          },
        })
      },
      onComplete: (timeline) => {
        const transition = state.workspaceTransition
        if (!transition || state.workspaceTransitionTimeline !== timeline) return
        const elapsed = Date.now() - transition.startedAt
        void appendWorkspaceDebugLog("transition_end", {
          from: transition.from,
          to: transition.to,
          progress: transition.progress,
          linearProgress: progressState.value,
          elapsed,
          viewportWidth: deps.getViewport().width,
          viewportHeight: deps.getViewport().height,
        })
        finishWorkspaceTransition(nextFocus, openPromptEditorAfterTransition)
      },
    })
  }

  function animatePromptPane(): void {
    stopPromptPaneAnimation()
    if (state.layoutMode !== "wide") {
      state.promptPaneRatio = 1
      state.promptPaneTargetRatio = 1
      redraw()
      return
    }
    const startRatio = state.promptPaneRatio
    const targetRatio = state.promptPaneTargetRatio
    const distance = Math.abs(targetRatio - startRatio)
    if (distance <= state.uiLayoutConfig.promptAnimationSnapEpsilon) {
      state.promptPaneRatio = targetRatio
      redraw()
      return
    }
    const progressState = { value: 0 }
    const duration = state.uiLayoutConfig.promptAnimationDurationMs
    startTimeline({
      key: "promptPaneAnimationTimeline",
      duration,
      configure: (timeline) => {
        timeline.add(progressState, {
          duration,
          value: 1,
          ease: state.uiLayoutConfig.promptAnimationEase,
          onUpdate: () => {
            if (state.promptPaneAnimationTimeline !== timeline) return
            state.promptPaneRatio = startRatio + ((targetRatio - startRatio) * progressState.value)
            redraw()
          },
        })
      },
      onComplete: (timeline) => {
        if (state.promptPaneAnimationTimeline !== timeline) return
        state.promptPaneRatio = targetRatio
        state.promptPaneAnimationTimeline = null
        redraw()
      },
    })
  }

  function refreshPromptPaneTarget(): void {
    const nextTarget = desiredPromptPaneRatio()
    if (state.layoutMode !== "wide") {
      stopPromptPaneAnimation()
      state.promptPaneTargetRatio = 1
      state.promptPaneRatio = 1
      return
    }
    if (Math.abs(nextTarget - state.promptPaneRatio) <= state.uiLayoutConfig.promptAnimationSnapEpsilon) {
      stopPromptPaneAnimation()
      state.promptPaneTargetRatio = nextTarget
      state.promptPaneRatio = nextTarget
      return
    }
    if (Math.abs(nextTarget - state.promptPaneTargetRatio) <= state.uiLayoutConfig.promptAnimationSnapEpsilon) {
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
