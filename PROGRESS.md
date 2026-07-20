# PROGRESS — リンク棚 (link-shelf)

## 2026-07-21
- やったこと: Hallmark audit の指摘を反映（css/style.css・index.html・js/app.js）。①スマホでフォルダの「…」メニューに到達できない問題を修正（タッチ端末・編集モードで常時表示）②ドロップオーバーレイの色直書きを `color-mix` でアクセント連動に（ダークテーマ追従バグ修正）③`maximum-scale=1.0` を削除しピンチズーム解禁 ④JSONインポートの confirm 連鎖を3ボタンモーダルに置き換え（置き換え時のみ confirm 維持）⑤削除の confirm を撤去し Undo トーストに一本化 ⑥カードに tabindex/Enter対応＋全要素に `:focus-visible` リング ⑦純白カード廃止・中間色をインディゴ系寒色に統一 ⑧radius/`--on-accent` のトークン化 ⑨追加・更新系トースト削減 ⑩`prefers-reduced-motion` 対応 ⑪件数に `tabular-nums` ⑫ブックマークレットの絵文字をSVG化
- 結果: 既存テスト全45件パス（store 28 + dom 17）。ローカルプレビュー（port 8340/8341）で現行版と比較確認済み。未 push（公開版は未反映）
- 次のステップ: 実機スマホでフォルダメニューとトースト削減の感触確認 → 問題なければ git push で公開版へ反映
