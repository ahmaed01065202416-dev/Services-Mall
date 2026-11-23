// k6 load test — run from YOUR machine (not from CI):   k6 run -e SITE=https://mall-services.pages.dev scripts/load-test.js
// Install k6: https://k6.io/docs/get-started/installation/    Start light (VUS=20), then raise: -e VUS=100, -e VUS=300.
// It only sends GET requests to PUBLIC pages/endpoints. Do NOT point it at payment/admin endpoints.
import http from 'k6/http';
import { check, sleep } from 'k6';

const SITE = __ENV.SITE || 'https://mall-services.pages.dev';
const VUS = Number(__ENV.VUS || 20);

export const options = {
  stages: [
    { duration: '30s', target: VUS },
    { duration: '2m', target: VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],        // < 2% errors
    http_req_duration: ['p(95)<1500'],     // 95% of requests under 1.5 s
  },
};

const PAGES = ['/', '/api/home-feed?section=services', '/api/home-feed?section=platform', '/api/services-list', '/api/home-stats', '/blog/', '/api/health'];

export default function () {
  const path = PAGES[Math.floor(Math.random() * PAGES.length)];
  const r = http.get(SITE + path, { tags: { name: path.split('?')[0] } });
  check(r, { 'status < 400 or 429': (x) => x.status < 400 || x.status === 429 });
  sleep(Math.random() * 2 + 0.5);
}
