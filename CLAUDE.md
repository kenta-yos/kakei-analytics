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

## ローカル確認

- `.env.local` に本番 DB の接続先とパスワードがある。ブラウザで確認するときは `BASIC_AUTH_PASSWORD= npx next dev -p 3123` で認証を外して起動する（パスワードは入力しない）。
