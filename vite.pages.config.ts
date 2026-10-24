import { mergeConfig } from 'vite'
import base from './vite.config'

// Single-file build for GitHub Pages hosting of the production (Arc Mainnet)
// instance: inlines all JS chunks and assets into dist-pages/ so the site can
// be published as a handful of files.
export default mergeConfig(base as any, {
  base: '/milepay/',
  build: {
    outDir: 'dist-pages',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
