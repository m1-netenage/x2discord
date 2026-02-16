X->Discord Watcher (x2discord)
==============================

X の指定ハッシュタグを定期取得し、Discord Webhook に投稿するツールです。Windows / macOS のダブルクリック運用を前提に GUI を同梱しています。

対応/非対応と免責
----------------

- 対応OS: Windows 10/11, macOS
- 非対応: Linux（動作確認外）
- 本ツール利用により発生した損害・アカウント制限等について、作者は責任を負いません
- 利用前に対象サービスの利用規約・法令を必ず確認してください

注意
----

利用前に対象サイトの規約・法令を確認してください。過剰なリクエスト、認証が必要な情報の収集、個人情報の不適切な取り扱いは行わないでください。

できること
----------

- 指定ハッシュタグ（カンマ区切りで複数可）の投稿をポーリングして Discord へ送信
- 本文から URL / ハッシュタグを除去して送信（必要なら文字数制限）
- Webhook の `username` / `avatar_url` を使って「アイコン + 名前 + 本文」表示
- GUI で `.env` とハイライト設定を編集保存
- ローカル配信用オーバーレイ `http://localhost:3000/overlay` を提供

必要環境
--------

- Windows 10/11 または macOS
- Node.js 18 以上
- Playwright Chromium（初回だけ必要になる場合あり）

入手方法（Git がわからない方向け）
----------------------------------

1. GitHub のリポジトリページを開く
2. 右上の緑ボタン `Code` を押す
3. `Download ZIP` を押してダウンロードする
4. ダウンロードした ZIP を解凍する
5. 解凍したフォルダを開く
6. Windows は `START-Windows.bat`、macOS は `START-Mac.command` をダブルクリックする
7. 初回は自動セットアップ（依存インストール）が走るので完了まで待つ

補足: ZIP 版は更新を自動取得しません。最新版を使うときは再度 `Download ZIP` してください。

クイックスタート（ターミナル不要）
---------------------------------

1. Windows は `START-Windows.bat`、macOS は `START-Mac.command` をダブルクリック
2. GUI が開いたら「環境設定 (.env に保存)」を入力して保存（`.env` が無ければ自動生成）
3. 初回ログイン: 「Start for Login」→ X にサインイン → GUI の「ログイン完了」を押す（`storageState.json` が更新される）
4. 通常運用: 「Start」で開始、「Stop」で停止（デフォルトはブラウザ表示。非表示にしたい場合は `.env` で `HEADLESS=true`）
5. GUI も含めて完全終了したいときは「Stop & Exit」
6. ハイライトしたいハンドルを入力して「保存（.envにも保存）」

補足: 監視中に環境設定を保存するとウォッチャーが自動再起動して設定を反映します。配布時は利用者ごとに自分の Discord Webhook URL を登録して使ってください。

Discord 側の準備（Webhook 作成手順）
-----------------------------------

`DISCORD_WEBHOOK_URL` は、Discord で作成した Webhook の URL を入れます。

1. Discord で投稿したいサーバーを開く
2. 投稿先にしたいチャンネルの「チャンネル設定」を開く
3. `連携サービス` -> `ウェブフック` を開く
4. `新しいウェブフック` を作成する
5. Webhook の投稿先チャンネルが正しいことを確認する
6. `ウェブフック URL をコピー` を押す
7. GUI の `DISCORD_WEBHOOK_URL` に貼り付けて `.envに保存` を押す
8. `Start (headless)` を押して動作確認する

うまくいかないときは、Webhook を作り直して URL を再コピーしてください。
Webhook URL はパスワードと同じ扱いにして、他人に共有しないでください。

設定項目（GUI から編集可）
-------------------------

- `DISCORD_WEBHOOK_URL`: Discord Webhook URL（必須）
- `HASHTAG`: 監視ハッシュタグ（カンマ区切り。例: `tag1,tag2`）
- `POLL_SECONDS`: ポーリング間隔（秒）
- `MAX_TEXT_LEN`: 送信本文の最大文字数（`0` または未入力で無制限）
- `HEADLESS`: `true` で画面非表示、`false` でブラウザ表示（デフォルトは表示）
- `STORAGE_PATH`: cookie 保存先（既定: `./storageState.json`）
- `SEEN_PATH`: 送信済み ID 保存先（既定: `./seen_ids.txt`）
- `HIGHLIGHT_IDS`: ハイライト対象ハンドル（カンマ区切り）
- `LOGIN_USER_AGENT`: ログイン時だけ適用する User-Agent（任意）
- `OVERLAY_ENABLED`: ローカルオーバーレイ連携（`1`/`0`、既定 `1`）
- `OVERLAY_POST_URL`: オーバーレイ受け口（既定: `http://localhost:3000/overlay/message`）
- `DEBUG_POST`: 送信デバッグログ（`1` で有効）
- `INIT_LOGIN`: GUI が自動設定（通常変更不要）

Playwright 初回セットアップ（必要時のみ）
----------------------------------------

通常は `START-Windows.bat` / `START-Mac.command` と GUI が自動で準備します。
初回の `Start` / `Start for Login` は、依存セットアップのため数秒〜数十秒かかる場合があります。
GUI 下部ログに進捗（`background warmup...` / `npm ci...` / `Chromium setup...`）が出ていれば正常です。

GUI 起動時に Chromium 不足エラーが出る場合のみ、1 回だけ以下を実行してください。

```bash
npx playwright install chromium
```

- 運用のヒント
------------

- 再送したい場合は `seen_ids.txt` を削除または空にして再起動
- ログイン切れ時は「Start for Login」→「ログイン完了」を押して保存
- URL / ハッシュタグ除去ルールを変える場合は `x2discord.mjs` の `normalizeText` を調整

トラブルシュート
----------------

- GUI が開かない: `http://localhost:3000` を手動で開く。`launcher.log` / `gui.log` を確認
- 投稿されない: `.env` の Webhook URL、GUI 下部ログを確認。ログイン切れなら「Start for Login」で再保存
- CMD を閉じたら止まる (Windows): ブラウザが開いたのを確認してから CMD を閉じる。止まる場合は `launcher.log` / `gui.log` / `gui.pid` を確認
- 配布フォルダを削除できない: GUI の「Stop & Exit」で完全終了してから削除
- 「Start for Login」で X に弾かれる:
  1. X 側の一時ブロックで発生する場合があります
  2. 20〜60分以上あけて再試行してください
  3. 続く場合は、別環境で作成した `storageState.json` を共有して `Start (headless)` を利用してください
- ハイライトが効かない: `HIGHLIGHT_IDS` と OBS ブラウザソースのリロードを確認
- macOSで「`START-Mac.command` は開けません」と出る:
  1. Finderで `START-Mac.command` を右クリック -> `開く` を実行（初回のみ）
  2. それでも不可なら `システム設定` -> `プライバシーとセキュリティ` の下部で `このまま開く` を許可
  3. ターミナルで解除する場合は以下を実行

```bash
xattr -d com.apple.quarantine START-Mac.command
chmod +x START-Mac.command
```

配布と GitHub 運用
------------------

- 公開用テンプレートは `.env.example` を使い、実運用の `.env` は Git 管理しないでください
- `storageState.json`（cookie）、`.env`、ログ、`seen_ids.txt` は `.gitignore` で除外済みです
- 既に追跡されている場合は一度だけ以下を実行してください

```bash
git rm --cached .env storageState.json seen_ids.txt gui.log x2discord.log
git commit -m "chore: stop tracking local secrets and runtime files"
```

配信用オーバーレイ（OBS）
-------------------------

- ブラウザソース URL: `http://localhost:3000/overlay`
- カスタム CSS: `overlay-theme.css` を貼り付け
- CSS / 設定変更後はブラウザソースをリロード

ローカルオーバーレイは Webhook 送信と同時に更新されます。

ファイル構成
------------

- `START-Windows.bat`: Windows 用 GUI 起動ランチャー
- `START-Mac.command`: macOS 用 GUI 起動ランチャー
- `gui.mjs`: GUI サーバー本体
- `x2discord.mjs`: X -> Discord 送信ロジック
- `.env`: 設定ファイル
- `package-lock.json`: 依存バージョン固定ファイル
- `overlay-theme.css`: OBS 用カスタム CSS
- `x2discord.log`: 実行ログ
- `storageState.json`: ログイン cookie（ログイン後）
- `seen_ids.txt`: 送信済み ID

連絡先
------

不具合や要望は Issue で連絡してください。

サポート（ビールくらい奢って下さい）
--------------

- Tip / Support:ドネーションはこちら(Doneru) [doneru.jp/room61_live](https://doneru.jp/room61_live)
- Tip / Support:ドネーションはこちら(PayPal) [streamlabs.com/room61_live](https://streamlabs.com/room61_live/tip)
