import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

export default function () {
  const live = http.get(`${BASE}/health/live`);
  check(live, { 'live is 200': (r) => r.status === 200 });

  if (TOKEN) {
    const headers = { Authorization: `Bearer ${TOKEN}` };
    const resources = http.get(`${BASE}/api/v1/resources?limit=20`, { headers });
    check(resources, { 'resources 200': (r) => r.status === 200 });
    const jobs = http.get(`${BASE}/api/v1/jobs?limit=20`, { headers });
    check(jobs, { 'jobs 200': (r) => r.status === 200 });
  }
  sleep(1);
}
