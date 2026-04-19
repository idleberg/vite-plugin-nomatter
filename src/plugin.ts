import type { Blockquote, Heading, Paragraph, Root } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Plugin } from 'vite';

export interface NomatterOptions {
	/** File extensions to process. Default: ['.md', '.markdown'] */
	extensions?: string[];

	/** Only process files under this path segment. Default: 'src/content/docs' */
	contentDir?: string;

	/** Max characters for the extracted description. Default: 160 */
	descriptionLength?: number;

	/** Remove the h1 from the body after extracting it as the title. Default: true */
	stripHeading?: boolean;

	// Custom frontmatter properties to add to the extracted metadata object. Values can be static or dynamically derived from the content AST via a function.
	meta?: Record<string, unknown>;
}

export default function nomatter(options: NomatterOptions = {}): Plugin {
	const {
		//
		extensions = ['.md', '.markdown'],

		// Astro Starlight's default content directory is 'src/content/docs', so we'll use that as the default filter.
		contentDir = 'src/content/docs',

		// Google typically truncates search result snippets around 155–160 characters, so this seemed like a reasonable default max length for description metadata.
		descriptionLength = 160,

		stripHeading = true,
		meta = {},
	} = options;

	// Processor is stateless and can safely be reused across all transform calls
	const processor = unified().use(remarkParse);

	return {
		name: 'vite-plugin-nomatter',

		transform(code: string, id: string) {
			if (!extensions.some((e) => id.endsWith(e))) return null;
			if (!id.includes(contentDir)) return null;

			// Files with existing frontmatter are left completely alone.
			// This plugin is only meant for frontmatter-free files.
			if (code.startsWith('---')) return null;

			const tree = processor.parse(code) as Root;

			const h1 = tree.children.find((n): n is Heading => n.type === 'heading' && n.depth === 1);

			// No h1 found — bail out and let Starlight surface its own
			// "title is required" validation error, which is more informative
			// than anything we could say here.
			if (!h1) return null;

			const title = mdastToString(h1, { includeImageAlt: false }).trim();
			if (!title) return null;

			const description = extractDescription(tree, descriptionLength);

			const fm = [
				...Object.entries(meta).map(([key, value]) => {
					const val = typeof value === 'function' ? value(tree) : value;

					return `${key}: ${toYamlValue(val)}`;
				}),
				`title: "${escapeYaml(title)}"`,
			];

			if (description) fm.push(`description: "${escapeYaml(description)}"`);

			let body = code;

			if (stripHeading) {
				// Use AST position offsets to strip the h1 from the body.
				// Useful when the consumer (e.g. Starlight) renders the frontmatter
				// title as its own <h1>, which would otherwise produce a duplicate.
				const h1Start = h1.position!.start.offset!;
				const h1End = h1.position!.end.offset!;

				body = (code.slice(0, h1Start) + code.slice(h1End)).trim();
			}

			return `---\n${fm.join('\n')}\n---\n\n${body}\n`;
		},
	};
}

function extractDescription(tree: Root, maxLen: number): string | null {
	for (const node of tree.children) {
		if (node.type !== 'paragraph' && node.type !== 'blockquote') continue;

		// For blockquotes, extract text from their paragraph children.
		// Many READMEs use a blockquote as a one-line tagline.
		const paras: Paragraph[] =
			node.type === 'blockquote'
				? (node as Blockquote).children.filter((c): c is Paragraph => c.type === 'paragraph')
				: [node as Paragraph];

		for (const para of paras) {
			// Skip image-only paragraphs — a standalone ![alt](url) on its own line
			// becomes a paragraph node in mdast whose only children are image nodes.
			// These are effectively figure captions and should not be used as descriptions.
			if (para.children.every((c) => c.type === 'image' || c.type === 'imageReference')) {
				continue;
			}

			// Image alt text is deliberately excluded from descriptions — it is written
			// for screen readers and carries visual context, not document summary intent.
			const text = mdastToString(para, { includeImageAlt: false }).replace(/\s+/g, ' ').trim();

			if (!text) continue;

			if (text.length <= maxLen) return text;

			// Truncate at the last word boundary within the character limit
			return `${text.slice(0, text.lastIndexOf(' ', maxLen))}…`;
		}
	}

	return null;
}

/** Escapes backslashes and double quotes for YAML double-quoted scalar strings */
function escapeYaml(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Serializes a value as a YAML scalar, quoting only strings */
function toYamlValue(value: unknown): string {
	if (typeof value === 'boolean' || typeof value === 'number') return String(value);
	if (value == null) return 'null';
	return `"${escapeYaml(String(value))}"`;
}
