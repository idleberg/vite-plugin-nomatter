# vite-plugin-nomatter — FAQ

This document explains the reasoning behind key design decisions so future contributors
can work on the plugin without having to reconstruct the context from scratch.

---

## Problem statement

Astro Starlight requires every Markdown page to have a `title` field in its YAML
frontmatter. This is a hard schema validation — the build fails without it. The plugin
author's goal is to write pure Markdown without any frontmatter (separation of concerns),
using the document's own `# Heading` as the canonical title.

---

## Why a Vite plugin, not a remark plugin

The intuitive place to inject derived frontmatter would be a remark plugin, since remark
is what Astro uses to process Markdown. However, in Astro 5's Content Layer API (which
Starlight requires), the pipeline is:

    Loader reads .md → YAML frontmatter extracted → Zod schema validates → remark runs

Schema validation happens *before* remark plugins run. Since `title` is a required
`z.string()` in Starlight's schema, any file without a frontmatter `title` is rejected
before remark ever gets a chance to supply one.

A Vite `transform` hook fires *before* Astro's content pipeline, at the raw module
level. By the time Astro sees the file, the plugin has already prepended the synthesized
frontmatter block. From Astro's perspective, the file always had frontmatter.

Starlight's route middleware (`defineRouteMiddleware`) was also considered but rejected
for the same reason — it runs after the content layer, too late to affect validation.

---

## Why .mdx is not supported by default

Supporting `.mdx` would require adding `remark-mdx` to the processor so that JSX syntax
doesn't cause parse errors. That is straightforward technically, but it creates a deeper
problem: once a file has MDX JSX at the top level (e.g. `import` statements, `<Component />`
blocks), reliable frontmatter-free authoring becomes ambiguous. The current design
intentionally supports only plain Markdown (`.md`, `.markdown`) out of the box.

Users who want MDX support can pass `extensions: ['.md', '.markdown', '.mdx']` and add
`remark-mdx` to the processor themselves, at their own risk.

---

## Why frontmatter parsing is omitted

An earlier design parsed existing frontmatter with `remark-frontmatter` + `js-yaml` to
support merging (e.g. a file with `draft: true` but no `title`). This was removed because:

1. It introduces additional dependencies (`js-yaml`).
2. The merge logic adds complexity with subtle edge cases (TOML vs YAML, multi-doc
   YAML, etc.).
3. The plugin's stated purpose is to serve files with *no* frontmatter. Files that
   already have a `---` block are skipped entirely via the `code.startsWith('---')`
   guard. If a user wants both a `draft` flag and no `title`, that is an unsupported
   combination and the build will correctly fail with Starlight's schema error.

If merge support is added in the future, use `remark-frontmatter` for parsing and
`js-yaml` for serializing. Do not use regex on the raw YAML string.

---

## Why the AST is used for description extraction (not regex)

Markdown's surface syntax makes paragraph detection deceptively simple at first glance
(`/^[^#>-`].+$/m`), but the parser knows things regex does not:

- A standalone `![alt](url)` on its own line becomes a `paragraph` node in mdast,
  but its only child is an `image` node — it is a figure caption, not prose.
- Blockquotes, list items, code blocks, and thematic breaks all live at the root
  level of the document tree and are correctly excluded by checking `node.type`.
- Tight lists produce paragraph nodes *inside* list items, which are not top-level
  and are therefore naturally excluded.

Using the same parser Astro uses (`unified` + `remark-parse`) means the plugin's
understanding of the document structure is identical to Astro's. No divergence is
possible.

---

## Why `includeImageAlt: false` is hardcoded

`mdast-util-to-string` has an `includeImageAlt` option (default: `true`) that includes
image `alt` attributes in the text output. Alt text is written for screen readers and
carries visual-context intent, not document-summary intent. It must never appear in a
page's `<meta name="description">`. The option is hardcoded to `false` throughout the
plugin and is not surfaced to users.

Note: this option also has a secondary effect — paragraphs whose only content is an
image will return an empty string from `toString`, which the `if (!text) continue` guard
catches. The explicit `every(c => c.type === 'image')` check above it is redundant but
retained as a clear statement of intent.

---

## Why the h1 is stripped from the body

Starlight renders the `title` from frontmatter as its own `<h1>` element at the top of
the page. If the source `# Heading` is left in the Markdown body, the rendered page
will contain two `<h1>` elements — one from Starlight's template and one from the
Markdown content. This is both an accessibility failure (only one `<h1>` per page) and
visually wrong.

The h1 is removed using the AST's position offset data (`node.position.start.offset`,
`node.position.end.offset`), which gives character-level precision. String replacement
or line-based removal would be fragile in edge cases (e.g. a heading with trailing
whitespace, Windows-style CRLF line endings, or a heading followed immediately by
a setext-style underline).

---

## The `processor` singleton

The `unified` processor instance is created once outside the `transform` function, not
inside it. `remarkParse` is stateless — it does not accumulate state between calls —
so the same instance is safe to reuse. Creating a new processor on every `transform`
call would add unnecessary object allocation overhead at scale.

---

## The `escapeYaml` helper

Titles extracted from headings may contain characters that would break inline YAML
double-quoted scalar syntax, specifically `"` and `\`. The helper escapes only these
two characters, which is correct and sufficient for double-quoted YAML scalars. It does
not attempt to be a general YAML serializer.

If the scope of injected fields grows (e.g. adding `author`, `tags`, or other
structured data), replace the hand-rolled YAML string building with `js-yaml`'s `dump()`
function to avoid this class of bug entirely.

---

## What is intentionally not done

- **Sidecar files (`.meta.json`, `.meta.yaml`)**: An alternative design discussed
  during inception. The Vite-plugin approach was chosen over sidecars because it
  requires no additional file format convention and works transparently with any
  Markdown tooling. Sidecar support could be added as a complementary feature.

- **Description truncation at sentence boundaries**: The current implementation
  truncates at the last word boundary before `descriptionLength`. Truncating at a
  sentence boundary would be more readable but requires a sentence tokenizer, which
  is a heavy dependency for marginal gain. The truncation produces correct output
  for the `<meta name="description">` use case regardless.

- **HMR invalidation for config changes**: If the user changes `descriptionLength`
  in `astro.config.mjs`, Vite will restart and all modules will be re-transformed.
  No special HMR handling is needed.
