# PROJECT STATUS

更新日期：2026-07-26
盤點基準：Sprint 4A feature branch（起點 `main` / `5a02c8c`）
工作區狀態：盤點開始時無未提交變更
判定原則：只記錄現有文件、程式碼、測試與 Git 歷史可證實的內容；無法確認者標記為 `Unknown`。

## 一、專案目標

### 本專案要解決什麼問題

「超級隨身助理」的核心目標是降低使用者的認知負擔，將想法、任務、行程與專案狀態整理成可快速判斷的 Dashboard。

目前產品方向已由 V1 的個人工作中控台，擴展為 V2 的 Workspace 協作平台：支援 Workspace、Project、Team、Task、多人角色、權限、雲端同步與未來多租戶 SaaS。

### MVP 範圍

依 `V2_PRODUCT_SPEC.md`、`V2_TECHNICAL_DESIGN.md` 與 `V2_IMPLEMENTATION_ROADMAP.md`，建議的 V2 MVP 包含：

- Email / Google 登入。
- Workspace 與 Workspace members。
- Project 與 Project members。
- Task CRUD、狀態、指派與截止日。
- Basic Dashboard。
- Basic RLS。
- V1 `localStorage` migration preview。
- 本機 mock users / mock roles 多人模擬。
- 附件僅保存外部 HTTPS 連結 metadata。

目前程式實際完成的是「無後端、無持久化的本機 V2 Prototype 子集」，不是上述完整 MVP。

### 長期目標

- 以 Supabase Auth、PostgreSQL 與 Row Level Security 提供雲端多人協作。
- 以 `workspace_id` 作為租戶隔離基礎，支援多 Workspace、多客戶 SaaS。
- 完成 Team、邀請、活動紀錄、通知、外部連結管理與 V1 正式遷移。
- SaaS 付費階段再評估內建檔案上傳、容量、壓縮、轉碼、防毒、版本與計費。
- 是否改用 React 或其他前端框架：`Unknown`；現有文件明確要求現階段不要重寫。

## 二、目前完成項目

### 已完成：V1 可操作 Prototype

- `index.html`、`styles.css`、`app.js` 組成 Vanilla JavaScript 單頁 Dashboard。
- 使用 `localStorage`（key：`superAssistantDashboardData`）保存 V1 資料。
- Git 歷史顯示已完成 V1 Dashboard 邏輯、互動、外部樣式與 V1.1 UX 優化。
- V1 實際的完整人工驗收結果：`Unknown`。

### 已完成：V2 規格與技術方向（Roadmap Phase 0 文件交付物）

- V2 產品規格、技術設計與分階段 Roadmap 已建立。
- 已定義 Workspace → Project → Team → Task → Subtask 的資訊層級。
- 已定義角色、權限矩陣、visibility、資料表方向、RLS 原則、migration 流程及外部連結策略。
- 已定義「營隊是一個 Project、各工作組是 Team、具體工作是 Task」。

注意：Phase 0 的文件交付物存在，但是否經產品負責人正式簽核：`Unknown`。

### 已完成：V2 UI 與狀態基礎

- V2 獨立入口：`dashboard.html`。
- Workspace、Project、Team、Task Detail、My Tasks 五種頁面。
- Hash router 與頁面選取狀態同步。
- 集中式 in-memory store，包含 clone、dispatch、subscribe 與 selector。
- mock Workspace、Project、Teams、Users、Tasks、Milestone、Activity、External Link。
- Dashboard 指標：進度、逾期、即將到期、阻塞、風險、健康度、工作量。
- Sprint 3A：建立任務、修改負責人與截止日。
- Sprint 3B：完成／重開任務與刪除任務。
- Sprint 3C：刪除任務時同步清除相關 activity、attachment、dependency reference 與 selected task。

### 已完成：現有自動測試

- `tests/state-foundation.test.js` 覆蓋 store 隔離、訂閱、狀態更新、建立、指派、日期、完成／重開、刪除及關聯清理、日期 selector、dependency 與 progress。
- 2026-07-26 執行結果：`state-foundation tests passed`。
- 瀏覽器端目前只有人工 smoke test；視覺、響應式、可用性與 console 的自動測試：`Unknown`（Repository 內未發現對應測試）。

### 已完成：Sprint 4A Repository Adapter 與本機持久化邊界

- 建立同步 repository contract：`loadState()`、`saveState(state)`、`resetState()`。
- Memory repository 的 state 位於各 instance closure，load / save 使用 clone 避免 reference 洩漏。
- LocalStorage repository 使用獨立 V2 key `superAssistantDashboardV2State`，不修改 V1 key `superAssistantDashboardData`。
- V2 state 加入 `schemaVersion: 1` 與最低限度 state shape validation。
- storage 不存在、JSON 損壞、schema version 不支援或 state shape 無效時，回退至 normalized mock state。
- Store 提供 `createStore({ repository, initialStateFactory })`，可用 spy repository 驗證 load / save / reset。
- 成功 dispatch 後嘗試保存；action 驗證失敗不保存；保存失敗不丟棄已完成的 in-memory update。
- 日期 selector 改為呼叫時計算系統日期，並可明確傳入日期或 fixed clock 測試。
- V1 migration preview 依 `app.js` 的實際 V1 key 與 `ideas` / `tasks` / `events` / `projects` / `settings` schema 建立；Sprint 4A 只預覽可遷移 Task，不正式匯入。
- Node 語法檢查、既有 Sprint 3A / 3B / 3C 測試與新增 repository boundary 測試通過。
- `dashboard.html` smoke test 通過：主要頁面渲染、建立任務後重整仍存在，檢查時沒有 browser console warning / error。

## 三、目前進行中

- 最新可確認進度為 Sprint 4A 本機實作與驗證完成，尚待人工驗收。
- Sprint 4A branch 起點為 `main` 的 `5a02c8c`。
- 目前是否另有已指派但尚未提交的 Sprint、負責人或期限：`Unknown`。
- Roadmap Phase 1 已完成 repository 與本機持久化邊界；尚未完成正式 migration mapping / import。

## 四、尚未完成

以下依現有 Roadmap 與程式缺口排序；實際商業優先級是否已由產品負責人確認：`Unknown`。

1. **確認下一個 Sprint 與 Phase 1 驗收邊界**
   - 確認是先完成持久化／repository adapter、V1 migration preview，或先補 UI 操作。
   - 確認 V2 Prototype 的驗收清單與完成定義。
2. **完成 Phase 1 剩餘 V1 保護工作**
   - V1 資料備份／匯出。
   - 完整 mapping、duplicate detection 與正式 dry run。
   - 不覆蓋、不刪除現有 V1 `localStorage`。
3. **補齊 V2 Prototype 的核心任務功能**
   - 完整文件狀態集：Backlog、Not Started、In Progress、Blocked、Review、Done、Archived；目前程式只有四種。
   - 權重規格一致化；文件建議 1 / 2 / 5，目前程式只接受 1–3。
   - 依賴、blocked reason、next action、外部連結與 activity 的新增／編輯流程。
   - Subtask 與加權進度。
4. **角色、權限與 visibility 的本機驗證**
   - mock user 切換。
   - 不同角色 Dashboard。
   - Private / Assigned Users / Team / Project / Workspace 可見性。
   - 目前只有 mock user 欄位，沒有實際授權限制。
5. **補齊測試與人工驗收**
   - Router、render、DOM interaction、錯誤顯示與刪除確認。
   - 桌機與 390px 手機版。
   - Browser console、鍵盤操作與基本 accessibility。
   - V1 regression 與 `localStorage` 資料保護。
6. **Phase 2：Supabase 基礎**
   - Auth、schema migration、RLS、Workspace / Project / Task CRUD。
   - staging 與 `workspace_id` tenant isolation 測試。
7. **後續 Roadmap**
   - 分角色 Dashboard、Team CRUD、邀請、Activity log、正式 V1 migration、通知、外部連結管理、稽核畫面與 SaaS 化。

## 五、重要決策

以下是三份 V2 文件一致記載、實作時應視為基線的決策；其正式簽核狀態為 `Unknown`。

- 採漸進式升級，短期維持 HTML / CSS / Vanilla JavaScript，不立即 React rewrite。
- Workspace 是最高層協作空間，也是未來多租戶 SaaS 的隔離基礎。
- 所有未來跨租戶資料必須依 `workspace_id` 隔離。
- 前端權限限制只處理體驗；資料安全最終由後端 RLS 保證。
- 第一階段可用 mock users / mock roles 做本機多人模擬。
- V1 `localStorage` 必須保留；migration 要先 preview / dry run，不自動刪除原始資料。
- 第一階段附件只保存外部 HTTPS 連結 metadata，不提供大型檔案上傳，也不能把本機路徑當作多人共享附件。
- 營隊建模為一個 Project，各工作組為 Team，具體工作為 Task。
- Service role key 不得放在前端。
- 在規格與驗證未完成前，不一次導入完整 Supabase、不一次實作全部權限、不覆蓋 V1 資料。

## 六、目前阻塞（Blockers）

### 已確認阻塞

- **缺少明確的下一 Sprint 定義**：Sprint 4A 完成後沒有下一張已確認任務書、負責人或優先級。
- **文件與程式狀態模型不一致**：文件為七種狀態，程式為四種狀態。
- **文件與程式權重規則不一致**：文件建議 1 / 2 / 5，程式驗證範圍為 1–3。
- **角色與 visibility 尚未實作**：目前不能驗證多人資料隔離與角色 Dashboard。
- **Repository 僅支援同步 contract**：目前 store 與 actions 是同步流程，不能直接替換為非同步 Supabase repository；未來需另行設計 async initialization、save 狀態、錯誤回復與競態處理。
- **瀏覽器驗證仍是 smoke test**：尚未建立自動化 DOM、390px 響應式或 accessibility regression suite。

### 資訊不足

- 產品負責人對 V2 規格、MVP 與 Phase 0 的正式核准：`Unknown`。
- 部署目標、正式網址、瀏覽器支援矩陣：`Unknown`。
- Supabase 專案、環境、預算與資料治理負責人：`Unknown`。
- V1 真實使用者資料格式、資料量與 migration 樣本：`Unknown`。
- Sprint owner、時程、release date 與成功指標：`Unknown`。
- `README.md` 不存在；啟動與驗收流程未集中記錄。
- `package.json` 不存在；目前以 Node 24 原生 ESM 直接執行 `.js` 測試，沒有集中 test script。

## 七、下一步（Next Action）

建議只先進行一個決策型動作：

1. 人工驗收 Sprint 4A 的 repository contract、fallback 與 V1 preview 邊界。
2. 決定 Phase 1 下一 Sprint 是先做 V1 匯出／完整 dry run，或補 DOM interaction 與 390px 自動驗收。
3. Phase 1 通過後，再獨立設計非同步 Supabase repository；不得把目前同步 adapter 宣稱為可直接替換。

在上述決策完成前，不建議直接建立資料庫、導入 React、覆蓋 V1 `localStorage` 或擴大功能範圍。

## 八、重要檔案

| 檔案 | 用途 |
| --- | --- |
| `PROJECT_STATUS.md` | 本次恢復後的專案單一狀態摘要。 |
| `PRODUCT_SPEC.md` | V1 產品定位、範圍、資料類型與成功標準。 |
| `CODEX_TASK.md` | V1 開發任務、禁止事項與驗收條件。 |
| `V2_PRODUCT_SPEC.md` | V2 Workspace 協作平台的產品規格與範圍。 |
| `V2_TECHNICAL_DESIGN.md` | V2 資料模型、RLS、adapter、migration 與技術風險。 |
| `V2_IMPLEMENTATION_ROADMAP.md` | Phase 0–7 的交付物、驗收、風險與回退策略。 |
| `index.html` / `styles.css` / `app.js` | 可使用 `localStorage` 的既有 V1 Dashboard。 |
| `dashboard.html` / `dashboard.css` / `dashboard-app.js` | 無後端、使用本機瀏覽器持久化的 V2 Prototype 入口、樣式與互動綁定。 |
| `data/mock-data.js` | V2 Workspace、Project、Team、User、Task 等 mock 資料。 |
| `store/store.js` | V2 store factory、預設 repository 選擇、dispatch、reset 與 subscription。 |
| `store/repositories.js` | Memory / LocalStorage repository、同步 contract 與 state validation。 |
| `store/storage-keys.js` | V1 / V2 storage key 與 V2 schema version 的集中定義。 |
| `store/clock.js` | 系統日期與 fixed clock 邊界。 |
| `store/migration-preview.js` | 依實際 V1 schema 產生純函式 migration preview。 |
| `store/actions.js` | 導覽選取及 Task create/update/delete actions。 |
| `store/selectors.js` | Dashboard 查詢、進度、日期、健康、風險與工作量計算。 |
| `store/state-utils.js` | clone、日期、狀態常數與 mock data normalization。 |
| `pages/` | Workspace、Project、Team、Task、My Tasks 頁面與 router。 |
| `components/` | V2 共用卡片與 UI HTML renderer。 |
| `tests/state-foundation.test.js` | V2 store、actions、selectors 與刪除關聯清理測試。 |
| `tests/repository-boundary.test.js` | Sprint 4A adapter、store injection、fallback、migration preview 與 clock 測試。 |

## 狀態結論

專案不是從零開始：V1 已是可保存資料的個人 Dashboard；V2 已完成規格、UI foundation、基本 Task lifecycle，以及 Sprint 4A 的同步 repository 與本機持久化邊界。下一個轉折點是完成 V1 正式 dry run 邊界與瀏覽器 regression，之後再獨立設計非同步 Supabase 整合。下一 Sprint 的正式範圍與負責人仍為 `Unknown`。
