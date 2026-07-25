import { mockData } from './data/mock-data.js';
import { renderRoute } from './pages/router.js';

const app = document.getElementById('app');

function render() {
  app.innerHTML = renderRoute(mockData);
  bindClickableCards();
  bindPrototypeActions();
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
      window.alert('Prototype only: this button represents creating a task. No data is persisted in Sprint 1.');
    });
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);