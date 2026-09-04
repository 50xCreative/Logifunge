// Cloudflare Pages Function: GET /interpreter?v=N
// Dynamically serves the interpreter source for the requested version,
// so versioned pages (v1..v6) and the latest build can all load their
// matching engine from one route instead of needing a copy baked into
// each /vN/ folder at deploy time.
//
// Mapping:
//   /interpreter            -> latest interpreter (pack/unpack variant)
//   /interpreter?v=latest   -> same as above
//   /interpreter?v=1..6     -> interpreters/interpreter_vN.js
//
// The actual JS files are deployed as normal static assets under
// /interpreters/*.js. This function just resolves the version alias,
// fetches the right static file via the Pages ASSETS binding, and
// returns it with JS content-type + long-lived caching (the version
// is part of the mapping, so old cached copies are never wrong).

const VALID_VERSIONS = new Set(['1', '2', '3', '4', '5', '6']);

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const vParam = (url.searchParams.get('v') || 'latest').toLowerCase();

  const version = vParam === 'latest' ? 'latest'
    : VALID_VERSIONS.has(vParam) ? vParam
    : null;

  if (!version) {
    return new Response('// Unknown interpreter version requested', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const assetUrl = new URL(`/interpreters/interpreter_${version}.js`, url.origin);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));

  if (!assetResponse.ok) {
    return new Response('// Interpreter source not found', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const body = await assetResponse.text();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
