# conceptcode

Package-backed ConceptCode feature implementation extracted from the root orchestration shell.

This package owns ConceptCode-specific runtime behavior such as:

- concept-graph types and navigation helpers
- graph load/normalize helpers
- graph mutation and validation scripts
- ConceptCode prompt semantics like `@...` and ConceptCode slash commands
- Concepts-pane content and related render helpers
- ConceptCode clipboard export payload building
- snippet, subtree, and metadata preview generation
- concept draft and concept-list behavior

The root `src/` tree still owns orchestration concerns such as:

- workspace composition and focus orchestration
- prompt hosting and editor lifecycle
- session persistence
- file-reference `&...` semantics
- platform integration such as clipboard and external editor access
- multi-feature registration and coordination

Some root modules remain as compatibility wrappers so existing docs, skills, and command flows continue to work while the extraction settles.
