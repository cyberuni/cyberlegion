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
				{
					label: 'Skills',
					items: [
						{ label: 'Overview', link: '/skills/' },
						{ label: 'legate', link: '/skills/legate/' },
						{ label: 'init-cyberlegion', link: '/skills/init-cyberlegion/' },
						{ label: 'manage-inbox', link: '/skills/manage-inbox/' },
					],
				},
				{
					label: 'CLI Reference',
					items: [
						{ label: 'Overview', link: '/cli/' },
						{ label: 'unit', link: '/cli/unit/' },
						{ label: 'mail', link: '/cli/mail/' },
						{ label: 'agent', link: '/cli/agent/' },
						{ label: 'mux', link: '/cli/mux/' },
						{ label: 'attach', link: '/cli/attach/' },
						{ label: 'init', link: '/cli/init/' },
						{ label: 'admin', link: '/cli/admin/' },
					],
				},
				{
					label: 'Reference',
					items: [{ label: 'Glossary', link: '/reference/glossary/' }],
				},
			],
			editLink: {
				baseUrl: 'https://github.com/cyberuni/cyberlegion/edit/main/apps/web/',
			},
		}),
	],
})
