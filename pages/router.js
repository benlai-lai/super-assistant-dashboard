import { selectProject, selectTask, selectTeam, selectWorkspace } from '../store/actions.js';
import { renderMyTasksPage } from './my-tasks-page.js';
import { renderProjectPage } from './project-page.js';
import { renderTaskPage } from './task-page.js';
import { renderTeamPage } from './team-page.js';
import { renderWorkspacePage } from './workspace-page.js';

const DEFAULT_ROUTE = '#/workspace/workspace-camp';

export function syncRouteSelection(hash = window.location.hash || DEFAULT_ROUTE) {
  const [, route, id] = hash.split('/');

  if (route === 'workspace') return selectWorkspace(id || 'workspace-camp');
  if (route === 'project') return selectProject(id);
  if (route === 'team') return selectTeam(id);
  if (route === 'task') return selectTask(id);
  return { ok: true };
}

export function renderRoute(state) {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const [, route, id] = hash.split('/');

  if (route === 'project') return renderProjectPage(state, id);
  if (route === 'team') return renderTeamPage(state, id);
  if (route === 'task') return renderTaskPage(state, id);
  if (route === 'my-tasks') return renderMyTasksPage(state);
  return renderWorkspacePage(state, id || 'workspace-camp');
}
