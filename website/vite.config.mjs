import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname);
const pages = ['index', 'login', 'admin', 'session', 'feedback', 'payment', 'wallet'];
const staticScripts = ['script.js', '.admin-inline-check.js'];
const defaultApiBase = 'https://side-quest-backend.onrender.com';

function buildConfigSource() {
  const apiBase = process.env.VITE_API_BASE || defaultApiBase;
  return `const CONFIG = {
    API_BASE: (() => {
        const configuredApiBase = ${JSON.stringify(apiBase)};
        const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        if (isLocal) return "http://localhost:3000";
        if (configuredApiBase) return configuredApiBase.replace(/\\/$/, "");
        return ${JSON.stringify(defaultApiBase)};
    })(),
    PS5_RATE: 150,
    POOL_RATE: 200,
    PS5_CAPACITY: 8,
    POOL_CAPACITY: 4
};

window.CONFIG = CONFIG;
`;
}

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
        this.emitFile({
          type: 'asset',
          fileName: 'config.js',
          source: buildConfigSource(),
        });

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
