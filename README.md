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

はじめに（ターミナル不要）
--------------------------

1. Windows は `START-Windows.bat`、macOS は `START-Mac.command` をダブルクリックする
2. GUI が開いたら「環境設定 (.env に保存)」を入力して保存する（`.env` が無ければ自動生成されます）
3. 初回だけ「Start for Login」-> X ログイン -> 「ログイン完了 -> 保存」
4. 通常運用は「Start (headless)」で開始、「Stop」で停止
5. ハイライトしたいハンドルを入力して「保存（.envにも保存）」

補足: 監視中に環境設定を保存すると、ウォッチャーは自動再起動して設定を反映します。
補足: 配布時は、利用者ごとに自分の Discord Webhook URL（=自分のチャンネル）を GUI から登録して使います。

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
- `HEADLESS`: `true` で画面非表示、`false` でブラウザ表示
- `STORAGE_PATH`: cookie 保存先（既定: `./storageState.json`）
- `SEEN_PATH`: 送信済み ID 保存先（既定: `./seen_ids.txt`）
- `HIGHLIGHT_IDS`: ハイライト対象ハンドル（カンマ区切り）
- `OVERLAY_ENABLED`: ローカルオーバーレイ連携（`1`/`0`、既定 `1`）
- `OVERLAY_POST_URL`: オーバーレイ受け口（既定: `http://localhost:3000/overlay/message`）
- `DEBUG_POST`: 送信デバッグログ（`1` で有効）
- `INIT_LOGIN`: GUI が自動設定（通常変更不要）

Playwright 初回セットアップ（必要時のみ）
----------------------------------------

通常は `START-Windows.bat` / `START-Mac.command` が自動で準備します。
GUI 起動時に Chromium 不足エラーが出る場合のみ、1 回だけ以下を実行してください。

```bash
npx playwright install chromium
```

運用のヒント
------------

- 再送したい場合は `seen_ids.txt` を削除または空にして再起動
- ログイン切れ時は「Start for Login」-> 「ログイン完了 -> 保存」
- URL / ハッシュタグ除去ルールを変える場合は `x2discord.mjs` の `normalizeText` を調整

トラブルシュート
----------------

- GUI が開かない: `http://localhost:3000` を手動で開く
- 投稿されない: `.env` の Webhook URL、GUI 下部ログを確認
- Stop しても流れる: 孤立プロセスの可能性。GUI の Stop を再実行
- ハイライトが効かない: `HIGHLIGHT_IDS` と OBS ブラウザソースのリロードを確認

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
