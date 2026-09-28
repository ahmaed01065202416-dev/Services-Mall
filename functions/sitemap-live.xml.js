// functions/sitemap-live.xml.js — Cloudflare Pages Function
// Serves the dynamic sitemap DIRECTLY at /sitemap-live.xml.
// (The old _redirects rule "/sitemap-live.xml /api/sitemap-dynamic 200" returned 404 on Pages.)
export { onRequest } from './api/sitemap-dynamic.js';
