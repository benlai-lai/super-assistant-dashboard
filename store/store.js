import { mockData } from '../data/mock-data.js';
import { createLocalStorageRepository, createMemoryRepository } from './repositories.js';
import { cloneState, normalizeMockData } from './state-utils.js';

export function createInitialState() {
  return normalizeMockData(mockData);
}

export function createStore({ repository, initialStateFactory = createInitialState } = {}) {
  if (!repository) throw new TypeError('A repository is required.');
  const subscribers = new Set();
  const loaded = safelyCall(() => repository.loadState(), { ok: false, error: 'LOAD_FAILED' });
  let state = loaded.ok && loaded.state ? cloneState(loaded.state) : cloneState(initialStateFactory());

  function getState() {
    return cloneState(state);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => unsubscribe(listener);
  }

  function unsubscribe(listener) {
    subscribers.delete(listener);
  }

  function dispatch(updater) {
    if (typeof updater !== 'function') return { ok: false, error: 'INVALID_UPDATER' };

    const draft = cloneState(state);
    let result;
    try {
      result = updater(draft);
    } catch (error) {
      return { ok: false, error: 'UPDATE_FAILED' };
    }
    if (result?.ok === false) return result;

    state = draft;
    const persistence = safelyCall(
      () => repository.saveState(cloneState(state)),
      { ok: false, error: 'SAVE_FAILED' }
    );
    notifySubscribers();
    return { ...(result || { ok: true }), ...(persistence.ok ? {} : { persistence }) };
  }

  function reset() {
    const result = safelyCall(
      () => repository.resetState(),
      { ok: false, error: 'RESET_FAILED' }
    );
    state = cloneState(initialStateFactory());
    notifySubscribers();
    return result;
  }

  function notifySubscribers() {
    const snapshot = getState();
    subscribers.forEach((listener) => listener(snapshot));
  }

  return { getState, subscribe, unsubscribe, dispatch, reset, initialization: loaded };
}

function safelyCall(operation, fallback) {
  try {
    const result = operation();
    return result && typeof result.ok === 'boolean' ? result : fallback;
  } catch (error) {
    return { ...fallback, details: error.message };
  }
}

const defaultStateFactory = createInitialState;
const defaultRepository = typeof globalThis.localStorage === 'undefined'
  ? createMemoryRepository({ fallbackStateFactory: defaultStateFactory })
  : createLocalStorageRepository({
      storage: globalThis.localStorage,
      fallbackStateFactory: defaultStateFactory
    });
const defaultStore = createStore({ repository: defaultRepository, initialStateFactory: defaultStateFactory });

export const getState = defaultStore.getState;
export const subscribe = defaultStore.subscribe;
export const unsubscribe = defaultStore.unsubscribe;
export const dispatch = defaultStore.dispatch;
export const resetStore = defaultStore.reset;
