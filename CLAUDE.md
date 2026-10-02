# CLAUDE.md

## 言語

- ユーザーとの会話、作業中の途中報告・説明、ツール実行時の説明文、最終報告は、すべて日本語で書く。
- コミットメッセージ、コード中のコメント、画面の文言も日本語を基本とする（コード上の識別子は英語でよい）。

## デプロイ

- 仕様が確定したら、確認を取らずにデプロイまで行う。
- 本番は Vercel。`master` に push すると自動で本番デプロイされる。
- 手順:
  1. `npx tsc --noEmit` と `npx next build` が通ることを確認する
  2. 変更したファイルだけを `git add` してコミットする（リポジトリ直下の未追跡ファイル `scripts/check-*.ts`・Excel・レポート CSV などは含めない）
  3. `git push origin master`
  4. `gh api repos/kenta-yos/kakei-analytics/commits/<sha>/status --jq '.state'` が `success` になるまで待ち、結果を報告する
- 本番 DB（Neon）に書き込む操作（予算の保存、CSV 取込など）は、ユーザーの依頼なしに実行しない。

## DB マイグレーション

- DB は Neon（Postgres）。接続先は `.env.local` の `DATABASE_URL`（本番と共通）
- マイグレーションは `drizzle/000N_*.sql` に手書きし、`@neondatabase/serverless` を使う一時スクリプトで本番に直接流す（drizzle-kit migrate は使わない）。`src/lib/schema.ts` も合わせて更新し、`drizzle/meta/_journal.json` に登録する。なお `drizzle/*.sql` は .gitignore 対象
- 順番に注意する:
  - **追加**（テーブル・列の追加）: 先に DB に流してから、コードをデプロイする
  - **削除**（列・テーブルの削除）: 先にその列を読まないコードをデプロイし、そのあとで DB から消す。消す前に中身を読み出して報告に残す
- 誤って上書きしたデータは、Neon の履歴保持期間内なら `neonctl branches create --parent <ISO時刻>` で過去時点のブランチを作って読み出せる。使い終わったブランチは削除する

## ローカル確認

- `.env.local` に本番 DB の接続先とパスワードがある。ブラウザで確認するときは `BASIC_AUTH_PASSWORD= npx next dev -p 3123` で認証を外して起動する（パスワードは入力しない）。
