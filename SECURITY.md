# Security Policy

## Supported Versions

公開中の `main` ブランチをサポート対象とします。

## Reporting a Vulnerability

セキュリティ上の問題を見つけた場合は、公開 Issue ではなくメンテナへ直接連絡してください。

- 連絡先: GitHub アカウント `m1-netenage` への DM または非公開連絡手段
- 共有してほしい情報:
  - 発生手順
  - 影響範囲
  - 再現条件
  - 可能なら修正案

## Secret Leakage Response

以下が漏えいした疑いがある場合は、即時ローテーションしてください。

- Discord Webhook URL (`DISCORD_WEBHOOK_URL`)
- `storageState.json`（ログイン状態）

推奨対応:

1. 該当Webhookを削除して再作成
2. `.env` の `DISCORD_WEBHOOK_URL` を差し替え
3. 必要なら Git 履歴から機密を削除して force push
