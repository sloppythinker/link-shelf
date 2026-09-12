// ストアロジックのユニットテスト: node tests/store.test.js
const assert = require("assert");
const LinkShelfStore = require("../js/store.js");

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

function newStore(initial) {
  const storage = fakeStorage();
  if (initial) storage.setItem(LinkShelfStore.STORAGE_KEY, JSON.stringify(initial));
  return { store: LinkShelfStore.createStore(storage), storage };
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
    console.error(`    ${e.message}`);
  }
}

console.log("store.test.js");

/* ---------- 正規化・基本CRUD ---------- */

test("空ストレージから空データで初期化される", () => {
  const { store } = newStore();
  const d = store.getData();
  assert.deepStrictEqual(d.folders, []);
  assert.deepStrictEqual(d.links, []);
  assert.deepStrictEqual(d.tombstones, { links: {}, folders: {} });
});

test("addLink がタグをtrim・重複除去し、titleはURLへフォールバックする", () => {
  const { store } = newStore();
  const l = store.addLink({ url: "https://a.example", title: "", tags: [" x ", "x", "", "y"] });
  assert.strictEqual(l.title, "https://a.example");
  assert.deepStrictEqual(l.tags, ["x", "y"]);
  assert.strictEqual(l.archived, false);
  assert.strictEqual(typeof l.updatedAt, "number");
});

test("updateLink が updatedAt を進める", () => {
  const { store } = newStore();
  const l = store.addLink({ url: "https://a.example", title: "A" });
  const before = l.updatedAt;
  store.updateLink(l.id, { title: "B" });
  const after = store.getData().links[0];
  assert.strictEqual(after.title, "B");
  assert.ok(after.updatedAt >= before);
});

test("deleteLink がトゥームストーンを残す", () => {
  const { store } = newStore();
  const l = store.addLink({ url: "https://a.example" });
  assert.strictEqual(store.deleteLink(l.id), true);
  assert.strictEqual(store.getData().links.length, 0);
  assert.strictEqual(typeof store.getData().tombstones.links[l.id], "number");
});

test("restoreLinks が復元しトゥームストーンを消す", () => {
  const { store } = newStore();
  const l = store.addLink({ url: "https://a.example", title: "A" });
  const snapshot = { ...l, tags: [...l.tags] };
  store.deleteLink(l.id);
  const n = store.restoreLinks([snapshot]);
  assert.strictEqual(n, 1);
  assert.strictEqual(store.getData().links[0].id, l.id);
  assert.strictEqual(store.getData().tombstones.links[l.id], undefined);
});

test("deleteFolder がフォルダ名のトゥームストーンを残し、中のリンクは未分類になる", () => {
  const { store } = newStore();
  const f = store.addFolder("素材");
  const l = store.addLink({ url: "https://a.example", folderId: f.id });
  store.deleteFolder(f.id);
  assert.strictEqual(store.getData().folders.length, 0);
  assert.strictEqual(store.getData().links.find((x) => x.id === l.id).folderId, null);
  assert.strictEqual(typeof store.getData().tombstones.folders["素材"], "number");
});

test("addFolder が同名フォルダのトゥームストーンを解除する", () => {
  const { store } = newStore();
  const f = store.addFolder("素材");
  store.deleteFolder(f.id);
  store.addFolder("素材");
  assert.strictEqual(store.getData().tombstones.folders["素材"], undefined);
});

/* ---------- タグ・重複 ---------- */

test("renameTag は既存タグ名なら統合する", () => {
  const { store } = newStore();
  store.addLink({ url: "https://a.example", tags: ["old"] });
  store.addLink({ url: "https://b.example", tags: ["old", "new"] });
  const r = store.renameTag("old", "new");
  assert.strictEqual(r.renamed, 2);
  assert.strictEqual(r.merged, true);
  store.getData().links.forEach((l) => assert.deepStrictEqual(l.tags, ["new"]));
});

test("deleteTag が全リンクからタグを外す", () => {
  const { store } = newStore();
  store.addLink({ url: "https://a.example", tags: ["t"] });
  store.addLink({ url: "https://b.example", tags: ["t", "u"] });
  assert.strictEqual(store.deleteTag("t"), 2);
  assert.strictEqual(store.tagCounts().length, 1);
});

test("duplicateUrls が重複URLだけ返す", () => {
  const { store } = newStore();
  store.addLink({ url: "https://a.example" });
  store.addLink({ url: "https://a.example" });
  store.addLink({ url: "https://b.example" });
  assert.deepStrictEqual([...store.duplicateUrls()], ["https://a.example"]);
});

/* ---------- フィルタ・ビュー ---------- */

test("filterLinks: アーカイブ済みは通常ビューから除外される", () => {
  const { store } = newStore();
  const l = store.addLink({ url: "https://a.example" });
  store.addLink({ url: "https://b.example" });
  store.updateLink(l.id, { archived: true });
  assert.strictEqual(store.filterLinks({ folder: "all" }).length, 1);
  assert.strictEqual(store.filterLinks({ folder: "archived" }).length, 1);
  assert.strictEqual(store.filterLinks({ folder: "archived" })[0].id, l.id);
});

test("filterLinks: inbox はフォルダもタグもないリンクだけ", () => {
  const { store } = newStore();
  const f = store.addFolder("F");
  store.addLink({ url: "https://a.example" }); // inbox対象
  store.addLink({ url: "https://b.example", tags: ["t"] });
  store.addLink({ url: "https://c.example", folderId: f.id });
  const inbox = store.filterLinks({ folder: "inbox" });
  assert.strictEqual(inbox.length, 1);
  assert.strictEqual(inbox[0].url, "https://a.example");
});

test("filterLinks: 検索はカタカナ・ひらがな・全角半角・大文字小文字を同一視する", () => {
  const { store } = newStore();
  store.addLink({ url: "https://a.example", title: "Blender チュートリアル" });
  store.addLink({ url: "https://b.example", title: "ＡＢＣ素材" });
  assert.strictEqual(store.filterLinks({ query: "ちゅーとりある" }).length, 1);
  assert.strictEqual(store.filterLinks({ query: "BLENDER" }).length, 1);
  assert.strictEqual(store.filterLinks({ query: "abc" }).length, 1);
  assert.strictEqual(store.filterLinks({ query: "存在しない" }).length, 0);
});

test("normText がNFKC+小文字+カタカナ→ひらがな変換をする", () => {
  assert.strictEqual(LinkShelfStore.normText("Ｂｌｅｎｄｅｒ カフェ"), "blender かふぇ");
});

test("tagCounts / folderCounts はアーカイブ済みを数えない", () => {
  const { store } = newStore();
  const f = store.addFolder("F");
  const l = store.addLink({ url: "https://a.example", tags: ["t"], folderId: f.id });
  store.addLink({ url: "https://b.example", tags: ["t"], folderId: f.id });
  store.updateLink(l.id, { archived: true });
  assert.strictEqual(store.tagCounts()[0].count, 1);
  assert.strictEqual(store.folderCounts().get(f.id), 1);
});

/* ---------- インポート ---------- */

test("bulkAdd がフォルダを名前で作成しURL重複をスキップする", () => {
  const { store } = newStore();
  store.addLink({ url: "https://a.example" });
  const r = store.bulkAdd([
    { url: "https://a.example", title: "dup" },
    { url: "https://b.example", title: "B", folderName: "取込" },
  ]);
  assert.deepStrictEqual({ added: r.added, skipped: r.skipped }, { added: 1, skipped: 1 });
  const folder = store.getData().folders.find((f) => f.name === "取込");
  assert.ok(folder);
  assert.strictEqual(store.getData().links.find((l) => l.url === "https://b.example").folderId, folder.id);
});

test("importJSON merge はURL重複をスキップしフォルダを名前で統合する", () => {
  const { store } = newStore();
  const f = store.addFolder("F");
  store.addLink({ url: "https://a.example", folderId: f.id });
  store.importJSON(
    {
      folders: [{ id: "rf", name: "F" }],
      links: [
        { id: "r1", url: "https://a.example", folderId: "rf" },
        { id: "r2", url: "https://b.example", folderId: "rf" },
      ],
    },
    "merge"
  );
  assert.strictEqual(store.getData().folders.length, 1);
  assert.strictEqual(store.getData().links.length, 2);
  assert.strictEqual(store.getData().links.find((l) => l.url === "https://b.example").folderId, f.id);
});

test("importJSON replace は archived / updatedAt を保持する（Gist往復で欠落しない）", () => {
  const { store } = newStore();
  store.importJSON(
    { links: [{ id: "x", url: "https://a.example", archived: true, createdAt: 100, updatedAt: 200 }] },
    "replace"
  );
  const l = store.getData().links[0];
  assert.strictEqual(l.archived, true);
  assert.strictEqual(l.createdAt, 100);
  assert.strictEqual(l.updatedAt, 200);
});

/* ---------- mergeRemote（Gistマージ同期） ---------- */

const now = Date.now();

function baseData(links, extra = {}) {
  return { version: 2, folders: [], links, tombstones: { links: {}, folders: {} }, ...extra };
}

test("mergeRemote: リモートの新規リンクが追加される", () => {
  const { store } = newStore(baseData([{ id: "a", url: "https://a.example", createdAt: now, updatedAt: now }]));
  const r = store.mergeRemote(
    baseData([
      { id: "a", url: "https://a.example", createdAt: now, updatedAt: now },
      { id: "b", url: "https://b.example", createdAt: now, updatedAt: now },
    ])
  );
  assert.strictEqual(r.added, 1);
  assert.strictEqual(store.getData().links.length, 2);
});

test("mergeRemote: updatedAtが新しい方の編集が勝つ", () => {
  const { store } = newStore(
    baseData([
      { id: "a", url: "https://a.example", title: "ローカル新", createdAt: now, updatedAt: now + 100 },
      { id: "b", url: "https://b.example", title: "ローカル旧", createdAt: now, updatedAt: now },
    ])
  );
  const r = store.mergeRemote(
    baseData([
      { id: "a", url: "https://a.example", title: "リモート旧", createdAt: now, updatedAt: now },
      { id: "b", url: "https://b.example", title: "リモート新", createdAt: now, updatedAt: now + 100 },
    ])
  );
  assert.strictEqual(r.updated, 1);
  const links = store.getData().links;
  assert.strictEqual(links.find((l) => l.id === "a").title, "ローカル新");
  assert.strictEqual(links.find((l) => l.id === "b").title, "リモート新");
});

test("mergeRemote: clicksは大きい方を採用する", () => {
  const { store } = newStore(
    baseData([{ id: "a", url: "https://a.example", clicks: 3, createdAt: now, updatedAt: now }])
  );
  store.mergeRemote(baseData([{ id: "a", url: "https://a.example", clicks: 7, createdAt: now, updatedAt: now }]));
  assert.strictEqual(store.getData().links[0].clicks, 7);
});

test("mergeRemote: ローカルで削除済みのリンクは復活しない", () => {
  const { store } = newStore(
    baseData([], { tombstones: { links: { a: now + 100 }, folders: {} } })
  );
  const r = store.mergeRemote(baseData([{ id: "a", url: "https://a.example", createdAt: now, updatedAt: now }]));
  assert.strictEqual(r.added, 0);
  assert.strictEqual(store.getData().links.length, 0);
});

test("mergeRemote: リモートの削除記録でローカルの古いリンクが消える", () => {
  const { store } = newStore(
    baseData([
      { id: "a", url: "https://a.example", createdAt: now, updatedAt: now },
      { id: "b", url: "https://b.example", createdAt: now, updatedAt: now + 200 },
    ])
  );
  const r = store.mergeRemote(
    baseData([], { tombstones: { links: { a: now + 100, b: now + 100 }, folders: {} } })
  );
  assert.strictEqual(r.removed, 1);
  const links = store.getData().links;
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].id, "b"); // 削除より後に編集されたリンクは残る
});

test("mergeRemote: 同じURLでidが違うリンクは重複追加しない", () => {
  const { store } = newStore(
    baseData([{ id: "local1", url: "https://a.example", title: "L", createdAt: now, updatedAt: now }])
  );
  const r = store.mergeRemote(
    baseData([{ id: "remote1", url: "https://a.example", title: "R", createdAt: now, updatedAt: now + 100 }])
  );
  assert.strictEqual(r.added, 0);
  assert.strictEqual(store.getData().links.length, 1);
  assert.strictEqual(store.getData().links[0].title, "R"); // 新しい編集は反映される
});

test("mergeRemote: フォルダは名前で統合され、リンクのフォルダも対応付く", () => {
  const { store } = newStore({
    version: 2,
    folders: [{ id: "lf", name: "F" }],
    links: [],
    tombstones: { links: {}, folders: {} },
  });
  store.mergeRemote({
    version: 2,
    folders: [{ id: "rf", name: "F" }, { id: "rg", name: "G" }],
    links: [{ id: "a", url: "https://a.example", folderId: "rf", createdAt: now, updatedAt: now }],
    tombstones: { links: {}, folders: {} },
  });
  const d = store.getData();
  assert.strictEqual(d.folders.length, 2);
  assert.strictEqual(d.links[0].folderId, "lf");
});

test("mergeRemote: ローカルで削除済みフォルダは古いリンクだけなら復活しない", () => {
  const { store } = newStore(
    baseData([], { tombstones: { links: {}, folders: { F: now + 100 } } })
  );
  store.mergeRemote({
    version: 2,
    folders: [{ id: "rf", name: "F" }],
    links: [{ id: "a", url: "https://a.example", folderId: "rf", createdAt: now, updatedAt: now }],
    tombstones: { links: {}, folders: {} },
  });
  const d = store.getData();
  assert.strictEqual(d.folders.length, 0);
  assert.strictEqual(d.links[0].folderId, null); // リンク自体は取り込むが未分類
});

test("mergeRemote: 差分がなければ changed=false で保存しない", () => {
  const data = baseData([{ id: "a", url: "https://a.example", createdAt: now, updatedAt: now }], { updatedAt: now });
  const { store } = newStore(data);
  const before = store.getData().updatedAt;
  const r = store.mergeRemote(data);
  assert.strictEqual(r.changed, false);
  assert.strictEqual(store.getData().updatedAt, before);
});

/* ---------- refresh（他タブ同期） ---------- */

test("refresh が localStorage の最新内容を読み直す", () => {
  const { store, storage } = newStore();
  store.addLink({ url: "https://a.example" });
  const raw = JSON.parse(storage.getItem(LinkShelfStore.STORAGE_KEY));
  raw.links.push({ id: "ext", url: "https://ext.example", title: "他タブ", createdAt: now, updatedAt: now });
  storage.setItem(LinkShelfStore.STORAGE_KEY, JSON.stringify(raw));
  store.refresh();
  assert.strictEqual(store.getData().links.length, 2);
});

test("同じ名前へのタグ変更ではタグと保存内容を保持する", () => {
  const { store, storage } = newStore();
  store.addLink({ url: "https://a.example", tags: ["仕事"] });
  const before = storage.getItem(LinkShelfStore.STORAGE_KEY);
  assert.deepStrictEqual(store.renameTag("仕事", " 仕事 "), { renamed: 0, merged: false });
  assert.strictEqual(storage.getItem(LinkShelfStore.STORAGE_KEY), before);
  assert.deepStrictEqual(store.getData().links[0].tags, ["仕事"]);
});

test("マージするバックアップ内でもURLとフォルダ名の重複をまとめる", () => {
  const { store } = newStore();
  store.importJSON({
    folders: [{ id: "f1", name: "資料" }, { id: "f2", name: "資料" }],
    links: [
      { url: "https://a.example", folderId: "f1" },
      { url: "https://a.example", folderId: "f2" },
      { url: "https://b.example", folderId: "f2" },
    ],
  }, "merge");
  assert.strictEqual(store.getData().folders.length, 1);
  assert.strictEqual(store.getData().links.length, 2);
  assert.ok(store.getData().links.every((l) => l.folderId === store.getData().folders[0].id));
});

test("別形式のバックアップを拒否して既存リンクを保持する", () => {
  const { store, storage } = newStore();
  store.addLink({ url: "https://keep.example" });
  const before = storage.getItem(LinkShelfStore.STORAGE_KEY);
  for (const raw of [null, {}, [], { links: [null] }, { links: [], folders: {} }]) {
    assert.throws(() => store.importJSON(JSON.stringify(raw), "replace"), /バックアップ形式/);
    assert.strictEqual(storage.getItem(LinkShelfStore.STORAGE_KEY), before);
    assert.strictEqual(store.getData().links[0].url, "https://keep.example");
  }
});

console.log(`store.test.js: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
