const V1_COLLECTIONS = ['ideas', 'tasks', 'events', 'projects'];
const V1_TOP_LEVEL_FIELDS = [...V1_COLLECTIONS, 'settings'];

export function previewV1Migration(input) {
  const warnings = [];
  const unrecognizedItems = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      migratableCount: 0,
      unrecognizedItems: [{ path: '$', reason: 'V1_STATE_NOT_OBJECT' }],
      warnings: ['V1 data must be an object.']
    };
  }

  Object.keys(input)
    .filter((key) => !V1_TOP_LEVEL_FIELDS.includes(key))
    .forEach((key) => unrecognizedItems.push({ path: key, reason: 'UNKNOWN_TOP_LEVEL_FIELD' }));

  V1_COLLECTIONS.forEach((collection) => {
    if (input[collection] !== undefined && !Array.isArray(input[collection])) {
      unrecognizedItems.push({ path: collection, reason: 'EXPECTED_ARRAY' });
    }
  });

  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  let migratableCount = 0;
  tasks.forEach((task, index) => {
    if (isRecognizedV1Task(task)) migratableCount += 1;
    else unrecognizedItems.push({ path: `tasks[${index}]`, reason: 'UNRECOGNIZED_V1_TASK' });
  });

  if (!input.settings || input.settings.version !== 1) {
    warnings.push('V1 settings.version is missing or is not 1.');
  }
  if (!tasks.length) warnings.push('No V1 tasks are available for migration preview.');
  warnings.push('Sprint 4A previews V1 tasks only; ideas, events, projects, and settings are recognized but not migrated.');
  warnings.push('Preview only: no V1 data was modified and no V2 data was written.');

  return { migratableCount, unrecognizedItems, warnings };
}

function isRecognizedV1Task(task) {
  return Boolean(
    task
    && typeof task === 'object'
    && !Array.isArray(task)
    && typeof task.id === 'string'
    && typeof task.title === 'string'
    && typeof task.status === 'string'
    && Object.hasOwn(task, 'dueDate')
    && Object.hasOwn(task, 'projectId')
    && typeof task.archived === 'boolean'
  );
}
