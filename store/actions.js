import { dispatch, getState } from './store.js';
import {
  isExternalUrl,
  isNullableDueDate,
  isValidVisibility,
  normalizeText,
  normalizeVisibility,
  TASK_STATUSES
} from './state-utils.js';
import {
  canCreateProject,
  canCreateTask,
  canCreateTeam,
  canManageProject,
  canManageTeam,
  canReadProject,
  canReadTask,
  canReadTeam,
  canWriteAttachment,
  canWriteTask,
  getAvailableDependencyTasks,
  getProjectById,
  getTaskById,
  getTeamById
} from './selectors.js';

export function switchCurrentUser(userId) {
  const state = getState();
  const user = state.members.find((member) => member.id === userId);
  if (!user) return { ok: false, error: 'MEMBER_NOT_FOUND' };
  if (state.currentUserId === userId) return { ok: true, unchanged: true };

  return dispatch((draft) => {
    draft.currentUserId = userId;
    return { ok: true, userId };
  });
}

export function createProject({ workspaceId, name, description = '', ownerId, startDate = null, dueDate = null, nextAction = '', riskLevelManual = null, visibility = 'workspace' }) {
  const parsedName = normalizeText(name);
  if (!parsedName) {
    return { ok: false, error: 'INVALID_NAME' };
  }

  const state = getState();
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return { ok: false, error: 'WORKSPACE_NOT_FOUND' };
  if (!state.members.some((member) => member.id === ownerId)) return { ok: false, error: 'MEMBER_NOT_FOUND' };
  if (!isNullableDueDate(startDate) || !isNullableDueDate(dueDate)) return { ok: false, error: 'INVALID_DUE_DATE' };
  if (!isValidVisibility(visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };
  if (!canCreateProject(state, workspaceId)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const id = `project-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return dispatch((draft) => {
    draft.projects.push({
      id,
      workspaceId,
      name: parsedName,
      description: normalizeText(description),
      ownerId,
      startDate,
      dueDate,
      nextAction: normalizeText(nextAction) || 'Define project next action',
      riskLevelManual: normalizeRisk(riskLevelManual),
      visibility
    });
    draft.selectedProjectId = id;
    draft.selectedWorkspaceId = workspace.id;
    return { ok: true, projectId: id };
  });
}

export function updateProject(projectId, updates) {
  const state = getState();
  const existing = getProjectById(state, projectId);
  if (!existing) return { ok: false, error: 'PROJECT_NOT_FOUND' };
  if (!canManageProject(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const parsed = {};
  if (Object.hasOwn(updates, 'name')) {
    const name = normalizeText(updates.name);
    if (!name) return { ok: false, error: 'INVALID_NAME' };
    parsed.name = name;
  }
  if (Object.hasOwn(updates, 'description')) parsed.description = normalizeText(updates.description);
  if (Object.hasOwn(updates, 'ownerId')) {
    if (!state.members.some((member) => member.id === updates.ownerId)) return { ok: false, error: 'MEMBER_NOT_FOUND' };
    parsed.ownerId = updates.ownerId;
  }
  if (Object.hasOwn(updates, 'startDate')) {
    if (!isNullableDueDate(updates.startDate || null)) return { ok: false, error: 'INVALID_DUE_DATE' };
    parsed.startDate = updates.startDate || null;
  }
  if (Object.hasOwn(updates, 'dueDate')) {
    if (!isNullableDueDate(updates.dueDate || null)) return { ok: false, error: 'INVALID_DUE_DATE' };
    parsed.dueDate = updates.dueDate || null;
  }
  if (Object.hasOwn(updates, 'nextAction')) parsed.nextAction = normalizeText(updates.nextAction);
  if (Object.hasOwn(updates, 'riskLevelManual')) parsed.riskLevelManual = normalizeRisk(updates.riskLevelManual);
  if (Object.hasOwn(updates, 'visibility')) {
    if (!isValidVisibility(updates.visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };
    parsed.visibility = updates.visibility;
  }

  return dispatch((draft) => {
    Object.assign(draft.projects.find((project) => project.id === projectId), parsed);
    return { ok: true };
  });
}

export function createTeam({ projectId, name, leadId, memberIds = [], nextAction = '', visibility = 'project' }) {
  const parsedName = normalizeText(name);
  if (!parsedName) return { ok: false, error: 'INVALID_NAME' };

  const state = getState();
  const project = getProjectById(state, projectId);
  if (!project) return { ok: false, error: 'PROJECT_NOT_FOUND' };
  if (!state.members.some((member) => member.id === leadId)) return { ok: false, error: 'MEMBER_NOT_FOUND' };
  if (!Array.isArray(memberIds) || !memberIds.every((id) => state.members.some((member) => member.id === id))) {
    return { ok: false, error: 'MEMBER_NOT_FOUND' };
  }
  if (!isValidVisibility(visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };
  if (!canCreateTeam(state, { projectId })) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const id = `team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const assignedMembers = [...new Set([leadId, ...memberIds])];

  return dispatch((draft) => {
    draft.teams.push({
      id,
      projectId,
      name: parsedName,
      leadId,
      nextAction: normalizeText(nextAction) || 'Define team next action',
      visibility
    });
    draft.members.forEach((member) => {
      if (assignedMembers.includes(member.id)) member.teamId = id;
    });
    draft.selectedTeamId = id;
    draft.selectedProjectId = project.id;
    draft.selectedWorkspaceId = project.workspaceId;
    return { ok: true, teamId: id };
  });
}

export function updateTeam(teamId, updates) {
  const state = getState();
  const existing = getTeamById(state, teamId);
  if (!existing) return { ok: false, error: 'TEAM_NOT_FOUND' };
  if (!canManageTeam(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const parsed = {};
  if (Object.hasOwn(updates, 'name')) {
    const name = normalizeText(updates.name);
    if (!name) return { ok: false, error: 'INVALID_NAME' };
    parsed.name = name;
  }
  if (Object.hasOwn(updates, 'leadId')) {
    if (!state.members.some((member) => member.id === updates.leadId)) return { ok: false, error: 'MEMBER_NOT_FOUND' };
    parsed.leadId = updates.leadId;
  }
  if (Object.hasOwn(updates, 'projectId')) {
    const targetProject = getProjectById(state, updates.projectId);
    if (!targetProject) return { ok: false, error: 'PROJECT_NOT_FOUND' };
    if (!canManageProject(state, targetProject)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };
    parsed.projectId = updates.projectId;
  }
  if (Object.hasOwn(updates, 'nextAction')) parsed.nextAction = normalizeText(updates.nextAction);
  if (Object.hasOwn(updates, 'visibility')) {
    if (!isValidVisibility(updates.visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };
    parsed.visibility = updates.visibility;
  }
  const memberIds = Object.hasOwn(updates, 'memberIds') ? updates.memberIds : null;
  if (memberIds !== null && (!Array.isArray(memberIds) || !memberIds.every((id) => state.members.some((member) => member.id === id)))) {
    return { ok: false, error: 'MEMBER_NOT_FOUND' };
  }

  return dispatch((draft) => {
    const team = draft.teams.find((item) => item.id === teamId);
    Object.assign(team, parsed);
    if (memberIds !== null) {
      const assigned = new Set([team.leadId, ...memberIds]);
      draft.members.forEach((member) => {
        if (assigned.has(member.id)) member.teamId = teamId;
        else if (member.teamId === teamId) member.teamId = null;
      });
    }
    if (parsed.projectId) {
      draft.tasks.forEach((task) => {
        if (task.teamId === teamId) task.projectId = parsed.projectId;
      });
      draft.attachments.forEach((attachment) => {
        if (attachment.teamId === teamId) attachment.projectId = parsed.projectId;
      });
    }
    return { ok: true };
  });
}

export function createTask({ title, teamId, projectId, assigneeId, dueDate = null, weight = 2, visibility = 'team', nextAction = 'Define next action', riskStatus = 'Low', description = '' }) {
  const parsedTitle = normalizeText(title);
  if (!parsedTitle) {
    return { ok: false, error: 'INVALID_TITLE' };
  }

  const state = getState();
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return { ok: false, error: 'TEAM_NOT_FOUND' };
  if (!state.projects.some((project) => project.id === projectId)) {
    return { ok: false, error: 'PROJECT_NOT_FOUND' };
  }
  if (team.projectId !== projectId) {
    return { ok: false, error: 'TEAM_PROJECT_MISMATCH' };
  }
  if (!state.members.some((member) => member.id === assigneeId)) {
    return { ok: false, error: 'MEMBER_NOT_FOUND' };
  }
  if (!isNullableDueDate(dueDate)) {
    return { ok: false, error: 'INVALID_DUE_DATE' };
  }
  if (!isValidVisibility(visibility)) {
    return { ok: false, error: 'INVALID_VISIBILITY' };
  }
  if (!canCreateTask(state, { teamId, projectId, assigneeId })) {
    return { ok: false, error: 'UNAUTHORIZED_WRITE' };
  }

  const parsedWeight = Number(weight);
  if (!Number.isFinite(parsedWeight) || parsedWeight < 1 || parsedWeight > 3) {
    return { ok: false, error: 'INVALID_WEIGHT' };
  }

  const id = `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return dispatch((draft) => {
    draft.tasks.push({
      id,
      title: parsedTitle,
      teamId,
      projectId,
      status: 'not-started',
      ownerId: assigneeId,
      assigneeId,
      orderId: null,
      dueDate,
      weight: parsedWeight,
      nextAction: normalizeText(nextAction) || 'Define next action',
      riskStatus: normalizeRisk(riskStatus) || 'Low',
      description: normalizeText(description),
      dependsOnTaskIds: [],
      blocked: false,
      visibility
    });
    return { ok: true, taskId: id };
  });
}

export function selectWorkspace(workspaceId) {
  const state = getState();
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) {
    return { ok: false, error: 'WORKSPACE_NOT_FOUND' };
  }
  if (state.selectedWorkspaceId === workspaceId) {
    return { ok: true, unchanged: true };
  }

  return dispatch((draft) => {
    draft.selectedWorkspaceId = workspaceId;
    return { ok: true };
  });
}

export function selectProject(projectId) {
  const state = getState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return { ok: false, error: 'PROJECT_NOT_FOUND' };
  if (!canReadProject(state, projectId)) return { ok: false, error: 'UNAUTHORIZED_SELECTION' };
  if (state.selectedProjectId === projectId && state.selectedWorkspaceId === project.workspaceId) {
    return { ok: true, unchanged: true };
  }

  return dispatch((draft) => {
    draft.selectedProjectId = projectId;
    draft.selectedWorkspaceId = project.workspaceId;
    return { ok: true };
  });
}

export function selectTeam(teamId) {
  const state = getState();
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return { ok: false, error: 'TEAM_NOT_FOUND' };
  if (!canReadTeam(state, teamId)) return { ok: false, error: 'UNAUTHORIZED_SELECTION' };
  const project = state.projects.find((item) => item.id === team.projectId);
  if (state.selectedTeamId === teamId && state.selectedProjectId === team.projectId) {
    return { ok: true, unchanged: true };
  }

  return dispatch((draft) => {
    draft.selectedTeamId = teamId;
    draft.selectedProjectId = team.projectId;
    draft.selectedWorkspaceId = project?.workspaceId || draft.selectedWorkspaceId;
    return { ok: true };
  });
}

export function selectTask(taskId) {
  const state = getState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (!canReadTask(state, taskId)) return { ok: false, error: 'UNAUTHORIZED_SELECTION' };
  const project = state.projects.find((item) => item.id === task.projectId);
  if (state.selectedTaskId === taskId && state.selectedTeamId === task.teamId) {
    return { ok: true, unchanged: true };
  }

  return dispatch((draft) => {
    draft.selectedTaskId = taskId;
    draft.selectedTeamId = task.teamId;
    draft.selectedProjectId = task.projectId;
    draft.selectedWorkspaceId = project?.workspaceId || draft.selectedWorkspaceId;
    return { ok: true };
  });
}

export function updateTaskStatus(taskId, status) {
  if (!TASK_STATUSES.includes(status)) {
    return { ok: false, error: 'INVALID_STATUS' };
  }

  const state = getState();
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }
  if (!canWriteTask(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    task.status = status;
    task.blocked = status === 'blocked';
    if (status !== 'blocked') delete task.blockedReason;
    return { ok: true };
  });
}

export function deleteTask(taskId) {
  const state = getState();
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }
  if (!canWriteTask(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  return dispatch((draft) => {
    draft.tasks = draft.tasks.filter((task) => task.id !== taskId);
    draft.activities = draft.activities.filter((activity) => activity.taskId !== taskId);
    draft.attachments = draft.attachments.filter((attachment) => attachment.taskId !== taskId);
    draft.tasks.forEach((task) => {
      task.dependsOnTaskIds = task.dependsOnTaskIds.filter((id) => id !== taskId);
    });
    if (draft.selectedTaskId === taskId) draft.selectedTaskId = null;
    return { ok: true };
  });
}

export function updateTaskAssignee(taskId, memberId) {
  const state = getState();
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }
  if (!state.members.some((member) => member.id === memberId)) {
    return { ok: false, error: 'MEMBER_NOT_FOUND' };
  }
  if (!canWriteTask(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    task.assigneeId = memberId;
    task.ownerId = memberId;
    return { ok: true };
  });
}

export function updateTaskDueDate(taskId, dueDate) {
  const state = getState();
  const existing = state.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }
  if (!isNullableDueDate(dueDate)) {
    return { ok: false, error: 'INVALID_DUE_DATE' };
  }
  if (!canWriteTask(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    task.dueDate = dueDate;
    return { ok: true };
  });
}

export function updateTask(taskId, updates) {
  const state = getState();
  const existing = getTaskById(state, taskId);
  if (!existing) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (!canWriteTask(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const parsed = {};
  if (Object.hasOwn(updates, 'title')) {
    const title = normalizeText(updates.title);
    if (!title) return { ok: false, error: 'INVALID_TITLE' };
    parsed.title = title;
  }
  if (Object.hasOwn(updates, 'status')) {
    if (!TASK_STATUSES.includes(updates.status)) return { ok: false, error: 'INVALID_STATUS' };
    parsed.status = updates.status;
    parsed.blocked = updates.status === 'blocked';
  }
  if (Object.hasOwn(updates, 'assigneeId')) {
    if (!state.members.some((member) => member.id === updates.assigneeId)) return { ok: false, error: 'MEMBER_NOT_FOUND' };
    parsed.assigneeId = updates.assigneeId;
    parsed.ownerId = updates.assigneeId;
  }
  if (Object.hasOwn(updates, 'dueDate')) {
    const dueDate = updates.dueDate || null;
    if (!isNullableDueDate(dueDate)) return { ok: false, error: 'INVALID_DUE_DATE' };
    parsed.dueDate = dueDate;
  }
  if (Object.hasOwn(updates, 'visibility')) {
    if (!isValidVisibility(updates.visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };
    parsed.visibility = updates.visibility;
  }
  if (Object.hasOwn(updates, 'nextAction')) parsed.nextAction = normalizeText(updates.nextAction);
  if (Object.hasOwn(updates, 'riskStatus')) parsed.riskStatus = normalizeRisk(updates.riskStatus) || 'Low';
  if (Object.hasOwn(updates, 'description')) parsed.description = normalizeText(updates.description);

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    Object.assign(task, parsed);
    if (parsed.status !== 'blocked') delete task.blockedReason;
    return { ok: true };
  });
}

export function addTaskDependency(taskId, dependencyTaskId) {
  const state = getState();
  const task = getTaskById(state, taskId);
  if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (!canWriteTask(state, task)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };
  if (taskId === dependencyTaskId) return { ok: false, error: 'INVALID_DEPENDENCY' };
  if (task.dependsOnTaskIds.includes(dependencyTaskId)) return { ok: false, error: 'DUPLICATE_DEPENDENCY' };
  const dependency = getTaskById(state, dependencyTaskId);
  if (!dependency) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (!getAvailableDependencyTasks(state, taskId).some((candidate) => candidate.id === dependencyTaskId)) {
    return { ok: false, error: 'UNAUTHORIZED_DEPENDENCY' };
  }

  return dispatch((draft) => {
    draft.tasks.find((item) => item.id === taskId).dependsOnTaskIds.push(dependencyTaskId);
    return { ok: true };
  });
}

export function removeTaskDependency(taskId, dependencyTaskId) {
  const state = getState();
  const task = getTaskById(state, taskId);
  if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (!canWriteTask(state, task)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };
  if (!task.dependsOnTaskIds.includes(dependencyTaskId)) return { ok: false, error: 'DEPENDENCY_NOT_FOUND' };

  return dispatch((draft) => {
    const draftTask = draft.tasks.find((item) => item.id === taskId);
    draftTask.dependsOnTaskIds = draftTask.dependsOnTaskIds.filter((id) => id !== dependencyTaskId);
    return { ok: true };
  });
}

export function addExternalLink({ taskId, title, type = 'External Link', url, note = '', visibility = 'team' }) {
  const parsedTitle = normalizeText(title);
  if (!parsedTitle) return { ok: false, error: 'INVALID_TITLE' };
  if (!isExternalUrl(url)) return { ok: false, error: 'INVALID_URL' };
  if (!isValidVisibility(visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };

  const state = getState();
  const task = getTaskById(state, taskId);
  if (!task) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (!canWriteTask(state, task)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const id = `link-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return dispatch((draft) => {
    draft.attachments.push({
      id,
      projectId: task.projectId,
      teamId: task.teamId,
      taskId,
      title: parsedTitle,
      type: normalizeText(type) || 'External Link',
      url: String(url).trim(),
      note: normalizeText(note),
      createdBy: state.currentUserId,
      created_by: state.currentUserId,
      createdAt: todayString(),
      created_at: todayString(),
      visibility
    });
    return { ok: true, attachmentId: id };
  });
}

export function updateExternalLink(attachmentId, updates) {
  const state = getState();
  const existing = state.attachments.find((attachment) => attachment.id === attachmentId);
  if (!existing) return { ok: false, error: 'ATTACHMENT_NOT_FOUND' };
  if (!canWriteAttachment(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  const parsed = {};
  if (Object.hasOwn(updates, 'title')) {
    const title = normalizeText(updates.title);
    if (!title) return { ok: false, error: 'INVALID_TITLE' };
    parsed.title = title;
  }
  if (Object.hasOwn(updates, 'type')) parsed.type = normalizeText(updates.type) || 'External Link';
  if (Object.hasOwn(updates, 'url')) {
    if (!isExternalUrl(updates.url)) return { ok: false, error: 'INVALID_URL' };
    parsed.url = String(updates.url).trim();
  }
  if (Object.hasOwn(updates, 'note')) parsed.note = normalizeText(updates.note);
  if (Object.hasOwn(updates, 'visibility')) {
    if (!isValidVisibility(updates.visibility)) return { ok: false, error: 'INVALID_VISIBILITY' };
    parsed.visibility = updates.visibility;
  }

  return dispatch((draft) => {
    Object.assign(draft.attachments.find((attachment) => attachment.id === attachmentId), parsed);
    return { ok: true };
  });
}

export function removeExternalLink(attachmentId) {
  const state = getState();
  const existing = state.attachments.find((attachment) => attachment.id === attachmentId);
  if (!existing) return { ok: false, error: 'ATTACHMENT_NOT_FOUND' };
  if (!canWriteAttachment(state, existing)) return { ok: false, error: 'UNAUTHORIZED_WRITE' };

  return dispatch((draft) => {
    draft.attachments = draft.attachments.filter((attachment) => attachment.id !== attachmentId);
    return { ok: true };
  });
}

function normalizeRisk(value) {
  if (value === null || value === undefined || value === '') return null;
  return ['Low', 'Medium', 'High'].includes(value) ? value : 'Low';
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
