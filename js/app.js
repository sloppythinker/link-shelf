const store = LinkShelfStore.createStore(localStorage, (error) => { render(); showToast(error.message); });
window.addEventListener("error", (event) => {
  if (event.error?.name === "StorageWriteError") event.preventDefault();
});

const UI_KEY = "linkshelf-ui";
const SYNC_KEY = "linkshelf-sync";

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

const uiPrefs = loadJSON(UI_KEY, {});

const state = {
  folder: "all", // "all" | "none" | folderId
  tags: [],
  query: "",
  sort: uiPrefs.sort || "new", // "new" | "old" | "title" | "clicks"
  dup: false, // 重複チェックビュー
};

let viewMode = uiPrefs.view || "grid"; // "grid" | "list"

function saveUIPrefs() {
  localStorage.setItem(UI_KEY, JSON.stringify({ sort: state.sort, theme: themeMode, view: viewMode }));
}

const $ = (id) => document.getElementById(id);

const el = {
  folderList: $("folderList"),
  tagCloud: $("tagCloud"),
  cardGrid: $("cardGrid"),
  emptyState: $("emptyState"),
  emptyTitle: $("emptyTitle"),
  emptyDesc: $("emptyDesc"),
  currentView: $("currentView"),
  countBadge: $("countBadge"),
  activeTags: $("activeTags"),
  searchInput: $("searchInput"),
  sortSelect: $("sortSelect"),
  sidebar: $("sidebar"),
  sidebarBackdrop: $("sidebarBackdrop"),
  linkModal: $("linkModal"),
  linkModalTitle: $("linkModalTitle"),
  linkForm: $("linkForm"),
  fieldUrl: $("fieldUrl"),
  fieldTitle: $("fieldTitle"),
  fieldFolder: $("fieldFolder"),
  fieldNewFolder: $("fieldNewFolder"),
  folderPicker: $("folderPicker"),
  bulkTagPopover: $("bulkTagPopover"),
  fieldTagText: $("fieldTagText"),
  chipInput: $("chipInput"),
  tagSuggest: $("tagSuggest"),
  fieldNote: $("fieldNote"),
  folderModal: $("folderModal"),
  folderModalTitle: $("folderModalTitle"),
  folderForm: $("folderForm"),
  fieldFolderName: $("fieldFolderName"),
  bulkBar: $("bulkBar"),
  bulkCount: $("bulkCount"),
  syncModal: $("syncModal"),
  syncToken: $("syncToken"),
  syncGistId: $("syncGistId"),
  syncStatus: $("syncStatus"),
  toast: $("toast"),
};

/* ---------- テーマ ---------- */

let themeMode = uiPrefs.theme || "auto"; // "auto" | "light" | "dark"
const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function applyTheme() {
  const resolved = themeMode === "auto" ? (darkMQ && darkMQ.matches ? "dark" : "light") : themeMode;
  document.documentElement.dataset.theme = resolved;
}

if (darkMQ && darkMQ.addEventListener) {
  darkMQ.addEventListener("change", () => {
    if (themeMode === "auto") applyTheme();
  });
}

$("themeBtn").addEventListener("click", () => {
  themeMode = themeMode === "auto" ? "dark" : themeMode === "dark" ? "light" : "auto";
  applyTheme();
  saveUIPrefs();
  const labels = { auto: "テーマ: 自動（OS設定に追従）", dark: "テーマ: ダーク", light: "テーマ: ライト" };
  showToast(labels[themeMode]);
});

applyTheme();

/* ---------- utils ---------- */

function tagHue(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % 360;
}

function styleTagChip(chip, tag) {
  const hue = tagHue(tag);
  chip.style.background = `hsl(${hue}, 70%, 92%)`;
  chip.style.color = `hsl(${hue}, 55%, 32%)`;
  chip.style.borderColor = `hsl(${hue}, 50%, 82%)`;
}

function domainOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function makeTagChip(tag, { count, onClick, removable, onRemove, selected } = {}) {
  const chip = document.createElement("span");
  chip.className = "tag-chip";
  if (selected) chip.classList.add("selected");
  styleTagChip(chip, tag);
  const name = document.createElement("span");
  name.textContent = tag;
  chip.appendChild(name);
  if (count !== undefined) {
    const c = document.createElement("span");
    c.className = "t-count";
    c.textContent = count;
    chip.appendChild(c);
  }
  if (removable) {
    const x = document.createElement("span");
    x.className = "t-x";
    x.textContent = "×";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove && onRemove(tag);
    });
    chip.appendChild(x);
  }
  if (onClick) chip.addEventListener("click", () => onClick(tag));
  return chip;
}

let toastTimer;
function showToast(msg, action) {
  el.toast.textContent = msg;
  if (action) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      clearTimeout(toastTimer);
      el.toast.hidden = true;
      action.onClick();
    });
    el.toast.appendChild(btn);
  }
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), action ? 6000 : 2600);
}

/* ---------- 削除の取り消し ---------- */

function deleteWithUndo(links, msg) {
  const snapshot = links.map((l) => ({ ...l }));
  links.forEach((l) => store.deleteLink(l.id));
  render();
  showToast(msg, {
    label: "元に戻す",
    onClick: () => {
      store.restoreLinks(snapshot);
      render();
      showToast("削除を取り消しました");
    },
  });
}

/* ---------- sidebar ---------- */

function folderItem({ id, name, icon, count, showMenu }) {
  const li = document.createElement("li");
  li.className = "folder-item";
  if (state.folder === id) li.classList.add("active");

  const iconSpan = document.createElement("span");
  iconSpan.className = "f-icon";
  iconSpan.innerHTML = icon;
  li.appendChild(iconSpan);

  const nameSpan = document.createElement("span");
  nameSpan.className = "f-name";
  nameSpan.textContent = name;
  li.appendChild(nameSpan);

  const countSpan = document.createElement("span");
  countSpan.className = "f-count";
  countSpan.textContent = count;
  li.appendChild(countSpan);

  if (showMenu) {
    const menuBtn = document.createElement("button");
    menuBtn.className = "f-menu";
    menuBtn.textContent = "⋯";
    menuBtn.title = "フォルダ操作";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFolderModal({ id, name });
    });
    li.appendChild(menuBtn);
  }

  li.addEventListener("click", () => {
    state.folder = id;
    state.dup = false;
    closeSidebar();
    render();
  });
  return li;
}

const FOLDER_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" fill="currentColor" opacity=".8"/></svg>';
const ALL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".8"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".5"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".5"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".8"/></svg>';
const INBOX_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 4h16v10h-5a3 3 0 0 1-6 0H4V4zm0 10v6h16v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const LOOSE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.5 3.5"/></svg>';
const ARCHIVE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const PIN_SVG = '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 4h6l-1 6 3 3v2h-4v5l-1 1-1-1v-5H7v-2l3-3L9 4z" fill="currentColor"/></svg>';

function renderSidebar() {
  const data = store.getData();
  const counts = store.folderCounts();
  const active = data.links.filter((l) => !l.archived);
  const inboxCount = active.filter((l) => l.folderId === null && !l.tags.length).length;
  const archivedCount = data.links.length - active.length;
  el.folderList.textContent = "";
  el.folderList.appendChild(folderItem({ id: "all", name: "すべて", icon: ALL_ICON, count: active.length }));
  el.folderList.appendChild(folderItem({ id: "none", name: "未分類", icon: INBOX_ICON, count: counts.get("none") || 0 }));
  el.folderList.appendChild(folderItem({ id: "inbox", name: "未整理", icon: LOOSE_ICON, count: inboxCount }));
  [...data.folders]
    .sort((a, b) => a.order - b.order)
    .forEach((f) => {
      el.folderList.appendChild(
        folderItem({ id: f.id, name: f.name, icon: FOLDER_ICON, count: counts.get(f.id) || 0, showMenu: true })
      );
    });
  el.folderList.appendChild(folderItem({ id: "archived", name: "アーカイブ", icon: ARCHIVE_ICON, count: archivedCount }));

  el.tagCloud.textContent = "";
  const tagCounts = store.tagCounts();
  if (!tagCounts.length) {
    const p = document.createElement("span");
    p.style.cssText = "font-size:12px;color:var(--text-sub);padding:0 4px;";
    p.textContent = "タグはまだありません";
    el.tagCloud.appendChild(p);
  }
  tagCounts.forEach(({ tag, count }) => {
    const chip = makeTagChip(tag, {
      count,
      selected: state.tags.includes(tag),
      onClick: () => {
        if (editMode) {
          openTagEditor(chip, tag);
          return;
        }
        state.tags = state.tags.includes(tag) ? state.tags.filter((t) => t !== tag) : [...state.tags, tag];
        state.dup = false;
        render();
      },
    });
    el.tagCloud.appendChild(chip);
  });
}

/* ---------- cards ---------- */

function sortLinks(links) {
  const cmp = {
    new: (a, b) => b.createdAt - a.createdAt,
    old: (a, b) => a.createdAt - b.createdAt,
    title: (a, b) => a.title.localeCompare(b.title, "ja"),
    clicks: (a, b) => (b.clicks || 0) - (a.clicks || 0) || b.createdAt - a.createdAt,
  }[state.sort] || ((a, b) => b.createdAt - a.createdAt);
  return [...links].sort((a, b) => (b.pinned - a.pinned) || cmp(a, b));
}

function renderCards() {
  const data = store.getData();
  let links = sortLinks(store.filterLinks(state));
  if (state.dup) {
    const dups = store.duplicateUrls();
    links = links.filter((l) => dups.has(l.url));
    links.sort((a, b) => a.url.localeCompare(b.url));
  }
  el.cardGrid.textContent = "";
  el.cardGrid.classList.toggle("list-view", viewMode === "list");

  const folderName =
    state.dup ? "重複リンク" :
    state.folder === "all" ? "すべてのリンク" :
    state.folder === "none" ? "未分類" :
    state.folder === "inbox" ? "未整理" :
    state.folder === "archived" ? "アーカイブ" :
    (data.folders.find((f) => f.id === state.folder) || {}).name || "すべてのリンク";
  el.currentView.textContent = folderName;
  el.countBadge.textContent = `${links.length}件`;
  el.sortSelect.value = state.sort;

  el.activeTags.textContent = "";
  state.tags.forEach((tag) => {
    el.activeTags.appendChild(
      makeTagChip(tag, {
        removable: true,
        onRemove: () => {
          state.tags = state.tags.filter((t) => t !== tag);
          render();
        },
      })
    );
  });

  // 消えたリンクを選択から除去
  const ids = new Set(data.links.map((l) => l.id));
  selectedIds.forEach((id) => {
    if (!ids.has(id)) selectedIds.delete(id);
  });
  updateBulkBar();

  if (!links.length) {
    el.emptyState.hidden = false;
    if (data.links.length === 0) {
      el.emptyTitle.textContent = "まだリンクがありません";
      el.emptyDesc.innerHTML = "まずは「リンク追加」ボタンからサイトを登録しましょう。<br>フォルダ分けは後から、カードのフォルダボタンでできます。";
    } else if (state.folder === "archived" && !state.query && !state.tags.length) {
      el.emptyTitle.textContent = "アーカイブは空です";
      el.emptyDesc.textContent = "カードの箱アイコンで、使い終わったリンクを棚から下げられます。";
    } else if (state.folder === "inbox" && !state.query && !state.tags.length) {
      el.emptyTitle.textContent = "未整理のリンクはありません";
      el.emptyDesc.textContent = "フォルダもタグも付いていないリンクがここに表示されます。";
    } else {
      el.emptyTitle.textContent = "一致するリンクがありません";
      el.emptyDesc.textContent = "検索条件やタグの絞り込みを変えてみてください。";
    }
    return;
  }
  el.emptyState.hidden = true;

  links.forEach((link) => el.cardGrid.appendChild(makeCard(link)));
}

function makeCard(link) {
  const card = document.createElement("article");
  card.className = "card";
  if (selectedIds.has(link.id)) card.classList.add("selected");

  // キーボード対応: Tabで到達、Enter/Spaceでクリックと同じ動作
  card.tabIndex = 0;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", link.title || link.url);
  card.addEventListener("keydown", (e) => {
    if (e.target !== card || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    card.click();
  });

  // 白枠内のどこをタップしてもリンクを開く（タグ・ボタン・リンク文字は除く）
  card.addEventListener("click", (e) => {
    if (e.target.closest("a, button, .tag-chip, .select-box")) return;
    if (editMode) {
      openLinkModal(link);
    } else {
      store.recordClick(link.id);
      window.open(link.url, "_blank", "noopener,noreferrer");
    }
  });

  if (link.pinned) {
    const badge = document.createElement("span");
    badge.className = "pin-badge";
    badge.innerHTML = PIN_SVG;
    badge.title = "ピン留め中";
    card.appendChild(badge);
  }

  const head = document.createElement("div");
  head.className = "card-head";

  const selectBox = document.createElement("span");
  selectBox.className = "select-box" + (selectedIds.has(link.id) ? " checked" : "");
  selectBox.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  selectBox.title = "選択";
  selectBox.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSelect(link.id, card, selectBox);
  });
  head.appendChild(selectBox);

  const fav = document.createElement("div");
  fav.className = "favicon-wrap";
  const domain = domainOf(link.url);
  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  img.addEventListener("error", () => {
    fav.textContent = "";
    fav.appendChild(faviconFallback(domain));
  });
  fav.appendChild(img);
  head.appendChild(fav);

  const titles = document.createElement("div");
  titles.className = "card-titles";
  const a = document.createElement("a");
  a.className = "card-title";
  a.href = link.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = link.title;
  a.addEventListener("click", (e) => {
    if (editMode) {
      e.preventDefault();
      openLinkModal(link);
    } else {
      store.recordClick(link.id);
    }
  });
  titles.appendChild(a);
  const dom = document.createElement("div");
  dom.className = "card-domain";
  dom.textContent = domain;
  titles.appendChild(dom);
  head.appendChild(titles);
  card.appendChild(head);

  if (link.note) {
    const note = document.createElement("p");
    note.className = "card-note";
    note.textContent = link.note;
    note.title = link.note;
    card.appendChild(note);
  }

  if (link.tags.length) {
    const tags = document.createElement("div");
    tags.className = "card-tags";
    link.tags.forEach((tag) => {
      tags.appendChild(
        makeTagChip(tag, {
          onClick: () => {
            if (!state.tags.includes(tag)) {
              state.tags = [...state.tags, tag];
              render();
            }
          },
        })
      );
    });
    card.appendChild(tags);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const pinBtn = document.createElement("button");
  pinBtn.title = link.pinned ? "ピン留め解除" : "ピン留め";
  pinBtn.className = link.pinned ? "pin-on" : "";
  pinBtn.innerHTML = PIN_SVG;
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    store.updateLink(link.id, { pinned: !link.pinned });
    render();
    showToast(link.pinned ? "ピン留めを解除しました" : "ピン留めしました（上部に固定）");
  });
  actions.appendChild(pinBtn);

  const archBtn = document.createElement("button");
  archBtn.title = link.archived ? "アーカイブから戻す" : "アーカイブ（棚から下げる）";
  archBtn.innerHTML = ARCHIVE_ICON.replace('width="15" height="15"', 'width="13" height="13"');
  archBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasArchived = link.archived;
    store.updateLink(link.id, { archived: !wasArchived });
    render();
    showToast(wasArchived ? "アーカイブから戻しました" : "アーカイブしました", {
      label: "元に戻す",
      onClick: () => {
        store.updateLink(link.id, { archived: wasArchived });
        render();
      },
    });
  });
  actions.appendChild(archBtn);

  const moveBtn = document.createElement("button");
  moveBtn.title = "フォルダへ移動";
  moveBtn.innerHTML = FOLDER_ICON.replace('fill="currentColor" opacity=".8"', 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"');
  moveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openFolderPicker(moveBtn, link.folderId, (folderId, label) => {
      store.updateLink(link.id, { folderId });
      render();
      showToast(folderId ? `「${label}」へ移動しました` : "未分類に移動しました");
    });
  });
  actions.appendChild(moveBtn);

  const editBtn = document.createElement("button");
  editBtn.title = "編集";
  editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 20h4L20 8l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openLinkModal(link);
  });
  actions.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "del";
  delBtn.title = "削除";
  delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteWithUndo([link], "リンクを削除しました");
  });
  actions.appendChild(delBtn);

  card.appendChild(actions);
  return card;
}

function faviconFallback(domain) {
  const div = document.createElement("div");
  div.className = "favicon-fallback";
  const hue = tagHue(domain);
  div.style.background = `hsl(${hue}, 55%, 60%)`;
  div.textContent = (domain.replace(/^www\./, "")[0] || "?").toUpperCase();
  return div;
}

/* ---------- 編集モード＋複数選択 ---------- */

let editMode = false;
const selectedIds = new Set();

$("editModeBtn").addEventListener("click", () => {
  editMode = !editMode;
  document.body.classList.toggle("edit-mode", editMode);
  const btn = $("editModeBtn");
  btn.textContent = editMode ? "完了" : "編集";
  btn.classList.toggle("active", editMode);
  if (!editMode) {
    selectedIds.clear();
    render();
  } else {
    showToast("編集モード: ○で複数選択、カードをタップで編集");
  }
  updateBulkBar();
});

function toggleSelect(id, card, box) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    card.classList.remove("selected");
    box.classList.remove("checked");
  } else {
    selectedIds.add(id);
    card.classList.add("selected");
    box.classList.add("checked");
  }
  updateBulkBar();
}

function updateBulkBar() {
  const show = editMode && selectedIds.size > 0;
  el.bulkBar.hidden = !show;
  if (show) {
    el.bulkCount.textContent = `${selectedIds.size}件選択`;
    $("bulkArchiveBtn").textContent = state.folder === "archived" ? "戻す" : "アーカイブ";
  }
}

$("bulkArchiveBtn").addEventListener("click", () => {
  const toArchive = state.folder !== "archived";
  const n = selectedIds.size;
  [...selectedIds].forEach((id) => store.updateLink(id, { archived: toArchive }));
  selectedIds.clear();
  render();
  showToast(toArchive ? `${n}件をアーカイブしました` : `${n}件をアーカイブから戻しました`);
});

$("bulkClearBtn").addEventListener("click", () => {
  selectedIds.clear();
  render();
});

$("bulkMoveBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  openFolderPicker($("bulkMoveBtn"), undefined, (folderId, label) => {
    [...selectedIds].forEach((id) => store.updateLink(id, { folderId }));
    const n = selectedIds.size;
    selectedIds.clear();
    render();
    showToast(`${n}件を${folderId ? `「${label}」` : "未分類"}へ移動しました`);
  });
});

$("bulkDeleteBtn").addEventListener("click", () => {
  const n = selectedIds.size;
  const targets = store.getData().links.filter((l) => selectedIds.has(l.id));
  selectedIds.clear();
  deleteWithUndo(targets, `${n}件削除しました`);
});

$("bulkTagBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const p = el.bulkTagPopover;
  p.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "popover-input";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "追加するタグ（カンマ区切り可）";
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      const tags = input.value.split(",").map((t) => t.trim()).filter(Boolean);
      if (!tags.length) return;
      [...selectedIds].forEach((id) => {
        const link = store.getData().links.find((l) => l.id === id);
        if (link) store.updateLink(id, { tags: [...new Set([...link.tags, ...tags])] });
      });
      const n = selectedIds.size;
      p.hidden = true;
      render();
      showToast(`${n}件に「${tags.join("・")}」を追加しました`);
    } else if (ev.key === "Escape") {
      p.hidden = true;
    }
  });
  wrap.appendChild(input);
  p.appendChild(wrap);
  // 既存タグのサジェスト
  store.tagCounts().slice(0, 8).forEach(({ tag }) => {
    p.appendChild(
      makeTagChip(tag, {
        onClick: () => {
          input.value = input.value ? `${input.value.replace(/,\s*$/, "")}, ${tag}` : tag;
          input.focus();
        },
      })
    );
  });
  positionPopover(p, $("bulkTagBtn"));
  input.focus();
});

document.addEventListener("click", (e) => {
  if (!el.bulkTagPopover.hidden && !el.bulkTagPopover.contains(e.target) && e.target !== $("bulkTagBtn")) {
    el.bulkTagPopover.hidden = true;
  }
});

/* ---------- folder picker ---------- */

function positionPopover(p, anchor) {
  p.hidden = false;
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - p.offsetWidth - 8));
  let top = r.bottom + 6;
  if (top + p.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - p.offsetHeight - 6);
  p.style.left = `${left}px`;
  p.style.top = `${top}px`;
}

function openFolderPicker(anchor, currentFolderId, onSelect) {
  const p = el.folderPicker;
  p.textContent = "";

  const choose = (folderId, label) => {
    closeFolderPicker();
    onSelect(folderId, label);
  };

  const addItem = (label, folderId) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "popover-item" + (currentFolderId !== undefined && currentFolderId === folderId ? " current" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => choose(folderId, label));
    p.appendChild(btn);
  };

  addItem("未分類", null);
  store.getData().folders.forEach((f) => addItem(f.name, f.id));

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "popover-item new";
  newBtn.textContent = "＋ 新規フォルダを作って移動";
  newBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wrap = document.createElement("div");
    wrap.className = "popover-input";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "フォルダ名を入力してEnter";
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        const name = input.value.trim();
        if (!name) return;
        const folder = store.addFolder(name) || store.getData().folders.find((f) => f.name === name);
        choose(folder.id, folder.name);
      } else if (ev.key === "Escape") {
        closeFolderPicker();
      }
    });
    wrap.appendChild(input);
    p.replaceChild(wrap, newBtn);
    input.focus();
  });
  p.appendChild(newBtn);

  positionPopover(p, anchor);
}

function closeFolderPicker() {
  el.folderPicker.hidden = true;
}

document.addEventListener("click", (e) => {
  if (!el.folderPicker.hidden && !el.folderPicker.contains(e.target)) closeFolderPicker();
});

/* ---------- link modal ---------- */

let editingId = null;
let editTags = [];

function openLinkModal(link, prefill) {
  editingId = link ? link.id : null;
  editTags = link ? [...link.tags] : [];
  el.linkModalTitle.textContent = link ? "リンクを編集" : "リンクを追加";
  el.fieldUrl.value = link ? link.url : (prefill && prefill.url) || "";
  el.fieldTitle.value = link ? (link.title === link.url ? "" : link.title) : (prefill && prefill.title) || "";
  el.fieldNote.value = link ? link.note : "";

  el.fieldFolder.textContent = "";
  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "未分類";
  el.fieldFolder.appendChild(optNone);
  store.getData().folders.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    el.fieldFolder.appendChild(opt);
  });
  const optNew = document.createElement("option");
  optNew.value = "__new__";
  optNew.textContent = "＋ 新しいフォルダを作成…";
  el.fieldFolder.appendChild(optNew);
  el.fieldFolder.value = link && link.folderId ? link.folderId : "";
  if (!link && store.getData().folders.some((f) => f.id === state.folder)) {
    el.fieldFolder.value = state.folder;
  }
  el.fieldNewFolder.hidden = true;
  el.fieldNewFolder.value = "";

  el.fieldTagText.value = "";
  renderChips();
  el.linkModal.hidden = false;
  el.fieldUrl.focus();
}

function closeLinkModal() {
  el.linkModal.hidden = true;
}

function renderChips() {
  [...el.chipInput.querySelectorAll(".tag-chip")].forEach((c) => c.remove());
  editTags.forEach((tag) => {
    el.chipInput.insertBefore(
      makeTagChip(tag, {
        removable: true,
        onRemove: (t) => {
          editTags = editTags.filter((x) => x !== t);
          renderChips();
        },
      }),
      el.fieldTagText
    );
  });
  renderTagSuggest();
}

function renderTagSuggest() {
  const input = LinkShelfStore.normText(el.fieldTagText.value.trim());
  el.tagSuggest.textContent = "";
  store
    .tagCounts()
    .filter(({ tag }) => !editTags.includes(tag) && (!input || LinkShelfStore.normText(tag).includes(input)))
    .slice(0, 12)
    .forEach(({ tag }) => {
      el.tagSuggest.appendChild(makeTagChip(tag, { onClick: () => addEditTag(tag) }));
    });
}

function addEditTag(raw) {
  const tag = String(raw || "").trim().replace(/,/g, "");
  if (!tag || editTags.includes(tag)) return;
  editTags.push(tag);
  el.fieldTagText.value = "";
  renderChips();
}

el.fieldTagText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addEditTag(el.fieldTagText.value);
  } else if (e.key === "Backspace" && !el.fieldTagText.value && editTags.length) {
    editTags.pop();
    renderChips();
  }
});
el.fieldTagText.addEventListener("input", renderTagSuggest);
el.chipInput.addEventListener("click", () => el.fieldTagText.focus());

el.fieldFolder.addEventListener("change", () => {
  const isNew = el.fieldFolder.value === "__new__";
  el.fieldNewFolder.hidden = !isNew;
  if (isNew) el.fieldNewFolder.focus();
});

el.linkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addEditTag(el.fieldTagText.value); // 未確定の入力も拾う
  let folderId = el.fieldFolder.value || null;
  if (folderId === "__new__") {
    const name = el.fieldNewFolder.value.trim();
    if (name) {
      const folder = store.addFolder(name) || store.getData().folders.find((f) => f.name === name);
      folderId = folder.id;
    } else {
      folderId = null;
    }
  }
  const payload = {
    url: el.fieldUrl.value.trim(),
    title: el.fieldTitle.value.trim(),
    tags: editTags,
    folderId,
    note: el.fieldNote.value.trim(),
  };
  if (!payload.url) return;
  if (editingId) {
    store.updateLink(editingId, payload);
  } else {
    store.addLink(payload);
  }
  closeLinkModal();
  render();
});

$("addLinkBtn").addEventListener("click", () => openLinkModal(null));
$("linkCancelBtn").addEventListener("click", closeLinkModal);
el.linkModal.addEventListener("click", (e) => {
  if (e.target === el.linkModal) closeLinkModal();
});

/* ---------- folder modal ---------- */

let editingFolderId = null;

function openFolderModal(folder) {
  editingFolderId = folder ? folder.id : null;
  el.folderModalTitle.textContent = folder ? "フォルダを編集" : "新規フォルダ";
  el.fieldFolderName.value = folder ? folder.name : "";
  $("folderDeleteBtn").hidden = !folder;
  el.folderModal.hidden = false;
  el.fieldFolderName.focus();
}

function closeFolderModal() {
  el.folderModal.hidden = true;
}

$("folderDeleteBtn").addEventListener("click", () => {
  if (!editingFolderId) return;
  const folder = store.getData().folders.find((f) => f.id === editingFolderId);
  if (!folder) return;
  if (window.confirm(`フォルダ「${folder.name}」を削除しますか？\n中のリンクは未分類に移動します。`)) {
    store.deleteFolder(editingFolderId);
    if (state.folder === editingFolderId) state.folder = "all";
    closeFolderModal();
    render();
    showToast("フォルダを削除しました");
  }
});

el.folderForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = el.fieldFolderName.value.trim();
  if (!name) return;
  const result = editingFolderId ? store.renameFolder(editingFolderId, name) : store.addFolder(name);
  if (!result) {
    showToast("同じ名前のフォルダがあります");
    return;
  }
  closeFolderModal();
  render();
});

$("addFolderBtn").addEventListener("click", () => openFolderModal(null));
$("folderCancelBtn").addEventListener("click", closeFolderModal);
el.folderModal.addEventListener("click", (e) => {
  if (e.target === el.folderModal) closeFolderModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLinkModal();
    closeFolderModal();
    closeFolderPicker();
    closeSyncModal();
    closeBmkModal();
    el.bulkTagPopover.hidden = true;
    $("tagEditPopover").hidden = true;
    closeSidebar();
  }
});

/* ---------- キーボードショートカット（/ = 検索、n = リンク追加） ---------- */

function anyOverlayOpen() {
  return !el.linkModal.hidden || !el.folderModal.hidden || !el.syncModal.hidden || !$("bmkModal").hidden;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
  if (anyOverlayOpen()) return;
  if (e.key === "/") {
    e.preventDefault();
    el.searchInput.focus();
    el.searchInput.select();
  } else if (e.key === "n") {
    e.preventDefault();
    openLinkModal(null);
  }
});

/* ---------- search / sort ---------- */

el.searchInput.addEventListener("input", () => {
  state.query = el.searchInput.value;
  if (state.query) state.dup = false;
  render();
});

el.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (el.searchInput.value) {
      el.searchInput.value = "";
      state.query = "";
      render();
    }
    el.searchInput.blur();
  }
});

el.sortSelect.addEventListener("change", () => {
  state.sort = el.sortSelect.value;
  saveUIPrefs();
  render();
});

/* ---------- 表示切替（カード⇔リスト） ---------- */

const GRID_VIEW_ICON = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor"/></svg>';
const LIST_VIEW_ICON = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

function applyView() {
  el.cardGrid.classList.toggle("list-view", viewMode === "list");
  const btn = $("viewBtn");
  btn.innerHTML = viewMode === "list" ? GRID_VIEW_ICON : LIST_VIEW_ICON;
  btn.title = viewMode === "list" ? "カード表示に切替" : "リスト表示に切替";
}

$("viewBtn").addEventListener("click", () => {
  viewMode = viewMode === "grid" ? "list" : "grid";
  applyView();
  saveUIPrefs();
});

applyView();

/* ---------- 重複チェック ---------- */

$("dupBtn").addEventListener("click", () => {
  closeSidebar();
  if (!store.duplicateUrls().size) {
    showToast("重複しているリンクはありません");
    return;
  }
  state.dup = true;
  state.folder = "all";
  state.tags = [];
  state.query = "";
  el.searchInput.value = "";
  render();
  showToast("同じURLのリンクを並べて表示しています");
});

/* ---------- タグ管理（リネーム・統合・削除） ---------- */

function openTagEditor(anchor, tag) {
  const p = $("tagEditPopover");
  p.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "popover-input";
  const input = document.createElement("input");
  input.type = "text";
  input.value = tag;
  input.placeholder = "新しいタグ名";
  const commit = () => {
    const name = input.value.trim().replace(/,/g, "");
    p.hidden = true;
    if (!name || name === tag) return;
    const result = store.renameTag(tag, name);
    if (!result || !result.renamed) return;
    state.tags = state.tags.filter((t) => t !== tag);
    render();
    showToast(
      result.merged
        ? `「${tag}」を「${name}」に統合しました（${result.renamed}件）`
        : `タグ名を「${name}」に変更しました（${result.renamed}件）`
    );
  };
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      commit();
    } else if (ev.key === "Escape") {
      p.hidden = true;
    }
  });
  wrap.appendChild(input);
  p.appendChild(wrap);

  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "popover-item";
  renameBtn.textContent = "名前を変更（既存タグ名なら統合）";
  renameBtn.addEventListener("click", commit);
  p.appendChild(renameBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "popover-item danger";
  delBtn.textContent = `タグ「${tag}」を削除`;
  delBtn.addEventListener("click", () => {
    if (!window.confirm(`タグ「${tag}」をすべてのリンクから削除しますか？`)) return;
    const n = store.deleteTag(tag);
    p.hidden = true;
    state.tags = state.tags.filter((t) => t !== tag);
    render();
    showToast(`${n}件からタグ「${tag}」を削除しました`);
  });
  p.appendChild(delBtn);

  positionPopover(p, anchor);
  input.focus();
  input.select();
}

document.addEventListener("click", (e) => {
  const p = $("tagEditPopover");
  if (!p.hidden && !p.contains(e.target) && !e.target.closest(".tag-cloud")) p.hidden = true;
});

/* ---------- export / import ---------- */

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([store.exportJSON()], { type: "application/json" });
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = URL.createObjectURL(blob);
  a.download = `linkshelf-${date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("エクスポートしました");
});

$("importBtn").addEventListener("click", () => $("importFile").click());

// ブックマークHTML（Netscape形式）の解析
const BOOKMARK_ROOT_NAMES = [
  "ブックマーク バー", "ブックマークバー", "Bookmarks bar", "Bookmarks Bar", "Bookmarks Toolbar",
  "その他のブックマーク", "Other bookmarks", "Other Bookmarks",
  "モバイルのブックマーク", "Mobile bookmarks", "Mobile Bookmarks",
];

function bookmarkFolderOf(a) {
  const dl = a.closest("dl");
  if (!dl) return null;
  const dt = dl.parentElement;
  if (dt && dt.tagName === "DT") {
    const h3 = dt.querySelector(":scope > h3");
    if (h3) return h3.textContent.trim();
  }
  let prev = dl.previousElementSibling;
  if (prev && prev.tagName === "P") prev = prev.previousElementSibling;
  if (prev && prev.tagName === "H3") return prev.textContent.trim();
  return null;
}

function parseBookmarksHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const url = a.getAttribute("href");
    if (!/^https?:/i.test(url)) return;
    let folderName = bookmarkFolderOf(a);
    if (folderName && BOOKMARK_ROOT_NAMES.includes(folderName)) folderName = null;
    items.push({ url, title: (a.textContent || "").trim(), folderName });
  });
  return items;
}

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch {
    showToast("ファイルを読み込めませんでした");
    return;
  }

  const isHtml = /\.html?$/i.test(file.name) || /^\s*</.test(text);
  if (isHtml) {
    const items = parseBookmarksHtml(text);
    if (!items.length) {
      showToast("ブックマークが見つかりませんでした");
      return;
    }
    if (!window.confirm(`ブックマーク${items.length}件をインポートします。\nフォルダ構造も引き継ぎ、登録済みのURLはスキップされます。`)) return;
    const { added, skipped } = store.bulkAdd(items);
    state.folder = "all";
    render();
    showToast(`${added}件追加しました${skipped ? `（重複${skipped}件をスキップ）` : ""}`);
    return;
  }

  try {
    JSON.parse(text);
  } catch {
    showToast("JSONファイルを読み込めませんでした");
    return;
  }
  pendingImportText = text;
  importModalEl.hidden = false;
});

/* ---------- インポート方法選択モーダル ---------- */

const importModalEl = $("importModal");
let pendingImportText = null;

function closeImportModal() {
  importModalEl.hidden = true;
  pendingImportText = null;
}

function runImport(mode) {
  const text = pendingImportText;
  if (text == null) return;
  try {
    const preview = store.previewImport(text, mode);
    const action = mode === "merge" ? `新規${preview.added}件を追加` : `現在の${preview.before}件を置き換え`;
    if (!window.confirm(`${action}します。取り込み後: リンク${preview.after}件・フォルダ${preview.folders}件。実行しますか？`)) return;
    store.importJSON(text, mode);
    closeImportModal();
    state.folder = "all";
    state.tags = [];
    render();
    showToast(mode === "merge" ? "追記でインポートしました" : "置き換えでインポートしました");
  } catch {
    showToast("インポートに失敗しました");
  }
}

$("importMergeBtn").addEventListener("click", () => runImport("merge"));
$("importReplaceBtn").addEventListener("click", () => {
  runImport("replace");
});
$("importCancelBtn").addEventListener("click", closeImportModal);
importModalEl.addEventListener("click", (e) => {
  if (e.target === importModalEl) closeImportModal();
});

/* ---------- Gist同期 ---------- */

const GIST_FILE = "linkshelf-data.json";

function syncConfig() {
  return loadJSON(SYNC_KEY, {});
}

function saveSyncConfig(cfg) {
  localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
}

function openSyncModal() {
  const cfg = syncConfig();
  el.syncToken.value = cfg.token || "";
  el.syncGistId.value = cfg.gistId || "";
  $("syncAuto").checked = !!cfg.auto;
  setSyncStatus("");
  el.syncModal.hidden = false;
}

function closeSyncModal() {
  el.syncModal.hidden = true;
}

function setSyncStatus(msg, isError) {
  el.syncStatus.textContent = msg;
  el.syncStatus.classList.toggle("error", !!isError);
}

async function gistRequest(method, path, token, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "トークンが無効です" : res.status === 404 ? "Gistが見つかりません" : `エラー (${res.status})`);
  }
  return res.json();
}

$("syncBtn").addEventListener("click", () => {
  closeSidebar();
  openSyncModal();
});
$("syncCancelBtn").addEventListener("click", closeSyncModal);
el.syncModal.addEventListener("click", (e) => {
  if (e.target === el.syncModal) closeSyncModal();
});

$("syncUploadBtn").addEventListener("click", async () => {
  const token = el.syncToken.value.trim();
  let gistId = el.syncGistId.value.trim();
  if (!token) {
    setSyncStatus("トークンを入力してください", true);
    return;
  }
  setSyncStatus("アップロード中…");
  try {
    const files = { [GIST_FILE]: { content: store.exportJSON() } };
    let gist;
    if (gistId) {
      gist = await gistRequest("PATCH", `/gists/${gistId}`, token, { files });
    } else {
      gist = await gistRequest("POST", "/gists", token, {
        description: "リンク棚(LinkShelf) データ",
        public: false,
        files,
      });
      gistId = gist.id;
      el.syncGistId.value = gistId;
    }
    saveSyncConfig({ ...syncConfig(), token, gistId, lastSync: Date.now() });
    setSyncStatus(`アップロード完了（${new Date().toLocaleString("ja-JP")}）`);
    showToast("クラウドへアップロードしました");
  } catch (err) {
    setSyncStatus(`アップロード失敗: ${err.message}`, true);
  }
});

$("syncDownloadBtn").addEventListener("click", async () => {
  const token = el.syncToken.value.trim();
  const gistId = el.syncGistId.value.trim();
  if (!token || !gistId) {
    setSyncStatus("トークンとGist IDを入力してください", true);
    return;
  }
  setSyncStatus("ダウンロード中…");
  try {
    const gist = await gistRequest("GET", `/gists/${gistId}`, token);
    const file = gist.files && gist.files[GIST_FILE];
    if (!file || !file.content) throw new Error("データファイルがありません");
    applyingRemote = true;
    const result = store.mergeRemote(file.content);
    applyingRemote = false;
    saveSyncConfig({ ...syncConfig(), token, gistId, lastSync: Date.now() });
    render();
    setSyncStatus(`統合完了: 追加${result.added}・更新${result.updated}・削除${result.removed}（${new Date().toLocaleString("ja-JP")}）`);
    showToast(result.changed ? "クラウドのデータを統合しました" : "すでに最新の状態です");
  } catch (err) {
    applyingRemote = false;
    setSyncStatus(`ダウンロード失敗: ${err.message}`, true);
  }
});

/* ---------- 自動同期 ---------- */

let applyingRemote = false;
let autoUploadTimer = null;

$("syncAuto").addEventListener("change", () => {
  const cfg = syncConfig();
  cfg.auto = $("syncAuto").checked;
  const token = el.syncToken.value.trim();
  const gistId = el.syncGistId.value.trim();
  if (token) cfg.token = token;
  if (gistId) cfg.gistId = gistId;
  saveSyncConfig(cfg);
  showToast(cfg.auto ? "自動同期をオンにしました" : "自動同期をオフにしました");
});

store.subscribe(() => {
  if (applyingRemote) return;
  const cfg = syncConfig();
  if (!cfg.auto || !cfg.token) return;
  clearTimeout(autoUploadTimer);
  autoUploadTimer = setTimeout(autoUpload, 3000);
});

async function autoUpload() {
  const cfg = syncConfig();
  if (!cfg.auto || !cfg.token) return;
  try {
    const files = { [GIST_FILE]: { content: store.exportJSON() } };
    if (cfg.gistId) {
      await gistRequest("PATCH", `/gists/${cfg.gistId}`, cfg.token, { files });
    } else {
      const gist = await gistRequest("POST", "/gists", cfg.token, {
        description: "リンク棚(LinkShelf) データ",
        public: false,
        files,
      });
      cfg.gistId = gist.id;
    }
    cfg.lastSync = Date.now();
    saveSyncConfig(cfg);
    showToast("クラウドへ自動アップロードしました");
  } catch {
    showToast("自動アップロードに失敗しました（同期画面から再試行できます）");
  }
}

async function autoSyncStartup() {
  const cfg = syncConfig();
  if (!cfg.auto || !cfg.token || !cfg.gistId) return;
  try {
    const gist = await gistRequest("GET", `/gists/${cfg.gistId}`, cfg.token);
    const file = gist.files && gist.files[GIST_FILE];
    if (!file || !file.content) return;
    const remote = JSON.parse(file.content);
    if ((remote.updatedAt || 0) <= (store.getData().updatedAt || 0)) return;
    // マージ方式なのでこの端末だけの変更は消えない。マージで変更が出れば
    // subscribe 経由の自動アップロードが統合結果をクラウドへ書き戻す
    const result = store.mergeRemote(file.content);
    saveSyncConfig({ ...cfg, lastSync: Date.now() });
    render();
    if (result.changed) {
      showToast(`クラウドの変更を統合しました（追加${result.added}・更新${result.updated}・削除${result.removed}）`);
    }
  } catch {
    // オフライン時などは静かにスキップ
  }
}

/* ---------- mobile sidebar ---------- */

function closeSidebar() {
  el.sidebar.classList.remove("open");
  el.sidebarBackdrop.classList.remove("show");
}

$("menuBtn").addEventListener("click", () => {
  el.sidebar.classList.toggle("open");
  el.sidebarBackdrop.classList.toggle("show");
});
el.sidebarBackdrop.addEventListener("click", closeSidebar);

/* ---------- 共有ターゲット（スマホの共有メニューから追加） ---------- */

function handleShareTarget() {
  const params = new URLSearchParams(location.search);
  if (!params.has("url") && !params.has("text") && !params.has("title")) return;
  const sharedUrl = params.get("url") || "";
  const text = params.get("text") || "";
  const title = params.get("title") || "";
  let url = sharedUrl.trim();
  if (!/^https?:/i.test(url)) {
    const m = (text + " " + title).match(/https?:\/\/\S+/);
    url = m ? m[0] : "";
  }
  history.replaceState(null, "", location.pathname);
  if (!url) return;
  let prefillTitle = title.trim();
  if (!prefillTitle) prefillTitle = text.replace(url, "").trim();
  openLinkModal(null, { url, title: prefillTitle });
  showToast("共有されたリンクを追加します");
}

/* ---------- ブックマークレット（PCのブラウザから1クリック追加） ---------- */

function bmkCode() {
  const base = location.origin + location.pathname.replace(/index\.html$/, "");
  return (
    "javascript:(function(){window.open('" +
    base +
    "?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank');})();"
  );
}

function openBmkModal() {
  $("bmkLink").setAttribute("href", bmkCode());
  $("bmkModal").hidden = false;
}

function closeBmkModal() {
  $("bmkModal").hidden = true;
}

$("bmkBtn").addEventListener("click", () => {
  closeSidebar();
  openBmkModal();
});
$("bmkCloseBtn").addEventListener("click", closeBmkModal);
$("bmkModal").addEventListener("click", (e) => {
  if (e.target === $("bmkModal")) closeBmkModal();
});
$("bmkLink").addEventListener("click", (e) => e.preventDefault()); // アプリ内では実行させない（ドラッグ登録用）
$("bmkCopyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(bmkCode());
    showToast("ブックマークレットのコードをコピーしました");
  } catch {
    showToast("コピーできませんでした。ボタンをブックマークバーへ直接ドラッグしてください");
  }
});

/* ---------- ドラッグ＆ドロップでリンク追加 ---------- */

let dragDepth = 0;

function dragHasLink(e) {
  const types = e.dataTransfer && e.dataTransfer.types;
  if (!types) return false;
  const list = [...types];
  if (list.includes("Files")) return false; // ファイルはインポートボタンから
  return list.includes("text/uri-list") || list.includes("text/plain");
}

document.addEventListener("dragenter", (e) => {
  dragDepth++;
  if (!dragHasLink(e)) return;
  e.preventDefault();
  $("dropOverlay").hidden = false;
});

document.addEventListener("dragover", (e) => {
  if (!dragHasLink(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

document.addEventListener("dragleave", () => {
  if (dragDepth > 0) dragDepth--;
  if (!dragDepth) $("dropOverlay").hidden = true;
});

document.addEventListener("drop", (e) => {
  dragDepth = 0;
  $("dropOverlay").hidden = true;
  if (!dragHasLink(e)) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  const uri = (dt.getData("text/uri-list") || "").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  const text = dt.getData("text/plain") || "";
  const url = uri || (text.match(/https?:\/\/\S+/) || [])[0] || "";
  if (!/^https?:/i.test(url)) {
    showToast("ドロップからURLが見つかりませんでした");
    return;
  }
  let title = "";
  const html = dt.getData("text/html");
  if (html) {
    const link = new DOMParser().parseFromString(html, "text/html").querySelector("a");
    if (link) title = (link.textContent || "").trim();
  }
  const plain = text.trim();
  if (!title && plain && plain !== url && !/^https?:\/\/\S+$/i.test(plain)) title = plain;
  openLinkModal(null, { url, title });
  showToast("ドロップしたリンクを追加します");
});

/* ---------- 他タブ・PWAウィンドウとの同期 ---------- */

window.addEventListener("storage", (e) => {
  if (e.key !== LinkShelfStore.STORAGE_KEY) return;
  // 別タブが保存した内容を読み直す。listeners は呼ばれないので自動アップロードは走らない
  store.refresh();
  render();
});

/* ---------- init ---------- */

function render() {
  renderSidebar();
  renderCards();
}

render();
handleShareTarget();
autoSyncStartup();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
