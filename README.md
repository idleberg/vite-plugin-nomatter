# vite-plugin-nomatter

[![License](https://img.shields.io/github/license/idleberg/vite-plugin-nomatter?color=blue&style=for-the-badge)](https://github.com/idleberg/vite-plugin-nomatter/blob/main/LICENSE)
[![Version: npm](https://img.shields.io/npm/v/@idleberg/vite-plugin-nomatter?style=for-the-badge)](https://www.npmjs.org/package/@idleberg/vite-plugin-nomatter)
![GitHub branch check runs](https://img.shields.io/github/check-runs/idleberg/vite-plugin-nomatter/main?style=for-the-badge)

A Vite plugin that lets you write pure Markdown without frontmatter. It derives
the `title` (and optional `description`) from the document's own content at
build time.

Works great with [Astro Starlight](https://starlight.astro.build/)
but is not tied to it.

## Installation 💿

```bash
pnpm add -D vite-plugin-nomatter
```

## Usage 🚀

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import nomatter from 'vite-plugin-nomatter'

export default defineConfig({
	vite: {
		plugins: [
			nomatter({
				// default options
				extensions: ['.md', '.markdown'],
				contentDir: 'src/content/docs',
				descriptionLength: 150,
				stripHeading: true,
			})
		]
	},
	integrations: [
		starlight({ title: 'My Docs' })
	]
})
```

### API ⚙️

`nomatter(options?)`

### Options

| Option              | Type       | Default               | Description                                              |
|---------------------|------------|-----------------------|----------------------------------------------------------|
| `extensions`        | `string[]` | `['.md', '.markdown']`| File extensions to process                               |
| `contentDir`        | `string`   | `'src/content/docs'`  | Only files under this path segment are processed         |
| `descriptionLength` | `number`   | `160`                 | Maximum character length for the extracted description   |
| `stripHeading`      | `boolean`  | `true`                | Remove the h1 from the body after extracting the title   |

## License ©️

This work is licensed under [The MIT License](LICENSE).
