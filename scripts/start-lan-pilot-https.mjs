import { X509Certificate, createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { createSecureContext } from 'node:tls';
import { fileURLToPath } from 'node:url';
import { assertPilotDataPath, createLanWritePilot } from '../server/lan-write-pilot.mjs';

export function parsePhaseBArgs(args) {
  const names = new Map([
    ['--host', 'host'], ['--port', 'port'], ['--data-root', 'allowedDataRoot'],
    ['--db', 'databasePath'], ['--tls-root', 'tlsRoot'],
    ['--cert', 'certPath'], ['--key', 'keyPath'],
  ]);
  const options = { port: 8443 };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const name = names.get(args[index]);
    const value = args[index + 1];
    if (!name || seen.has(name) || !value || value.startsWith('--')) throw new Error('Invalid launcher arguments');
    seen.add(name);
    if (name === 'port' && !/^\d+$/.test(value)) throw new Error('Invalid port');
    options[name] = name === 'port' ? Number(value) : value;
  }
  return options;
}

function validateBind(host, port) {
  if (typeof host !== 'string' || isIP(host) !== 4) throw new Error('Explicit IPv4 bind host required');
  const octets = host.split('.').map(Number);
  if (octets[0] === 0 || octets[0] >= 224 || host === '255.255.255.255') throw new Error('Wildcard or non-unicast bind rejected');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1..65535');
  if (!Object.values(networkInterfaces()).flat().some((entry) => entry?.family === 'IPv4' && entry.address === host)) {
    throw new Error('Bind address is not assigned to this host');
  }
}

function strictPath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f]/.test(path)
      || path.startsWith('\\\\') || path.startsWith('//')
      || path.slice(process.platform === 'win32' ? 2 : 0).includes(':')
      || path.split(/[\\/]/).some((part) => part === '..' || /[. ]$/.test(part))) {
    throw new Error('Unsafe launcher path');
  }
}

function checkedFile(path, root, maximumSize = Infinity) {
  const safe = assertPilotDataPath(path, root);
  const info = statSync(safe);
  if (!info.isFile() || info.nlink !== 1 || info.size === 0 || info.size > maximumSize) throw new Error('Invalid launcher file');
  return safe;
}

export function validatePhaseBOptions(options = {}) {
  const { host, port = 8443, allowedDataRoot, databasePath, tlsRoot, certPath, keyPath } = options;
  validateBind(host, port);
  for (const path of [allowedDataRoot, databasePath, tlsRoot, certPath, keyPath]) strictPath(path);
  const db = checkedFile(databasePath, allowedDataRoot);
  const certFile = checkedFile(certPath, tlsRoot, 1024 * 1024);
  const keyFile = checkedFile(keyPath, tlsRoot, 1024 * 1024);
  const sidecars = ['-wal', '-shm', '-journal'].map((suffix) => assertPilotDataPath(db + suffix, allowedDataRoot));
  for (const sidecar of sidecars) {
    if (existsSync(sidecar)) {
      const info = statSync(sidecar);
      if (!info.isFile() || info.nlink !== 1) throw new Error('Unsafe database sidecar');
    }
  }
  if (new Set([db, ...sidecars, certFile, keyFile].map((path) => process.platform === 'win32' ? path.toLowerCase() : path)).size !== 6) {
    throw new Error('Database and TLS paths must differ');
  }

  let cert;
  let key;
  try {
    cert = readFileSync(certFile);
    key = readFileSync(keyFile);
    const certificate = new X509Certificate(cert);
    const privateKey = createPrivateKey(key);
    const now = Date.now();
    if (!certificate.checkIP(host) || !certificate.checkPrivateKey(privateKey)
        || !(Date.parse(certificate.validFrom) <= now && now < Date.parse(certificate.validTo))) {
      throw new Error('TLS identity mismatch');
    }
    createSecureContext({ cert, key, minVersion: 'TLSv1.2' });
    return { host, port, databasePath: db, allowedDataRoot, tls: { cert, key, minVersion: 'TLSv1.2' } };
  } catch {
    key?.fill(0);
    throw new Error('TLS material invalid, expired, or does not match bind address');
  }
}

export async function startPhaseB(options, status = () => {}) {
  let pilot;
  let validated;
  let closing;
  const sockets = new Set();
  try {
    validated = validatePhaseBOptions(options);
    pilot = await createLanWritePilot(validated);
    await pilot.start();
    pilot.server.server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    status('RUNNING');
  } catch {
    if (pilot) await pilot.close().catch(() => {});
    validated?.tls.key.fill(0);
    throw new Error('Phase B startup refused');
  }
  return {
    url: `${pilot.url}/lan-pilot/`,
    close() {
      if (!closing) closing = (async () => {
        status('STOPPING');
        const deadline = setTimeout(() => {
          for (const socket of sockets) socket.destroy();
        }, 5000);
        deadline.unref();
        try {
          await pilot.close();
          status('STOPPED');
        } finally {
          clearTimeout(deadline);
          validated.tls.key.fill(0);
        }
      })();
      return closing;
    },
  };
}

async function main() {
  const options = parsePhaseBArgs(process.argv.slice(2));
  let pilot;
  let stopping = false;
  const stop = async () => {
    stopping = true;
    if (pilot) await pilot.close();
  };
  const signal = () => { stop().catch(() => { process.exitCode = 1; }); };
  process.on('SIGINT', signal);
  process.on('SIGTERM', signal);
  try {
    process.stdout.write('phase_b=STARTING\n');
    pilot = await startPhaseB(options, (state) => process.stdout.write(`phase_b=${state}\n`));
    if (stopping) await stop();
    else process.stdout.write(`phase_b_url=${pilot.url}\n`);
  } catch {
    process.stderr.write('phase_b=FAILED startup refused; check explicit bind, paths and TLS material\n');
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('phase_b=FAILED invalid launcher arguments\n');
    process.exitCode = 1;
  });
}
