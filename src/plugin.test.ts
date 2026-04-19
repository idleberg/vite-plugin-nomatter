import { describe, expect, it } from 'vitest';
import nomatter from './plugin.ts';

/** Helper: call the plugin's transform hook with a default content-dir path */
function transform(code: string, id = 'src/content/docs/guide.md', options = {}) {
	const plugin = nomatter(options) as any;
	return plugin.transform(code, id);
}

// ---------------------------------------------------------------------------
// File filtering
// ---------------------------------------------------------------------------
describe('file filtering', () => {
	it('ignores non-markdown files', () => {
		expect(transform('# Hello', 'src/content/docs/page.html')).toBeNull();
	});

	it('ignores files outside the content directory', () => {
		expect(transform('# Hello', 'src/other/page.md')).toBeNull();
	});

	it('processes .markdown extension', () => {
		expect(transform('# Hello', 'src/content/docs/page.markdown')).not.toBeNull();
	});

	it('ignores files that already have frontmatter', () => {
		expect(transform('---\ntitle: Existing\n---\n# Hello')).toBeNull();
	});

	it('respects custom extensions option', () => {
		const opts = { extensions: ['.mdx'] };
		expect(transform('# Hello', 'src/content/docs/page.mdx', opts)).not.toBeNull();
		expect(transform('# Hello', 'src/content/docs/page.md', opts)).toBeNull();
	});

	it('respects custom contentDir option', () => {
		const opts = { contentDir: 'docs' };
		expect(transform('# Hello', 'docs/page.md', opts)).not.toBeNull();
		expect(transform('# Hello', 'src/content/docs/page.md', opts)).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------
describe('title extraction', () => {
	it('extracts a plain h1 as the title', () => {
		const result = transform('# Hello World\n\nSome text.');
		expect(result).toContain('title: "Hello World"');
	});

	it('returns null when there is no h1', () => {
		expect(transform('## Only h2\n\nSome text.')).toBeNull();
	});

	it('strips inline formatting from the title', () => {
		const result = transform('# Hello **bold** and *italic*\n\nBody.');
		expect(result).toContain('title: "Hello bold and italic"');
	});

	it('excludes image alt text from the title', () => {
		const result = transform('# Title ![logo](logo.png) rest\n\nBody.');
		expect(result).toContain('title: "Title  rest"');
	});

	it('escapes double quotes in the title', () => {
		const result = transform('# A "quoted" title\n\nBody.');
		expect(result).toContain('title: "A \\"quoted\\" title"');
	});

	it('escapes backslashes in the title', () => {
		const result = transform('# Path C:\\Users\n\nBody.');
		expect(result).toContain('title: "Path C:\\\\Users"');
	});
});

// ---------------------------------------------------------------------------
// H1 removal
// ---------------------------------------------------------------------------
describe('h1 removal', () => {
	it('strips the h1 from the body to avoid duplicate headings', () => {
		const result = transform('# Title\n\nBody paragraph.');
		expect(result).toContain('Body paragraph.');
		// The title should only appear in the frontmatter, not as a heading in the body
		expect(result).not.toMatch(/^# Title$/m);
	});

	it('preserves content before the h1', () => {
		const result = transform('Some preamble.\n\n# Title\n\nBody.');
		expect(result).toContain('Some preamble.');
		expect(result).toContain('Body.');
	});
});

// ---------------------------------------------------------------------------
// Description extraction — paragraphs
// ---------------------------------------------------------------------------
describe('description from paragraphs', () => {
	it('extracts the first paragraph as description', () => {
		const result = transform('# Title\n\nThis is the first paragraph.\n\nSecond paragraph.');
		expect(result).toContain('description: "This is the first paragraph."');
	});

	it('skips image-only paragraphs', () => {
		const result = transform('# Title\n\n![alt](img.png)\n\nActual description.');
		expect(result).toContain('description: "Actual description."');
	});

	it('skips image-reference-only paragraphs', () => {
		const md = '# Title\n\n![alt][ref]\n\nActual description.\n\n[ref]: img.png';
		const result = transform(md);
		expect(result).toContain('description: "Actual description."');
	});

	it('excludes image alt text from the description', () => {
		const result = transform('# Title\n\nSome text ![logo](logo.png) more text.');
		expect(result).toContain('description: "Some text more text."');
	});

	it('collapses whitespace in the description', () => {
		const result = transform('# Title\n\nHello   world\n   foo.');
		expect(result).toContain('description: "Hello world foo."');
	});

	it('omits description when no qualifying paragraph exists', () => {
		const result = transform('# Title\n\n![only](img.png)');
		expect(result).not.toContain('description:');
	});
});

// ---------------------------------------------------------------------------
// Description extraction — blockquotes
// ---------------------------------------------------------------------------
describe('description from blockquotes', () => {
	it('extracts a blockquote tagline as description', () => {
		const result = transform('# My Tool\n\n> A blazing fast widget compiler.\n\nMore text.');
		expect(result).toContain('description: "A blazing fast widget compiler."');
	});

	it('prefers the first qualifying node (paragraph before blockquote)', () => {
		const result = transform('# Title\n\nFirst paragraph.\n\n> Blockquote tagline.');
		expect(result).toContain('description: "First paragraph."');
	});

	it('falls through to blockquote when paragraph is image-only', () => {
		const result = transform('# Title\n\n![badge](badge.svg)\n\n> The real tagline.');
		expect(result).toContain('description: "The real tagline."');
	});

	it('skips image-only paragraphs inside blockquotes', () => {
		const md = '# Title\n\n> ![badge](badge.svg)\n> \n> Actual tagline.\n\nBody.';
		const result = transform(md);
		expect(result).toContain('description: "Actual tagline."');
	});
});

// ---------------------------------------------------------------------------
// Description truncation
// ---------------------------------------------------------------------------
describe('description truncation', () => {
	it('truncates at the last word boundary with an ellipsis', () => {
		const long = 'word '.repeat(40).trim(); // 199 chars
		const result = transform(`# Title\n\n${long}`);
		const match = result.match(/description: "(.*)"/);
		expect(match).not.toBeNull();
		const desc = match![1];
		expect(desc.endsWith('…')).toBe(true);
		expect(desc.length).toBeLessThanOrEqual(161); // 160 + ellipsis char
	});

	it('does not truncate text within the limit', () => {
		const short = 'Short description.';
		const result = transform(`# Title\n\n${short}`);
		expect(result).toContain(`description: "${short}"`);
	});

	it('respects custom descriptionLength', () => {
		const text = 'Hello world this is a test sentence for truncation.';
		const result = transform(`# Title\n\n${text}`, undefined, { descriptionLength: 20 });
		const match = result.match(/description: "(.*)"/);
		const desc = match![1];
		expect(desc.endsWith('…')).toBe(true);
		expect(desc.length).toBeLessThanOrEqual(21);
	});
});

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------
describe('output format', () => {
	it('produces valid frontmatter delimiters', () => {
		const result = transform('# Title\n\nBody.');
		expect(result).toMatch(/^---\n/);
		expect(result).toMatch(/\n---\n/);
	});

	it('ends with a trailing newline', () => {
		const result = transform('# Title\n\nBody.');
		expect(result.endsWith('\n')).toBe(true);
	});

	it('includes both title and description when available', () => {
		const result = transform('# Title\n\nDescription paragraph.');
		expect(result).toContain('title: "Title"');
		expect(result).toContain('description: "Description paragraph."');
	});

	it('includes only title when no description is available', () => {
		const result = transform('# Title');
		expect(result).toContain('title: "Title"');
		expect(result).not.toContain('description:');
	});
});

// ---------------------------------------------------------------------------
// Custom frontmatter
// ---------------------------------------------------------------------------
describe('custom frontmatter', () => {
	it('adds static string frontmatter fields', () => {
		const result = transform('# Title\n\nBody.', undefined, { frontmatter: { author: 'Jan' } });
		expect(result).toContain('author: "Jan"');
	});

	it('adds boolean frontmatter fields unquoted', () => {
		const result = transform('# Title\n\nBody.', undefined, { frontmatter: { draft: true } });
		expect(result).toContain('draft: true');
	});

	it('adds numeric frontmatter fields unquoted', () => {
		const result = transform('# Title\n\nBody.', undefined, { frontmatter: { order: 3 } });
		expect(result).toContain('order: 3');
	});

	it('serializes null frontmatter fields', () => {
		const result = transform('# Title\n\nBody.', undefined, { frontmatter: { banner: null } });
		expect(result).toContain('banner: null');
	});

	it('supports function values that receive the AST', () => {
		const result = transform('# Title\n\nBody.', undefined, {
			frontmatter: { hasContent: (tree: any) => tree.children.length > 1 },
		});
		expect(result).toContain('hasContent: true');
	});

	it('places custom fields before title in frontmatter', () => {
		const result = transform('# Title\n\nBody.', undefined, { frontmatter: { draft: false } });
		const draftIndex = result.indexOf('draft:');
		const titleIndex = result.indexOf('title:');
		expect(draftIndex).toBeLessThan(titleIndex);
	});
});
