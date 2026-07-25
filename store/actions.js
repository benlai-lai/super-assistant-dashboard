import { dispatch, getState } from './store.js';
import { isNullableDueDate, TASK_STATUSES } from './state-utils.js';

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
  if (!state.tasks.some((task) => task.id === taskId)) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    task.status = status;
    task.blocked = status === 'blocked';
    if (status !== 'blocked') delete task.blockedReason;
    return { ok: true };
  });
}

export function updateTaskAssignee(taskId, memberId) {
  const state = getState();
  if (!state.tasks.some((task) => task.id === taskId)) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }
  if (!state.members.some((member) => member.id === memberId)) {
    return { ok: false, error: 'MEMBER_NOT_FOUND' };
  }

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    task.assigneeId = memberId;
    task.ownerId = memberId;
    return { ok: true };
  });
}

export function updateTaskDueDate(taskId, dueDate) {
  const state = getState();
  if (!state.tasks.some((task) => task.id === taskId)) {
    return { ok: false, error: 'TASK_NOT_FOUND' };
  }
  if (!isNullableDueDate(dueDate)) {
    return { ok: false, error: 'INVALID_DUE_DATE' };
  }

  return dispatch((draft) => {
    const task = draft.tasks.find((item) => item.id === taskId);
    task.dueDate = dueDate;
    return { ok: true };
  });
}
