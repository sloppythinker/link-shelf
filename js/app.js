const store = LinkShelfStore.createStore(localStorage);

const state = {
  folder: "all", // "all" | "none" | folderId
  tags: [],
  query: "",
};

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
  sidebar: $("sidebar"),
  sidebarBackdrop: $("sidebarBackdrop"),
  linkModal: $("linkModal"),
  linkModalTitle: $("linkModalTitle"),
  linkForm: $("linkForm"),
  fieldUrl: $("fieldUrl"),
  fieldTitle: $("fieldTitle"),
  fieldFolder: $("fieldFolder"),
  fieldTagText: $("fieldTagText"),
  chipInput: $("chipInput"),
  tagSuggest: $("tagSuggest"),
  fieldNote: $("fieldNote"),
  folderModal: $("folderModal"),
  folderModalTitle: $("folderModalTitle"),
  folderForm: $("folderForm"),
  fieldFolderName: $("fieldFolderName"),
  toast: $("toast"),
};

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
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 2200);
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
      openFolderMenu(id, name);
    });
    li.appendChild(menuBtn);
  }

  li.addEventListener("click", () => {
    state.folder = id;
    closeSidebar();
    render();
  });
  return li;
}

const FOLDER_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" fill="currentColor" opacity=".8"/></svg>';
const ALL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".8"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".5"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".5"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".8"/></svg>';
const INBOX_ICON = '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 4h16v10h-5a3 3 0 0 1-6 0H4V4zm0 10v6h16v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function renderSidebar() {
  const data = store.getData();
  const counts = store.folderCounts();
  el.folderList.textContent = "";
  el.folderList.appendChild(folderItem({ id: "all", name: "すべて", icon: ALL_ICON, count: data.links.length }));
  el.folderList.appendChild(folderItem({ id: "none", name: "未分類", icon: INBOX_ICON, count: counts.get("none") || 0 }));
  [...data.folders]
    .sort((a, b) => a.order - b.order)
    .forEach((f) => {
      el.folderList.appendChild(
        folderItem({ id: f.id, name: f.name, icon: FOLDER_ICON, count: counts.get(f.id) || 0, showMenu: true })
      );
    });

  el.tagCloud.textContent = "";
  const tagCounts = store.tagCounts();
  if (!tagCounts.length) {
    const p = document.createElement("span");
    p.style.cssText = "font-size:12px;color:var(--text-sub);padding:0 4px;";
    p.textContent = "タグはまだありません";
    el.tagCloud.appendChild(p);
  }
  tagCounts.forEach(({ tag, count }) => {
    el.tagCloud.appendChild(
      makeTagChip(tag, {
        count,
        selected: state.tags.includes(tag),
        onClick: () => {
          state.tags = state.tags.includes(tag) ? state.tags.filter((t) => t !== tag) : [...state.tags, tag];
          render();
        },
      })
    );
  });
}

function openFolderMenu(id, name) {
  openFolderModal({ id, name });
}

/* ---------- cards ---------- */

function renderCards() {
  const data = store.getData();
  const links = store.filterLinks(state);
  el.cardGrid.textContent = "";

  const folderName =
    state.folder === "all" ? "すべてのリンク" :
    state.folder === "none" ? "未分類" :
    (data.folders.find((f) => f.id === state.folder) || {}).name || "すべてのリンク";
  el.currentView.textContent = folderName;
  el.countBadge.textContent = `${links.length}件`;

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

  if (!links.length) {
    el.emptyState.hidden = false;
    if (data.links.length === 0) {
      el.emptyTitle.textContent = "まだリンクがありません";
      el.emptyDesc.innerHTML = "「リンク追加」ボタンから、よく使うサイトを登録しましょう。<br>タグ（イラスト・素材集・tips など）とフォルダで整理できます。";
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

  const head = document.createElement("div");
  head.className = "card-head";

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
  const editBtn = document.createElement("button");
  editBtn.title = "編集";
  editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 20h4L20 8l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  editBtn.addEventListener("click", () => openLinkModal(link));
  const delBtn = document.createElement("button");
  delBtn.className = "del";
  delBtn.title = "削除";
  delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  delBtn.addEventListener("click", () => {
    if (window.confirm(`「${link.title}」を削除しますか？`)) {
      store.deleteLink(link.id);
      render();
      showToast("リンクを削除しました");
    }
  });
  actions.appendChild(editBtn);
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

/* ---------- link modal ---------- */

let editingId = null;
let editTags = [];

function openLinkModal(link) {
  editingId = link ? link.id : null;
  editTags = link ? [...link.tags] : [];
  el.linkModalTitle.textContent = link ? "リンクを編集" : "リンクを追加";
  el.fieldUrl.value = link ? link.url : "";
  el.fieldTitle.value = link ? (link.title === link.url ? "" : link.title) : "";
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
  el.fieldFolder.value = link && link.folderId ? link.folderId : "";
  if (!link && state.folder !== "all" && state.folder !== "none") {
    el.fieldFolder.value = state.folder;
  }

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
  const input = el.fieldTagText.value.trim().toLowerCase();
  el.tagSuggest.textContent = "";
  store
    .tagCounts()
    .filter(({ tag }) => !editTags.includes(tag) && (!input || tag.toLowerCase().includes(input)))
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

el.linkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addEditTag(el.fieldTagText.value); // 未確定の入力も拾う
  const payload = {
    url: el.fieldUrl.value.trim(),
    title: el.fieldTitle.value.trim(),
    tags: editTags,
    folderId: el.fieldFolder.value || null,
    note: el.fieldNote.value.trim(),
  };
  if (!payload.url) return;
  if (editingId) {
    store.updateLink(editingId, payload);
    showToast("リンクを更新しました");
  } else {
    store.addLink(payload);
    showToast("リンクを追加しました");
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

function closeFolderModal() {
  el.folderModal.hidden = true;
}

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
  showToast(editingFolderId ? "フォルダ名を変更しました" : "フォルダを作成しました");
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
    closeSidebar();
  }
});

/* ---------- search ---------- */

el.searchInput.addEventListener("input", () => {
  state.query = el.searchInput.value;
  render();
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

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let text;
  try {
    text = await file.text();
    JSON.parse(text);
  } catch {
    showToast("JSONファイルを読み込めませんでした");
    return;
  }
  const merge = window.confirm("インポート方法を選んでください。\n\nOK = 追記（既存のリンクに追加）\nキャンセル = 置き換え（既存データを消して読み込む）");
  if (!merge && !window.confirm("既存のデータをすべて置き換えます。本当によろしいですか？")) {
    return;
  }
  try {
    store.importJSON(text, merge ? "merge" : "replace");
    state.folder = "all";
    state.tags = [];
    render();
    showToast("インポートしました");
  } catch {
    showToast("インポートに失敗しました");
  }
});

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

/* ---------- init ---------- */

function render() {
  renderSidebar();
  renderCards();
}

render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
