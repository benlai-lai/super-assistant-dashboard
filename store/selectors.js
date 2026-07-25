import { isValidDate, parseDate, TODAY } from './state-utils.js';

export function getCurrentUser(state) {
  return getMemberById(state, state.currentUserId);
}

export function getWorkspaceById(state, workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId) || null;
}

export function getProjectsByWorkspaceId(state, workspaceId) {
  return state.projects.filter((project) => project.workspaceId === workspaceId);
}

export function getProjectById(state, projectId) {
  return state.projects.find((project) => project.id === projectId) || null;
}

export function getTeamsByProjectId(state, projectId) {
  return state.teams.filter((team) => team.projectId === projectId);
}

export function getTeamById(state, teamId) {
  return state.teams.find((team) => team.id === teamId) || null;
}

export function getTasksByTeamId(state, teamId) {
  return state.tasks.filter((task) => task.teamId === teamId);
}

export function getTaskById(state, taskId) {
  return state.tasks.find((task) => task.id === taskId) || null;
}

export function getMemberById(state, memberId) {
  return state.members.find((member) => member.id === memberId) || { id: memberId, name: 'Unassigned', role: 'Unknown' };
}

export function getActivitiesByTaskId(state, taskId) {
  return state.activities.filter((activity) => activity.taskId === taskId);
}

export function getAttachmentsByTaskId(state, taskId) {
  return state.attachments.filter((attachment) => attachment.taskId === taskId);
}

export function getMyTasks(state, userId) {
  return state.tasks.filter((task) => task.assigneeId === userId || task.ownerId === userId);
}

export function getTodayTasks(state, userId) {
  return getMyTasks(state, userId).filter((task) => isTaskOpen(task) && isTaskDueToday(task));
}

export function getUpcomingTasks(state, userId) {
  return getDueSoonTasks(getMyTasks(state, userId));
}

export function getOverdueTasks(stateOrTasks, userIdOrToday, maybeToday) {
  const { tasks, today } = resolveTaskInput(stateOrTasks, userIdOrToday, maybeToday);
  const todayDate = parseDate(today);
  if (!isValidDate(todayDate)) return [];

  return tasks.filter((task) => {
    const dueDate = parseDate(task.dueDate);
    return isTaskOpen(task) && isValidDate(dueDate) && dueDate < todayDate;
  });
}

export function getProjectTasks(state, projectId) {
  return state.tasks.filter((task) => task.projectId === projectId);
}

export function getWorkspaceTasks(state, workspaceId) {
  const projectIds = getProjectsByWorkspaceId(state, workspaceId).map((project) => project.id);
  return state.tasks.filter((task) => projectIds.includes(task.projectId));
}

export function getMilestonesByProjectId(state, projectId) {
  return state.milestones.filter((milestone) => milestone.projectId === projectId);
}

export function getDueSoonTasks(stateOrTasks, userIdOrToday, maybeToday) {
  const { tasks, today } = resolveTaskInput(stateOrTasks, userIdOrToday, maybeToday);
  const todayDate = parseDate(today);
  const soonDate = parseDate(today);
  if (!isValidDate(todayDate) || !isValidDate(soonDate)) return [];
  soonDate.setDate(soonDate.getDate() + 7);

  return tasks.filter((task) => {
    const dueDate = parseDate(task.dueDate);
    return isTaskOpen(task) && isValidDate(dueDate) && dueDate >= todayDate && dueDate <= soonDate;
  });
}

export function getBlockedTasks(tasks) {
  return tasks.filter((task) => task.blocked || task.status === 'blocked');
}

export function getDependencyTasks(state, task) {
  return task.dependsOnTaskIds.map((id) => getTaskById(state, id)).filter(Boolean);
}

export function getBlockingTasks(state, taskId) {
  return state.tasks.filter((task) => task.dependsOnTaskIds.includes(taskId));
}

export function isTaskDone(task) {
  return task.status === 'done';
}

export function isTaskOpen(task) {
  return !['done', 'archived'].includes(task.status);
}

export function isTaskDueToday(task, today = TODAY) {
  const dueDate = parseDate(task.dueDate);
  const todayDate = parseDate(today);
  return isValidDate(dueDate) && isValidDate(todayDate) && dueDate.valueOf() === todayDate.valueOf();
}

export function getProgress(tasks) {
  if (!tasks.length) return { completed: 0, total: 0, percent: 0 };
  const completed = tasks.filter(isTaskDone).length;
  return { completed, total: tasks.length, percent: Math.round((completed / tasks.length) * 100) };
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

export function getExpectedProgress(project, today = TODAY) {
  if (!project.startDate || !project.dueDate) return null;
  const start = parseDate(project.startDate);
  const due = parseDate(project.dueDate);
  const current = parseDate(today);
  if (!isValidDate(start) || !isValidDate(due) || !isValidDate(current)) return null;

  const total = due - start;
  if (total <= 0) return null;
  if (current < start) return 0;
  if (current > due) return 100;
  return Math.round(((current - start) / total) * 100);
}

export function getHealth(project, tasks) {
  const progress = getProgress(tasks).percent;
  const expected = getExpectedProgress(project);
  const blocked = getBlockedTasks(tasks).length;
  const overdue = getOverdueTasks(tasks).length;
  const openTasks = tasks.filter(isTaskOpen).length || 1;
  const overdueRatio = overdue / openTasks;
  const dueDate = parseDate(project.dueDate);
  const todayDate = parseDate(TODAY);
  const daysUntilDue = isValidDate(dueDate) && isValidDate(todayDate) ? Math.ceil((dueDate - todayDate) / 86400000) : null;

  if (daysUntilDue !== null && daysUntilDue < 0 && progress < 100) return { level: 'Delayed', reason: 'Project due date has passed.' };
  if (overdueRatio >= 0.25) return { level: 'Delayed', reason: 'More than 25% of open tasks are overdue.' };
  if (daysUntilDue !== null && daysUntilDue <= 2 && progress < 70) return { level: 'Delayed', reason: 'Due very soon and progress is below 70%.' };
  if (overdueRatio >= 0.1) return { level: 'High Risk', reason: 'Overdue task ratio is above 10%.' };
  if (blocked >= 3 || blocked / openTasks >= 0.15) return { level: 'High Risk', reason: 'Blocked tasks need attention.' };
  if (expected !== null && daysUntilDue !== null && daysUntilDue <= 7 && progress < expected - 20) return { level: 'High Risk', reason: 'Progress is more than 20% behind expected pace.' };
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

function resolveTaskInput(stateOrTasks, userIdOrToday, maybeToday) {
  if (Array.isArray(stateOrTasks)) {
    return { tasks: stateOrTasks, today: userIdOrToday || TODAY };
  }

  return {
    tasks: getMyTasks(stateOrTasks, userIdOrToday),
    today: maybeToday || TODAY
  };
}
