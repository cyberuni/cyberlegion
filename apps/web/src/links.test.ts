import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const docsRoot = join(webRoot, 'src/content/docs')

async function docPages(): Promise<string[]> {
	const entries = await readdir(docsRoot, { recursive: true, withFileTypes: true })
	return entries.filter((e) => e.isFile() && /\.mdx?$/.test(e.name)).map((e) => join(e.parentPath, e.name))
}

async function base(): Promise<string> {
	const config = await readFile(join(webRoot, 'astro.config.mjs'), 'utf8')
	const found = config.match(/base:\s*'([^']+)'/)
	if (!found) throw new Error('astro.config.mjs declares no base')
	return found[1]
}

/** Every markdown link whose target is a site-absolute path. */
function siteLinks(source: string): string[] {
	return [...source.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1])
}

/** The route each doc page is published at, base-prefixed, e.g. `/cyberlegion/cli/unit/`. */
async function routes(prefix: string): Promise<Set<string>> {
	const published = new Set<string>()
	for (const page of await docPages()) {
		const slug = page
			.slice(docsRoot.length + 1)
			.replace(/\.mdx?$/, '')
			.replace(/(^|\/)index$/, '')
		published.add(slug ? `${prefix}${slug}/` : prefix)
	}
	return published
}

describe('authored links resolve under the deployed base', () => {
	it('every site-absolute link in the docs starts with the configured base', async () => {
		const prefix = `${await base()}/`
		const offenders: string[] = []

		for (const page of await docPages()) {
			for (const link of siteLinks(await readFile(page, 'utf8'))) {
				if (!link.startsWith(prefix)) {
					offenders.push(`${page.slice(docsRoot.length + 1)} -> ${link}`)
				}
			}
		}

		expect(offenders).toEqual([])
	})

	it('every site-absolute link points at a page that exists', async () => {
		const prefix = `${await base()}/`
		const published = await routes(prefix)
		const dangling: string[] = []

		for (const page of await docPages()) {
			for (const link of siteLinks(await readFile(page, 'utf8'))) {
				const route = link.split('#')[0]
				if (route.startsWith(prefix) && !published.has(route)) {
					dangling.push(`${page.slice(docsRoot.length + 1)} -> ${link}`)
				}
			}
		}

		expect(dangling).toEqual([])
	})
})
