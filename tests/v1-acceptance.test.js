import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8');

function assertAppearsInOrder(source, expectedValues, message) {
  let cursor = -1;
  for (const value of expectedValues) {
    const nextIndex = source.indexOf(value, cursor + 1);
    assert.notEqual(nextIndex, -1, `${message}: missing ${value}`);
    assert.ok(nextIndex > cursor, `${message}: ${value} is out of order`);
    cursor = nextIndex;
  }
}

assert.match(indexHtml, /<html\s+lang="zh-Hant">/);
assert.match(indexHtml, /<meta\s+name="viewport"\s+content="width=device-width, initial-scale=1">/);
assert.equal((indexHtml.match(/class="mobile-nav"/g) ?? []).length, 1);

const sidebarMarkup = indexHtml.match(/<nav class="nav">([\s\S]*?)<\/nav>/)?.[1] ?? '';
const mobileMarkup = indexHtml.match(/<nav class="mobile-nav">([\s\S]*?)<\/nav>/)?.[1] ?? '';
assertAppearsInOrder(sidebarMarkup, ['總覽', '日曆', '任務', '專案', 'Inbox'], 'desktop navigation');
assertAppearsInOrder(mobileMarkup, ['總覽', '日曆', '任務', '專案', '更多'], 'mobile navigation');

assert.match(appSource, /const STORAGE_KEY = 'superAssistantDashboardData';/);
assert.match(appSource, /<option value="idea">想法<\/option>/);
assert.match(appSource, /<option value="task">任務<\/option>/);
assert.match(appSource, /<option value="event">行程<\/option>/);
assert.match(appSource, /this\.dm\.addIdea\(title\)/);
assert.match(appSource, /this\.dm\.addTask\(title, description, date\)/);
assert.match(appSource, /this\.dm\.addEvent\(title, date, time, location\)/);

const mobileMediaStart = styles.indexOf('@media (max-width: 768px)');
const narrowMediaStart = styles.indexOf('@media (max-width: 390px)');
assert.ok(mobileMediaStart >= 0, 'missing mobile breakpoint');
assert.ok(narrowMediaStart > mobileMediaStart, 'missing 390px breakpoint');
const mobileStyles = styles.slice(mobileMediaStart, narrowMediaStart);
const narrowStyles = styles.slice(narrowMediaStart);
assert.match(mobileStyles, /\.sidebar\s*{\s*display:\s*none;/);
assert.match(mobileStyles, /\.mobile-nav\s*{[\s\S]*?display:\s*grid;[\s\S]*?position:\s*fixed;/);
assert.match(mobileStyles, /grid-template-columns:\s*repeat\(5,\s*1fr\);/);
assert.match(narrowStyles, /\.main\s*{[\s\S]*?padding:\s*12px 10px 88px;/);

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

const localStorage = createStorage();
const context = vm.createContext({
  alert() {},
  confirm() {
    return false;
  },
  console,
  Date,
  document: {
    addEventListener() {}
  },
  localStorage,
  window: {}
});

vm.runInContext(
  `${appSource}\n;globalThis.__v1Acceptance = { DataManager, UIManager, VIEWS, STORAGE_KEY };`,
  context,
  { filename: path.join(projectRoot, 'app.js') }
);

const { DataManager, UIManager, VIEWS, STORAGE_KEY } = context.__v1Acceptance;
assert.equal(STORAGE_KEY, 'superAssistantDashboardData');

const dataManager = new DataManager();
assert.ok(dataManager.data.projects.some((project) => project.title === '超級隨身助理'));
assert.ok(dataManager.data.projects.some((project) => project.title === 'AI Sales OS'));
assert.ok(dataManager.data.projects.some((project) => project.title === 'BagKing 網站'));
assert.ok(dataManager.data.events.some((event) => event.title === '台北郵局會議'));

const idea = dataManager.addIdea('V1 acceptance idea');
const task = dataManager.addTask('V1 acceptance task', 'Existing flow', '2030-02-03');
const event = dataManager.addEvent('V1 acceptance event', '2030-02-03', '09:30', 'Taipei');
let persisted = JSON.parse(localStorage.getItem(STORAGE_KEY));
assert.equal(persisted.ideas.some((item) => item.id === idea.id), true);
assert.equal(persisted.tasks.some((item) => item.id === task.id), true);
assert.equal(persisted.events.some((item) => item.id === event.id), true);

dataManager.updateTask(task.id, { status: 'waiting' });
persisted = JSON.parse(localStorage.getItem(STORAGE_KEY));
assert.equal(persisted.tasks.find((item) => item.id === task.id).status, 'waiting');

const reloadedDataManager = new DataManager();
assert.equal(reloadedDataManager.data.ideas.some((item) => item.id === idea.id), true);
assert.equal(reloadedDataManager.data.tasks.some((item) => item.id === task.id), true);
assert.equal(reloadedDataManager.data.events.some((item) => item.id === event.id), true);

reloadedDataManager.updateTask(task.id, { archived: true });
persisted = JSON.parse(localStorage.getItem(STORAGE_KEY));
assert.equal(persisted.tasks.find((item) => item.id === task.id).archived, true);

const uiManager = Object.create(UIManager.prototype);
uiManager.updateNavigation = () => {};
uiManager.render = () => {};
const desktopViews = [VIEWS.overview, VIEWS.calendar, VIEWS.tasks, VIEWS.projects, VIEWS.inbox];
desktopViews.forEach((expectedView, index) => {
  uiManager.switchView(index, 'sidebar');
  assert.equal(uiManager.currentView, expectedView);
});
uiManager.switchView(4, 'mobile');
assert.equal(uiManager.currentView, VIEWS.more);

console.log('v1-acceptance tests passed');
