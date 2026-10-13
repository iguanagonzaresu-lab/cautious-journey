# Mobile Release Preflight v0.1

iOS / Android のリリース前に、設定・変更差分・テストの証拠を集める読み取り中心の Agent Skill です。SkillScout とは独立しています。

「ビルドする・公開する」道具ではありません。問題が確認できれば **BLOCK**、確認できない項目や要レビューの変更は **WARN**、検査対象を確認できた場合だけ **PASS** を返します。

## 使い方

Node.js 22 以上と Git が必要です。依存パッケージのインストールは不要です。

Skillを読み込めるAIには、例えば次のように依頼します。

> $mobile-release-preflight を使って、このExpoアプリのAndroid/iOS本番リリース前チェックをして。まず読み取りだけで、ビルドや公開はしないで。

CLI単体でも動きます。このフォルダで実行してください。

```powershell
node scripts/preflight.js --repo "C:\path\to\mobile-app" --platform both --target production
```

JSON 出力：

```powershell
node scripts/preflight.js --repo "C:\path\to\mobile-app" --platform android --target production --base v1.1.0 --json
```

`--base` はローカルに存在する比較元のGit参照です。省略時は **HEAD と現在の作業ツリー**（ステージ済み・未追跡も含む）の比較です。前回リリースを自動選択するわけではありません。PRの分岐点を比較元にする場合は、先に適切なmerge-baseを確認してください。

## v0.1 の検査範囲

| 検査 | 対応 |
| --- | --- |
| バージョン | Expo JSON、一般的なappモジュールGradle、単一Info.plistのリテラル |
| 増分 | ユーザーが確認済みの前回リリースJSONとの比較 |
| 変更リスク | 認証・API・課金・データ・通知・ネイティブ設定等のパスによる推定 |
| 権限 | Manifest・Info.plist・Expo JSONの追加差分 |
| テスト | 証拠JSONの照合、または明示指定された既存のroot npm test |
| ソース上の問題 | 一部の資格情報パターン、競合マーカー、不正な設定JSON |
| レポート | Evidence / Risk / Fix / Verify、JSONまたはMarkdown |

Expoの動的設定やGradleを実行して値を取り出しません。ネイティブの複数ターゲット・flavor・Xcode変数・リモート管理のビルド番号は未解決として報告します。Expo/RNのネイティブ設定が存在する場合はそちらを優先します。

## テスト結果と前回リリース

フォーマットは [references/evidence.md](references/evidence.md) を参照してください。

```powershell
node scripts/preflight.js --repo "C:\path\to\mobile-app" --target production --previous-release "C:\release-evidence\previous.json" --evidence "C:\release-evidence\tests.json" --json
```

証拠のコミット・アプリのサブパス・対象環境・プラットフォーム・日時を照合します。既定で24時間以内、作業ツリーがクリーンである必要があります。証拠はユーザー提供の申告であり、CIサービスへの認証付き問い合わせではありません。

テストをこのツールから実行する場合は、**package.json・npm設定・テストスクリプトの中身を先に確認し、実行してよいと判断したときだけ**指定します。

```powershell
node scripts/preflight.js --repo "C:\path\to\mobile-app" --target production --run-tests
```

`pretest` / `posttest` は実行しません。既定120秒、出力1MiBで打ち切ります。生ログは表示しません。ただし **テストはサンドボックス内で動くわけではありません**。スクリプトやその依存先にはファイル変更・ネットワーク通信が可能です。ビルド・公開等を行うテストスクリプトは指定しないでください。単純なコマンド名チェックは完全な安全検査ではありません。

ネイティブのGradle/Xcodeテストは自動実行しません。別途実行・確認した結果を証拠JSONで渡してください。

## 判定とCIの終了コード

| 状態 | 終了コード | 意味 |
| --- | ---: | --- |
| PASS | 0 | 今回の限定された検査範囲を確認できた |
| WARN | 1 | 不足する証拠・要レビューの変更がある |
| BLOCK | 2 | 不正な番号・テスト失敗等の停止理由がある |
| ERROR | 64 | 引数・Git参照・ファイルアクセス等の問題で検査できなかった |

WARN もCIでは非ゼロになります。WARNを無視してマージ可能にする運用は既定では行いません。

**PASS はストア公開の承認ではありません。** どの判定でも `productionReadiness: NOT_VERIFIED` を明記します。ビルド成功、署名、成果物、マージ済み権限、プライバシー申告、デバイス動作、現在のストアポリシーは別途確認してください。v0.1ではスコアや成功確率を捏造しません。

## 安全性と限界

- 既定で外部通信・ファイル変更・インストール・ビルド・公開をしません。
- バイナリ・keystore類、一般的な生成物ディレクトリ、Git無視ファイルはソース検査対象外です。
- ソース検査は4,000ファイル、1ファイル1MiB、合計24MiBまで。超過・読めないファイルは未確認です。
- プロジェクト内のシンボリックリンクはたどりません。明示指定された証拠JSONは別フォルダから読めます。
- 資格情報パターンの値・設定の生値・テスト生ログは出しません。相対ファイル名やコミットはレポートに含まれるため、共有前に確認してください。
- パターン検査は完全な秘密情報監査ではありません。「秘密情報が一切ない」と保証しません。
- テストファイル変更の有無だけで回帰やカバレッジを断定しません。
- XML/Gradleは限定的な静的抽出であり、完全な構文・ビルド評価ではありません。

実装詳細・公式の参照先は [platform-rules.md](references/platform-rules.md) にあります。

## このSkill自体のテスト

```powershell
node --test tests/preflight.test.js
```

OSの一時フォルダにダミーのGitリポジトリを作って検証し、テスト後に削除します。実際のアプリ、ストア、APIキー、モバイルSDKは不要です。

[テスト結果](tests/TEST_REPORT.md)と[レポート例](examples/preflight-report.md)も同梱しています。

## 公開状況

これはローカルの v0.1 です。GitHubへのpush、skills.sh登録、ストアへの提出はこの作成作業に含めていません。GitHub Actions・EAS・Fastlaneの認証付き結果取得や成果物検証は今後の拡張です。
