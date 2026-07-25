import { renderRoute, syncRouteSelection } from './pages/router.js';
import { createTask, updateTaskAssignee, updateTaskDueDate, updateTaskStatus } from './store/actions.js';
import { getState, subscribe } from './store/store.js';

const app = document.getElementById('app');
let isRendering = false;

function render() {
  if (isRendering) return;
  isRendering = true;
  syncRouteSelection(window.location.hash);
  app.innerHTML = renderRoute(getState());
  bindClickableCards();
  bindCreateTaskForm();
  bindTaskAssigneeControls();
  bindTaskDueDateControls();
  bindTaskStatusControls();
  isRendering = false;
}

function bindClickableCards() {
  app.querySelectorAll('[data-link]').forEach((element) => {
    element.addEventListener('click', (event) => {
      const interactive = event.target.closest('a, button, input, select, textarea');
      if (interactive) return;
      window.location.hash = element.dataset.link;
    });
  });
}

function bindCreateTaskForm() {
  const toggle = app.querySelector('[data-action="toggle-create-task"]');
  const panel = app.querySelector('#create-task-panel');
  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
    });
  }

  const form = app.querySelector('[data-action="create-task"]');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const result = createTask({
      title: formData.get('title'),
      teamId: formData.get('teamId'),
      projectId: formData.get('projectId'),
      assigneeId: formData.get('assigneeId'),
      dueDate: formData.get('dueDate') || null,
      weight: 2
    });

    if (!result.ok) {
      form.dataset.error = result.error;
      return;
    }

    form.reset();
    if (panel) panel.hidden = true;
  });
}

function bindTaskAssigneeControls() {
  app.querySelectorAll('[data-action="update-task-assignee"]').forEach((control) => {
    control.addEventListener('change', (event) => {
      const result = updateTaskAssignee(event.target.dataset.taskId, event.target.value);
      if (!result.ok) {
        event.target.dataset.error = result.error;
      }
    });
  });
}

function bindTaskDueDateControls() {
  app.querySelectorAll('[data-action="update-task-due-date"]').forEach((control) => {
    control.addEventListener('change', (event) => {
      const result = updateTaskDueDate(event.target.dataset.taskId, event.target.value || null);
      if (!result.ok) {
        event.target.dataset.error = result.error;
      }
    });
  });
}

function bindTaskStatusControls() {
  app.querySelectorAll('[data-action="update-task-status"]').forEach((control) => {
    control.addEventListener('change', (event) => {
      const result = updateTaskStatus(event.target.dataset.taskId, event.target.value);
      if (!result.ok) {
        event.target.dataset.error = result.error;
      }
    });
  });
}

subscribe(render);
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
