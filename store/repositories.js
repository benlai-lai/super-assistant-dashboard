import { cloneState } from './state-utils.js';
import { V2_SCHEMA_VERSION, V2_STORAGE_KEY } from './storage-keys.js';

const REQUIRED_ARRAYS = [
  'workspaces',
  'projects',
  'teams',
  'tasks',
  'members',
  'milestones',
  'activities',
  'attachments'
];

export function validateStateShape(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: 'INVALID_STATE_SHAPE', details: 'State must be an object.' };
  }
  if (state.schemaVersion !== V2_SCHEMA_VERSION) {
    return { ok: false, error: 'UNSUPPORTED_SCHEMA_VERSION', details: { expected: V2_SCHEMA_VERSION, actual: state.schemaVersion } };
  }
  const invalidField = REQUIRED_ARRAYS.find((field) => !Array.isArray(state[field]));
  if (invalidField) {
    return { ok: false, error: 'INVALID_STATE_SHAPE', details: `Expected ${invalidField} to be an array.` };
  }
  if (typeof state.currentUserId !== 'string') {
    return { ok: false, error: 'INVALID_STATE_SHAPE', details: 'Expected currentUserId to be a string.' };
  }
  return { ok: true };
}

export function createMemoryRepository({ initialState = null, fallbackStateFactory = null } = {}) {
  const initialValidation = initialState ? validateStateShape(initialState) : { ok: true };
  let memoryState = initialState && initialValidation.ok ? cloneState(initialState) : null;

  return {
    loadState() {
      if (memoryState) return { ok: true, state: cloneState(memoryState) };
      return createFallbackResult(fallbackStateFactory, 'STATE_NOT_FOUND');
    },
    saveState(state) {
      const validation = validateStateShape(state);
      if (!validation.ok) return validation;
      memoryState = cloneState(state);
      return { ok: true };
    },
    resetState() {
      memoryState = null;
      return { ok: true };
    }
  };
}

export function createLocalStorageRepository({
  storage,
  key = V2_STORAGE_KEY,
  fallbackStateFactory = null
}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new TypeError('A Storage-compatible object is required.');
  }

  return {
    loadState() {
      let raw;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        return createFallbackResult(fallbackStateFactory, 'STORAGE_READ_FAILED', error.message);
      }
      if (raw === null) return createFallbackResult(fallbackStateFactory, 'STATE_NOT_FOUND');

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return createFallbackResult(fallbackStateFactory, 'CORRUPTED_STATE', error.message);
      }

      const validation = validateStateShape(parsed);
      if (!validation.ok) return createFallbackResult(fallbackStateFactory, validation.error, validation.details);
      return { ok: true, state: cloneState(parsed) };
    },
    saveState(state) {
      const validation = validateStateShape(state);
      if (!validation.ok) return validation;
      try {
        storage.setItem(key, JSON.stringify(state));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: 'STORAGE_WRITE_FAILED', details: error.message };
      }
    },
    resetState() {
      try {
        storage.removeItem(key);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: 'STORAGE_RESET_FAILED', details: error.message };
      }
    }
  };
}

function createFallbackResult(fallbackStateFactory, error, details) {
  if (typeof fallbackStateFactory !== 'function') {
    return { ok: false, state: null, error, ...(details === undefined ? {} : { details }) };
  }
  return {
    ok: true,
    state: cloneState(fallbackStateFactory()),
    details: { fallback: true, error, ...(details === undefined ? {} : { cause: details }) }
  };
}
