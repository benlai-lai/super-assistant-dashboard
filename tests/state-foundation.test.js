import assert from 'node:assert/strict';

import {
  createTask,
  deleteTask,
  updateTaskAssignee,
  updateTaskDueDate,
  updateTaskStatus
} from '../store/actions.js';
import {
  getDependencyTasks,
  getDueSoonTasks,
  getOverdueTasks,
  getProgress,
  getProjectTasks,
  getTaskById,
  getTasksByTeamId,
  getTodayTasks
} from '../store/selectors.js';
import { getState, subscribe } from '../store/store.js';

const initial = getState();
const targetTaskId = 'task-checkin-flow';

const externalState = getState();
externalState.tasks[0].status = 'done';
assert.notEqual(getTaskById(getState(), externalState.tasks[0].id).status, 'done');

let callCount = 0;
const unsubscribe = subscribe(() => {
  callCount += 1;
});
assert.equal(updateTaskStatus(targetTaskId, 'done').ok, true);
assert.equal(callCount, 1);
unsubscribe();
assert.equal(updateTaskStatus(targetTaskId, 'in-progress').ok, true);
assert.equal(callCount, 1);

const beforeMissingTask = JSON.stringify(getState());
assert.deepEqual(updateTaskStatus('missing-task', 'done'), { ok: false, error: 'TASK_NOT_FOUND' });
assert.equal(JSON.stringify(getState()), beforeMissingTask);

const beforeInvalidStatus = JSON.stringify(getState());
assert.deepEqual(updateTaskStatus(targetTaskId, 'invalid'), { ok: false, error: 'INVALID_STATUS' });
assert.equal(JSON.stringify(getState()), beforeInvalidStatus);

assert.deepEqual(updateTaskAssignee(targetTaskId, 'missing-member'), { ok: false, error: 'MEMBER_NOT_FOUND' });
assert.equal(updateTaskAssignee(targetTaskId, 'user-ben').ok, true);
assert.equal(getTaskById(getState(), targetTaskId).assigneeId, 'user-ben');

assert.deepEqual(updateTaskDueDate(targetTaskId, 'bad-date'), { ok: false, error: 'INVALID_DUE_DATE' });
assert.equal(updateTaskDueDate(targetTaskId, null).ok, true);
assert.equal(getTaskById(getState(), targetTaskId).dueDate, null);
assert.equal(updateTaskDueDate(targetTaskId, '2026-07-25').ok, true);

assert.deepEqual(createTask({ title: '', teamId: 'team-checkin', projectId: 'project-summer-camp', assigneeId: 'user-amy', dueDate: '2026-08-01' }), { ok: false, error: 'INVALID_TITLE' });
assert.deepEqual(createTask({ title: 'New task', teamId: 'missing-team', projectId: 'project-summer-camp', assigneeId: 'user-amy', dueDate: '2026-08-01' }), { ok: false, error: 'TEAM_NOT_FOUND' });
assert.deepEqual(createTask({ title: 'New task', teamId: 'team-checkin', projectId: 'missing-project', assigneeId: 'user-amy', dueDate: '2026-08-01' }), { ok: false, error: 'PROJECT_NOT_FOUND' });
assert.deepEqual(createTask({ title: 'New task', teamId: 'team-checkin', projectId: 'project-summer-camp', assigneeId: 'missing-member', dueDate: '2026-08-01' }), { ok: false, error: 'MEMBER_NOT_FOUND' });
assert.deepEqual(createTask({ title: 'New task', teamId: 'team-checkin', projectId: 'project-summer-camp', assigneeId: 'user-amy', dueDate: 'invalid' }), { ok: false, error: 'INVALID_DUE_DATE' });

const beforeCreate = getState();
const createResult = createTask({
  title: 'Confirm room signs',
  teamId: 'team-checkin',
  projectId: 'project-summer-camp',
  assigneeId: 'user-amy',
  dueDate: '2026-08-01',
  weight: 2
});
assert.equal(createResult.ok, true);
assert.equal(typeof createResult.taskId, 'string');
const afterCreate = getState();
const createdTask = getTaskById(afterCreate, createResult.taskId);
assert.equal(afterCreate.tasks.length, beforeCreate.tasks.length + 1);
assert.equal(createdTask.title, 'Confirm room signs');
assert.equal(createdTask.teamId, 'team-checkin');
assert.equal(createdTask.projectId, 'project-summer-camp');
assert.equal(createdTask.assigneeId, 'user-amy');
assert.equal(createdTask.ownerId, 'user-amy');
assert.equal(createdTask.dueDate, '2026-08-01');

assert.equal(updateTaskStatus(createResult.taskId, 'done').ok, true);
assert.equal(getTaskById(getState(), createResult.taskId).status, 'done');
assert.equal(updateTaskStatus(createResult.taskId, 'in-progress').ok, true);
assert.equal(getTaskById(getState(), createResult.taskId).status, 'in-progress');
assert.deepEqual(updateTaskStatus('missing-task', 'done'), { ok: false, error: 'TASK_NOT_FOUND' });

const beforeCancelledDelete = JSON.stringify(getState());
const cancelledDeleteConfirmed = false;
if (cancelledDeleteConfirmed) deleteTask(createResult.taskId);
assert.equal(JSON.stringify(getState()), beforeCancelledDelete);

assert.deepEqual(deleteTask('missing-task'), { ok: false, error: 'TASK_NOT_FOUND' });
assert.equal(deleteTask(createResult.taskId).ok, true);
const afterDelete = getState();
assert.equal(getTaskById(afterDelete, createResult.taskId), null);
assert.equal(getTasksByTeamId(afterDelete, 'team-checkin').some((task) => task.id === createResult.taskId), false);
assert.equal(getProjectTasks(afterDelete, 'project-summer-camp').some((task) => task.id === createResult.taskId), false);

const datedTasks = [
  { id: 'today-open', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: '2026-07-25' },
  { id: 'upcoming-open', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: '2026-07-28' },
  { id: 'overdue-open', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: '2026-07-20' },
  { id: 'overdue-done', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'done', dueDate: '2026-07-20' },
  { id: 'missing-date', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: null },
  { id: 'invalid-date', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: 'invalid' }
];
const dateState = { ...initial, currentUserId: 'user-ben', tasks: datedTasks };
assert.deepEqual(getTodayTasks(dateState, 'user-ben').map((task) => task.id), ['today-open']);
assert.deepEqual(getDueSoonTasks(datedTasks).map((task) => task.id), ['today-open', 'upcoming-open']);
assert.deepEqual(getOverdueTasks(datedTasks).map((task) => task.id), ['overdue-open']);

const selectorInput = structuredClone(dateState);
getProgress(selectorInput.tasks);
getOverdueTasks(selectorInput.tasks);
assert.deepEqual(selectorInput, dateState);

const missingDependencyState = {
  ...initial,
  tasks: [{ id: 'task-with-missing-dependency', dependsOnTaskIds: ['missing-task'] }]
};
assert.deepEqual(getDependencyTasks(missingDependencyState, missingDependencyState.tasks[0]), []);

assert.deepEqual(getProgress([]), { completed: 0, total: 0, percent: 0 });

console.log('state-foundation tests passed');
