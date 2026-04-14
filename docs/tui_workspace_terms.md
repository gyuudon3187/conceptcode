# TUI workspace terminology

This document names the main spatial concepts used when discussing the current TUI layout.

## Why these terms exist

The interface is not just a set of independent panes. It is organized as two mirrored workspace arrangements that shift emphasis when focus changes.

These terms help distinguish:

- where the user is currently working
- which panes support that work
- which panes stay visible mainly for orientation

## Core terms

### Workspace

A `workspace` is one full arrangement of panes optimized around a primary activity.

The current TUI has two workspaces:

- `Concepts workspace`
- `Prompt workspace`

Switching focus between them does not merely move a cursor. It rebalances the whole visible composition.

### Dominant pane

The `dominant pane` is the largest and most visually emphasized pane in a workspace.

- In the `Concepts workspace`, the dominant pane is `Concepts`.
- In the `Prompt workspace`, the dominant pane is `Prompt`.

The dominant pane is where the user is expected to spend most of their attention in that workspace.

### Support column

The `support column` is the narrower side of a workspace that contains supporting panes stacked vertically.

- In the `Concepts workspace`, the support column is on the right.
- In the `Prompt workspace`, the support column is on the left.

The support column helps preserve awareness of adjacent tools and supplementary information without competing with the dominant pane.

### Support pane

A `support pane` is the upper pane inside the support column. It contains information that deepens the current workspace's main task.

- In the `Concepts workspace`, the support pane is `Details`.
- In the `Prompt workspace`, the support pane is `Context`.

Support panes are intended to be more informative than preview panes and are expected to grow over time.

### Preview pane

A `preview pane` is the lower pane inside the support column. It keeps the neighboring workspace visible in a compressed form.

- In the `Concepts workspace`, the preview pane is `Session`.
- In the `Prompt workspace`, the preview pane is `Concepts`.

Preview panes are primarily about orientation and continuity, not deep interaction.

## Role-specific terms

### Session pane

The `Session pane` is the preview pane shown in the `Concepts workspace`.

Its job is to keep the prompt side present without making it compete with concept navigation. It should usually show:

- session status such as `idle`, `thinking`, or `error`
- a compact preview of the current draft or live assistant reply
- a transition cue that points toward the `Prompt` workspace

### Concepts preview pane

The `Concepts preview pane` is the preview pane shown in the `Prompt workspace`.

Its job is to keep the concept side present while the prompt editor is dominant. It usually shows a compact card for the currently highlighted concept.

### Details pane

The `Details pane` is the support pane shown in the `Concepts workspace`.

It currently carries the concept summary content that used to live in the old summary pane, but it is intended to expand into a richer concept-inspection surface.

### Context pane

The `Context pane` is the support pane shown in the `Prompt workspace`.

It currently shows prompt budget and referenced-item information, but it should be treated as a broader future-facing support pane rather than as a permanently narrow token counter.

## Interaction terms

### Transition cue

A `transition cue` is a compact directional hint such as `Tab -> Prompt`.

Its purpose is to remind the user that another workspace exists and that focus can shift there.

The cue should feel spatial and low-noise rather than like generic help text.

### Mirrored layout

The `mirrored layout` is the overall design pattern where the two workspaces share the same broad geometry but swap left/right emphasis.

This gives the interface a strong sense of moving between two constellations without requiring an entirely different visual language for each one.

### Peripheral awareness

`Peripheral awareness` describes the design goal that the non-dominant side should remain visible enough to preserve orientation, but subdued enough not to distract from the active task.

Preview panes are the main mechanism for maintaining this awareness.

## Short reference

- `Concepts workspace`: `Concepts` dominant pane + `Details` support pane + `Session` preview pane
- `Prompt workspace`: `Prompt` dominant pane + `Context` support pane + `Concepts` preview pane
- `support column`: the stacked side column that holds support and preview panes
- `transition cue`: the directional hint for shifting into the neighboring workspace
