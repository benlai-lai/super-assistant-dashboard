import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createConnection } from 'node:net';
import test from 'node:test';
import { getSchemaVersion } from '../server/database.mjs';
import { startLocalReadonlyPilot } from '../server/local-readonly-pilot.mjs';

async function start(options = {}) {
  const pilot = await startLocalReadonlyPilot({ host: '127.0.0.1', port: 0, ...options });
  assert.match(pilot.url, /^http:\/\/127\.0\.0\.1:\d+\/pilot\/$/);
  return pilot;
}

async function withPilot(callback, options) {
  const pilot = await start(options);
  try {
    return await callback(pilot);
  } finally {
    await pilot.close();
  }
}

function originOf(pilot) {
  return new URL(pilot.url).origin;
}

function request(pilot, target, {
  method = 'GET', body, cookie, origin, headers = {},
} = {}) {
  const address = pilot.server.server.address();
  const payload = body === undefined ? null : JSON.stringify(body);
  const requestHeaders = { ...headers };
  if (origin !== null) requestHeaders.Origin = origin ?? originOf(pilot);
  if (cookie) requestHeaders.Cookie = cookie;
  if (payload !== null) {
    requestHeaders['Content-Type'] ??= 'application/json';
    requestHeaders['Content-Length'] ??= Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path: target,
      headers: requestHeaders,
      agent: false,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.setTimeout(2_500, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (payload !== null) req.end(payload);
    else req.end();
  });
}

function parseJson(response) {
  return JSON.parse(response.text);
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
}

async function login(pilot, { includeHeader = false } = {}) {
  const response = await request(pilot, '/api/session', {
    method: 'POST',
    body: { username: pilot.username, password: pilot.password },
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers['set-cookie']?.[0] ?? '';
  assert.match(setCookie, /^bk_dashboard_pilot_session=[a-f0-9]{64};/);
  const cookie = setCookie.split(';', 1)[0];
  return includeHeader ? { cookie, setCookie } : cookie;
}

function rawRequest(pilot, lines, body = '') {
  const { port } = pilot.server.server.address();
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const chunks = [];
    socket.setTimeout(2_500, () => socket.destroy(new Error('raw request timeout')));
    socket.on('connect', () => socket.end(`${lines.join('\r\n')}\r\n\r\n${body}`));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
    socket.on('error', reject);
  });
}

function rawStatus(raw) {
  const match = raw.match(/^HTTP\/1\.1 (\d{3}) /);
  assert.ok(match, `Missing HTTP response status: ${raw.slice(0, 80)}`);
  return Number(match[1]);
}

function snapshot(db) {
  return {
    customers: db.prepare('SELECT * FROM customers ORDER BY id').all(),
    inquiries: db.prepare('SELECT * FROM inquiries ORDER BY id').all(),
    items: db.prepare('SELECT * FROM inquiry_items ORDER BY id').all(),
  };
}

test('creates a validated in-memory migrations 1-3 database with the exact related seed', { timeout: 10_000 }, async () => {
  await withPilot(async (pilot) => {
    assert.equal(getSchemaVersion(pilot.db), '3');
    assert.deepEqual(
      pilot.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(({ version }) => version),
      [1, 2, 3],
    );
    assert.equal(pilot.db.prepare('PRAGMA database_list').all()[0].file, '');
    assert.equal(pilot.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.deepEqual(pilot.seed, {
      customers: 2,
      inquiries: 3,
      items: 3,
      migrations: pilot.seed.migrations,
    });
    assert.equal(pilot.seed.migrations.length, 3);
    assert.deepEqual(pilot.db.prepare('PRAGMA foreign_key_check').all(), []);
    const data = snapshot(pilot.db);
    assert.deepEqual(data.customers.map(({ id }) => id), ['pilot-customer-empty', 'pilot-customer-one']);
    assert.equal(data.inquiries.length, 3);
    assert.equal(data.items.length, 3);
    assert.ok(data.inquiries.every((inquiry) => data.customers.some((customer) => customer.id === inquiry.customer_id)));
    assert.ok(data.items.every((item) => data.inquiries.some((inquiry) => inquiry.id === item.inquiry_id)));
    assert.ok(data.customers.some((customer) => !data.inquiries.some((inquiry) => inquiry.customer_id === customer.id)));
    assert.ok(data.inquiries.some((inquiry) => !data.items.some((item) => item.inquiry_id === inquiry.id)));
  });
});

test('generates a fresh temporary viewer password for every pilot startup', { timeout: 10_000 }, async () => {
  const first = await start();
  const second = await start();
  try {
    assert.match(first.password, /^[A-Za-z0-9_-]{24}$/);
    assert.match(second.password, /^[A-Za-z0-9_-]{24}$/);
    assert.notEqual(first.password, second.password);
  } finally {
    await first.close();
    await second.close();
  }
});

test('serves only the three static pilot files with no-store browser defenses', { timeout: 10_000 }, async () => {
  await withPilot(async (pilot) => {
    const routes = [
      ['/pilot/', 'text/html'],
      ['/pilot/pilot.css', 'text/css'],
      ['/pilot/pilot.js', 'text/javascript'],
    ];
    for (const [target, contentType] of routes) {
      const get = await request(pilot, target);
      assert.equal(get.status, 200);
      assert.match(get.headers['content-type'], new RegExp(`^${contentType}`));
      assert.ok(get.text.length > 0);
      assert.doesNotMatch(get.text, new RegExp(pilot.password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assertSecurityHeaders(get);
      const head = await request(pilot, target, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(head.text, '');
      assertSecurityHeaders(head);
    }
    for (const target of ['/', '/pilot', '/pilot/index.html', '/app.js', '/server/schema.sql', '/package.json']) {
      assert.equal((await request(pilot, target)).status, 404, target);
    }
  });
});

test('rejects imprecise sources, duplicate sensitive headers, and abnormal request targets', { timeout: 10_000 }, async () => {
  await withPilot(async (pilot) => {
    const port = pilot.server.server.address().port;
    assert.equal((await request(pilot, '/pilot/', { headers: { Host: `localhost:${port}` } })).status, 403);
    assert.equal((await request(pilot, '/pilot/', { origin: 'null' })).status, 403);
    assert.equal((await request(pilot, '/pilot/', { origin: `http://localhost:${port}` })).status, 403);
    assert.equal((await request(pilot, '/pilot/', { origin: `${originOf(pilot)}.example` })).status, 403);
    assert.equal((await request(pilot, '/pilot/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await request(pilot, '/api/customers', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 401);
    assert.equal((await request(pilot, '/api/session', { method: 'POST', origin: null, body: {} })).status, 403);

    const host = `127.0.0.1:${port}`;
    const origin = originOf(pilot);
    const duplicateCases = [
      ['GET /api/session HTTP/1.1', `Host: ${host}`, `Origin: ${origin}`, `Origin: ${origin}`, 'Connection: close'],
      ['GET /api/session HTTP/1.1', `Host: ${host}`, 'Cookie: a=b', 'Cookie: c=d', 'Connection: close'],
      ['POST /api/session HTTP/1.1', `Host: ${host}`, `Origin: ${origin}`, 'Content-Type: application/json',
        'Content-Type: application/json', 'Content-Length: 2', 'Connection: close'],
    ];
    for (const lines of duplicateCases) {
      const status = rawStatus(await rawRequest(pilot, lines, lines[0].startsWith('POST') ? '{}' : ''));
      assert.ok([400, 403].includes(status), `${lines[1]} duplicate case returned ${status}`);
    }
    const malformedTargets = [
      `GET http://${host}/api/customers HTTP/1.1`,
      'GET //pilot/ HTTP/1.1',
      'GET /pilot/%2e%2e/package.json HTTP/1.1',
      'GET /pilot/%ZZ HTTP/1.1',
    ];
    for (const firstLine of malformedTargets) {
      assert.equal(rawStatus(await rawRequest(pilot, [firstLine, `Host: ${host}`, 'Connection: close'])), 400);
    }
  });
});

test('uses the independent viewer session cookie and revokes it on logout', { timeout: 10_000 }, async () => {
  await withPilot(async (pilot) => {
    const invalid = await request(pilot, '/api/session', {
      method: 'POST', body: { username: pilot.username, password: 'invalid-password-value' },
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(parseJson(invalid), { error: 'Invalid credentials' });

    const { cookie, setCookie } = await login(pilot, { includeHeader: true });
    assert.match(setCookie, /; Path=\/;/);
    assert.match(setCookie, /; HttpOnly;/);
    assert.match(setCookie, /; SameSite=Strict;/);
    assert.doesNotMatch(setCookie, /bk_dashboard_session=/);
    assert.equal((await request(pilot, '/api/session', { cookie: 'bk_dashboard_session=forged' })).status, 401);

    const current = await request(pilot, '/api/session', { cookie });
    assert.equal(current.status, 200);
    assert.deepEqual({ actorId: parseJson(current).actorId, role: parseJson(current).role }, {
      actorId: 'local-readonly-pilot-viewer', role: 'viewer',
    });
    assert.equal(typeof parseJson(current).expiresAt, 'number');
    const logout = await request(pilot, '/api/session', { method: 'DELETE', cookie });
    assert.equal(logout.status, 200);
    assert.deepEqual(parseJson(logout), { success: true });
    assert.match(logout.headers['set-cookie'][0], /^bk_dashboard_pilot_session=;/);
    assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
    assert.equal((await request(pilot, '/api/session', { cookie })).status, 401);
    assert.equal(pilot.server.sessionStore.getCount(), 0);
  });
});

test('expires sessions and applies the inherited loopback login rate limit', { timeout: 15_000 }, async () => {
  await withPilot(async (pilot) => {
    const cookie = await login(pilot);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal((await request(pilot, '/api/session', { cookie })).status, 401);
    assert.equal(pilot.server.sessionStore.getCount(), 0);
  }, { sessionExpiry: 5 });

  await withPilot(async (pilot) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(pilot, '/api/session', {
        method: 'POST',
        headers: { 'X-Forwarded-For': `203.0.113.${attempt}` },
        body: { username: pilot.username, password: 'invalid-password-value' },
      });
      assert.equal(response.status, 401);
    }
    const limited = await request(pilot, '/api/session', {
      method: 'POST', body: { username: pilot.username, password: 'invalid-password-value' },
    });
    assert.equal(limited.status, 429);
  });
});

test('exposes exactly the five viewer business GET shapes with limits and relations intact', { timeout: 15_000 }, async () => {
  await withPilot(async (pilot) => {
    const cookie = await login(pilot);
    const customers = parseJson(await request(pilot, '/api/customers?limit=100', { cookie })).customers;
    const inquiries = parseJson(await request(pilot, '/api/inquiries?limit=100', { cookie })).inquiries;
    assert.equal(customers.length, 2);
    assert.equal(inquiries.length, 3);
    assert.equal(parseJson(await request(pilot, '/api/customers?limit=1', { cookie })).customers.length, 1);
    assert.equal(parseJson(await request(pilot, '/api/inquiries?limit=1', { cookie })).inquiries.length, 1);
    for (const route of ['/api/customers', '/api/inquiries']) {
      for (const value of ['0', '101']) {
        assert.equal((await request(pilot, `${route}?limit=${value}`, { cookie })).status, 400);
      }
      for (const value of ['-1', '1.5', 'x']) {
        assert.equal((await request(pilot, `${route}?limit=${value}`, { cookie })).status, 404);
      }
      assert.equal((await request(pilot, `${route}?limit=1&limit=2`, { cookie })).status, 404);
      assert.equal((await request(pilot, `${route}?offset=1`, { cookie })).status, 404);
    }
    for (const customer of customers) {
      const response = await request(pilot, `/api/customers/${customer.id}`, { cookie });
      assert.equal(response.status, 200);
      assert.deepEqual(parseJson(response).customer, customer);
    }
    for (const inquiry of inquiries) {
      const detail = await request(pilot, `/api/inquiries/${inquiry.id}`, { cookie });
      const items = await request(pilot, `/api/inquiries/${inquiry.id}/items`, { cookie });
      assert.equal(detail.status, 200);
      assert.equal(items.status, 200);
      assert.deepEqual(parseJson(detail).inquiry, inquiry);
      assert.ok(parseJson(items).items.every((item) => item.inquiry_id === inquiry.id));
    }
    assert.deepEqual(parseJson(await request(pilot, '/api/inquiries/pilot-inquiry-two/items', { cookie })), { items: [] });
    assert.equal((await request(pilot, '/api/customers/missing-customer', { cookie })).status, 404);
    assert.equal((await request(pilot, '/api/inquiries/missing-inquiry', { cookie })).status, 404);
    assert.equal((await request(pilot, '/api/customers')).status, 401);
  });
});

test('blocks all business writes and unapproved APIs before repositories can mutate', { timeout: 10_000 }, async () => {
  await withPilot(async (pilot) => {
    const cookie = await login(pilot);
    const before = snapshot(pilot.db);
    const attempts = [
      ['POST', '/api/customers', { displayName: 'blocked' }],
      ['PATCH', '/api/customers/pilot-customer-one', { displayName: 'blocked' }],
      ['POST', '/api/inquiries', { customerId: 'pilot-customer-one', title: 'blocked' }],
      ['PATCH', '/api/inquiries/pilot-inquiry-one', { title: 'blocked' }],
      ['POST', '/api/inquiries/pilot-inquiry-one/items', { description: 'blocked', quantity: 1 }],
      ['PATCH', '/api/inquiries/pilot-inquiry-one/items/pilot-item-one', { quantity: 1 }],
    ];
    for (const [method, target, body] of attempts) {
      assert.equal((await request(pilot, target, { method, body, cookie })).status, 404, `${method} ${target}`);
    }
    for (const target of [
      '/api/health', '/api/product-categories', '/api/quotations/example/internal',
      '/api/quotations/example/customer', '/api/inquiries/export', '/api/approvals',
    ]) {
      assert.equal((await request(pilot, target, { cookie })).status, 404, target);
    }
    assert.deepEqual(snapshot(pilot.db), before);
  });
});

test('close drains the listener, revokes sessions, closes SQLite, and is idempotent', { timeout: 10_000 }, async () => {
  const pilot = await start();
  await login(pilot);
  assert.equal(pilot.server.sessionStore.getCount(), 1);
  await pilot.close();
  assert.equal(pilot.closed, true);
  assert.equal(pilot.server.sessionStore.getCount(), 0);
  assert.equal(pilot.server.server.listening, false);
  assert.throws(() => pilot.db.prepare('SELECT 1'), /closed|open/i);
  await assert.doesNotReject(pilot.close());
  await assert.rejects(request(pilot, '/pilot/'));
});

for (const mode of ['normal', 'startup-error', 'shutdown-error']) {
  test(`CLI keeps credentials out of stdout and stderr (${mode})`, { timeout: 15_000 }, async (t) => {
    const secret = 'synthetic-sensitive-error-marker';
    const bootstrap = `
      import { Server } from 'node:net';
      import { fileURLToPath } from 'node:url';
      const mode = ${JSON.stringify(mode)};
      const listen = Server.prototype.listen;
      const close = Server.prototype.close;
      Server.prototype.listen = function (options, ...args) {
        if (mode === 'startup-error') throw new Error(${JSON.stringify(secret)});
        this.once('listening', () => process.send({ port: this.address().port }));
        return listen.call(this, 0, ...args);
      };
      if (mode === 'shutdown-error') {
        Server.prototype.close = function (callback) {
          return close.call(this, (error) => callback(error || new Error(${JSON.stringify(secret)})));
        };
      }
      process.on('message', () => {
        process.emit('SIGTERM');
        process.disconnect();
      });
      process.channel.unref();
      const entry = ${JSON.stringify(new URL('../server/local-readonly-pilot.mjs', import.meta.url).href)};
      process.argv[1] = fileURLToPath(entry);
      await import(entry);
    `;
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '--eval', bootstrap], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const completed = once(child, 'close');
    if (mode !== 'startup-error') {
      const ready = await Promise.race([
        once(child, 'message').then(([message]) => message),
        completed.then(() => { throw new Error('CLI exited before listening'); }),
      ]);
      const pilot = {
        url: `http://127.0.0.1:${ready.port}/pilot/`,
        server: { server: { address: () => ({ port: ready.port }) } },
      };
      const response = await request(pilot, '/api/session', {
        method: 'POST',
        body: { username: 'synthetic-viewer-marker', password: 'synthetic-password-marker' },
        cookie: 'synthetic-cookie-marker',
        headers: { Authorization: 'Bearer synthetic-token-marker' },
      });
      assert.equal(response.status, 401);
      child.send('stop');
    }
    const [code, signal] = await completed;
    assert.equal(signal, null);
    assert.equal(code, mode === 'normal' ? 0 : 1);
    if (mode === 'startup-error') {
      assert.equal(stdout, '');
      assert.equal(stderr, 'Unable to start the local read-only pilot.\n');
    } else {
      assert.match(stdout, /^Local read-only pilot: http:\/\/127\.0\.0\.1:\d+\/pilot\/\nPress Ctrl\+C to stop and erase the in-memory database\.\n$/);
      assert.equal(stderr, mode === 'normal' ? '' : 'Unable to stop the local read-only pilot.\n');
    }
    for (const value of [secret, 'synthetic-viewer-marker', 'synthetic-password-marker',
      'synthetic-cookie-marker', 'synthetic-token-marker', 'pilot-viewer']) {
      assert.equal((stdout + stderr).includes(value), false, 'CLI output must exclude credentials and raw errors');
    }
  });
}
