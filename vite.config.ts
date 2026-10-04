import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite'
import { shouldCopyFrontendAsset } from './scripts/frontend-public-assets.ts';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/** Engine.io frontend uploads choke on the 600MB+ local math corpus; RGS serves books separately. */
function copyFrontendPublicAssets(): Plugin {
	let publicDirectory = '';
	let outputDirectory = '';
	let root = projectRoot;
	return {
		name: 'copy-frontend-public-assets',
		apply: 'build',
		configResolved(config) {
			root = config.root;
			publicDirectory = config.publicDir;
			outputDirectory = path.resolve(root, config.build.outDir);
		},
		async writeBundle(options) {
			if (!publicDirectory || !existsSync(publicDirectory)) return;
			await cp(publicDirectory, path.resolve(root, options.dir ?? outputDirectory), {
				recursive: true,
				// Match Vite's copier, which follows public asset symlinks.
				dereference: true,
				filter(source) {
					const relative = path.relative(publicDirectory, source).split(path.sep).join('/');
					// Returning false for the math directory prevents its traversal too.
					return shouldCopyFrontendAsset(relative);
				},
			});
		},
	};
}

export default defineConfig({
	plugins: [react(), tailwindcss(), copyFrontendPublicAssets()],
	base: './',
	build: {
		copyPublicDir: false,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes('/node_modules/@esotericsoftware/')) return 'spine';
					if (id.includes('/node_modules/@pixi/')) return 'pixi';
					if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react';
				}
			}
		}
	},
	server: {
		watch: {
			// Native pose proofs and outcome books are generated data, not modules.
			ignored: ['**/art-source/**', '**/work/**', '**/backups/**', '**/qa/**', '**/math/**', '**/public/alchemist/math/**', '**/.math-venv/**'],
		},
		proxy: {
			// Stake Engine RGS endpoints (https://stakeengine.github.io/math-sdk/rgs_docs/RGS/)
			'/wallet': 'http://127.0.0.1:5010',
			'/bet': 'http://127.0.0.1:5010'
		}
	},
	preview: {
		proxy: {
			'/wallet': 'http://127.0.0.1:5010',
			'/bet': 'http://127.0.0.1:5010'
		}
	},
	resolve: {
		alias: {
			'@': path.resolve(projectRoot, './src'),
			'@components': path.resolve(projectRoot, './src/components'),
			'@store': path.resolve(projectRoot, './src/store'),
			'@layout': path.resolve(projectRoot, './src/layout'),
			'@config': path.resolve(projectRoot, './src/config'),
			'@api': path.resolve(projectRoot, './src/api')
		}
	}
});
