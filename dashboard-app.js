import { renderRoute, syncRouteSelection } from './pages/router.js';
import { createTask, deleteTask, updateTaskAssignee, updateTaskDueDate, updateTaskStatus } from './store/actions.js';
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
  bindTaskLifecycleActions();
  bindTaskDeleteActions();
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

function bindTaskLifecycleActions() {
  app.querySelectorAll('[data-action="complete-task"], [data-action="reopen-task"]').forEach((control) => {
    control.addEventListener('click', (event) => {
      const nextStatus = event.currentTarget.dataset.action === 'complete-task' ? 'done' : 'in-progress';
      const result = updateTaskStatus(event.currentTarget.dataset.taskId, nextStatus);
      if (!result.ok) {
        event.currentTarget.dataset.error = result.error;
      }
    });
  });
}

function bindTaskDeleteActions() {
  app.querySelectorAll('[data-action="delete-task"]').forEach((control) => {
    control.addEventListener('click', (event) => {
      const taskId = event.currentTarget.dataset.taskId;
      const teamId = event.currentTarget.dataset.teamId;
      const confirmed = window.confirm('Delete this task? This only affects the in-memory prototype state.');
      if (!confirmed) return;

      const result = deleteTask(taskId);
      if (!result.ok) {
        event.currentTarget.dataset.error = result.error;
        return;
      }

      window.location.hash = `#/team/${teamId}`;
    });
  });
}

subscribe(render);
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
