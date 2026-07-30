import { cloneState } from './state-utils.js';
import { V2_SCHEMA_VERSION } from './storage-keys.js';

export function migrateStateToCurrentVersion(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: 'INVALID_STATE_SHAPE' };
  }

  if (state.schemaVersion === V2_SCHEMA_VERSION) {
    return { ok: true, state: cloneState(state), migrated: false };
  }

  if (state.schemaVersion !== 1) {
    return {
      ok: false,
      error: 'UNSUPPORTED_SCHEMA_VERSION',
      details: { expected: V2_SCHEMA_VERSION, actual: state.schemaVersion }
    };
  }

  if (!Array.isArray(state.tasks)) {
    return { ok: false, error: 'INVALID_STATE_SHAPE', details: 'Expected tasks to be an array.' };
  }
  if (state.tasks.some((task) => !task || typeof task !== 'object' || Array.isArray(task))) {
    return { ok: false, error: 'INVALID_STATE_SHAPE', details: 'Expected every task to be an object.' };
  }

  return {
    ok: true,
    state: {
      ...cloneState(state),
      schemaVersion: V2_SCHEMA_VERSION,
      orders: [],
      tasks: state.tasks.map((task) => ({
        ...cloneState(task),
        orderId: task.orderId ?? null
      }))
    },
    migrated: true,
    fromVersion: 1,
    toVersion: V2_SCHEMA_VERSION
  };
}
