import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname);
const pages = ['index', 'login', 'admin', 'session', 'feedback', 'payment', 'wallet'];
const staticScripts = ['config.js', 'script.js', '.admin-inline-check.js'];

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page, resolve(root, `${page}.html`)])
      ),
    },
  },
  plugins: [
    {
      name: 'copy-static-page-scripts',
      generateBundle() {
        for (const fileName of staticScripts) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(resolve(root, fileName), 'utf8'),
          });
        }
      },
    },
  ],
});
