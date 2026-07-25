import { mockData } from '../data/mock-data.js';
import { cloneState, normalizeMockData } from './state-utils.js';

let state = normalizeMockData(mockData);
const subscribers = new Set();

export function getState() {
  return cloneState(state);
}

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  subscribers.add(listener);
  return () => unsubscribe(listener);
}

export function unsubscribe(listener) {
  subscribers.delete(listener);
}

export function dispatch(updater) {
  if (typeof updater !== 'function') {
    return { ok: false, error: 'INVALID_UPDATER' };
  }

  const draft = cloneState(state);
  let result;
  try {
    result = updater(draft);
  } catch (error) {
    return { ok: false, error: 'UPDATE_FAILED' };
  }
  if (result?.ok === false) return result;

  state = draft;
  notifySubscribers();
  return result || { ok: true };
}

function notifySubscribers() {
  const snapshot = getState();
  subscribers.forEach((listener) => listener(snapshot));
}
