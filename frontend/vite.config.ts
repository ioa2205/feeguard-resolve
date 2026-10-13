import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

import { PREVIEW_LANGS, PREVIEWS, previewTags } from './src/landing/previews'

// The public address the link previews point to. Set SITE_URL when the demo moves.
declare const process: { env: Record<string, string | undefined> }
const SITE = (process.env.SITE_URL ?? 'https://freeguard.up.railway.app').replace(/\/$/, '')
const BLOCK = /<!-- preview -->[\s\S]*?<!-- \/preview -->/
type Lang = (typeof PREVIEW_LANGS)[number]
const withPreview = (html: string, lang: Lang) => html
  .replace(BLOCK, `<!-- preview -->\n    ${previewTags(lang, SITE)}\n    <!-- /preview -->`)
  .replace(/<html lang="[^"]*">/, `<html lang="${PREVIEWS[lang].htmlLang}">`)

/** Link previews in the page's language (V2_PLAN W2): index.html carries the Uzbek ones, and the
 * build adds uz.html, ru.html and en.html, which the web server gives to /uz, /ru and /en. */
function landingPreviews(): Plugin {
  return {
    name: 'landing-previews',
    enforce: 'post',
    transformIndexHtml: (html) => withPreview(html, 'uz'),
    generateBundle(_, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') return
      for (const lang of PREVIEW_LANGS) {
        this.emitFile({ type: 'asset', fileName: `${lang}.html`, source: withPreview(String(index.source), lang) })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), landingPreviews()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' },
  },
})
