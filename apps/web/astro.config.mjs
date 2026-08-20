import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/cyberlegion',
	integrations: [
		starlight({
			title: 'cyberlegion',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/cyberuni/cyberlegion',
				},
			],
			sidebar: [
				{ label: 'Overview', link: '/overview/' },
				{ label: 'CLI Architecture', link: '/architecture/' },
				{
					label: 'CLI',
					items: [{ autogenerate: { directory: 'cli' } }],
				},
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cyberlegion/edit/main/apps/web/',
			},
		}),
	],
})
