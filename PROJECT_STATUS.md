# PROJECT STATUS

更新日期：2026-07-26
盤點基準：`main` / `67e686e`（與 `origin/main` 同步）
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
- 瀏覽器端、視覺、響應式、可用性與 console 的自動測試：`Unknown`（Repository 內未發現對應測試）。

## 三、目前進行中

- 最新可確認進度停在 Sprint 3C：任務刪除後的關聯清理，提交 `67e686e`。
- `main` 與 `origin/main` 同步，盤點開始時沒有未提交程式變更。
- 目前是否另有已指派但尚未提交的 Sprint、負責人或期限：`Unknown`。
- Roadmap Phase 1 僅部分落地：
  - 已有集中式 store、selectors、actions 與 mock data。
  - 尚未看到正式 repository / adapter 介面。
  - V2 Prototype 尚未接上 `localStorage`。
  - migration preview / dry run 尚未實作。

## 四、尚未完成

以下依現有 Roadmap 與程式缺口排序；實際商業優先級是否已由產品負責人確認：`Unknown`。

1. **確認下一個 Sprint 與 Phase 1 驗收邊界**
   - 確認是先完成持久化／repository adapter、V1 migration preview，或先補 UI 操作。
   - 確認 V2 Prototype 的驗收清單與完成定義。
2. **完成 Phase 1 資料層抽象與 V1 保護**
   - `TaskRepository` / `LocalStorageTaskRepository` 等 adapter。
   - V1 資料備份／匯出與 migration preview / dry run。
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

- **缺少明確的下一 Sprint 定義**：Repository 只顯示已完成至 Sprint 3C，沒有下一張任務書或已確認優先級。
- **V2 沒有持久化**：重新整理會還原 mock data，無法作為可持續使用的 MVP。
- **文件與程式狀態模型不一致**：文件為七種狀態，程式為四種狀態。
- **文件與程式權重規則不一致**：文件建議 1 / 2 / 5，程式驗證範圍為 1–3。
- **日期基準寫死**：`store/state-utils.js` 的 `TODAY` 固定為 `2026-07-25`，會使逾期、今日與即將到期結果隨真實日期失準。
- **角色與 visibility 尚未實作**：目前不能驗證多人資料隔離與角色 Dashboard。
- **缺少瀏覽器與響應式驗證證據**：現有測試只涵蓋 Node 狀態邏輯。

### 資訊不足

- 產品負責人對 V2 規格、MVP 與 Phase 0 的正式核准：`Unknown`。
- 部署目標、正式網址、瀏覽器支援矩陣：`Unknown`。
- Supabase 專案、環境、預算與資料治理負責人：`Unknown`。
- V1 真實使用者資料格式、資料量與 migration 樣本：`Unknown`。
- Sprint owner、時程、release date 與成功指標：`Unknown`。
- `README.md` 不存在；啟動與驗收流程未集中記錄。

## 七、下一步（Next Action）

建議只先進行一個決策型動作：

1. 由產品／技術負責人確認「下一 Sprint 是否以完成 Roadmap Phase 1 為目標」。
2. 若確認，先建立可驗收的 Sprint 規格，不直接串 Supabase：
   - 定義 repository / adapter 邊界。
   - 決定 V2 本機持久化 key 與 V1 key 的隔離方式。
   - 建立 V1 migration fixture、preview 與 dry-run 驗收案例。
   - 統一 task status、weight 與日期基準。
   - 補 V1 regression、V2 store、DOM interaction 與 390px 驗收。
3. Phase 1 通過後，再決定 Phase 2 Supabase staging、schema 與 RLS 的實作排程。

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
| `dashboard.html` / `dashboard.css` / `dashboard-app.js` | 無後端、in-memory 的 V2 Prototype 入口、樣式與互動綁定。 |
| `data/mock-data.js` | V2 Workspace、Project、Team、User、Task 等 mock 資料。 |
| `store/store.js` | V2 集中式 in-memory state、dispatch 與 subscription。 |
| `store/actions.js` | 導覽選取及 Task create/update/delete actions。 |
| `store/selectors.js` | Dashboard 查詢、進度、日期、健康、風險與工作量計算。 |
| `store/state-utils.js` | clone、日期、狀態常數與 mock data normalization。 |
| `pages/` | Workspace、Project、Team、Task、My Tasks 頁面與 router。 |
| `components/` | V2 共用卡片與 UI HTML renderer。 |
| `tests/state-foundation.test.js` | V2 store、actions、selectors 與刪除關聯清理測試。 |

## 狀態結論

專案不是從零開始：V1 已是可保存資料的個人 Dashboard；V2 已完成規格、UI foundation、集中式狀態與基本 Task lifecycle，最新進度到 Sprint 3C。現在的主要轉折點是把「可操作但重新整理即重置的 Prototype」推進為「資料邊界清楚、可持久化、可遷移且可驗收的 Phase 1」。在下一 Sprint 未被正式確認前，進一步實作方向為 `Unknown`。
