import assert from 'node:assert/strict';

import { createFixedClock, getToday } from '../store/clock.js';
import { previewV1Migration } from '../store/migration-preview.js';
import { createLocalStorageRepository, createMemoryRepository } from '../store/repositories.js';
import { V1_STORAGE_KEY, V2_SCHEMA_VERSION, V2_STORAGE_KEY } from '../store/storage-keys.js';
import { createInitialState, createStore } from '../store/store.js';

const makeState = () => createInitialState();

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

const firstMemory = createMemoryRepository({ fallbackStateFactory: makeState });
const secondMemory = createMemoryRepository({ fallbackStateFactory: makeState });
const externalLoad = firstMemory.loadState().state;
externalLoad.tasks[0].title = 'external mutation';
assert.notEqual(firstMemory.loadState().state.tasks[0].title, 'external mutation');

const savedState = makeState();
savedState.tasks[0].title = 'saved only in first';
assert.equal(firstMemory.saveState(savedState).ok, true);
savedState.tasks[0].title = 'mutation after save';
assert.equal(firstMemory.loadState().state.tasks[0].title, 'saved only in first');
assert.notEqual(secondMemory.loadState().state.tasks[0].title, 'saved only in first');
assert.equal(firstMemory.resetState().ok, true);
assert.equal(firstMemory.loadState().details.fallback, true);

const storage = createStorage();
const localRepository = createLocalStorageRepository({ storage, fallbackStateFactory: makeState });
assert.equal(localRepository.loadState().details.fallback, true);
const roundTripState = makeState();
roundTripState.tasks[0].title = 'round trip';
assert.equal(localRepository.saveState(roundTripState).ok, true);
const loadedRoundTrip = localRepository.loadState();
assert.equal(loadedRoundTrip.state.tasks[0].title, 'round trip');
loadedRoundTrip.state.tasks[0].title = 'external mutation';
assert.equal(localRepository.loadState().state.tasks[0].title, 'round trip');
assert.equal(localRepository.resetState().ok, true);
assert.equal(localRepository.loadState().details.error, 'STATE_NOT_FOUND');

const corruptedRepository = createLocalStorageRepository({
  storage: createStorage({ [V2_STORAGE_KEY]: '{bad json' }),
  fallbackStateFactory: makeState
});
assert.equal(corruptedRepository.loadState().details.error, 'CORRUPTED_STATE');

const invalidShapeRepository = createLocalStorageRepository({
  storage: createStorage({ [V2_STORAGE_KEY]: JSON.stringify({ schemaVersion: V2_SCHEMA_VERSION, tasks: [] }) }),
  fallbackStateFactory: makeState
});
assert.equal(invalidShapeRepository.loadState().details.error, 'INVALID_STATE_SHAPE');

const invalidVersionRepository = createLocalStorageRepository({
  storage: createStorage({ [V2_STORAGE_KEY]: JSON.stringify({ ...makeState(), schemaVersion: 999 }) }),
  fallbackStateFactory: makeState
});
assert.equal(invalidVersionRepository.loadState().details.error, 'UNSUPPORTED_SCHEMA_VERSION');

const calls = { load: 0, save: 0, reset: 0 };
const spyRepository = {
  loadState() {
    calls.load += 1;
    return { ok: true, state: makeState() };
  },
  saveState() {
    calls.save += 1;
    return { ok: true };
  },
  resetState() {
    calls.reset += 1;
    return { ok: true };
  }
};
const injectedStore = createStore({ repository: spyRepository, initialStateFactory: makeState });
assert.equal(calls.load, 1);
assert.equal(injectedStore.dispatch((draft) => {
  draft.tasks[0].title = 'persisted update';
  return { ok: true };
}).ok, true);
assert.equal(calls.save, 1);
assert.deepEqual(injectedStore.dispatch(() => ({ ok: false, error: 'REJECTED' })), { ok: false, error: 'REJECTED' });
assert.equal(calls.save, 1);
assert.equal(injectedStore.reset().ok, true);
assert.equal(calls.reset, 1);
assert.equal(injectedStore.getState().tasks[0].title, makeState().tasks[0].title);

const failingSaveStore = createStore({
  repository: {
    loadState: () => ({ ok: true, state: makeState() }),
    saveState: () => {
      throw new Error('disk unavailable');
    },
    resetState: () => ({ ok: true })
  },
  initialStateFactory: makeState
});
const failedSaveResult = failingSaveStore.dispatch((draft) => {
  draft.tasks[0].title = 'kept in memory';
  return { ok: true };
});
assert.equal(failedSaveResult.ok, true);
assert.equal(failedSaveResult.persistence.ok, false);
assert.equal(failingSaveStore.getState().tasks[0].title, 'kept in memory');

const v1Input = {
  ideas: [{ id: 'idea-1', title: 'Idea', created: '2026-07-20T00:00:00.000Z', archived: false }],
  tasks: [
    {
      id: 'task-1',
      title: 'V1 task',
      description: 'Actual V1 fields',
      status: 'waiting',
      priority: 1,
      dueDate: '2026-07-22T00:00:00.000Z',
      projectId: 'project-1',
      archived: false
    },
    { id: 'bad-task', title: 'Missing actual V1 fields' }
  ],
  events: [{ id: 'event-1', title: 'Event', date: '2026-07-22T00:00:00.000Z', time: '09:00', location: 'Office', duration: '30 minutes', completed: false }],
  projects: [{ id: 'project-1', title: 'Project', progress: 35, color: 'blue', nextStep: 'Next', risk: 'None' }],
  settings: { initialized: true, version: 1 },
  unexpected: []
};
const v1Snapshot = structuredClone(v1Input);
const preview = previewV1Migration(v1Input);
assert.equal(preview.migratableCount, 1);
assert.equal(preview.unrecognizedItems.length, 2);
assert.deepEqual(v1Input, v1Snapshot);
assert.equal(V1_STORAGE_KEY, 'superAssistantDashboardData');
assert.notEqual(V1_STORAGE_KEY, V2_STORAGE_KEY);

const actualNow = new Date();
const expectedToday = [
  actualNow.getFullYear(),
  String(actualNow.getMonth() + 1).padStart(2, '0'),
  String(actualNow.getDate()).padStart(2, '0')
].join('-');
assert.equal(getToday(), expectedToday);
assert.equal(getToday(createFixedClock('2030-02-03')), '2030-02-03');

console.log('repository-boundary tests passed');
