import { getState, subscribe } from './store/store.js';
import { updateTaskStatus } from './store/actions.js';
import { renderRoute, syncRouteSelection } from './pages/router.js';

const app = document.getElementById('app');
let isRendering = false;

function render() {
  if (isRendering) return;
  isRendering = true;
  syncRouteSelection(window.location.hash);
  app.innerHTML = renderRoute(getState());
  bindClickableCards();
  bindPrototypeActions();
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

function bindPrototypeActions() {
  const createTaskButton = app.querySelector('[data-action="open-create-task"]');
  if (createTaskButton) {
    createTaskButton.addEventListener('click', () => {
      window.alert('Prototype only: this button represents creating a task. No data is persisted in Sprint 2.');
    });
  }
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
