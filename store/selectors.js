import { getToday } from './clock.js';
import { isValidDate, normalizeVisibility, parseDate } from './state-utils.js';

export function getCurrentUser(state) {
  return getMemberById(state, state.currentUserId);
}

export function getWorkspaceById(state, workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId) || null;
}

export function getProjectsByWorkspaceId(state, workspaceId) {
  return state.projects.filter((project) => project.workspaceId === workspaceId);
}

export function getVisibleProjectsByWorkspaceId(state, workspaceId, userId = state.currentUserId) {
  return getProjectsByWorkspaceId(state, workspaceId).filter((project) => {
    if (!canReadProject(state, project.id, userId)) return false;
    if (canManageProject(state, project, userId)) return true;
    return getVisibleProjectTasks(state, project.id, userId).length > 0;
  });
}

export function getProjectById(state, projectId) {
  return state.projects.find((project) => project.id === projectId) || null;
}

export function getTeamsByProjectId(state, projectId) {
  return state.teams.filter((team) => team.projectId === projectId);
}

export function getVisibleTeamsByProjectId(state, projectId, userId = state.currentUserId) {
  return getTeamsByProjectId(state, projectId).filter((team) => {
    if (!canReadTeam(state, team.id, userId)) return false;
    if (canManageTeam(state, team, userId) || canManageProject(state, getProjectById(state, projectId), userId)) return true;
    return getVisibleTeamTasks(state, team.id, userId).length > 0;
  });
}

export function getTeamById(state, teamId) {
  return state.teams.find((team) => team.id === teamId) || null;
}

export function getTasksByTeamId(state, teamId) {
  return state.tasks.filter((task) => task.teamId === teamId);
}

export function getVisibleTeamTasks(state, teamId, userId = state.currentUserId) {
  return getTasksByTeamId(state, teamId).filter((task) => canReadTask(state, task, userId));
}

export function getTaskById(state, taskId) {
  return state.tasks.find((task) => task.id === taskId) || null;
}

export function getVisibleTaskById(state, taskId, userId = state.currentUserId) {
  const task = getTaskById(state, taskId);
  return canReadTask(state, task, userId) ? task : null;
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

export function getVisibleAttachmentsByTaskId(state, taskId, userId = state.currentUserId) {
  return getAttachmentsByTaskId(state, taskId).filter((attachment) => canReadAttachment(state, attachment, userId));
}

export function getMyTasks(state, userId) {
  return state.tasks.filter((task) => canReadTask(state, task, userId) && (task.assigneeId === userId || task.ownerId === userId));
}

export function getVisibleTasks(state, userId = state.currentUserId) {
  return state.tasks.filter((task) => canReadTask(state, task, userId));
}

export function getTodayTasks(state, userId, today = getToday()) {
  return getMyTasks(state, userId).filter((task) => isTaskOpen(task) && isTaskDueToday(task, today));
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

export function getVisibleProjectTasks(state, projectId, userId = state.currentUserId) {
  return getProjectTasks(state, projectId).filter((task) => canReadTask(state, task, userId));
}

export function getWorkspaceTasks(state, workspaceId) {
  const projectIds = getProjectsByWorkspaceId(state, workspaceId).map((project) => project.id);
  return state.tasks.filter((task) => projectIds.includes(task.projectId));
}

export function getVisibleWorkspaceTasks(state, workspaceId, userId = state.currentUserId) {
  return getWorkspaceTasks(state, workspaceId).filter((task) => canReadTask(state, task, userId));
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
  return task.dependsOnTaskIds.map((id) => getTaskById(state, id)).filter((item) => item && canReadTask(state, item));
}

export function getAvailableDependencyTasks(state, taskId, userId = state.currentUserId) {
  const task = getTaskById(state, taskId);
  if (!task || !canReadTask(state, task, userId)) return [];
  return state.tasks.filter((candidate) => (
    candidate.id !== task.id
    && candidate.projectId === task.projectId
    && !task.dependsOnTaskIds.includes(candidate.id)
    && canReadTask(state, candidate, userId)
  ));
}

export function getBlockingTasks(state, taskId) {
  return state.tasks.filter((task) => task.dependsOnTaskIds.includes(taskId) && canReadTask(state, task));
}

export function isTaskDone(task) {
  return task.status === 'done';
}

export function isTaskOpen(task) {
  return ['not-started', 'in-progress', 'blocked'].includes(task.status);
}

export function isTaskDueToday(task, today = getToday()) {
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

export function getExpectedProgress(project, today = getToday()) {
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

export function getHealth(project, tasks, today = getToday()) {
  const progress = getProgress(tasks).percent;
  const expected = getExpectedProgress(project, today);
  const blocked = getBlockedTasks(tasks).length;
  const overdue = getOverdueTasks(tasks, today).length;
  const openTasks = tasks.filter(isTaskOpen).length || 1;
  const overdueRatio = overdue / openTasks;
  const dueDate = parseDate(project.dueDate);
  const todayDate = parseDate(today);
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

export function canReadProject(state, projectId, userId = state.currentUserId) {
  const project = getProjectById(state, projectId);
  const user = getKnownMemberById(state, userId);
  if (!project || !user) return false;
  if (isWorkspaceManager(user)) return true;
  if (canManageProject(state, project, userId)) return true;

  const userTeam = getTeamById(state, user.teamId);
  if (userTeam?.projectId === project.id) return true;

  return getProjectTasks(state, project.id).some((task) => isTaskParticipant(task, userId) && canReadTask(state, task, userId));
}

export function canReadTeam(state, teamId, userId = state.currentUserId) {
  const team = getTeamById(state, teamId);
  const user = getKnownMemberById(state, userId);
  if (!team || !user) return false;
  if (isWorkspaceManager(user)) return true;
  if (canManageProject(state, getProjectById(state, team.projectId), userId)) return true;
  if (canManageTeam(state, team, userId)) return true;
  if (user.teamId === team.id) return true;

  return getTasksByTeamId(state, team.id).some((task) => isTaskParticipant(task, userId) && canReadTask(state, task, userId));
}

export function canReadTask(state, taskOrId, userId = state.currentUserId) {
  const task = typeof taskOrId === 'string' ? getTaskById(state, taskOrId) : taskOrId;
  if (!task) return false;
  const user = getKnownMemberById(state, userId);
  if (!user) return false;
  const visibility = normalizeVisibility(task.visibility);
  if (isWorkspaceManager(user)) return true;
  if (canManageProject(state, getProjectById(state, task.projectId), userId)) return true;
  if (canManageTeam(state, getTeamById(state, task.teamId), userId)) return true;
  if (user.role === 'Team Lead') return isTaskParticipant(task, userId) || isSameTeam(state, task.teamId, userId);

  if (visibility === 'private') return isTaskParticipant(task, userId);
  if (visibility === 'assigned') return isTaskParticipant(task, userId);
  if (visibility === 'team') return isSameTeam(state, task.teamId, userId);
  if (visibility === 'project') return isProjectParticipant(state, task.projectId, userId);
  if (visibility === 'workspace') return isWorkspaceParticipant(state, task.projectId, userId);
  return false;
}

export function canReadAttachment(state, attachment, userId = state.currentUserId) {
  if (!attachment) return false;
  const task = attachment.taskId ? getTaskById(state, attachment.taskId) : null;
  if (task && !canReadTask(state, task, userId)) return false;
  const visibility = normalizeVisibility(attachment.visibility);
  if (task) return canReadTask(state, { ...task, visibility }, userId);
  if (visibility === 'private') return attachment.createdBy === userId || attachment.created_by === userId;
  if (visibility === 'assigned') return attachment.createdBy === userId || attachment.created_by === userId;
  if (visibility === 'team') return isSameTeam(state, attachment.teamId, userId);
  if (visibility === 'project') return isProjectParticipant(state, attachment.projectId, userId);
  if (visibility === 'workspace') return isWorkspaceParticipant(state, attachment.projectId, userId);
  return false;
}

export function canWriteTask(state, task, userId = state.currentUserId) {
  if (!task) return false;
  const user = getMemberById(state, userId);
  if (user.role === 'Viewer') return false;
  if (isWorkspaceManager(user)) return true;
  if (canManageProject(state, getProjectById(state, task.projectId), userId)) return true;
  if (canManageTeam(state, getTeamById(state, task.teamId), userId)) return true;
  if (user.role === 'Member') return isTaskParticipant(task, userId);
  return false;
}

export function canWriteAttachment(state, attachment, userId = state.currentUserId) {
  if (!attachment) return false;
  const task = attachment.taskId ? getTaskById(state, attachment.taskId) : null;
  if (!task) return false;
  return canReadAttachment(state, attachment, userId) && canWriteTask(state, task, userId);
}

export function canCreateTask(state, { teamId, projectId, assigneeId }, userId = state.currentUserId) {
  const user = getMemberById(state, userId);
  if (user.role === 'Viewer') return false;
  if (isWorkspaceManager(user)) return true;
  if (canManageProject(state, getProjectById(state, projectId), userId)) return true;
  if (canManageTeam(state, getTeamById(state, teamId), userId)) return true;
  return user.role === 'Member' && assigneeId === userId && isSameTeam(state, teamId, userId);
}

export function canCreateProject(state, workspaceId, userId = state.currentUserId) {
  const workspace = getWorkspaceById(state, workspaceId);
  const user = getMemberById(state, userId);
  if (!workspace || user.role === 'Viewer') return false;
  return isWorkspaceManager(user) && workspace.id === state.selectedWorkspaceId;
}

export function canCreateTeam(state, { projectId }, userId = state.currentUserId) {
  const project = getProjectById(state, projectId);
  if (!project) return false;
  return canManageProject(state, project, userId);
}

export function canManageProject(state, project, userId = state.currentUserId) {
  if (!project) return false;
  const user = getMemberById(state, userId);
  if (isWorkspaceManager(user)) return project.workspaceId === state.selectedWorkspaceId;
  return user.role === 'Project Manager' && project.ownerId === userId;
}

export function canManageTeam(state, team, userId = state.currentUserId) {
  if (!team) return false;
  const user = getMemberById(state, userId);
  if (isWorkspaceManager(user)) return true;
  if (canManageProject(state, getProjectById(state, team.projectId), userId)) return true;
  return user.role === 'Team Lead' && team.leadId === userId;
}

function isWorkspaceManager(user) {
  return user.role === 'Workspace Owner' || user.role === 'Workspace Admin';
}

function getKnownMemberById(state, memberId) {
  return state.members.find((member) => member.id === memberId) || null;
}

function isTaskParticipant(task, userId) {
  return task.ownerId === userId || task.assigneeId === userId;
}

function isSameTeam(state, teamId, userId) {
  const user = getMemberById(state, userId);
  return Boolean(teamId && user.teamId === teamId);
}

function isProjectParticipant(state, projectId, userId) {
  if (!projectId) return false;
  const user = getMemberById(state, userId);
  if (canManageProject(state, getProjectById(state, projectId), userId)) return true;
  return state.teams.some((team) => team.projectId === projectId && team.id === user.teamId);
}

function isWorkspaceParticipant(state, projectId, userId) {
  return Boolean(getProjectById(state, projectId) && state.members.some((member) => member.id === userId));
}

function resolveTaskInput(stateOrTasks, userIdOrToday, maybeToday) {
  if (Array.isArray(stateOrTasks)) {
    return { tasks: stateOrTasks, today: userIdOrToday || getToday() };
  }

  return {
    tasks: getMyTasks(stateOrTasks, userIdOrToday),
    today: maybeToday || getToday()
  };
}
