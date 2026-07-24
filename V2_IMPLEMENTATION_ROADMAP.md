# Dashboard V2 Implementation Roadmap

## 1. 原則

V2 應以低風險、可回退、可驗證的方式推進。現有 V1 Dashboard 若仍可使用，應避免一次性重寫。每個 Phase 都應有明確交付物、驗收條件、風險與回退策略。

本 Roadmap 只規劃未來實作順序。本階段不修改 `app.js`、`styles.css`、`index.html`，不建立 React / npm / `src/`，不直接串接 Supabase，也不建立資料庫。

統一詞彙：單機多人模擬、多租戶 SaaS、Workspace 作為租戶隔離基礎。第一階段可先用 mock users 和 mock roles 在本機測試；未來接入 Supabase 時，保留既有資料模型與前端流程；多租戶 SaaS 階段必須依 `workspace_id` 隔離資料。

## 2. Phase 0：規格與設計確認

### 目標

確認 V2 的產品邊界、資料模型、權限模型、Dashboard 類型與 migration 策略。

### 交付物

- `V2_PRODUCT_SPEC.md`
- `V2_TECHNICAL_DESIGN.md`
- `V2_IMPLEMENTATION_ROADMAP.md`
- 角色與權限矩陣
- 資料表草案
- RLS 原則
- V1 migration 流程
- 第一階段外部連結附件策略
- 單機多人模擬策略
- 營隊使用情境：營隊是一個 Project；報到組、教材組、美術組、器材組、行政組、交通組等是 Team；各組具體工作是 Task；不要把每個組別都建立為獨立 Project。
- Dashboard 卡片欄位規格：專案名稱、組別名稱、進度百分比、已完成任務數 / 總任務數、下一步、風險狀態、負責人、截止日期。

### 驗收條件

- 清楚定義 Workspace / Project / Team / Task 層級。
- 清楚定義 Owner / Admin / PM / Team Lead / Member / Viewer。
- 清楚定義任務可見性。
- 清楚定義 Supabase 表格方向。
- 清楚定義哪些內容不在第一階段實作。
- 清楚定義本機路徑不可作為多人共享附件。
- 清楚定義測試角色與多人資料模型預留欄位。
- 清楚定義多租戶 SaaS 階段必須依 `workspace_id` 隔離資料，Workspace 作為租戶隔離基礎。

### 風險

- 規格過大，導致 MVP 無法落地。
- 權限模型太早過度複雜。

### 回退策略

- 若範圍過大，先保留 Workspace + Project + Task，Team 延後。

## 3. Phase 1：資料層抽象與 V1 保護

### 目標

在不破壞 V1 的前提下，抽出資料存取介面，讓未來可切換 localStorage 與 Supabase。

### 交付物

- 資料 adapter 設計
- Task repository 介面
- localStorage repository
- mock user / mock role repository
- mock workspace / project / team dataset
- V1 資料備份與匯出
- V1 migration dry run 規格
- external link metadata model

### 驗收條件

- 現有 Dashboard 行為不變。
- 所有既有 localStorage 資料仍可讀取。
- 可產生 migration preview。
- 沒有刪除或覆蓋既有 localStorage。
- 第一階段可先用 mock users 和 mock roles 在本機測試。
- 可用測試資料模擬 Workspace Owner、Workspace Admin、Project Manager、Team Lead、Member、Viewer。
- 不同測試角色可看到不同 Dashboard。
- Private / Team / Project / Workspace visibility 可在本機資料中驗證。
- 附件只儲存外部 HTTPS 連結，不接受本機路徑作為多人共享連結。

### 風險

- 改動既有 JavaScript 後造成 V1 regression。
- V1 localStorage 結構未完整掌握。

### 回退策略

- 保留原始 V1 檔案。
- migration 僅 preview，不寫入雲端。

## 4. Phase 2：Supabase 基礎建置

### 目標

建立 Supabase Auth、資料表、RLS 與基本 Workspace / Project / Task CRUD。

### 交付物

- Supabase 專案
- 保留既有資料模型與前端流程的 adapter 切換方案
- Database schema migration
- RLS policy
- Auth 設定
- Email / Google 登入
- Workspace CRUD
- Project CRUD
- Task CRUD

### 驗收條件

- 使用者可註冊、登入、登出。
- 使用者可建立 Workspace。
- 使用者可建立 Project。
- 使用者可建立與指派 Task。
- 使用者只能看到自己有權限的資料。
- 所有資料查詢與 RLS policy 都依 `workspace_id` 做租戶隔離。
- Viewer 無法修改資料。

### 風險

- RLS policy 錯誤造成資料外洩或資料看不到。
- 前端使用 service role key 的風險。
- Auth callback 與部署網域設定錯誤。

### 回退策略

- 使用 Supabase staging project 測試。
- 所有 migration 使用版本化 SQL。
- RLS 先用小型測試資料驗證。

## 5. Phase 3：Dashboard 分層

### 目標

依角色與 scope 建立不同 Dashboard。

### 交付物

- Workspace Dashboard
- Project Manager Dashboard
- Team Lead Dashboard
- Member Dashboard
- Viewer Dashboard
- Dashboard progress query
- overdue / blocked / risk summary

### 驗收條件

- Workspace Admin 可看到 Workspace 全域摘要。
- Project Manager 可看到自己管理的 Project。
- Team Lead 可看到自己 Team 的任務與風險。
- Member 可看到指派給自己的任務。
- Viewer 只能讀取，不可修改。
- Dashboard 進度計算與 task 狀態一致。
- Dashboard 卡片明確顯示專案名稱、組別名稱、進度百分比、已完成任務數 / 總任務數、下一步、風險狀態、負責人、截止日期。

### 風險

- 查詢過多造成 Dashboard 變慢。
- 權限與 Dashboard 顯示不一致。

### 回退策略

- 先用簡化查詢。
- 資料量成長後再新增 view 或 materialized view。

## 6. Phase 4：Team、邀請與協作

### 目標

完成多人協作的核心流程。

### 交付物

- Team CRUD
- Team members
- Team Lead 指派
- Invitation flow
- invitation token
- Activity log
- Task assignment history

### 驗收條件

- Admin 可邀請使用者加入 Workspace。
- PM 可邀請成員加入 Project。
- Team Lead 可管理允許範圍內的 Team 任務。
- 邀請過期、撤銷、接受狀態可追蹤。
- 重要變更寫入 activity log。

### 風險

- 邀請權限過寬。
- 成員離開後仍能看到舊資料。
- Activity log 寫入不完整。

### 回退策略

- 邀請先限制為 Workspace Admin 發出。
- Project / Team invitation 延後開放。

## 7. Phase 5：V1 Migration

### 目標

提供正式從 V1 localStorage 匯入 V2 雲端資料的流程。

### 交付物

- localStorage scanner
- migration preview
- mapping rules
- duplicate detection
- import confirmation
- import activity log
- rollback guidance

### 驗收條件

- 使用者可看到即將匯入的資料。
- 使用者可選擇目標 Workspace / Project。
- 匯入不刪除原始 localStorage。
- 匯入失敗可重試。
- 重複匯入不會產生不可控重複資料。

### 風險

- V1 資料格式不一致。
- 重複匯入。
- 任務狀態 mapping 錯誤。

### 回退策略

- 先提供匯出 JSON。
- 再提供 dry run。
- 最後才提供正式 import。

## 8. Phase 6：外部連結、通知與進階管理

### 目標

補齊實務協作常見功能，但第一階段附件仍維持外部連結模式，不提供大量檔案上傳。

### 交付物

- external links
- 任務外部連結
- Project 外部連結
- event 外部連結
- link validation
- local path rejection
- Email notification
- due date reminder
- notification preferences
- export
- audit review screen

### 驗收條件

- 成員可新增授權範圍內的外部連結。
- 系統拒絕 `file://`、`C:\Users\...`、`/Users/...` 等本機路徑作為多人協作附件。
- 系統提示外部檔案權限由原始雲端服務控制。
- 沒有權限者無法讀取外部連結 metadata。
- 任務指派與逾期可通知。
- 管理者可查看活動紀錄。

### 風險

- 外部連結權限未開放，其他成員無法查看檔案。
- 使用者刪除或移動外部檔案後，連結失效。
- 通知過多造成干擾。

### 回退策略

- 附件只保存外部連結 metadata。
- 通知先只做 Email。
- 預設關閉非必要通知。
- 系統內建上傳、容量限制、壓縮、轉碼、防毒掃描與版本管理延後到 SaaS 付費版評估。

## 9. Phase 7：SaaS 化準備

### 目標

讓產品可支援多客戶、多 Workspace 與商業化。

### 交付物

- Workspace billing model
- plan limits
- usage tracking
- workspace settings
- admin console
- onboarding flow
- tenant isolation review
- `workspace_id` RLS coverage review
- security review

### 驗收條件

- 每個 Workspace 資料隔離明確，且多租戶 SaaS 階段必須依 `workspace_id` 隔離資料。
- 使用量可計算。
- 權限模型可支援付費方案。
- 新客戶可完成 onboarding。

### 風險

- 過早 SaaS 化造成內部 MVP 延誤。
- 方案限制與資料模型不一致。

### 回退策略

- SaaS 化只保留資料結構準備。
- 先服務 BagKing 內部使用。

## 10. 建議 MVP 範圍

第一個可執行 MVP 建議只包含：

- Email / Google login
- Workspace
- Workspace members
- Project
- Project members
- Task CRUD
- Task assignment
- Basic dashboard
- Basic RLS
- V1 migration preview
- 單機多人模擬：Local mock users and roles
- External link attachments only

延後：

- Team 完整管理
- 系統內建檔案上傳
- 通知
- 複雜 audit screen
- SaaS billing
- React rewrite

## 11. 驗證清單

每個 Phase 完成前應檢查：

- 是否破壞現有 V1 行為
- 是否有明確資料備份或回退方式
- 是否有權限測試
- 是否有 Dashboard 數字驗證
- 是否有 migration dry run
- 是否有 staging 環境
- 是否沒有把 service role key 放進前端
- 是否沒有讓使用者看到未授權資料
- 是否沒有把本機檔案路徑當作多人共享附件
- 是否已用 mock users、mock roles 與測試角色驗證 Dashboard 與 visibility
- 是否已確認角色名稱、任務狀態、visibility 層級、階段名稱、外部連結附件策略、V1 localStorage migration、Supabase / RLS 升級方向與三份 V2 文件一致

## 12. 不建議立即執行的事項

目前不建議立即：

- 重寫成 React
- 建立大型 npm 專案
- 一次導入完整 Supabase schema
- 一次實作所有角色權限
- 直接覆蓋 V1 localStorage
- 在沒有 RLS 測試下發布雲端版本
- 在規格未確認前建立 PR 或 merge
- 第一階段建立大量檔案上傳系統
- 第一階段導入圖片壓縮、影片轉碼、防毒掃描或檔案版本管理
- 先做完全單人資料模型，未來再硬改成多人系統
