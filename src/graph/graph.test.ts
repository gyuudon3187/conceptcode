import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { JsonValue } from "../core/types"
import { deleteConceptPreflight, mergeConceptPreflight, validateGraph } from "./analyze"
import { anchorConcept } from "./anchor-concept"
import { createConcept } from "./create-concept"
import { deleteConcept } from "./delete-concept"
import { linkRelatedPaths } from "./link-related-paths"
import { mergeConcepts } from "./merge-concepts"
import { moveConcept } from "./move-concept"
import { readGraph } from "./mutate"
import { renameConcept } from "./rename-concept"
import { splitConcept } from "./split-concept"
import { preflightSplitConcept } from "./split-concept-preflight"

type JsonObject = Record<string, JsonValue>

async function withTempGraph<T>(graph: JsonObject, run: (graphPath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "conceptcode-graph-"))
  const graphPath = join(dir, "graph.json")
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8")
  try {
    return await run(graphPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe("graph mutation contracts", () => {
  test("create defaults new root concepts to implemented false", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            parent: { title: "Parent", summary: "Parent summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await createConcept({
          graphPath,
          conceptPath: "root.parent.child",
          fields: { summary: "Child summary" },
        })

        const graph = await readGraph(graphPath)
        const child = (((graph.root as JsonObject).children as JsonObject).parent as JsonObject).children as JsonObject
        expect((child.child as JsonObject).implemented).toBe(false)
      },
    )
  })

  test("create rejects domain implementation-only metadata", async () => {
    await withTempGraph(
      {
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            area: { title: "Area", summary: "Area summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await expect(
          createConcept({
            graphPath,
            conceptPath: "domain.area.policy",
            fields: { summary: "Policy summary", implemented: false },
          }),
        ).rejects.toThrow("Domain concepts cannot include implemented")
      },
    )
  })

  test("create rejects inline children", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            parent: { title: "Parent", summary: "Parent summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await expect(
          createConcept({
            graphPath,
            conceptPath: "root.parent.child",
            fields: { summary: "Child summary", children: {} },
          }),
        ).rejects.toThrow("New concepts cannot include inline children")
      },
    )
  })

  test("delete preflight reports subtree and inbound references", async () => {
    const graph = {
      root: {
        title: "Root",
        summary: "Root summary",
        children: {
          target: {
            title: "Target",
            summary: "Target summary",
            children: {
              child: { title: "Child", summary: "Child summary", children: {} },
            },
          },
          referrer: {
            title: "Referrer",
            summary: "Referrer summary",
            related_paths: ["root.target"],
            children: {},
          },
        },
      },
      domain: {
        title: "Domain",
        summary: "Domain summary",
        children: {
          policy: {
            title: "Policy",
            summary: "Policy summary",
            related_paths: ["root.target"],
            children: {},
          },
        },
      },
    } satisfies JsonObject

    const preflight = deleteConceptPreflight(graph, "root.target")
    expect(preflight).toEqual({
      conceptPath: "root.target",
      exists: true,
      directChildCount: 1,
      descendantCount: 1,
      inboundReferenceCount: 2,
      referencingPaths: ["root.referrer", "domain.policy"],
      referencingNamespaces: ["root", "domain"],
      subtreeDeletion: true,
    })
  })

  test("delete removes related path references from both namespaces", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            target: { title: "Target", summary: "Target summary", children: {} },
            referrer: {
              title: "Referrer",
              summary: "Referrer summary",
              related_paths: ["root.target"],
              children: {},
            },
          },
        },
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            policy: {
              title: "Policy",
              summary: "Policy summary",
              related_paths: ["root.target"],
              children: {},
            },
          },
        },
      },
      async (graphPath) => {
        await deleteConcept({ graphPath, conceptPath: "root.target", confirmed: true })

        const saved = JSON.parse(await readFile(graphPath, "utf8")) as JsonObject
        const rootReferrer = ((((saved.root as JsonObject).children as JsonObject).referrer) as JsonObject).related_paths
        const domainPolicy = ((((saved.domain as JsonObject).children as JsonObject).policy) as JsonObject).related_paths

        expect(rootReferrer).toEqual([])
        expect(domainPolicy).toEqual([])
      },
    )
  })

  test("rename rewrites descendant and inbound related paths", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            parent: {
              title: "Parent",
              summary: "Parent summary",
              children: {
                target: {
                  title: "Target",
                  summary: "Target summary",
                  related_paths: ["root.parent.target.child"],
                  children: {
                    child: { title: "Child", summary: "Child summary", children: {} },
                  },
                },
                referrer: {
                  title: "Referrer",
                  summary: "Referrer summary",
                  related_paths: ["root.parent.target", "root.parent.target.child"],
                  children: {},
                },
              },
            },
          },
        },
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            policy: {
              title: "Policy",
              summary: "Policy summary",
              related_paths: ["root.parent.target.child"],
              children: {},
            },
          },
        },
      },
      async (graphPath) => {
        await renameConcept({ graphPath, conceptPath: "root.parent.target", newKey: "renamed", confirmed: true })

        const saved = await readGraph(graphPath)
        const parentChildren = (((saved.root as JsonObject).children as JsonObject).parent as JsonObject).children as JsonObject
        const renamed = parentChildren.renamed as JsonObject
        const referrer = parentChildren.referrer as JsonObject
        const domainPolicy = (((saved.domain as JsonObject).children as JsonObject).policy as JsonObject)

        expect(parentChildren.target).toBeUndefined()
        expect((renamed.children as JsonObject).child).toBeDefined()
        expect(renamed.related_paths).toEqual(["root.parent.renamed.child"])
        expect(referrer.related_paths).toEqual(["root.parent.renamed", "root.parent.renamed.child"])
        expect(domainPolicy.related_paths).toEqual(["root.parent.renamed.child"])
      },
    )
  })

  test("rename rejects sibling collisions", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            parent: {
              title: "Parent",
              summary: "Parent summary",
              children: {
                target: { title: "Target", summary: "Target summary", children: {} },
                taken: { title: "Taken", summary: "Taken summary", children: {} },
              },
            },
          },
        },
      },
      async (graphPath) => {
        await expect(renameConcept({ graphPath, conceptPath: "root.parent.target", newKey: "taken", confirmed: true })).rejects.toThrow(
          "Sibling concept already exists at root.parent.taken",
        )
      },
    )
  })

  test("move rewrites subtree paths and inbound references", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            source_parent: {
              title: "Source Parent",
              summary: "Source summary",
              children: {
                target: {
                  title: "Target",
                  summary: "Target summary",
                  children: {
                    child: { title: "Child", summary: "Child summary", children: {} },
                  },
                },
              },
            },
            destination_parent: {
              title: "Destination Parent",
              summary: "Destination summary",
              children: {},
            },
            referrer: {
              title: "Referrer",
              summary: "Referrer summary",
              related_paths: ["root.source_parent.target", "root.source_parent.target.child"],
              children: {},
            },
          },
        },
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            policy: {
              title: "Policy",
              summary: "Policy summary",
              related_paths: ["root.source_parent.target.child"],
              children: {},
            },
          },
        },
      },
      async (graphPath) => {
        await moveConcept({ graphPath, conceptPath: "root.source_parent.target", destinationParentPath: "root.destination_parent", confirmed: true })

        const saved = await readGraph(graphPath)
        const rootChildren = (saved.root as JsonObject).children as JsonObject
        const sourceChildren = ((rootChildren.source_parent as JsonObject).children as JsonObject)
        const destinationChildren = ((rootChildren.destination_parent as JsonObject).children as JsonObject)
        const referrer = rootChildren.referrer as JsonObject
        const domainPolicy = (((saved.domain as JsonObject).children as JsonObject).policy as JsonObject)

        expect(sourceChildren.target).toBeUndefined()
        expect(destinationChildren.target).toBeDefined()
        expect(referrer.related_paths).toEqual(["root.destination_parent.target", "root.destination_parent.target.child"])
        expect(domainPolicy.related_paths).toEqual(["root.destination_parent.target.child"])
      },
    )
  })

  test("move rejects moving into descendant", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            parent: {
              title: "Parent",
              summary: "Parent summary",
              children: {
                target: {
                  title: "Target",
                  summary: "Target summary",
                  children: {
                    child: { title: "Child", summary: "Child summary", children: {} },
                  },
                },
              },
            },
          },
        },
      },
      async (graphPath) => {
        await expect(
          moveConcept({ graphPath, conceptPath: "root.parent.target", destinationParentPath: "root.parent.target.child", confirmed: true }),
        ).rejects.toThrow("Cannot move a concept into its own descendant: root.parent.target.child")
      },
    )
  })

  test("move rejects sibling collisions", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            source_parent: {
              title: "Source Parent",
              summary: "Source summary",
              children: {
                target: { title: "Target", summary: "Target summary", children: {} },
              },
            },
            destination_parent: {
              title: "Destination Parent",
              summary: "Destination summary",
              children: {
                target: { title: "Existing", summary: "Existing summary", children: {} },
              },
            },
          },
        },
      },
      async (graphPath) => {
        await expect(
          moveConcept({ graphPath, conceptPath: "root.source_parent.target", destinationParentPath: "root.destination_parent", confirmed: true }),
        ).rejects.toThrow("Sibling concept already exists at root.destination_parent.target")
      },
    )
  })

  test("merge rewrites inbound references and keeps survivor values by default", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            survivor: {
              title: "Canonical",
              summary: "Canonical summary",
              aliases: ["canon"],
              children: {},
            },
            removed: {
              title: "Duplicate",
              summary: "Duplicate summary",
              aliases: ["dup"],
              related_paths: ["root.survivor"],
              why_it_exists: "Historical name",
              children: {
                child: { title: "Child", summary: "Child summary", children: {} },
              },
            },
            referrer: {
              title: "Referrer",
              summary: "Referrer summary",
              related_paths: ["root.removed", "root.removed.child"],
              children: {},
            },
          },
        },
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            policy: {
              title: "Policy",
              summary: "Policy summary",
              related_paths: ["root.removed.child"],
              children: {},
            },
          },
        },
      },
      async (graphPath) => {
        await mergeConcepts({ graphPath, survivorPath: "root.survivor", removedPath: "root.removed", confirmed: true })

        const saved = await readGraph(graphPath)
        const rootChildren = (saved.root as JsonObject).children as JsonObject
        const survivor = rootChildren.survivor as JsonObject
        const referrer = rootChildren.referrer as JsonObject
        const domainPolicy = (((saved.domain as JsonObject).children as JsonObject).policy as JsonObject)

        expect(rootChildren.removed).toBeUndefined()
        expect(survivor.title).toBe("Canonical")
        expect(survivor.summary).toBe("Canonical summary")
        expect(survivor.why_it_exists).toBe("Historical name")
        expect(survivor.aliases).toEqual(["canon", "dup"])
        expect(survivor.related_paths).toBeUndefined()
        expect((survivor.children as JsonObject).child).toBeDefined()
        expect(referrer.related_paths).toEqual(["root.survivor", "root.survivor.child"])
        expect(domainPolicy.related_paths).toEqual(["root.survivor.child"])
      },
    )
  })

  test("merge preflight reports child collisions", () => {
    const preflight = mergeConceptPreflight(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            survivor: {
              title: "Survivor",
              summary: "Survivor summary",
              children: {
                shared: { title: "Shared", summary: "Shared summary", children: {} },
              },
            },
            removed: {
              title: "Removed",
              summary: "Removed summary",
              children: {
                shared: { title: "Duplicate Shared", summary: "Duplicate shared summary", children: {} },
              },
            },
          },
        },
      },
      "root.survivor",
      "root.removed",
    )

    expect(preflight.childCollisions).toEqual([
      {
        childKey: "shared",
        survivorPath: "root.survivor.shared",
        removedPath: "root.removed.shared",
      },
    ])
  })

  test("merge rejects mutation when child collisions exist", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            survivor: {
              title: "Survivor",
              summary: "Survivor summary",
              children: {
                shared: { title: "Shared", summary: "Shared summary", children: {} },
              },
            },
            removed: {
              title: "Removed",
              summary: "Removed summary",
              children: {
                shared: { title: "Duplicate Shared", summary: "Duplicate shared summary", children: {} },
              },
            },
          },
        },
      },
      async (graphPath) => {
        await expect(mergeConcepts({ graphPath, survivorPath: "root.survivor", removedPath: "root.removed", confirmed: true })).rejects.toThrow(
          "Merge has child collisions that require resolution before mutation: shared",
        )
      },
    )
  })

  test("split preflight reports redistribution plan and untouched children", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            overloaded: {
              title: "Overloaded",
              summary: "Overloaded summary",
              children: {
                alpha: { title: "Alpha", summary: "Alpha summary", children: {} },
                beta: {
                  title: "Beta",
                  summary: "Beta summary",
                  children: {
                    nested: { title: "Nested", summary: "Nested summary", children: {} },
                  },
                },
                gamma: { title: "Gamma", summary: "Gamma summary", children: {} },
              },
            },
            referrer: {
              title: "Referrer",
              summary: "Referrer summary",
              related_paths: ["root.overloaded.alpha", "root.overloaded.beta.nested"],
              children: {},
            },
          },
        },
      },
      async (graphPath) => {
        const preflight = await preflightSplitConcept({
          graphPath,
          conceptPath: "root.overloaded",
          targets: [{ newKey: "focused", childKeys: ["alpha", "beta"] }],
        })

        expect(preflight.requestedTargetCount).toBe(1)
        expect(preflight.requestedChildCount).toBe(2)
        expect(preflight.untouchedChildKeys).toEqual(["gamma"])
        expect(preflight.relatedPathRewriteCount).toBe(1)
        expect(preflight.targetPlans).toEqual([
          {
            childKey: "focused",
            targetPath: "root.overloaded.focused",
            childExists: false,
            directChildCount: 2,
            descendantCount: 1,
            subtreePathRewrites: [
              { fromPath: "root.overloaded.alpha", toPath: "root.overloaded.focused.alpha" },
              { fromPath: "root.overloaded.beta", toPath: "root.overloaded.focused.beta" },
              { fromPath: "root.overloaded.beta.nested", toPath: "root.overloaded.focused.beta.nested" },
            ],
          },
        ])
      },
    )
  })

  test("split preserves umbrella parent and rewrites references", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            overloaded: {
              title: "Overloaded",
              summary: "Overloaded summary",
              implemented: true,
              related_paths: ["root.referrer"],
              children: {
                alpha: { title: "Alpha", summary: "Alpha summary", children: {} },
                beta: {
                  title: "Beta",
                  summary: "Beta summary",
                  children: {
                    nested: { title: "Nested", summary: "Nested summary", children: {} },
                  },
                },
                gamma: { title: "Gamma", summary: "Gamma summary", children: {} },
              },
            },
            referrer: {
              title: "Referrer",
              summary: "Referrer summary",
              related_paths: ["root.overloaded.alpha", "root.overloaded.beta.nested"],
              children: {},
            },
          },
        },
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            policy: {
              title: "Policy",
              summary: "Policy summary",
              related_paths: ["root.overloaded.beta"],
              children: {},
            },
          },
        },
      },
      async (graphPath) => {
        await splitConcept({
          graphPath,
          conceptPath: "root.overloaded",
          confirmed: true,
          targets: [{ newKey: "focused", childKeys: ["alpha", "beta"] }],
          targetFields: {
            focused: {
              title: "Focused",
              summary: "Focused summary",
            },
          },
        })

        const saved = await readGraph(graphPath)
        const rootChildren = (saved.root as JsonObject).children as JsonObject
        const overloaded = rootChildren.overloaded as JsonObject
        const overloadedChildren = overloaded.children as JsonObject
        const focused = overloadedChildren.focused as JsonObject
        const focusedChildren = focused.children as JsonObject
        const referrer = rootChildren.referrer as JsonObject
        const domainPolicy = (((saved.domain as JsonObject).children as JsonObject).policy as JsonObject)

        expect(overloadedChildren.alpha).toBeUndefined()
        expect(overloadedChildren.beta).toBeUndefined()
        expect(overloadedChildren.gamma).toBeDefined()
        expect(focused.title).toBe("Focused")
        expect(focused.summary).toBe("Focused summary")
        expect(focused.implemented).toBe(false)
        expect(focused.related_paths).toEqual(["root.overloaded.focused.alpha", "root.overloaded.focused.beta", "root.overloaded"])
        expect(focusedChildren.alpha).toBeDefined()
        expect((focusedChildren.beta as JsonObject).children).toBeDefined()
        expect(referrer.related_paths).toEqual(["root.overloaded.focused.alpha", "root.overloaded.focused.beta.nested"])
        expect(domainPolicy.related_paths).toEqual(["root.overloaded.focused.beta"])
      },
    )
  })

  test("split rejects target collisions", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            overloaded: {
              title: "Overloaded",
              summary: "Overloaded summary",
              children: {
                alpha: { title: "Alpha", summary: "Alpha summary", children: {} },
                focused: { title: "Existing", summary: "Existing summary", children: {} },
              },
            },
          },
        },
      },
      async (graphPath) => {
        await expect(
          splitConcept({
            graphPath,
            conceptPath: "root.overloaded",
            confirmed: true,
            targets: [{ newKey: "focused", childKeys: ["alpha"] }],
          }),
        ).rejects.toThrow("Split target already exists under root.overloaded: focused")
      },
    )
  })

  test("validate passes representative graph after split", () => {
    const result = validateGraph(
      {
        schema_version: 1,
        root: {
          title: "Root",
          kind: "module",
          summary: "Root summary",
          children: {
            overloaded: {
              title: "Overloaded",
              kind: "region",
              summary: "Umbrella summary",
              children: {
                focused: {
                  title: "Focused",
                  kind: "region",
                  summary: "Focused summary",
                  implemented: false,
                  related_paths: ["root.overloaded"],
                  children: {
                    alpha: { title: "Alpha", kind: "control", summary: "Alpha summary", children: {} },
                  },
                },
                gamma: { title: "Gamma", kind: "control", summary: "Gamma summary", children: {} },
              },
            },
          },
        },
      },
      "graph.json",
    )

    expect(result.findingCount).toBe(0)
  })

  test("validate reports cross-namespace kind mismatch as error", () => {
    const result = validateGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            policy_area: { title: "Policy Area", kind: "policy", summary: "Policy summary", children: {} },
          },
        },
      },
      "graph.json",
    )

    expect(result.findings).toContainEqual({
      severity: "error",
      path: "root.policy_area",
      fields: ["kind"],
      message: "kind belongs to the domain namespace, not root.",
      suggestedFixSkill: "/move",
    })
  })

  test("validate reports unknown kind as warning", () => {
    const result = validateGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            strange: { title: "Strange", kind: "widget", summary: "Strange summary", children: {} },
          },
        },
      },
      "graph.json",
    )

    expect(result.findings).toContainEqual({
      severity: "warning",
      path: "root.strange",
      fields: ["kind"],
      message: "Unknown kind value: widget.",
      suggestedFixSkill: "/consolidate",
    })
  })

  test("validate reports broken related paths", () => {
    const result = validateGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            referrer: {
              title: "Referrer",
              summary: "Referrer summary",
              related_paths: ["root.missing"],
              children: {},
            },
          },
        },
      },
      "graph.json",
    )

    expect(result.findings).toContainEqual({
      severity: "error",
      path: "root.referrer",
      fields: ["related_paths"],
      message: "related_paths references missing concept: root.missing.",
      suggestedFixSkill: "/link",
    })
  })

  test("validate reports forbidden domain metadata", () => {
    const result = validateGraph(
      {
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            rulebook: {
              title: "Rulebook",
              summary: "Rule summary",
              exploration_coverage: 0.8,
              children: {},
            },
          },
        },
      },
      "graph.json",
    )

    expect(result.findings).toContainEqual({
      severity: "error",
      path: "domain.rulebook",
      fields: ["exploration_coverage"],
      message: "Domain concepts must not include exploration_coverage.",
      suggestedFixSkill: "/move",
    })
  })

  test("validate warns when summary confidence exceeds exploration coverage", () => {
    const result = validateGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            module_a: {
              title: "Module A",
              summary: "Module summary",
              exploration_coverage: 0.4,
              summary_confidence: 0.9,
              children: {},
            },
          },
        },
      },
      "graph.json",
    )

    expect(result.findings).toContainEqual({
      severity: "warning",
      path: "root.module_a",
      fields: ["summary_confidence", "exploration_coverage"],
      message: "summary_confidence should not exceed exploration_coverage.",
      suggestedFixSkill: "/consolidate",
    })
  })

  test("link adds valid related paths", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            source: { title: "Source", summary: "Source summary", children: {} },
            target: { title: "Target", summary: "Target summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await linkRelatedPaths({ graphPath, conceptPath: "root.source", operation: "add", relatedPaths: ["root.target"] })

        const saved = await readGraph(graphPath)
        const source = (((saved.root as JsonObject).children as JsonObject).source as JsonObject)
        expect(source.related_paths).toEqual(["root.target"])
      },
    )
  })

  test("link removes related paths", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            source: { title: "Source", summary: "Source summary", related_paths: ["root.target"], children: {} },
            target: { title: "Target", summary: "Target summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await linkRelatedPaths({ graphPath, conceptPath: "root.source", operation: "remove", relatedPaths: ["root.target"] })

        const saved = await readGraph(graphPath)
        const source = (((saved.root as JsonObject).children as JsonObject).source as JsonObject)
        expect(source.related_paths).toEqual([])
      },
    )
  })

  test("link normalizes duplicate related paths", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            source: { title: "Source", summary: "Source summary", related_paths: ["root.target", "root.target"], children: {} },
            target: { title: "Target", summary: "Target summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await linkRelatedPaths({ graphPath, conceptPath: "root.source", operation: "normalize" })

        const saved = await readGraph(graphPath)
        const source = (((saved.root as JsonObject).children as JsonObject).source as JsonObject)
        expect(source.related_paths).toEqual(["root.target"])
      },
    )
  })

  test("anchor updates root loc and coverage", async () => {
    await withTempGraph(
      {
        root: {
          title: "Root",
          summary: "Root summary",
          children: {
            feature: { title: "Feature", summary: "Old summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await anchorConcept({
          graphPath,
          conceptPath: "root.feature",
          loc: { file: "src/feature.ts", start_line: 10, end_line: 20 },
          explorationCoverage: 0.8,
          summary: "Refined summary",
          summaryConfidence: 0.7,
        })

        const saved = await readGraph(graphPath)
        const feature = (((saved.root as JsonObject).children as JsonObject).feature as JsonObject)
        expect(feature.loc).toEqual({ file: "src/feature.ts", start_line: 10, end_line: 20 })
        expect(feature.exploration_coverage).toBe(0.8)
        expect(feature.summary).toBe("Refined summary")
        expect(feature.summary_confidence).toBe(0.7)
      },
    )
  })

  test("anchor rejects domain concepts", async () => {
    await withTempGraph(
      {
        domain: {
          title: "Domain",
          summary: "Domain summary",
          children: {
            policy: { title: "Policy", summary: "Policy summary", children: {} },
          },
        },
      },
      async (graphPath) => {
        await expect(
          anchorConcept({
            graphPath,
            conceptPath: "domain.policy",
            loc: { file: "src/policy.ts", start_line: 1, end_line: 2 },
            explorationCoverage: 0.6,
          }),
        ).rejects.toThrow("Anchors are only supported for root concepts: domain.policy")
      },
    )
  })
})
