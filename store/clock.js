export const systemClock = {
  now() {
    return new Date();
  }
};

export function createFixedClock(value) {
  const fixed = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(fixed.valueOf())) throw new TypeError('Fixed clock requires a valid date.');
  return {
    now() {
      return new Date(fixed);
    }
  };
}

export function getToday(clock = systemClock) {
  const now = clock.now();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
