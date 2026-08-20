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
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', link: '/getting-started/introduction/' },
						{ label: 'Installation', link: '/getting-started/installation/' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'The Spine', link: '/concepts/spine/' },
						{ label: 'Architecture', link: '/concepts/architecture/' },
						{ label: 'Mail Model', link: '/concepts/mail-model/' },
					],
				},
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cyberlegion/edit/main/apps/web/',
			},
		}),
	],
})
