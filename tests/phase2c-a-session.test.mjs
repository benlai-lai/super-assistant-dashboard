import assert from 'node:assert/strict';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { createSessionStore } from '../server/session-store.mjs';
import { checkPermission, validateRoleFromSession, getPolicyMatrix } from '../server/access-policy.mjs';

const scryptAsync = promisify(scrypt);

async function hashPassword(password, salt) {
  return (await scryptAsync(password, salt, 32)).toString('hex');
}

test('SessionStore - token hashing', () => {
  const store = createSessionStore();
  const token = 'test-token-123';

  // Same token should produce same hash
  const hash1 = store.constructor.hashToken(token);
  const hash2 = store.constructor.hashToken(token);
  assert.equal(hash1, hash2);

  // Token should be hex string
  assert.match(hash1, /^[a-f0-9]{64}$/);
});

test('SessionStore - create and get session', () => {
  const store = createSessionStore();
  const token = randomBytes(32).toString('hex');
  const actorId = 'editor-1';
  const role = 'editor';
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  store.create(token, actorId, role, expiresAt);

  const session = store.get(token);
  assert.deepEqual(session, { actorId, role, expiresAt });
});

test('SessionStore - get non-existent session returns null', () => {
  const store = createSessionStore();
  const session = store.get('non-existent-token');
  assert.equal(session, null);
});

test('SessionStore - expired session returns null and is cleaned up', () => {
  const store = createSessionStore();
  const token = randomBytes(32).toString('hex');
  const actorId = 'editor-1';
  const role = 'editor';
  const expiresAt = Date.now() - 1000; // Expired 1 second ago

  store.create(token, actorId, role, expiresAt);
  const session = store.get(token);

  assert.equal(session, null);
});

test('SessionStore - delete session', () => {
  const store = createSessionStore();
  const token = randomBytes(32).toString('hex');
  const actorId = 'editor-1';
  const role = 'editor';
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  store.create(token, actorId, role, expiresAt);
  assert.equal(store.get(token) !== null, true);

  const deleted = store.delete(token);
  assert.equal(deleted, true);
  assert.equal(store.get(token), null);
});

test('SessionStore - delete non-existent session returns false', () => {
  const store = createSessionStore();
  const deleted = store.delete('non-existent-token');
  assert.equal(deleted, false);
});

test('SessionStore - deleteByActorId removes all sessions for that actor', () => {
  const store = createSessionStore();
  const actorId = 'editor-1';
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  const token1 = randomBytes(32).toString('hex');
  const token2 = randomBytes(32).toString('hex');
  const token3 = randomBytes(32).toString('hex');

  store.create(token1, actorId, 'editor', expiresAt);
  store.create(token2, actorId, 'editor', expiresAt);
  store.create(token3, 'viewer-1', 'viewer', expiresAt);

  store.deleteByActorId(actorId);

  assert.equal(store.get(token1), null);
  assert.equal(store.get(token2), null);
  assert.notEqual(store.get(token3), null);
});

test('SessionStore - cleanupExpired removes expired sessions', () => {
  const store = createSessionStore();
  const expiresAtValid = Date.now() + 24 * 60 * 60 * 1000;
  const expiresAtExpired = Date.now() - 1000;

  const token1 = randomBytes(32).toString('hex');
  const token2 = randomBytes(32).toString('hex');

  store.create(token1, 'editor-1', 'editor', expiresAtValid);
  store.create(token2, 'editor-2', 'editor', expiresAtExpired);

  store.cleanupExpired();

  assert.notEqual(store.get(token1), null);
  assert.equal(store.get(token2), null);
});

test('SessionStore - server store does not store raw session token', () => {
  const store = createSessionStore();
  const token = randomBytes(32).toString('hex');
  const actorId = 'editor-1';
  const role = 'editor';
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  store.create(token, actorId, role, expiresAt);

  // Check that the token hash is not the raw token
  for (const [hash] of store.sessions.entries()) {
    assert.notEqual(hash, token);
  }
});

test('SessionStore - different tokens have different hashes', () => {
  const store = createSessionStore();
  const token1 = randomBytes(32).toString('hex');
  const token2 = randomBytes(32).toString('hex');

  const hash1 = store.constructor.hashToken(token1);
  const hash2 = store.constructor.hashToken(token2);

  assert.notEqual(hash1, hash2);
});

test('AccessPolicy - checkPermission for editor', () => {
  assert.equal(checkPermission('editor', 'read'), true);
  assert.equal(checkPermission('editor', 'create'), true);
  assert.equal(checkPermission('editor', 'update'), true);
  assert.equal(checkPermission('editor', 'delete'), true);
  assert.equal(checkPermission('editor', 'publish'), true);
  assert.equal(checkPermission('editor', 'category:list'), true);
  assert.equal(checkPermission('editor', 'category:create'), true);
  assert.equal(checkPermission('editor', 'category:rename'), true);
  assert.equal(checkPermission('editor', 'category:deactivate'), true);
});

test('AccessPolicy - checkPermission for viewer', () => {
  assert.equal(checkPermission('viewer', 'read'), true);
  assert.equal(checkPermission('viewer', 'create'), false);
  assert.equal(checkPermission('viewer', 'update'), false);
  assert.equal(checkPermission('viewer', 'delete'), false);
  assert.equal(checkPermission('viewer', 'publish'), false);
  assert.equal(checkPermission('viewer', 'category:list'), false);
  assert.equal(checkPermission('viewer', 'category:create'), false);
  assert.equal(checkPermission('viewer', 'category:rename'), false);
  assert.equal(checkPermission('viewer', 'category:deactivate'), false);
});

test('AccessPolicy - checkPermission throws on unknown role', () => {
  assert.throws(() => checkPermission('unknown-role', 'read'), /Unknown role/);
});

test('AccessPolicy - checkPermission throws on unknown action', () => {
  assert.throws(() => checkPermission('editor', 'unknown-action'), /Unknown action/);
});

test('AccessPolicy - validateRoleFromSession accepts valid roles', () => {
  assert.doesNotThrow(() => validateRoleFromSession('editor'));
  assert.doesNotThrow(() => validateRoleFromSession('viewer'));
});

test('AccessPolicy - validateRoleFromSession rejects invalid roles', () => {
  assert.throws(() => validateRoleFromSession('admin'), /Invalid role/);
  assert.throws(() => validateRoleFromSession('superuser'), /Invalid role/);
});

test('AccessPolicy - getPolicyMatrix returns correct structure', () => {
  const matrix = getPolicyMatrix();

  assert.deepEqual(Object.keys(matrix).sort(), ['editor', 'viewer']);
  assert.equal(matrix.editor.read, true);
  assert.equal(matrix.editor.create, true);
  assert.equal(matrix.viewer.read, true);
  assert.equal(matrix.viewer.create, false);
});

test('AccessPolicy - permission matrix shows viewer cannot write', () => {
  const matrix = getPolicyMatrix();

  assert.equal(matrix.viewer.create, false);
  assert.equal(matrix.viewer.update, false);
  assert.equal(matrix.viewer.delete, false);
  assert.equal(matrix.viewer.publish, false);
  assert.equal(matrix.viewer.read, true);
  assert.equal(matrix.viewer['category:list'], false);
  assert.equal(matrix.viewer['category:create'], false);
  assert.equal(matrix.viewer['category:rename'], false);
  assert.equal(matrix.viewer['category:deactivate'], false);
});

test('AccessPolicy - policy matrix is immutable', () => {
  const matrix1 = getPolicyMatrix();
  const matrix2 = getPolicyMatrix();

  // Modifying matrix1 should not affect matrix2
  matrix1.editor.read = false;
  assert.equal(matrix2.editor.read, true);
});

test('Session lifecycle - create, retrieve, expiry', () => {
  const store = createSessionStore();
  const token = randomBytes(32).toString('hex');
  const actorId = 'editor-1';
  const role = 'editor';
  
  // Just expired
  const expiresAt = Date.now() - 1;
  store.create(token, actorId, role, expiresAt);

  // Should be expired immediately
  const session = store.get(token);
  assert.equal(session, null);
});

test('Session security - same actor with different credentials uses different salt', async () => {
  const password1 = 'password123';
  const password2 = 'password456';
  
  const salt1 = randomBytes(16);
  const salt2 = randomBytes(16);

  // Same password with different salt produces different hash
  const hash1 = await hashPassword(password1, salt1);
  const hash2 = await hashPassword(password1, salt2);

  assert.notEqual(hash1, hash2);

  // Different passwords with same salt produce different hash
  const hash3 = await hashPassword(password1, salt1);
  const hash4 = await hashPassword(password2, salt1);

  assert.notEqual(hash3, hash4);
});
