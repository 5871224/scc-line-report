# SCC LINE Report

將原本 n8n 的「SHOPLINE 業績 LINE 回報」改成 Node.js + GitHub Actions。

流程：

1. 每天 20:00（Asia/Taipei）執行。
2. 從 SHOPLINE Orders API 取得 created / cancelled 訂單。
3. 計算昨天、近 30 天、本月的淨營業額、淨訂單數與客單價。
4. 使用 LINE Messaging API Broadcast 發送原本的 Flex Message。

## GitHub Actions Secrets

到 **Settings → Secrets and variables → Actions → New repository secret** 建立：

- `SHOPLINE_TOKEN`：只填 Token 本體，不要加 `Bearer `。
- `LINE_TOKEN`：LINE Channel Access Token，只填 Token 本體，不要加 `Bearer `。

Token 不應寫入程式碼、README、Issue 或 Actions Log。

## 手動測試

完成 Secrets 後，到 **Actions → SHOPLINE LINE Report → Run workflow**。

手動執行會真的呼叫 SHOPLINE API，並送出一則 LINE Broadcast。

## 排程

`.github/workflows/daily-report.yml` 設定為每天 20:00（Asia/Taipei）執行。GitHub 排程可能因平台負載而稍有延遲。

> 公開 repository 的 scheduled workflows 若 60 天沒有任何 repository activity，GitHub 可能自動停用排程；需要重新啟用。
