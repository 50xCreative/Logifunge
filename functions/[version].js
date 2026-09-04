// Cloudflare Pages Function: matches any single top-level path segment,
// e.g. GET /v1, /v2, ... /v6 — and passes through to static assets /
// 404 for anything else (this file only intercepts segments matching
// the vN pattern; everything else is left to Pages' normal static
// asset resolution).
//
// Serves ONE shared run.html (the current v6 UI) for every version,
// swapping in only what varies per version: the interpreter engine
// (/interpreter?v=N), examples.js, the docs link, and canonical URL.
// This replaces six near-duplicate index.html files with one template.

import { RUN_HTML_TEMPLATE } from './_run-template.js';

const VERSION_PATTERN = /^v([1-6])$/i;

export async function onRequestGet(context) {
  const { params } = context;
  const segment = String(params.version || '');
  const match = segment.match(VERSION_PATTERN);

  if (!match) {
    // Not a /vN route — let Pages fall through to static assets (this
    // return only happens if Pages still invokes us for the path; in
    // practice more specific static files/routes win automatically).
    return context.next();
  }

  const num = match[1];
  const versionSlug = `v${num}`;

  const html = RUN_HTML_TEMPLATE
    .replaceAll('__VERSION_NUM__', num)
    .replaceAll('__VERSION__', versionSlug);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
