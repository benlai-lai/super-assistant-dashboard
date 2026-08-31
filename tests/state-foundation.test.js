import assert from 'node:assert/strict';

import {
  addExternalLink,
  addTaskDependency,
  createProject,
  createTask,
  createTeam,
  deleteTask,
  removeExternalLink,
  removeTaskDependency,
  selectProject,
  selectTask,
  selectTeam,
  switchCurrentUser,
  updateExternalLink,
  updateProject,
  updateTask,
  updateTaskAssignee,
  updateTaskDueDate,
  updateTaskStatus,
  updateTeam
} from '../store/actions.js';
import { projectCard, teamCard } from '../components/cards.js';
import {
  canReadProject,
  canReadTeam,
  canReadTask,
  canWriteTask,
  canCreateProject,
  canCreateTeam,
  canManageProject,
  canManageTeam,
  canWriteAttachment,
  getAvailableDependencyTasks,
  getDependencyTasks,
  getActivitiesByTaskId,
  getAttachmentsByTaskId,
  getCurrentUser,
  getDueSoonTasks,
  getOverdueTasks,
  getProgress,
  getProjectTasks,
  getRisk,
  getTaskById,
  getTasksByTeamId,
  getVisibleAttachmentsByTaskId,
  getVisibleProjectTasks,
  getVisibleTasks,
  getVisibleTeamTasks,
  getVisibleWorkspaceTasks,
  getTodayTasks
} from '../store/selectors.js';
import { TASK_STATUSES, VISIBILITY_LEVELS } from '../store/state-utils.js';
import { getState, subscribe } from '../store/store.js';
import { renderProjectPage } from '../pages/project-page.js';
import { renderTaskPage } from '../pages/task-page.js';
import { renderTeamPage } from '../pages/team-page.js';

const initial = getState();
const targetTaskId = 'task-checkin-flow';
assert.equal(initial.schemaVersion, 2);
assert.deepEqual(initial.orders, []);
assert.equal(initial.tasks.every((task) => task.orderId === null), true);
assert.deepEqual(TASK_STATUSES, ['not-started', 'in-progress', 'blocked', 'done']);
assert.deepEqual(VISIBILITY_LEVELS, ['private', 'assigned', 'team', 'project', 'workspace']);
assert.equal(initial.tasks.every((task) => VISIBILITY_LEVELS.includes(task.visibility)), true);
assert.equal(initial.attachments.every((attachment) => VISIBILITY_LEVELS.includes(attachment.visibility)), true);

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
assert.equal(createdTask.orderId, null);
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

assert.equal(getActivitiesByTaskId(getState(), 'task-projector').length, 1);
assert.equal(getAttachmentsByTaskId(getState(), 'task-checkin-flow').length, 1);
const activitiesBeforeProjectorDelete = getState().activities.length;
const attachmentsBeforeProjectorDelete = getState().attachments.length;
assert.equal(deleteTask('task-projector').ok, true);
const afterProjectorDelete = getState();
assert.equal(getTaskById(afterProjectorDelete, 'task-projector'), null);
assert.equal(getActivitiesByTaskId(afterProjectorDelete, 'task-projector').length, 0);
assert.equal(getAttachmentsByTaskId(afterProjectorDelete, 'task-checkin-flow').length, 1);
assert.equal(afterProjectorDelete.activities.length, activitiesBeforeProjectorDelete - 1);
assert.equal(afterProjectorDelete.attachments.length, attachmentsBeforeProjectorDelete);

assert.equal(getAttachmentsByTaskId(getState(), 'task-checkin-flow').length, 1);
const activitiesBeforeCheckinDelete = getState().activities.length;
const attachmentsBeforeCheckinDelete = getState().attachments.length;
assert.equal(deleteTask('task-checkin-flow').ok, true);
const afterCheckinDelete = getState();
assert.equal(getTaskById(afterCheckinDelete, 'task-checkin-flow'), null);
assert.equal(getAttachmentsByTaskId(afterCheckinDelete, 'task-checkin-flow').length, 0);
assert.equal(getActivitiesByTaskId(afterCheckinDelete, 'task-shuttle-notice').length, 1);
assert.equal(afterCheckinDelete.activities.length, activitiesBeforeCheckinDelete);
assert.equal(afterCheckinDelete.attachments.length, attachmentsBeforeCheckinDelete - 1);
const datedTasks = [
  { id: 'today-open', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: '2026-07-25' },
  { id: 'upcoming-open', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: '2026-07-28' },
  { id: 'overdue-open', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: '2026-07-20' },
  { id: 'overdue-done', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'done', dueDate: '2026-07-20' },
  { id: 'missing-date', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: null },
  { id: 'invalid-date', ownerId: 'user-ben', assigneeId: 'user-ben', status: 'not-started', dueDate: 'invalid' }
];
const dateState = { ...initial, currentUserId: 'user-ben', tasks: datedTasks };
assert.deepEqual(getTodayTasks(dateState, 'user-ben', '2026-07-25').map((task) => task.id), ['today-open']);
assert.deepEqual(getDueSoonTasks(datedTasks, '2026-07-25').map((task) => task.id), ['today-open', 'upcoming-open']);
assert.deepEqual(getOverdueTasks(datedTasks, '2026-07-25').map((task) => task.id), ['overdue-open']);

const selectorInput = structuredClone(dateState);
getProgress(selectorInput.tasks);
getOverdueTasks(selectorInput.tasks, '2026-07-25');
assert.deepEqual(selectorInput, dateState);

const missingDependencyState = {
  ...initial,
  tasks: [{ id: 'task-with-missing-dependency', dependsOnTaskIds: ['missing-task'] }]
};
assert.deepEqual(getDependencyTasks(missingDependencyState, missingDependencyState.tasks[0]), []);

assert.deepEqual(getProgress([]), { completed: 0, total: 0, percent: 0 });

const visibilityFixture = structuredClone(initial);
const privateTask = getTaskById(visibilityFixture, 'task-discussion-questions');
assert.equal(canReadTask(visibilityFixture, privateTask, 'user-fiona'), false);
assert.equal(canReadTask(visibilityFixture, { ...privateTask, visibility: 'invalid' }, 'user-fiona'), false);
assert.equal(canReadTask(visibilityFixture, { ...privateTask, visibility: undefined }, 'user-fiona'), false);
assert.equal(canReadTask(visibilityFixture, privateTask.id, 'user-fiona'), false);
assert.equal(canReadTask(visibilityFixture, privateTask, 'user-chris'), true);
assert.equal(canReadProject(visibilityFixture, 'project-summer-camp', 'missing-user'), false);
assert.equal(canReadTeam(visibilityFixture, 'team-equipment', 'user-chris'), false);
assert.equal(canReadTeam(visibilityFixture, 'team-teaching', 'user-chris'), true);
assert.equal(canReadTask(visibilityFixture, getTaskById(visibilityFixture, 'task-handout-print'), 'user-dora'), true);
assert.equal(canReadTask(visibilityFixture, getTaskById(visibilityFixture, 'task-day-one-handout'), 'user-chris'), true);
assert.equal(canReadTask(visibilityFixture, getTaskById(visibilityFixture, 'task-attendee-list'), 'user-fiona'), true);
assert.equal(canReadTask(visibilityFixture, getTaskById(visibilityFixture, 'task-projector'), 'user-fiona'), true);

assert.equal(getVisibleTasks(visibilityFixture, 'user-amy').length, visibilityFixture.tasks.length);
assert.equal(getVisibleWorkspaceTasks(visibilityFixture, 'workspace-camp', 'user-grace').length, visibilityFixture.tasks.length);
assert.equal(getVisibleProjectTasks(visibilityFixture, 'project-summer-camp', 'user-ben').length, visibilityFixture.tasks.length);
assert.deepEqual(
  getVisibleTeamTasks(visibilityFixture, 'team-teaching', 'user-chris').map((task) => task.id).sort(),
  ['task-day-one-handout', 'task-discussion-questions', 'task-handout-print']
);
assert.equal(getVisibleTeamTasks(visibilityFixture, 'team-equipment', 'user-chris').length, 0);
assert.equal(getVisibleAttachmentsByTaskId(visibilityFixture, 'task-discussion-questions', 'user-fiona').length, 0);
assert.equal(getVisibleAttachmentsByTaskId(visibilityFixture, 'task-discussion-questions', 'user-chris').length, 1);

assert.equal(switchCurrentUser('user-fiona').ok, true);
assert.equal(getCurrentUser(getState()).role, 'Viewer');
assert.deepEqual(updateTaskStatus('task-cables', 'done'), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.equal(getTaskById(getState(), 'task-cables').status, 'not-started');

assert.equal(switchCurrentUser('user-dora').ok, true);
assert.deepEqual(updateTaskStatus('task-day-one-handout', 'done'), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.equal(updateTaskStatus('task-handout-print', 'in-progress').ok, true);

assert.equal(switchCurrentUser('user-chris').ok, true);
const beforeUnauthorizedTeamSelection = JSON.stringify(getState());
assert.deepEqual(selectTeam('team-equipment'), { ok: false, error: 'UNAUTHORIZED_SELECTION' });
assert.equal(JSON.stringify(getState()), beforeUnauthorizedTeamSelection);
const beforeUnauthorizedTaskSelection = JSON.stringify(getState());
assert.deepEqual(selectTask('task-sound-list'), { ok: false, error: 'UNAUTHORIZED_SELECTION' });
assert.equal(JSON.stringify(getState()), beforeUnauthorizedTaskSelection);
assert.equal(updateTaskStatus('task-day-one-handout', 'done').ok, true);
assert.deepEqual(updateTaskStatus('task-sound-list', 'in-progress'), { ok: false, error: 'UNAUTHORIZED_WRITE' });

assert.equal(switchCurrentUser('user-ben').ok, true);
assert.equal(updateTaskStatus('task-sound-list', 'done').ok, true);
assert.equal(selectProject('project-summer-camp').ok, true);
assert.equal(switchCurrentUser('user-amy').ok, true);
assert.deepEqual(updateTaskStatus('task-sound-list', 'archived'), { ok: false, error: 'INVALID_STATUS' });

const cardProject = visibilityFixture.projects[0];
const cardTasks = getVisibleProjectTasks(visibilityFixture, cardProject.id, 'user-amy');
const projectCardHtml = projectCard({
  ...cardProject,
  projectName: cardProject.name,
  teamName: 'All teams',
  progress: getProgress(cardTasks),
  riskStatus: getRisk(cardProject, cardTasks).display,
  ownerName: 'Ben Lin',
  dueDate: cardProject.dueDate
});
const cardTeam = visibilityFixture.teams.find((team) => team.id === 'team-traffic');
const teamTasks = getVisibleTeamTasks(visibilityFixture, cardTeam.id, 'user-amy');
const teamCardHtml = teamCard({
  ...cardTeam,
  projectName: cardProject.name,
  teamName: cardTeam.name,
  progress: getProgress(teamTasks),
  riskStatus: getRisk(cardProject, teamTasks).display,
  ownerName: 'Fiona Tsai',
  dueDate: null
});
for (const required of ['Project name', 'Team name', 'Progress percentage', 'Completed / total tasks', 'Next action', 'Risk status', 'Owner', 'Due date']) {
  assert.match(projectCardHtml, new RegExp(required));
  assert.match(teamCardHtml, new RegExp(required));
}
assert.match(projectCardHtml, /data-card-fields="project-name,team-name,progress-percentage,task-count,next-action,risk-status,owner,due-date"/);
assert.match(teamCardHtml, /未分組|Traffic Team/);
assert.match(teamCardHtml, /<dd>—<\/dd>/);
assert.doesNotMatch(projectCardHtml, /user-ben/);
assert.doesNotMatch(teamCardHtml, /user-fiona/);

const deniedTeamHtml = renderTeamPage({ ...visibilityFixture, currentUserId: 'user-chris' }, 'team-equipment');
assert.match(deniedTeamHtml, /無法查看此內容/);
assert.doesNotMatch(deniedTeamHtml, /Equipment Team/);
assert.doesNotMatch(deniedTeamHtml, /Evan/);
assert.doesNotMatch(deniedTeamHtml, /projector model/);

const deniedTaskHtml = renderTaskPage({ ...visibilityFixture, currentUserId: 'user-dora' }, 'task-discussion-questions');
assert.match(deniedTaskHtml, /無法查看此內容/);
assert.doesNotMatch(deniedTaskHtml, /Prepare discussion questions/);
assert.doesNotMatch(deniedTaskHtml, /Private speaker notes/);
assert.doesNotMatch(deniedTaskHtml, /Design check-in flow/);

const deniedProjectHtml = renderProjectPage({ ...visibilityFixture, currentUserId: 'missing-user' }, 'project-summer-camp');
assert.match(deniedProjectHtml, /無法查看此內容/);
assert.doesNotMatch(deniedProjectHtml, /2026 Summer Youth Camp/);
assert.doesNotMatch(deniedProjectHtml, /Ben Lin/);
assert.doesNotMatch(deniedProjectHtml, /Milestones/);
assert.doesNotMatch(deniedProjectHtml, /Project Health/);
assert.doesNotMatch(deniedProjectHtml, /Risk/);

const unknownProjectHtml = renderProjectPage({ ...visibilityFixture, currentUserId: 'missing-user' }, 'missing-project');
assert.equal(unknownProjectHtml, deniedProjectHtml);

assert.match(renderProjectPage({ ...visibilityFixture, currentUserId: 'user-grace' }, 'project-summer-camp'), /2026 Summer Youth Camp/);
assert.match(renderProjectPage({ ...visibilityFixture, currentUserId: 'user-ben' }, 'project-summer-camp'), /2026 Summer Youth Camp/);
assert.match(renderTeamPage({ ...visibilityFixture, currentUserId: 'user-chris' }, 'team-teaching'), /Teaching Team/);
assert.match(renderTaskPage({ ...visibilityFixture, currentUserId: 'user-dora' }, 'task-handout-print'), /Print participant handbooks/);
assert.match(renderTaskPage({ ...visibilityFixture, currentUserId: 'user-fiona' }, 'task-projector'), /Borrow projector/);

const unchangedAfterRejected = (operation) => {
  const before = JSON.stringify(getState());
  const result = operation();
  assert.equal(JSON.stringify(getState()), before);
  return result;
};

assert.equal(switchCurrentUser('user-amy').ok, true);
assert.equal(canCreateProject(getState(), 'workspace-camp'), true);
const projectResult = createProject({
  workspaceId: 'workspace-camp',
  name: 'Local Retreat Project',
  description: 'Local-only Phase 2A project',
  ownerId: 'user-amy',
  startDate: '2026-08-10',
  dueDate: '2026-08-20',
  nextAction: 'Create working teams',
  riskLevelManual: 'Low',
  visibility: 'workspace'
});
assert.equal(projectResult.ok, true);
assert.equal(getTaskById(getState(), targetTaskId), null);
assert.equal(updateProject(projectResult.projectId, { name: 'Local Retreat Project Updated', riskLevelManual: 'Medium' }).ok, true);
assert.equal(getState().projects.find((project) => project.id === projectResult.projectId).name, 'Local Retreat Project Updated');
assert.deepEqual(updateProject(projectResult.projectId, { visibility: 'unknown' }), { ok: false, error: 'INVALID_VISIBILITY' });

assert.equal(canCreateTeam(getState(), { projectId: projectResult.projectId }), true);
const teamResult = createTeam({
  projectId: projectResult.projectId,
  name: 'Hospitality Team',
  leadId: 'user-chris',
  memberIds: ['user-dora'],
  nextAction: 'Assign welcome tasks',
  visibility: 'project'
});
assert.equal(teamResult.ok, true);
assert.equal(canManageTeam(getState(), getState().teams.find((team) => team.id === teamResult.teamId)), true);
assert.equal(updateTeam(teamResult.teamId, { name: 'Hospitality Team Updated', memberIds: ['user-chris', 'user-dora'], visibility: 'team' }).ok, true);

const managedTask = createTask({
  title: 'Prepare welcome table',
  teamId: teamResult.teamId,
  projectId: projectResult.projectId,
  assigneeId: 'user-dora',
  dueDate: '2026-08-18',
  visibility: 'team',
  nextAction: 'Confirm table count',
  riskStatus: 'Low',
  description: 'Local edit coverage task'
});
assert.equal(managedTask.ok, true);
assert.equal(updateTask(managedTask.taskId, {
  title: 'Prepare updated welcome table',
  status: 'blocked',
  assigneeId: 'user-dora',
  dueDate: '2026-08-19',
  visibility: 'project',
  nextAction: 'Call venue',
  riskStatus: 'High',
  description: 'Updated description'
}).ok, true);
const editedTask = getTaskById(getState(), managedTask.taskId);
assert.equal(editedTask.title, 'Prepare updated welcome table');
assert.equal(editedTask.status, 'blocked');
assert.equal(editedTask.blocked, true);
assert.equal(editedTask.visibility, 'project');
assert.equal(editedTask.riskStatus, 'High');
assert.equal(editedTask.description, 'Updated description');
assert.deepEqual(updateTask(managedTask.taskId, { status: 'archived' }), { ok: false, error: 'INVALID_STATUS' });
assert.deepEqual(updateTask(managedTask.taskId, { visibility: 'invalid' }), { ok: false, error: 'INVALID_VISIBILITY' });

const linkResult = addExternalLink({
  taskId: managedTask.taskId,
  title: 'Venue page',
  type: 'Web',
  url: 'https://example.com/venue',
  note: 'External metadata only',
  visibility: 'project'
});
assert.equal(linkResult.ok, true);
const link = getState().attachments.find((attachment) => attachment.id === linkResult.attachmentId);
assert.equal(canWriteAttachment(getState(), link), true);
assert.equal(updateExternalLink(linkResult.attachmentId, { title: 'Venue page updated', url: 'https://example.com/venue-updated', visibility: 'team' }).ok, true);
assert.deepEqual(addExternalLink({ taskId: managedTask.taskId, title: 'Local file', url: 'file:///C:/secret.txt', visibility: 'team' }), { ok: false, error: 'INVALID_URL' });

const dependencyTask = createTask({
  title: 'Confirm table count',
  teamId: teamResult.teamId,
  projectId: projectResult.projectId,
  assigneeId: 'user-chris',
  dueDate: null,
  visibility: 'project'
});
assert.equal(dependencyTask.ok, true);
assert.equal(getAvailableDependencyTasks(getState(), managedTask.taskId).some((task) => task.id === dependencyTask.taskId), true);
assert.equal(addTaskDependency(managedTask.taskId, dependencyTask.taskId).ok, true);
assert.deepEqual(addTaskDependency(managedTask.taskId, managedTask.taskId), { ok: false, error: 'INVALID_DEPENDENCY' });
assert.deepEqual(addTaskDependency(managedTask.taskId, dependencyTask.taskId), { ok: false, error: 'DUPLICATE_DEPENDENCY' });
assert.deepEqual(addTaskDependency(managedTask.taskId, 'missing-task'), { ok: false, error: 'TASK_NOT_FOUND' });
assert.equal(removeTaskDependency(managedTask.taskId, dependencyTask.taskId).ok, true);
assert.deepEqual(removeTaskDependency(managedTask.taskId, dependencyTask.taskId), { ok: false, error: 'DEPENDENCY_NOT_FOUND' });

assert.equal(switchCurrentUser('user-fiona').ok, true);
assert.equal(canCreateProject(getState(), 'workspace-camp'), false);
assert.deepEqual(unchangedAfterRejected(() => createProject({ workspaceId: 'workspace-camp', name: 'Viewer Project', ownerId: 'user-fiona' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.deepEqual(unchangedAfterRejected(() => updateProject(projectResult.projectId, { name: 'Viewer edit' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.deepEqual(unchangedAfterRejected(() => createTeam({ projectId: projectResult.projectId, name: 'Viewer Team', leadId: 'user-fiona' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.deepEqual(unchangedAfterRejected(() => updateTask(managedTask.taskId, { title: 'Viewer edit' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.deepEqual(unchangedAfterRejected(() => updateExternalLink(linkResult.attachmentId, { title: 'Viewer link edit' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });

assert.equal(switchCurrentUser('user-dora').ok, true);
assert.deepEqual(unchangedAfterRejected(() => updateTask('task-discussion-questions', { title: 'Member leak' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.deepEqual(unchangedAfterRejected(() => addTaskDependency(managedTask.taskId, 'task-discussion-questions')), { ok: false, error: 'UNAUTHORIZED_DEPENDENCY' });
assert.equal(getAvailableDependencyTasks(getState(), managedTask.taskId).some((task) => task.id === 'task-discussion-questions'), false);

assert.equal(switchCurrentUser('user-chris').ok, true);
assert.deepEqual(unchangedAfterRejected(() => updateTeam('team-equipment', { name: 'Wrong team' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });
assert.deepEqual(unchangedAfterRejected(() => updateTask('task-sound-list', { title: 'Wrong team task' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });

assert.equal(switchCurrentUser('user-ben').ok, true);
assert.equal(canManageProject(getState(), getState().projects.find((project) => project.id === 'project-summer-camp')), true);
assert.deepEqual(unchangedAfterRejected(() => updateProject(projectResult.projectId, { name: 'Wrong project' })), { ok: false, error: 'UNAUTHORIZED_WRITE' });

assert.equal(switchCurrentUser('user-amy').ok, true);
assert.equal(removeExternalLink(linkResult.attachmentId).ok, true);
assert.equal(getState().attachments.some((attachment) => attachment.id === linkResult.attachmentId), false);

console.log('state-foundation tests passed');
