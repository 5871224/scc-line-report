# SCC SHOPLINE Automations

將原本 n8n 的 SHOPLINE 排程改成 Node.js + GitHub Actions。

## LINE 業績回報

流程：

1. 每天 20:00（Asia/Taipei）執行。
2. 從 SHOPLINE Orders API 取得 created / cancelled 訂單。
3. 計算昨天、近 30 天、本月的淨營業額、淨訂單數與客單價。
4. 使用 LINE Messaging API Broadcast 發送原本的 Flex Message。

## GitHub Actions Secrets

到 **Settings → Secrets and variables → Actions → New repository secret** 建立：

- `SHOPLINE_TOKEN`：只填 Token 本體，不要加 `Bearer `。
- `LINE_TOKEN`：LINE Channel Access Token，只填 Token 本體，不要加 `Bearer `。

## 客戶資料同步

`.github/workflows/customer-sync.yml` 每 10 分鐘執行：

1. 取得 SHOPLINE 最近 30 分鐘更新的客戶（與原 n8n 流程相同）。
2. 將客戶陣列轉成 JSON。
3. 以參數化查詢執行 SQL Server 的 `[更新客戶]` stored procedure。

另外建立以下 repository secrets：

- `SQL_SERVER`：SQL Server 主機名稱或 IP。
- `SQL_PORT`：連接埠；未設定時程式使用 `1433`。
- `SQL_DATABASE`：資料庫名稱。
- `SQL_USER`：登入帳號。
- `SQL_PASSWORD`：登入密碼。

若連線設定需要，可建立 repository variables：

- `SQL_ENCRYPT`：預設為 `true`。
- `SQL_TRUST_SERVER_CERTIFICATE`：預設為 `false`。

GitHub-hosted runner 必須能從網際網路連到 SQL Server。若資料庫只開放內網，需使用可連到該內網的 self-hosted runner。

Token 不應寫入程式碼、README、Issue 或 Actions Log。

## 手動測試

完成對應 Secrets 後，到 Actions 頁面選擇要測試的 workflow，再按 **Run workflow**。

手動執行會真的呼叫 SHOPLINE API；LINE workflow 會送出 Broadcast，客戶同步 workflow 會更新 SQL Server。

## 排程

`.github/workflows/daily-report.yml` 設定為每天 20:00（Asia/Taipei）執行。GitHub 排程可能因平台負載而稍有延遲。

> 公開 repository 的 scheduled workflows 若 60 天沒有任何 repository activity，GitHub 可能自動停用排程；需要重新啟用。
