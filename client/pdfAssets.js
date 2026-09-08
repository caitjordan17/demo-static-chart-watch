import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PDF.js loads these by filename. Serve/bundle locally, including offline fonts
// and image decoders, rather than fetching document resources from a CDN.
export function pdfAssets() {
  const assets = new Map();
  for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
    const base = new URL(`./node_modules/pdfjs-dist/${directory}/`, import.meta.url);
    for (const file of readdirSync(base)) {
      assets.set(`pdfjs/${directory}/${file}`, readFileSync(fileURLToPath(new URL(file, base))));
    }
  }
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].replace(/^\//, '');
        const data = assets.get(name);
        if (!data) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(data);
      });
    },
    generateBundle() {
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
