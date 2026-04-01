import { createApp } from '../src/index.js';

const ITERATIONS = 2000;

async function bench(name, fn) {
  // Warm up
  for (let i = 0; i < 50; i++) await fn();

  const times = [];
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  const total = performance.now() - start;

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const rps = Math.round(ITERATIONS / (total / 1000));

  // eslint-disable-next-line no-console
  console.log(
    `  ${name.padEnd(30)} ${rps.toString().padStart(6)} req/s | ` +
    `p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms`,
  );
}

async function main() {
  const app = createApp();

  // Plain text
  app.get('/text', (ctx) => ctx.send('Hello World'));

  // JSON
  app.get('/json', (ctx) => ctx.send({ hello: 'world', items: [1, 2, 3] }));

  // Route params
  app.get('/users/:id', (ctx) => ctx.send({ id: ctx.params.id }));

  // 10-deep middleware chain
  for (let i = 0; i < 10; i++) {
    app.use(async (_ctx, next) => { await next(); });
  }
  app.get('/mw', (ctx) => ctx.send('ok'));

  // Body parsing
  app.post('/echo', (ctx) => ctx.send(ctx.body));

  const { port } = await app.listen({ port: 0, requestTimeout: 0 });
  const base = `http://127.0.0.1:${port}`;

  // eslint-disable-next-line no-console
  console.log(`\nAxon Benchmark (${ITERATIONS} iterations each)\n`);

  await bench('Plain text response', () => fetch(`${base}/text`).then((r) => r.text()));

  await bench('JSON response', () => fetch(`${base}/json`).then((r) => r.json()));

  await bench('Route params', () => fetch(`${base}/users/42`).then((r) => r.json()));

  await bench('Middleware chain (10 deep)', () => fetch(`${base}/mw`).then((r) => r.text()));

  await bench('Body parsing (POST JSON)', () =>
    fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"bench"}',
    }).then((r) => r.json()),
  );

  await app.close();

  // eslint-disable-next-line no-console
  console.log('');
}

main();
