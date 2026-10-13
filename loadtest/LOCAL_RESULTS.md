# Local concurrency smoke test

**Executed:** 2026-10-14 (sandbox)  
**Command:** `npm run load:local`  
**Environment:** Node 20, Express API, MongoMemoryServer in the same sandbox; 150 synthetic students; one isolated quiz with five synthetic questions. This measures this local test setup only, not MongoDB Atlas or production networking.

| Measure | Observed |
|---|---:|
| Concurrent virtual students | 150 |
| Completed student flows | 150 / 150 |
| Request errors | 0 |
| Total wall time | 4,117.95 ms |
| Student entry p50 / p95 / max | 2,000.25 / 3,611.51 / 3,740.86 ms |
| Load current quiz p50 / p95 / max | 123.61 / 179.02 / 3,749.97 ms |
| Start attempt p50 / p95 / max | 144.84 / 200.08 / 219.83 ms |
| Save answer p50 / p95 / max | 122.11 / 163.23 / 183.22 ms |
| Submit attempt p50 / p95 / max | 193.57 / 258.27 / 336.45 ms |

The outlier request times under a 150-user in-memory test are visible above; this is not a production capacity guarantee. Run the provided k6 flow against a properly sized isolated staging environment before using the app for a high-stakes event.
