import { dispatch, getState } from './store.js';
import { isNullableDueDate, normalizeVisibility, TASK_STATUSES } from './state-utils.js';
import { canCreateTask, canReadProject, canReadTask, canReadTeam, canWriteTask } from './selectors.js';

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

export function createTask({ title, teamId, projectId, assigneeId, dueDate = null, weight = 2, visibility = 'team' }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
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
      title: title.trim(),
      teamId,
      projectId,
      status: 'not-started',
      ownerId: assigneeId,
      assigneeId,
      orderId: null,
      dueDate,
      weight: parsedWeight,
      nextAction: 'Define next action',
      dependsOnTaskIds: [],
      blocked: false,
      visibility: normalizeVisibility(visibility)
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
