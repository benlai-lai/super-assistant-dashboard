# Dashboard Project Status

- 更新日期：2026-09-06
- 唯一正式 Repository：`C:\Users\taich\Documents\GitHub\super-assistant-dashboard`
- 已驗證程式基準：`main` / `a4d2bb83eb5d8914d0c68934e0f34dce8e9db226`
- 已驗證程式 tree：`bb0bae5e50b2e7b572634322dbd366819b4cd5ce`；以下自動化證據不等同本基準的人工驗收。
判定原則：無法由目前程式、文件或驗證確認者，一律標記 `UNKNOWN`。

## 目前方向

- 核心目標：降低使用者管理想法、任務、行程與專案狀態的認知負擔。
- V1 是可操作的個人工作 Dashboard，必須保留既有資料與使用方式。
- C0-B 已透過 PR #21 合併結案；保留 V1／V2 既有行為，下一階段範圍與執行授權尚未確認。
- V2 文件將方向擴展為 Workspace 協作平台；完整多人產品核准狀態仍為 `UNKNOWN`。
- Pages 已公開靜態 Prototype；正式 Node 後端、正式資料庫及正式多人環境尚未啟用。

## 已完成並可由程式確認

- V1：總覽、日曆、任務、專案、Inbox、快速新增、任務狀態／完成／封存及 V1 `localStorage` 保存。
- V2：Workspace、Project、Team、Task Detail、My Tasks 五種頁面與 Hash Router。
- V2 任務操作：建立、改負責人、改截止日、改狀態、完成／重開及刪除；刪除會同步清理相關 activity、attachment、dependency 與 selected task。
- V2 Dashboard：進度、逾期、即將到期、阻塞、風險、健康度與工作量摘要。
- V2 本機操作：模擬使用者切換、visibility／寫入限制、Project／Team 建立與編輯、既有成員配置、外部連結新增／編輯／移除及依賴新增／移除。
- 資料邊界：Memory／LocalStorage repository、V2 獨立 storage key、fallback、state validation 與 fixed clock 測試邊界。
- V1 migration preview：只預覽可遷移 Task，不會正式匯入或刪除 V1 資料。
- V2 storage schema 已升到 version 2：新增 `orders` 陣列與 Task `orderId` 相容欄位；目前只有資料格式，沒有訂單履約操作畫面或流程。
- 本機後端基礎：Node HTTP 登入／session、editor／viewer／approver 權限控制、SQLite repository 與版本 1–3 migrations、Customer／Inquiry、品類及報價 API；Inquiry JSON export 已有受政策控制的 service，尚無 UI／HTTP 入口。
- C0-B：approver 核准／退回、禁止自行核准、不可變更的核准紀錄，以及內部／客戶欄位白名單投影；`costSummary` 僅限內部投影。
- ReDoS：PR #22 已合併；CSS `url()`／`@import` 抽取改用預先計算與有界解析，保留既有抽取及 validator 行為。

## 已驗證結果與限制

- 同一程式 tree 的隔離驗收：128 tests 通過，lint／build／audit 通過，audit 為 0 vulnerabilities；本次文件更新未重跑功能驗收。
- 此 main 的 [CI](https://github.com/benlai-lai/super-assistant-dashboard/actions/runs/34007988785)／[CodeQL](https://github.com/benlai-lai/super-assistant-dashboard/actions/runs/34007988649) 成功；CodeQL analysis `1730807217` 對應上述 main、0 results、無分析錯誤。main 的 ReDoS alerts #1–#4 實際狀態為 Fixed，未 dismiss。
- Playwright 1.63.0／Chromium：V1／V2 入口、主要導覽與重新載入，1440px／390px 共 24 checkpoints 通過；console／page／HTTP errors 與水平溢出均為 0。未涵蓋完整 CRUD、登入／API、其他瀏覽器、鍵盤或 accessibility regression。
- ZAP 2.17.0：隔離 loopback、合成資料及匿名／viewer／editor／approver，固定 66 requests（24 靜態、42 API）的有界被動基線；保留 4 Medium、24 Low、8 Informational。Medium／Low 均屬臨時靜態測試服務的缺少安全 headers 警告。
- ZAP 未執行 spider／主動掃描，也未完整覆蓋 API／權限組合、TLS 或正式環境 headers；使用者已接受這些警告與覆蓋限制作為本次合併的有限證據，不代表正式環境零漏洞。

## Pages 已公開發布

- PR #21 合併後，既有 Pages 由 `main` 根目錄自動重建與公開發布；[流程](https://github.com/benlai-lai/super-assistant-dashboard/actions/runs/34007988287) 成功且部署 SHA 為上述 main。公開網址：[Dashboard](https://benlai-lai.github.io/super-assistant-dashboard/)。
- 已核對 artifact `9981562545` 共 78 檔：70 個原始檔與核准 tree 一致，涵蓋前端、server 原始碼、migration SQL、tests、scripts、package／lockfile 與專案文件；另有 7 個文件轉製 HTML 與 1 個樣式檔，無未預期差異。此為靜態檔案公開，不會啟動 Node 後端或執行 migration。

## 尚未完成或只有部分基礎

- V1／V2 UI 仍使用本機資料，V2 使用模擬使用者；尚未串接後端登入／session 與業務 API；前端限制不代表正式安全隔離。
- 正式 Node 後端、正式資料庫及正式 migration 未啟用；本機預設啟動不自動開庫，呼叫 SQLite 開庫 helper 會套用 migrations，正式使用仍需另行授權。
- Activity 尚無獨立管理流程；Workspace、帳號／成員生命週期、邀請及完整刪除流程尚未完成。
- V1 migration 尚無正式 export、完整 mapping、duplicate detection 或 import dry run。
- 沒有 Supabase Auth、PostgreSQL、RLS、雲端同步或正式多人資料隔離實作。
- 前端 Repository contract 目前為同步模式，不能宣稱可直接替換成非同步 Supabase repository。
- V1 的報表與設定仍為空白或未開放；V2 的 390px 頂部導覽占用較多首屏空間。
- V2 完成／重開／刪除的連續人工操作驗收仍為 `UNKNOWN`；此次導覽自動化未補足該證據。
- 品類／報價 API 基礎不等於完整訂單履約；訂單 UI 與完整生命週期尚未完成。

## 已確認的重要決策

- 短期維持 HTML／CSS／Vanilla JavaScript，不立即重寫框架。
- Workspace 是未來多租戶隔離基礎；跨租戶資料必須依 `workspace_id` 隔離。
- 前端按鈕限制不能取代後端權限檢查或未來 RLS。
- V1 `localStorage` 必須保留；遷移先 preview／dry run，不自動覆蓋或刪除原資料。
- 第一階段附件只保存外部 HTTPS 連結 metadata，不以本機路徑共享。
- 營隊是一個 Project，各工作組是 Team，具體工作是 Task。
- Dashboard 工作採有界自主執行；本地、可逆、低風險且不改產品決策的技術事項可自主完成，發布與 Production 仍須分開授權。

## 已確認落差／阻塞

- 文件定義 7 種任務狀態；程式目前只有 4 種。
- 文件建議任務權重 1／2／5；程式目前接受 1–3。
- C0-B 之後的產品階段、負責人與期限尚未確認。
- V2 完整多人產品核准、正式後端部署目標／網址、完整瀏覽器支援矩陣：`UNKNOWN`。
- Supabase 專案、環境、預算、資料治理負責人：`UNKNOWN`。
- V1 真實資料格式、資料量與 migration 樣本：`UNKNOWN`。

## 下一個決策點

C0-B 已合併並完成上述有限驗收與 Pages 發布核對。下一階段尚未授權；本次僅更新結案狀態，不自動開始新功能、串接 UI／正式後端、建立正式資料庫、執行正式 migration、覆蓋 V1 資料或擴大訂單功能。本次文件的 commit／發布亦須另行授權。

## 詳細資料按需閱讀

- V1：`PRODUCT_SPEC.md`、`CODEX_TASK.md`
- V2 產品：`V2_PRODUCT_SPEC.md`
- V2 技術／安全：`V2_TECHNICAL_DESIGN.md`
- 階段規劃：`V2_IMPLEMENTATION_ROADMAP.md`
