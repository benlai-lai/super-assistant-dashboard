import { renderMyTasksPage } from './my-tasks-page.js';
import { renderProjectPage } from './project-page.js';
import { renderTaskPage } from './task-page.js';
import { renderTeamPage } from './team-page.js';
import { renderWorkspacePage } from './workspace-page.js';

export function renderRoute(data) {
  const hash = window.location.hash || '#/workspace/workspace-camp';
  const [, route, id] = hash.split('/');

  if (route === 'project') return renderProjectPage(data, id);
  if (route === 'team') return renderTeamPage(data, id);
  if (route === 'task') return renderTaskPage(data, id);
  if (route === 'my-tasks') return renderMyTasksPage(data);
  return renderWorkspacePage(data, id || 'workspace-camp');
}