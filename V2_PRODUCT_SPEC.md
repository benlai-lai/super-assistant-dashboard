# Dashboard V2 Product Spec

## 1. 目標

Dashboard V2 的目標，是把目前單一使用者、單一資料池的 V1 Dashboard，升級為可支援多 Workspace、多 Project、多 Team、多人協作、權限控管與雲端資料同步的營運管理系統。

V2 仍以現有 Dashboard 的工作管理邏輯為核心，但產品邊界從「個人任務面板」擴展為「Workspace 協作平台」。本文件只定義產品規格，不要求修改現有 `index.html`、`styles.css`、`app.js`，也不要求建立 React、npm、Supabase 或資料庫實作。

## 2. V1 現況假設

因目前工作區未同步到 `PRODUCT_SPEC.md`、`CODEX_TASK.md`、`index.html`、`styles.css`、`app.js`、`README.md` 等主要檔案，本規格依據任務描述整理 V1 現況：

- V1 是靜態 HTML、CSS、Vanilla JavaScript Dashboard。
- V1 使用 `localStorage` 保存任務與設定。
- V1 偏向單一使用者、單一 Dashboard。
- V1 已有任務狀態、進度、Next Action、風險或逾期提示等概念。
- V1 沒有正式多人權限、Workspace、Project、Team、雲端同步、邀請與審計紀錄。

## 3. V2 產品範圍

V2 應支援以下核心能力：

- 多 Workspace：使用者可建立或加入多個 Workspace。
- 多 Project：每個 Workspace 可包含多個 Project。
- 多 Team：每個 Project 或 Workspace 可包含多個 Team。
- 任務與子任務：Task 可隸屬於 Workspace、Project、Team，並可建立 Subtask。
- 多人協作：支援成員加入、邀請、角色、指派與可見性。
- 權限控管：不同角色可擁有不同讀寫與管理能力。
- 雲端資料：V2 最終應以 Supabase Auth、PostgreSQL、RLS、Storage 為主要後端方向。
- Dashboard 分層：依角色與範圍顯示不同 Dashboard。
- V1 migration：保留從 `localStorage` 匯入既有資料的路徑。

## 4. 產品定位

V2 不是單純的待辦清單，也不是一次性專案表格。它應定位為 BagKing 內部與未來 SaaS 化可延伸的工作作業系統：

- 第一階段服務 BagKing 內部營運、產品、行銷、客服、開發等任務管理。
- 第二階段可抽象為多客戶、多 Workspace 的多租戶 SaaS 架構。
- 所有資料模型需避免只綁定單一公司或單一專案，以利未來擴展。
- Workspace 作為租戶隔離基礎；未來多租戶 SaaS 階段必須依 `workspace_id` 隔離資料。

## 5. 資訊架構

基本層級：

```text
Workspace
  Project
    Team / Group
      Task
        Subtask
```

### Workspace

Workspace 是最高層級的協作空間，可代表一家公司、一個品牌、一個大型組織或一個客戶環境。

範例：

- BagKing 總部
- 品牌營運部
- 客戶專案空間
- 測試 Workspace

### Project

Project 是具體專案或長期工作流，可隸屬於 Workspace。

範例：

- BagKing 官方網站
- 客服知識庫
- AI 客戶詢問 MVP
- 禮盒商品頁優化
- 內部作業流程改善

### Team

Team 是人員與任務的協作群組，可用於組織權限、Dashboard 與任務分派。

範例：

- 營運團隊
- 行銷團隊
- 商品團隊
- 客服團隊
- 開發團隊
- 管理團隊
- 外部協作者

### Task

Task 是最小可追蹤工作單位，需支援狀態、優先級、負責人、截止日、可見性、權重、依賴關係與活動紀錄。

### 營隊使用情境

營隊管理應使用同一套 Workspace / Project / Team / Task 架構，不另外建立特殊資料模型。

- 營隊是一個 Project。
- 報到組、教材組、美術組、器材組、行政組、交通組等是 Team。
- 各組具體工作是 Task。
- 不要把每個組別都建立為獨立 Project，否則 Dashboard 彙總、權限、進度與跨組協作會被拆散。
### Subtask

Subtask 是 Task 的拆解項目，可用於計算父任務進度。

## 6. Dashboard 類型

V2 應依使用者角色與所在範圍提供不同 Dashboard。

### Workspace Dashboard

給 Workspace Owner / Admin 使用。

應顯示：

- Workspace 整體進度
- Project 數量與狀態
- Team 數量與狀態
- 逾期任務
- 高風險任務
- 下一步 Next Action
- 成員工作量
- 權限與邀請概況
- 最近活動

### Project Manager Dashboard

給 Project Manager 使用。

應顯示：

- Project 整體進度
- 各 Team 進度
- 待處理任務
- 逾期任務
- 風險任務
- Project 成員
- Project Next Action
- 最近更新

### Team Lead Dashboard

給 Team Lead 使用。

應顯示：

- Team 整體進度
- Team 任務清單
- 成員工作量
- 逾期任務
- Team Next Action
- Team 風險

### Member Dashboard

給一般成員使用。

應顯示：

- 指派給我的任務
- 今日或本週到期任務
- 任務狀態
- 我建立的任務
- 我參與的 Team / Project
- 最近更新

### Viewer Dashboard

給唯讀角色使用。

應顯示：

- 允許查看的 Workspace / Project / Team 摘要
- 只讀任務資訊
- 不提供新增、修改、刪除或邀請操作

## 7. Dashboard 卡片內容

每個 Dashboard 卡片必須明確支援以下欄位：

- 專案名稱
- 組別名稱
- 進度百分比
- 已完成任務數 / 總任務數
- 下一步
- 風險狀態
- 負責人
- 截止日期

每個 Dashboard 卡片也可依情境補充：

- 所屬 Workspace / Project / Team
- 逾期任務數量
- 高優先級任務數量
- 最近更新時間

範例：

```text
專案名稱：暑期營隊 2026
組別名稱：報到組
進度百分比：60%
已完成任務數 / 總任務數：6 / 10
下一步：確認報到動線與名牌列印
風險狀態：2 個逾期任務需要處理
負責人：報到組組長
截止日期：2026-08-01
```
## 8. 任務狀態與進度

### 任務狀態

建議狀態：

- Backlog
- Not Started
- In Progress
- Blocked
- Review
- Done
- Archived

### 進度計算

任務進度可由子任務計算：

```text
完成率 = 已完成子任務數 / 子任務總數 * 100%
```

Project、Team、Workspace 進度可用任務權重計算：

```text
加權完成率 = 已完成任務權重總和 / 全部任務權重總和 * 100%
```

若沒有設定權重，預設每個任務權重為 1。

### 權重建議

- 小型任務：1
- 中型任務：2
- 大型或跨部門任務：5

## 9. 角色與權限

V2 角色：

- Workspace Owner
- Workspace Admin
- Project Manager
- Team Lead
- Member
- Viewer

### 權限矩陣

| 能力 | Owner | Admin | PM | Team Lead | Member | Viewer |
| --- | --- | --- | --- | --- | --- | --- |
| 建立 Workspace | Yes | No | No | No | No | No |
| 修改 Workspace | Yes | Yes | No | No | No | No |
| 刪除 Workspace | Yes | No | No | No | No | No |
| 邀請成員 | Yes | Yes | Yes | Limited | No | No |
| 建立 Project | Yes | Yes | Yes | No | No | No |
| 修改 Project | Yes | Yes | Yes | No | No | No |
| 刪除 Project | Yes | Yes | Limited | No | No | No |
| 建立 Team | Yes | Yes | Yes | Limited | No | No |
| 指派 Team Lead | Yes | Yes | Yes | No | No | No |
| 建立 Task | Yes | Yes | Yes | Yes | Yes | No |
| 修改 Task | Yes | Yes | Yes | Yes | Own/Assigned | No |
| 查看 Dashboard | Yes | Yes | Yes | Yes | Yes | Read-only |
| 匯出資料 | Yes | Yes | Limited | No | No | No |

## 10. 任務可見性

任務可見性分為：

- Private：只有建立者或明確授權者可見。
- Assigned Users：只有被指派的使用者可見。
- Team：同 Team 成員可見。
- Project：同 Project 成員可見。
- Workspace：整個 Workspace 成員可見。

預設建議：

- 個人任務：Private
- Team 任務：Team
- Project 任務：Project
- 公告或全域任務：Workspace

## 11. Project 管理能力

V2 應支援 Project 管理：

- 建立 Project
- 編輯 Project 名稱、描述、狀態、負責人
- 指派 Project Manager
- 設定 Project 成員
- 設定 Project Team
- 設定 Project 可見性
- 顯示 Project Dashboard
- 顯示 Project 風險與進度

Project 建立表單建議欄位：

- Project 名稱
- Project 描述
- 所屬 Workspace
- 負責人
- 成員
- Team
- 狀態
- 預計開始日
- 預計完成日

## 12. Team 管理能力

V2 應支援 Team 管理：

- 建立 Team
- 編輯 Team 名稱與描述
- 新增或移除 Team 成員
- 指派 Team Lead
- 查看 Team Dashboard
- 查看 Team 任務
- 查看 Team 進度與風險

## 13. 邀請與登入

MVP 登入方式：

- Email + 密碼
- Google OAuth

後續可延伸：

- LINE 登入
- Microsoft 登入

邀請流程：

1. Admin 或有權限者輸入受邀者 Email。
2. 選擇 Workspace、Project 或 Team。
3. 指派角色。
4. 系統產生邀請紀錄。
5. 受邀者註冊或登入。
6. 系統建立 membership。
7. 受邀者依權限看到對應資料。

## 14. 通知

第一階段可先定義資料結構，不必實作完整通知系統。

未來通知事件：

- 任務被指派
- 任務狀態變更
- 任務即將到期
- 任務逾期
- 留言或活動更新
- 邀請加入 Workspace / Project / Team

## 15. V1 資料遷移

V2 必須保留從 V1 `localStorage` 匯入資料的規格。

遷移流程：

1. 偵測 V1 localStorage key。
2. 解析既有任務資料。
3. 讓使用者選擇目標 Workspace。
4. 建立預設 Project。
5. 將既有任務匯入該 Project。
6. 顯示匯入預覽。
7. 使用者確認後寫入雲端資料庫。
8. 保留原始 localStorage，不自動刪除。

## 16. 檔案與附件策略

V2 第一階段不提供大量圖片、影片或大型附件直接上傳到本系統。

原因：

- 降低儲存成本。
- 避免多租戶情境下容量快速增加。
- 降低備份與資安責任。
- 避免過早建立複雜的檔案管理系統。

第一階段採用「外部連結模式」。使用者可以在任務、專案、行程或備註中新增附件連結，例如：

- Google Drive
- OneDrive
- Dropbox
- YouTube
- Vimeo
- 其他 HTTPS 網址

系統只儲存：

- 連結 URL
- 連結名稱
- 檔案類型
- 說明
- 建立者
- 所屬 `workspace_id`
- 所屬 `project_id`
- 所屬 `team_id`
- 所屬 `task_id`
- 可見範圍 `visibility`
- 建立時間
- 更新時間

檔案本體預設由使用者或客戶自行保管於自己的雲端空間。

系統不得假設本機檔案路徑可以與其他使用者共享，例如：

```text
C:\Users\...
file:///...
/Users/...
```

本機路徑只能在同一台裝置使用，不可當作多人協作連結。

系統應驗證連結格式，並明確提醒使用者：

- 外部檔案的存取權限由原始雲端服務控制。
- 若連結未開放給其他成員，其他人可能無法查看。
- 系統只保存連結，不負責外部檔案永久存在。
- 使用者刪除或移動原始檔案後，連結可能失效。

未來 SaaS 付費版本可再評估：

- 系統內建檔案上傳
- 每個工作區容量限制
- 不同訂閱方案的儲存配額
- 單檔大小限制
- 圖片壓縮
- 影片轉碼
- 防毒掃描
- 檔案版本管理
- 自動備份
- 儲存用量計費

但以上不納入 V2 第一階段。

## 17. 單機多人模擬與未來升級原則

V2 可以先開發為「多人架構的本機測試版」。

意思是：

- 功能與資料模型按照多人系統設計。
- 第一階段可先用 mock users 和 mock roles 在本機測試，使用假帳號與測試角色模擬多個使用者。
- 先在本機或測試環境驗證流程。
- 暫時不需要正式購買主機或付費資料庫方案。
- 暫時不開放真實外部使用者登入。

但從一開始，資料模型必須預留：

- `workspace_id`
- `user_id`
- `owner_id`
- `created_by`
- `assignee_id`
- `role`
- `visibility`
- tenant / workspace 隔離邏輯
- `created_at`
- `updated_at`

不可以先建立完全單人的資料模型，再於未來硬改成多人版。

第一階段可以使用測試資料模擬：

- Workspace Owner
- Project Manager
- Team Lead
- Member
- Viewer

並驗證：

- 不同角色看到不同 Dashboard。
- 私人資料不可被其他測試帳號看到。
- 組別資料只對組員與管理者顯示。
- 專案資料只對專案成員顯示。
- 總負責人可以查看所有組別彙總。
- 組員只能修改自己有權限的任務。

之後接入 Supabase 時，應保留既有資料模型與前端流程，盡量只替換：

- 本機資料來源
- 身份驗證
- 雲端儲存
- Row Level Security
- 即時同步

未來升級為多租戶 SaaS 時，Workspace 作為租戶隔離基礎，所有跨租戶資料必須依 `workspace_id` 隔離，避免大規模重寫。

## 18. 不在本階段範圍

本規格文件階段不包含：

- 修改 `app.js`
- 修改 `styles.css`
- 修改 `index.html`
- 建立 React 專案
- 建立 npm 專案
- 建立 `src/`
- 直接串接 Supabase
- 建立資料庫
- 修改 main branch
- 建立 Pull Request
- 實作登入或權限
- 大量圖片、影片或大型附件上傳
- 系統內建檔案儲存、壓縮、轉碼、防毒掃描或版本管理
