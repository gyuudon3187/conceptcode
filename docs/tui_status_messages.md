# TUI status and feedback notes

This file captures the messages that used to flow through the bottom status pane, plus where they have been moved or how they should be handled now that the pane is gone.

## Messages intentionally superseded by list arrows

- `Already at the root` in `src/index.ts:861`
  - Formerly shown when navigating left from the root concept.
  - Superseded by the left marker column: concepts with a parent show `<-`, and the root context has no parent marker.

- ``${node.path} has no children`` in `src/index.ts:847`
  - Formerly shown when navigating right into a concept with no children.
  - Superseded by the right marker column: concepts with children show `->`.

## Messages now shown in overlays/modals

- `Concept name and summary are required` in `src/index.ts:515`
  - Trigger: submitting the create-concept modal without both required fields.
  - Category: validation.
  - Current home: confirmation-style overlay.

- `Added draft concept: ${createdPath}` / `Added draft concept without kind: ${createdPath}` in `src/index.ts:528`
  - Trigger: successfully creating a draft concept.
  - Category: success feedback.
  - Current home: removed for now.

- `Removed draft` in `src/index.ts:626`
  - Trigger: confirming draft removal.
  - Category: success feedback.
  - Current home: removed for now.

- `Browse: j/k move  h/l back/open  Shift+Tab/Ctrl+H/Ctrl+L focus panes  i prompt  s/t/m inspect  y copy  q quit` in `src/index.ts:907`
  - Trigger: `?` help shortcut.
  - Category: help text.
  - Current home: help overlay with updated shortcuts.

- `Press Ctrl+C again to quit, or Esc to stay` in `src/index.ts:982`
  - Trigger: first `Ctrl+C` press before quitting.
  - Category: quit confirmation.
  - Current home: quit overlay.

## Error and external-command messages

- `message` from external editor failures in `src/index.ts:734`
  - Trigger: failure when opening or resuming from the external editor.
  - Upstream examples include:
    - `EDITOR is not set` from `src/index.ts:938`
    - `${editor} exited with code ${code}` from `src/index.ts:948`
  - Category: error.
  - Current home: error overlay.

- `result.message` from clipboard failures in `src/index.ts:1024`
  - Trigger: `copyToClipboard(...)` returning a failure.
  - Category: error.
  - Current home: error overlay.

## Success feedback removed with the status pane

- `Copied context for ${selection.count} concept(s)` in `src/index.ts:889`
  - Trigger: copying prompt-referenced concept context.
  - Category: success feedback.
  - Current home: removed for now.

- `Copied path: ${path}` in `src/index.ts:903`
  - Trigger: copying the current concept path.
  - Category: success feedback.
  - Current home: removed for now.

## Informational copy removed with the status pane

- `Browse concepts. Shift+Tab/Ctrl+H/Ctrl+L switches panes. Prompt focus edits immediately. y copies referenced context.` in `src/index.ts:413` and `src/index.ts:932`
  - Trigger: initial render and timed reset after transient status messages.
  - Category: default informational/help copy.
  - Current home: removed. Prompt pane text now carries the essential prompt-edit guidance.
