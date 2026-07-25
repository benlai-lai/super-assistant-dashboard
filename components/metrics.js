export function getUser(data, userId) {
  return data.users.find((user) => user.id === userId) || { id: userId, name: 'Unassigned', role: 'Unknown' };
}

export function getProjectTasks(data, projectId) {
  return data.tasks.filter((task) => task.projectId === projectId);
}

export function getTeamTasks(data, teamId) {
  return data.tasks.filter((task) => task.teamId === teamId);
}

export function isTaskDone(task) {
  return task.status === 'done';
}

export function isTaskOpen(task) {
  return !['done', 'archived'].includes(task.status);
}

export function getProgress(tasks) {
  if (!tasks.length) return { completed: 0, total: 0, percent: 0 };
  const completed = tasks.filter(isTaskDone).length;
  return { completed, total: tasks.length, percent: Math.round((completed / tasks.length) * 100) };
}

export function getBlockedTasks(tasks) {
  return tasks.filter((task) => task.blocked || task.status === 'blocked');
}

export function getOverdueTasks(tasks, today = new Date('2026-07-25')) {
  return tasks.filter((task) => isTaskOpen(task) && new Date(task.dueDate) < today);
}

export function getDueSoonTasks(tasks, today = new Date('2026-07-25')) {
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  return tasks.filter((task) => {
    const dueDate = new Date(task.dueDate);
    return isTaskOpen(task) && dueDate >= today && dueDate <= soon;
  });
}

export function getWorkload(tasks) {
  const openTasks = tasks.filter(isTaskOpen);
  const points = openTasks.reduce((sum, task) => sum + (task.weight || 2), 0);
  const overdue = getOverdueTasks(openTasks).length;
  const dueSoon = getDueSoonTasks(openTasks).length;
  let status = 'Low';

  if (points >= 9 || dueSoon >= 5 || overdue >= 2) status = 'Overloaded';
  else if (points >= 4 || dueSoon >= 2 || overdue === 1) status = 'Normal';

  return { openTasks: openTasks.length, dueSoon, overdue, points, status };
}

export function getExpectedProgress(project, today = new Date('2026-07-25')) {
  if (!project.startDate || !project.dueDate) return null;
  const start = new Date(project.startDate);
  const due = new Date(project.dueDate);
  const total = due - start;
  if (total <= 0) return null;
  if (today < start) return 0;
  if (today > due) return 100;
  return Math.round(((today - start) / total) * 100);
}

export function getHealth(project, tasks) {
  const progress = getProgress(tasks).percent;
  const expected = getExpectedProgress(project);
  const blocked = getBlockedTasks(tasks).length;
  const overdue = getOverdueTasks(tasks).length;
  const openTasks = tasks.filter(isTaskOpen).length || 1;
  const overdueRatio = overdue / openTasks;
  const dueDate = new Date(project.dueDate);
  const daysUntilDue = Math.ceil((dueDate - new Date('2026-07-25')) / 86400000);

  if (daysUntilDue < 0 && progress < 100) return { level: 'Delayed', reason: 'Project due date has passed.' };
  if (overdueRatio >= 0.25) return { level: 'Delayed', reason: 'More than 25% of open tasks are overdue.' };
  if (daysUntilDue <= 2 && progress < 70) return { level: 'Delayed', reason: 'Due very soon and progress is below 70%.' };
  if (overdueRatio >= 0.1) return { level: 'High Risk', reason: 'Overdue task ratio is above 10%.' };
  if (blocked >= 3 || blocked / openTasks >= 0.15) return { level: 'High Risk', reason: 'Blocked tasks need attention.' };
  if (expected !== null && daysUntilDue <= 7 && progress < expected - 20) return { level: 'High Risk', reason: 'Progress is more than 20% behind expected pace.' };
  if (overdue > 0 || blocked > 0) return { level: 'Attention', reason: 'There are overdue or blocked tasks.' };
  if (!project.nextAction) return { level: 'Attention', reason: 'No next action is defined.' };
  return { level: 'Healthy', reason: 'Progress, next action, and task status look on track.' };
}

export function getRisk(project, tasks) {
  const blocked = getBlockedTasks(tasks).length;
  const overdue = getOverdueTasks(tasks).length;
  const computed = blocked >= 2 || overdue >= 2 ? 'High' : blocked || overdue ? 'Medium' : 'Low';
  const computedReason = blocked || overdue ? 'Computed from blocked and overdue tasks.' : 'No blocking risk detected.';
  return {
    manual: project.riskLevelManual,
    computed,
    display: project.riskLevelManual || computed,
    reason: project.riskLevelManual ? 'Manual risk override is active.' : computedReason,
    computedReason
  };
}