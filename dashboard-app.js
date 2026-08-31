import { renderRoute, syncRouteSelection } from './pages/router.js';
import {
  addExternalLink,
  addTaskDependency,
  createProject,
  createTask,
  createTeam,
  deleteTask,
  removeExternalLink,
  removeTaskDependency,
  switchCurrentUser,
  updateExternalLink,
  updateProject,
  updateTask,
  updateTaskAssignee,
  updateTaskDueDate,
  updateTaskStatus,
  updateTeam
} from './store/actions.js';
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
  bindProjectForms();
  bindTeamForms();
  bindTaskFieldControls();
  bindExternalLinkForms();
  bindDependencyForms();
  bindTaskAssigneeControls();
  bindTaskDueDateControls();
  bindTaskLifecycleActions();
  bindTaskDeleteActions();
  bindTaskStatusControls();
  bindMockUserSwitcher();
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
      weight: 2,
      visibility: formData.get('visibility') || 'team'
    });

    if (!result.ok) {
      form.dataset.error = result.error;
      return;
    }

    form.reset();
    if (panel) panel.hidden = true;
  });
}

function bindProjectForms() {
  bindToggle('toggle-create-project', 'create-project-panel');
  bindToggle('toggle-edit-project', 'edit-project-panel');

  const createForm = app.querySelector('[data-action="create-project"]');
  if (createForm) {
    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(createForm);
      const result = createProject({
        workspaceId: formData.get('workspaceId'),
        name: formData.get('name'),
        description: formData.get('description'),
        ownerId: formData.get('ownerId'),
        startDate: formData.get('startDate') || null,
        dueDate: formData.get('dueDate') || null,
        nextAction: formData.get('nextAction'),
        riskLevelManual: formData.get('riskLevelManual') || null,
        visibility: formData.get('visibility')
      });
      handleFormResult(createForm, result);
      if (result.ok) window.location.hash = `#/project/${result.projectId}`;
    });
  }

  const editForm = app.querySelector('[data-action="edit-project"]');
  if (editForm) {
    editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(editForm);
      const result = updateProject(formData.get('projectId'), {
        name: formData.get('name'),
        description: formData.get('description'),
        ownerId: formData.get('ownerId'),
        startDate: formData.get('startDate') || null,
        dueDate: formData.get('dueDate') || null,
        nextAction: formData.get('nextAction'),
        riskLevelManual: formData.get('riskLevelManual') || null,
        visibility: formData.get('visibility')
      });
      handleFormResult(editForm, result);
    });
  }
}

function bindTeamForms() {
  bindToggle('toggle-create-team', 'create-team-panel');
  bindToggle('toggle-edit-team', 'edit-team-panel');

  const createForm = app.querySelector('[data-action="create-team"]');
  if (createForm) {
    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(createForm);
      const result = createTeam({
        projectId: formData.get('projectId'),
        name: formData.get('name'),
        leadId: formData.get('leadId'),
        memberIds: formData.getAll('memberIds'),
        nextAction: formData.get('nextAction'),
        visibility: formData.get('visibility')
      });
      handleFormResult(createForm, result);
      if (result.ok) window.location.hash = `#/team/${result.teamId}`;
    });
  }

  const editForm = app.querySelector('[data-action="edit-team"]');
  if (editForm) {
    editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(editForm);
      const result = updateTeam(formData.get('teamId'), {
        name: formData.get('name'),
        projectId: formData.get('projectId'),
        leadId: formData.get('leadId'),
        memberIds: formData.getAll('memberIds'),
        nextAction: formData.get('nextAction'),
        visibility: formData.get('visibility')
      });
      handleFormResult(editForm, result);
    });
  }
}

function bindTaskFieldControls() {
  app.querySelectorAll('[data-action="update-task-field"]').forEach((control) => {
    const eventNames = control.tagName === 'TEXTAREA' || control.type === 'text' ? ['change', 'blur'] : ['change'];
    eventNames.forEach((eventName) => control.addEventListener(eventName, (event) => {
      const field = event.target.dataset.field;
      const result = updateTask(event.target.dataset.taskId, { [field]: event.target.value });
      if (!result.ok) event.target.dataset.error = result.error;
    }));
  });
}

function bindExternalLinkForms() {
  app.querySelectorAll('[data-action="add-external-link"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const result = addExternalLink({
        taskId: formData.get('taskId'),
        title: formData.get('title'),
        type: formData.get('type'),
        url: formData.get('url'),
        note: formData.get('note'),
        visibility: formData.get('visibility')
      });
      handleFormResult(form, result);
      if (result.ok) form.reset();
    });
  });

  app.querySelectorAll('[data-action="edit-external-link"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const result = updateExternalLink(formData.get('attachmentId'), {
        title: formData.get('title'),
        type: formData.get('type'),
        url: formData.get('url'),
        note: formData.get('note'),
        visibility: formData.get('visibility')
      });
      handleFormResult(form, result);
    });
  });

  app.querySelectorAll('[data-action="remove-external-link"]').forEach((control) => {
    control.addEventListener('click', (event) => {
      const result = removeExternalLink(event.currentTarget.dataset.attachmentId);
      if (!result.ok) event.currentTarget.dataset.error = result.error;
    });
  });
}

function bindDependencyForms() {
  app.querySelectorAll('[data-action="add-task-dependency"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const result = addTaskDependency(formData.get('taskId'), formData.get('dependencyTaskId'));
      handleFormResult(form, result);
    });
  });

  app.querySelectorAll('[data-action="remove-task-dependency"]').forEach((control) => {
    control.addEventListener('click', (event) => {
      const result = removeTaskDependency(event.currentTarget.dataset.taskId, event.currentTarget.dataset.dependencyTaskId);
      if (!result.ok) event.currentTarget.dataset.error = result.error;
    });
  });
}

function bindToggle(action, panelId) {
  const toggle = app.querySelector(`[data-action="${action}"]`);
  const panel = app.querySelector(`#${panelId}`);
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });
}

function handleFormResult(form, result) {
  if (!result.ok) {
    form.dataset.error = result.error;
    return;
  }
  delete form.dataset.error;
}

function bindMockUserSwitcher() {
  app.querySelectorAll('[data-action="switch-current-user"]').forEach((control) => {
    control.addEventListener('change', (event) => {
      const result = switchCurrentUser(event.target.value);
      if (!result.ok) {
        event.target.dataset.error = result.error;
      }
    });
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
