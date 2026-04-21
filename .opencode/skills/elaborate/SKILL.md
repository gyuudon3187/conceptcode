---
name: elaborate
description: Verify a user-provided concept explanation against the code and update summary confidence
compatibility: opencode
metadata:
  audience: maintainers
  domain: concept-graph
  workflow: conceptualize-elaboration
  mode: conceptualize
---

# Elaborate

Use this skill in conceptualize mode when the user provides an explanation for an existing concept and wants that explanation checked against the code.

## Invocation

```text
/elaborate @root.some.concept <user explanation>
```

- The command requires both an existing concept path and a user-provided explanation.
- The explanation may be partial.
- If either the concept path or explanation is missing, ask for the missing input instead of guessing.

## What I do

- Inspect the code behind the target concept.
- Compare the user-provided explanation against that code.
- Identify which parts are supported, unclear, contradictory, or missing.
- Update the concept `summary` to reflect the verified explanation when the evidence supports doing so.
- Update `summary_confidence` conservatively based on that verification.

## Output expectations

- Return a structured result with sections such as:
  - `target_concept`
  - `supported_points`
  - `unclear_points`
  - `contradictions`
  - `suggested_summary_adjustments`
  - `summary_update`
  - `summary_confidence_update`
- If any part of the explanation does not make sense or contradicts the code, state that explicitly and keep the description concrete.
- Do not silently rewrite contradictions away.

## Constraints

- Do not run without an explicit existing concept path.
- Do not edit implementation code.
- Only update the concept summary when the verified explanation materially improves or corrects it.
- Update `summary_confidence` conservatively and explain why it changed.
