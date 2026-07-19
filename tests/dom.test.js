// UIのDOM実行レベルテスト: node tests/dom.test.js（要: npm install）
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const storeSrc = fs.readFileSync(path.join(__dirname, "..", "js", "store.js"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

function makeApp({ url = "https://example.test/app/", seed } = {}) {
  const dom = new JSDOM(html, { url, runScripts: "dangerously", pretendToBeVisual: true });
  const { window } = dom;
  window.open = () => null;
  window.confirm = () => true;
  window.alert = () => {};
  if (seed) window.localStorage.setItem("linkshelf-data", JSON.stringify(seed));
  // <script src> は resources 無効のため読み込まれない。実ソースを注入して実行する
  [storeSrc, appSrc].forEach((src) => {
    const s = window.document.createElement("script");
    s.textContent = src;
    window.document.body.appendChild(s);
  });
  return { dom, window, document: window.document, $: (id) => window.document.getElementById(id) };
}

function addLinkViaModal(app, { url, title = "", tag = "" }) {
  const { window, $ } = app;
  $("addLinkBtn").click();
  $("fieldUrl").value = url;
  $("fieldTitle").value = title;
  if (tag) {
    $("fieldTagText").value = tag;
    $("fieldTagText").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }
  $("linkForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function search(app, q) {
  const { window, $ } = app;
  $("searchInput").value = q;
  $("searchInput").dispatchEvent(new window.Event("input", { bubbles: true }));
}

function cards(app) {
  return [...app.document.querySelectorAll("#cardGrid .card")];
}

function sidebarItem(app, name) {
  return [...app.document.querySelectorAll("#folderList .folder-item")].find(
    (li) => li.querySelector(".f-name").textContent === name
  );
}

function keydown(app, key, target) {
  (target || app.document.body).dispatchEvent(
    new app.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`    ${e.stack.split("\n").slice(0, 3).join("\n    ")}`);
  }
}

console.log("dom.test.js");

test("初期表示: 空状態が見え、サイドバーに未整理とアーカイブがある", () => {
  const app = makeApp();
  assert.strictEqual(app.$("emptyState").hidden, false);
  assert.ok(sidebarItem(app, "未整理"));
  assert.ok(sidebarItem(app, "アーカイブ"));
});

test("リンク追加フロー: モーダルから追加してカードが描画される", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://blender.org/", title: "Blender チュートリアル", tag: "3D" });
  assert.strictEqual(app.$("linkModal").hidden, true);
  assert.strictEqual(cards(app).length, 1);
  assert.ok(cards(app)[0].textContent.includes("Blender チュートリアル"));
  assert.ok(cards(app)[0].querySelector(".tag-chip"));
});

test("検索: ひらがな/カタカナ・全角半角を同一視して絞り込む", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "Blender チュートリアル" });
  addLinkViaModal(app, { url: "https://b.example/", title: "印刷ノウハウ" });
  search(app, "ちゅーとりある");
  assert.strictEqual(cards(app).length, 1);
  search(app, "BLENDER");
  assert.strictEqual(cards(app).length, 1);
  search(app, "");
  assert.strictEqual(cards(app).length, 2);
});

test("キーボード: / で検索へフォーカス、n で追加モーダル、Escで閉じる", () => {
  const app = makeApp();
  keydown(app, "/");
  assert.strictEqual(app.document.activeElement, app.$("searchInput"));
  app.$("searchInput").blur();
  keydown(app, "n");
  assert.strictEqual(app.$("linkModal").hidden, false);
  keydown(app, "Escape");
  assert.strictEqual(app.$("linkModal").hidden, true);
});

test("キーボード: 入力中は n がショートカットとして発動しない", () => {
  const app = makeApp();
  keydown(app, "n", app.$("searchInput"));
  assert.strictEqual(app.$("linkModal").hidden, true);
});

test("検索欄のEscは検索をクリアする", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "A" });
  search(app, "zzz");
  assert.strictEqual(cards(app).length, 0);
  keydown(app, "Escape", app.$("searchInput"));
  assert.strictEqual(app.$("searchInput").value, "");
  assert.strictEqual(cards(app).length, 1);
});

test("URLパラメータ起動（共有ターゲット/ブックマークレット）でモーダルが前埋めされる", () => {
  const app = makeApp({
    url: "https://example.test/app/?url=" + encodeURIComponent("https://foo.example/page") + "&title=" + encodeURIComponent("Fooのページ"),
  });
  assert.strictEqual(app.$("linkModal").hidden, false);
  assert.strictEqual(app.$("fieldUrl").value, "https://foo.example/page");
  assert.strictEqual(app.$("fieldTitle").value, "Fooのページ");
});

test("ブックマークレットモーダル: コードが生成される", () => {
  const app = makeApp();
  app.$("bmkBtn").click();
  assert.strictEqual(app.$("bmkModal").hidden, false);
  const href = app.$("bmkLink").getAttribute("href");
  assert.ok(href.startsWith("javascript:"));
  assert.ok(href.includes("https://example.test/app/?url="));
  app.$("bmkCloseBtn").click();
  assert.strictEqual(app.$("bmkModal").hidden, true);
});

test("ドラッグ＆ドロップ: dragenterでオーバーレイ、dropで追加モーダルが前埋めされる", () => {
  const app = makeApp();
  const { window } = app;
  const dt = {
    types: ["text/uri-list", "text/plain", "text/html"],
    dropEffect: "",
    getData: (t) =>
      t === "text/uri-list" ? "https://drop.example/page\r\n" :
      t === "text/plain" ? "ドロップしたページ" :
      t === "text/html" ? '<a href="https://drop.example/page">ドロップしたページ</a>' : "",
  };
  const enter = new window.Event("dragenter", { bubbles: true, cancelable: true });
  enter.dataTransfer = dt;
  app.document.dispatchEvent(enter);
  assert.strictEqual(app.$("dropOverlay").hidden, false);
  const drop = new window.Event("drop", { bubbles: true, cancelable: true });
  drop.dataTransfer = dt;
  app.document.dispatchEvent(drop);
  assert.strictEqual(app.$("dropOverlay").hidden, true);
  assert.strictEqual(app.$("linkModal").hidden, false);
  assert.strictEqual(app.$("fieldUrl").value, "https://drop.example/page");
  assert.strictEqual(app.$("fieldTitle").value, "ドロップしたページ");
});

test("ドラッグ＆ドロップ: ファイルのドラッグには反応しない", () => {
  const app = makeApp();
  const enter = new app.window.Event("dragenter", { bubbles: true, cancelable: true });
  enter.dataTransfer = { types: ["Files"], getData: () => "" };
  app.document.dispatchEvent(enter);
  assert.strictEqual(app.$("dropOverlay").hidden, true);
});

test("他タブ同期: storageイベントで再読込・再描画される", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "A" });
  const raw = JSON.parse(app.window.localStorage.getItem("linkshelf-data"));
  raw.links.push({ id: "ext1", url: "https://ext.example/", title: "他タブから", createdAt: Date.now(), updatedAt: Date.now() });
  app.window.localStorage.setItem("linkshelf-data", JSON.stringify(raw));
  app.window.dispatchEvent(new app.window.StorageEvent("storage", { key: "linkshelf-data" }));
  assert.strictEqual(cards(app).length, 2);
  assert.ok(app.document.querySelector("#cardGrid").textContent.includes("他タブから"));
});

test("アーカイブ: カードのボタンで棚から下がり、アーカイブビューに現れる", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "A" });
  const archBtn = [...cards(app)[0].querySelectorAll(".card-actions button")].find((b) =>
    b.title.includes("アーカイブ")
  );
  archBtn.click();
  assert.strictEqual(cards(app).length, 0);
  const item = sidebarItem(app, "アーカイブ");
  assert.strictEqual(item.querySelector(".f-count").textContent, "1");
  item.click();
  assert.strictEqual(cards(app).length, 1);
  const backBtn = [...cards(app)[0].querySelectorAll(".card-actions button")].find((b) =>
    b.title.includes("戻す")
  );
  backBtn.click();
  assert.strictEqual(cards(app).length, 0);
  sidebarItem(app, "すべて").click();
  assert.strictEqual(cards(app).length, 1);
});

test("未整理ビュー: フォルダもタグもないリンクだけが表示される", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "未整理のやつ" });
  addLinkViaModal(app, { url: "https://b.example/", title: "タグ付き", tag: "t" });
  sidebarItem(app, "未整理").click();
  assert.strictEqual(cards(app).length, 1);
  assert.ok(cards(app)[0].textContent.includes("未整理のやつ"));
});

test("一括アーカイブ: 編集モードで選択してまとめて棚から下げる", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "A" });
  addLinkViaModal(app, { url: "https://b.example/", title: "B" });
  app.$("editModeBtn").click();
  cards(app).forEach((c) => c.querySelector(".select-box").dispatchEvent(new app.window.MouseEvent("click", { bubbles: true })));
  assert.strictEqual(app.$("bulkBar").hidden, false);
  assert.strictEqual(app.$("bulkArchiveBtn").textContent, "アーカイブ");
  app.$("bulkArchiveBtn").click();
  assert.strictEqual(cards(app).length, 0);
  assert.strictEqual(sidebarItem(app, "アーカイブ").querySelector(".f-count").textContent, "2");
});

test("フォルダ作成とフォルダビュー", () => {
  const app = makeApp();
  app.$("addFolderBtn").click();
  app.$("fieldFolderName").value = "制作ツール";
  app.$("folderForm").dispatchEvent(new app.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(sidebarItem(app, "制作ツール"));
  sidebarItem(app, "制作ツール").click();
  app.$("addLinkBtn").click();
  // フォルダビューで開いた追加モーダルはそのフォルダが初期選択される
  const folderId = [...app.$("fieldFolder").options].find((o) => o.textContent === "制作ツール").value;
  assert.strictEqual(app.$("fieldFolder").value, folderId);
});

test("削除とUndo: トーストの「元に戻す」で復元される", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "A" });
  const delBtn = cards(app)[0].querySelector(".card-actions .del");
  delBtn.click();
  assert.strictEqual(cards(app).length, 0);
  const undo = app.$("toast").querySelector(".toast-action");
  assert.ok(undo);
  undo.click();
  assert.strictEqual(cards(app).length, 1);
});

test("アーカイブ済みは検索にも出ない", () => {
  const app = makeApp();
  addLinkViaModal(app, { url: "https://a.example/", title: "秘蔵リンク" });
  const archBtn = [...cards(app)[0].querySelectorAll(".card-actions button")].find((b) =>
    b.title.includes("アーカイブ")
  );
  archBtn.click();
  search(app, "秘蔵");
  assert.strictEqual(cards(app).length, 0);
});

console.log(`dom.test.js: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
