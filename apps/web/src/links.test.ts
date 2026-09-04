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

/**
 * Every site-absolute link a page authors — both markdown body links and the
 * `link:` targets of splash-hero actions, which Starlight emits verbatim.
 */
function siteLinks(source: string): string[] {
	const body = [...source.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1])
	const hero = [...source.matchAll(/^\s*link:\s*(\/\S+)\s*$/gm)].map((m) => m[1])
	return [...body, ...hero]
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

/** Starlight slugs headings with github-slugger: lowercase, drop punctuation, spaces to hyphens. */
function slug(heading: string): string {
	return heading
		.trim()
		.toLowerCase()
		.replace(/[^\w\- ]+/g, '')
		.replace(/ +/g, '-')
}

/** The anchors a page publishes: one per markdown heading, ignoring fenced code. */
function headingAnchors(source: string): Set<string> {
	const anchors = new Set<string>()
	let fenced = false
	for (const line of source.split('\n')) {
		if (line.trimStart().startsWith('```')) {
			fenced = !fenced
			continue
		}
		if (fenced) continue
		const heading = line.match(/^#{2,6} +(.+?) *$/)
		if (heading) anchors.add(slug(heading[1].replace(/[*`_]/g, '')))
	}
	return anchors
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

	it('every link with an anchor points at a heading that exists', async () => {
		const prefix = `${await base()}/`
		const anchors = new Map<string, Set<string>>()
		for (const page of await docPages()) {
			const slugPath = page
				.slice(docsRoot.length + 1)
				.replace(/\.mdx?$/, '')
				.replace(/(^|\/)index$/, '')
			const route = slugPath ? `${prefix}${slugPath}/` : prefix
			anchors.set(route, headingAnchors(await readFile(page, 'utf8')))
		}

		const dangling: string[] = []
		for (const page of await docPages()) {
			for (const link of siteLinks(await readFile(page, 'utf8'))) {
				const [route, anchor] = link.split('#')
				if (!anchor) continue
				if (!anchors.get(route)?.has(anchor)) {
					dangling.push(`${page.slice(docsRoot.length + 1)} -> ${link}`)
				}
			}
		}

		expect(dangling).toEqual([])
	})
})
