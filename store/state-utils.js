export const TODAY = '2026-07-25';

export const TASK_STATUSES = ['not-started', 'in-progress', 'blocked', 'done'];

export function cloneState(value) {
  return structuredClone(value);
}

export function parseDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

export function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = parseDate(value);
  return isValidDate(parsed);
}

export function isNullableDueDate(value) {
  return value === null || isValidDateString(value);
}

export function normalizeMockData(mockData) {
  const source = cloneState(mockData);
  const tasks = source.tasks.map((task) => ({
    ...task,
    assigneeId: task.assigneeId || task.ownerId,
    dependsOnTaskIds: [...(task.dependsOnTaskIds || [])]
  }));

  const activities = source.activity.map((item) => ({
    ...item,
    taskId: item.taskId || inferTaskIdFromActivity(item, tasks)
  }));

  const attachments = source.externalLinks.map((link) => ({
    ...link,
    created_by: link.createdBy,
    created_at: link.createdAt
  }));

  return {
    workspaces: source.workspaces,
    projects: source.projects,
    teams: source.teams,
    tasks,
    members: source.users,
    milestones: source.milestones,
    activities,
    attachments,
    currentUserId: source.currentUserId,
    selectedWorkspaceId: source.workspaces[0]?.id || null,
    selectedProjectId: source.projects[0]?.id || null,
    selectedTeamId: source.teams[0]?.id || null,
    selectedTaskId: source.tasks[0]?.id || null
  };
}

function inferTaskIdFromActivity(activity, tasks) {
  if (activity.taskId) return activity.taskId;
  const text = activity.text.toLowerCase();
  const task = tasks.find((item) => text.includes(item.title.toLowerCase()));
  return task?.id || null;
}
