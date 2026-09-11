import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { checkServerIdentity } from 'node:tls';
import { join, resolve } from 'node:path';
import { openPhase2bDatabase } from '../server/database.mjs';
import { parsePhaseBArgs, startPhaseB, validatePhaseBOptions } from '../scripts/start-lan-pilot-https.mjs';

const openssl = process.env.DASHBOARD_TEST_OPENSSL
  ?? (process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl');
const root = mkdtempSync(join(tmpdir(), 'dashboard-phase-b-test-'));
const certPath = join(root, 'test-cert.pem');
const keyPath = join(root, 'test-key.pem');
const databasePath = join(root, 'synthetic.sqlite3');
const options = { host: '127.0.0.1', port: 8443, allowedDataRoot: root, databasePath, tlsRoot: root, certPath, keyPath };

function certificate(cert, key, ip) {
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=Disposable-loopback-test', '-addext', `subjectAltName=IP:${ip}`,
    '-keyout', key, '-out', cert], { stdio: 'ignore', windowsHide: true });
}
async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
  const port = server.address().port;
  await new Promise((yes, no) => server.close((error) => error ? no(error) : yes()));
  return port;
}
function get(port, headers = {}, method = 'GET') {
  return new Promise((yes, no) => {
    const req = request({ hostname: '127.0.0.1', port, path: '/lan-pilot/', method,
      ca: readFileSync(certPath), agent: false, servername: '',
      checkServerIdentity: (_name, cert) => checkServerIdentity('127.0.0.1', cert), headers }, (res) => {
      res.resume();
      res.on('end', () => yes(res.statusCode));
    });
    req.on('error', no);
    req.end();
  });
}

test.before(() => {
  certificate(certPath, keyPath, '127.0.0.1');
  openPhase2bDatabase(databasePath).close();
});
test.after(() => {
  assert.ok(root.startsWith(join(tmpdir(), 'dashboard-phase-b-test-')));
  rmSync(root, { recursive: true, force: true });
  assert.equal(existsSync(root), false);
});

test('Phase B arguments require explicit values and default to 8443', () => {
  assert.equal(parsePhaseBArgs([]).port, 8443);
  for (const args of [['--host'], ['--port', '0x20'], ['--unknown', 'x'], ['--port', '8443', '--port', '9']]) {
    assert.throws(() => parsePhaseBArgs(args));
  }
});

test('Phase B refuses wildcard, hostname, IPv6, unassigned address and invalid port before IO', () => {
  for (const host of [undefined, '', '0.0.0.0', '0.1.2.3', '::', '::1', 'localhost', '224.0.0.1', '192.0.2.123']) {
    assert.throws(() => validatePhaseBOptions({ ...options, host }));
  }
  for (const port of [0, -1, 65536, 1.5, '8443']) assert.throws(() => validatePhaseBOptions({ ...options, port }));
});

test('Phase B refuses missing TLS or DB and unsafe paths before creating data', async () => {
  for (const name of ['allowedDataRoot', 'databasePath', 'tlsRoot', 'certPath', 'keyPath']) {
    assert.throws(() => validatePhaseBOptions({ ...options, [name]: undefined }));
  }
  const missing = join(root, 'absent.sqlite3');
  for (const name of ['databasePath', 'certPath', 'keyPath']) {
    await assert.rejects(startPhaseB({ ...options, [name]: missing }), /startup refused/);
    assert.equal(existsSync(missing), false);
  }
  for (const keyPath of ['relative.pem', join(root, '..', 'outside.pem'), `${options.keyPath}:stream`, resolve('package.json')]) {
    assert.throws(() => validatePhaseBOptions({ ...options, keyPath }));
  }
});

test('Phase B rejects malformed, mismatched private key and wrong IP SAN', () => {
  const wrongCert = join(root, 'wrong-cert.pem');
  const wrongKey = join(root, 'wrong-key.pem');
  certificate(wrongCert, wrongKey, '192.0.2.123');
  assert.throws(() => validatePhaseBOptions({ ...options, certPath: wrongCert, keyPath: wrongKey }), /TLS material/);
  assert.throws(() => validatePhaseBOptions({ ...options, keyPath: wrongKey }), /TLS material/);
  const malformed = join(root, 'invalid.pem');
  writeFileSync(malformed, randomBytes(48));
  assert.throws(() => validatePhaseBOptions({ ...options, certPath: malformed }), /TLS material/);
});

test('HTTPS validates certificate, enforces Host and Origin and releases listener on close', async () => {
  const port = await freePort();
  const states = [];
  const pilot = await startPhaseB({ ...options, port }, (state) => states.push(state));
  try {
    assert.equal(pilot.url, `https://127.0.0.1:${port}/lan-pilot/`);
    assert.equal(await get(port), 200);
    assert.equal(await get(port, { Host: `localhost:${port}` }), 403);
    assert.equal(await get(port, { Origin: `http://127.0.0.1:${port}` }), 403);
    assert.equal(await get(port, { Origin: 'https://attacker.invalid' }), 403);
    assert.equal(await get(port, {}, 'POST'), 403);
    assert.equal(await get(port, { Origin: `https://127.0.0.1:${port}` }, 'POST'), 404);
  } finally { await Promise.all([pilot.close(), pilot.close()]); }
  assert.deepEqual(states, ['RUNNING', 'STOPPING', 'STOPPED']);
  const probe = createServer();
  await new Promise((yes, no) => { probe.once('error', no); probe.listen(port, '127.0.0.1', yes); });
  await new Promise((yes) => probe.close(yes));
});

test('shutdown bounds an incomplete TLS connection and frees port', { timeout: 15000 }, async () => {
  const port = await freePort();
  const pilot = await startPhaseB({ ...options, port });
  const socket = connect(port, '127.0.0.1');
  socket.on('error', () => {});
  await new Promise((yes) => socket.once('connect', yes));
  try { await pilot.close(); } finally { socket.destroy(); }
  const probe = createServer();
  await new Promise((yes, no) => { probe.once('error', no); probe.listen(port, '127.0.0.1', yes); });
  await new Promise((yes) => probe.close(yes));
});

test('CLI fails with sanitized status without echoing supplied secret-like arguments', () => {
  const marker = randomBytes(24).toString('hex');
  const result = spawnSync(process.execPath, ['scripts/start-lan-pilot-https.mjs', '--key', marker], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /phase_b=FAILED/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(marker), false);
});

test('DB sidecars reject TLS collisions, hardlinks and non-files', () => {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = `${databasePath}${suffix}`;
    assert.equal(existsSync(sidecar), false);
    try {
      copyFileSync(certPath, sidecar);
      assert.throws(() => validatePhaseBOptions({ ...options, certPath: sidecar }), /paths must differ/);
      rmSync(sidecar);
      const unrelated = join(root, 'unrelated-synthetic-file');
      writeFileSync(unrelated, 'synthetic sidecar hardlink target');
      linkSync(unrelated, sidecar);
      assert.throws(() => validatePhaseBOptions(options), /sidecar/);
      rmSync(sidecar);
      mkdirSync(sidecar);
      assert.throws(() => validatePhaseBOptions(options), /sidecar/);
    } finally { rmSync(sidecar, { recursive: true, force: true }); }
  }
});

test('DB size is independent of the TLS material size limit', () => {
  const large = join(root, 'large-synthetic.sqlite3');
  writeFileSync(large, Buffer.alloc(1024 * 1024 + 1));
  const validated = validatePhaseBOptions({ ...options, databasePath: large });
  validated.tls.key.fill(0);
});
