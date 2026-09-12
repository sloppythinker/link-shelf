const LinkShelfStore = (() => {
  const STORAGE_KEY = "linkshelf-data";
  const TOMBSTONE_TTL = 180 * 24 * 60 * 60 * 1000; // 削除記録は180日で掃除

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // 検索・照合用の正規化: NFKC + 小文字化 + カタカナ→ひらがな
  function normText(s) {
    return String(s)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function emptyData() {
    return { version: 2, folders: [], links: [], tombstones: { links: {}, folders: {} } };
  }

  // tombstones: { links: { linkId: 削除時刻 }, folders: { フォルダ名: 削除時刻 } }
  function normalizeTombstones(raw) {
    const out = { links: {}, folders: {} };
    if (!raw || typeof raw !== "object") return out;
    const cutoff = Date.now() - TOMBSTONE_TTL;
    ["links", "folders"].forEach((kind) => {
      const src = raw[kind];
      if (!src || typeof src !== "object") return;
      Object.entries(src).forEach(([key, at]) => {
        if (typeof at === "number" && at > cutoff) out[kind][key] = at;
      });
    });
    return out;
  }

  function normalize(raw) {
    const data = emptyData();
    if (!raw || typeof raw !== "object") return data;
    if (Array.isArray(raw.folders)) {
      data.folders = raw.folders
        .filter((f) => f && typeof f.name === "string")
        .map((f, i) => ({
          id: String(f.id || uid()),
          name: f.name,
          order: typeof f.order === "number" ? f.order : i,
        }));
    }
    const folderIds = new Set(data.folders.map((f) => f.id));
    if (Array.isArray(raw.links)) {
      data.links = raw.links
        .filter((l) => l && typeof l.url === "string" && l.url)
        .map((l) => {
          const createdAt = typeof l.createdAt === "number" ? l.createdAt : Date.now();
          return {
            id: String(l.id || uid()),
            url: l.url,
            title: typeof l.title === "string" && l.title ? l.title : l.url,
            tags: Array.isArray(l.tags)
              ? [...new Set(l.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()))]
              : [],
            folderId: folderIds.has(l.folderId) ? l.folderId : null,
            note: typeof l.note === "string" ? l.note : "",
            pinned: !!l.pinned,
            archived: !!l.archived,
            clicks: typeof l.clicks === "number" ? l.clicks : 0,
            createdAt,
            updatedAt: typeof l.updatedAt === "number" ? l.updatedAt : createdAt,
          };
        });
    }
    data.tombstones = normalizeTombstones(raw.tombstones);
    if (typeof raw.updatedAt === "number") data.updatedAt = raw.updatedAt;
    return data;
  }

  function createStore(storage, onSaveError = () => {}) {
    let data;

    function load() {
      try {
        return normalize(JSON.parse(storage.getItem(STORAGE_KEY)));
      } catch {
        return emptyData();
      }
    }

    data = load();
    let committed = JSON.stringify(data);

    const listeners = [];

    function save() {
      data.updatedAt = Date.now();
      try {
        const next = JSON.stringify(data);
        storage.setItem(STORAGE_KEY, next);
        committed = next;
      } catch (cause) {
        data = JSON.parse(committed);
        const error = new Error("保存できませんでした。空き容量・ブラウザの保存設定を確認してください", { cause });
        error.name = "StorageWriteError";
        onSaveError(error);
        throw error;
      }
      listeners.forEach((fn) => fn());
    }

    return {
      getData() {
        return data;
      },

      // 他タブが書いた localStorage を読み直す（storage イベント用。listeners には通知しない）
      refresh() {
        data = load();
        committed = JSON.stringify(data);
      },

      previewImport(json, mode = "replace") {
        const sandbox = createStore({ getItem: () => JSON.stringify(data), setItem() {} });
        const after = sandbox.importJSON(json, mode);
        const urls = new Set(data.links.map((l) => l.url));
        return {
          before: data.links.length,
          after: after.links.length,
          added: after.links.filter((l) => !urls.has(l.url)).length,
          folders: after.folders.length,
        };
      },

      addLink({ url, title, tags = [], folderId = null, note = "" }) {
        const link = normalize({ links: [{ url, title, tags, folderId, note }], folders: data.folders }).links[0];
        if (!link) return null;
        data.links.unshift(link);
        save();
        return link;
      },

      updateLink(id, patch) {
        const link = data.links.find((l) => l.id === id);
        if (!link) return null;
        const merged = { ...link, ...patch, id: link.id, createdAt: link.createdAt };
        const normalized = normalize({ links: [merged], folders: data.folders }).links[0];
        if (!normalized) return null;
        Object.assign(link, normalized, { id: link.id, createdAt: link.createdAt, updatedAt: Date.now() });
        save();
        return link;
      },

      deleteLink(id) {
        const before = data.links.length;
        data.links = data.links.filter((l) => l.id !== id);
        if (data.links.length === before) return false;
        data.tombstones.links[id] = Date.now();
        save();
        return true;
      },

      // 削除の取り消し用: id/createdAt/clicks を保ったまま復元
      restoreLinks(links) {
        const normalized = normalize({ links, folders: data.folders }).links;
        let restored = 0;
        normalized.forEach((l) => {
          if (data.links.some((x) => x.id === l.id)) return;
          l.updatedAt = Date.now(); // 復元は削除記録より新しい編集として扱う
          delete data.tombstones.links[l.id];
          data.links.unshift(l);
          restored++;
        });
        save();
        return restored;
      },

      recordClick(id) {
        const link = data.links.find((l) => l.id === id);
        if (!link) return;
        link.clicks = (link.clicks || 0) + 1;
        save();
      },

      renameTag(oldTag, newTag) {
        oldTag = String(oldTag || "").trim();
        newTag = String(newTag || "").trim().replace(/,/g, "");
        if (!oldTag || !newTag) return null;
        if (oldTag === newTag) return { renamed: 0, merged: false };
        const merged = oldTag !== newTag && data.links.some((l) => l.tags.includes(newTag));
        let renamed = 0;
        data.links.forEach((l) => {
          const i = l.tags.indexOf(oldTag);
          if (i === -1) return;
          if (l.tags.includes(newTag)) l.tags.splice(i, 1);
          else l.tags[i] = newTag;
          l.updatedAt = Date.now();
          renamed++;
        });
        if (renamed) save();
        return { renamed, merged };
      },

      deleteTag(tag) {
        let removed = 0;
        data.links.forEach((l) => {
          if (!l.tags.includes(tag)) return;
          l.tags = l.tags.filter((t) => t !== tag);
          l.updatedAt = Date.now();
          removed++;
        });
        if (removed) save();
        return removed;
      },

      duplicateUrls() {
        const counts = new Map();
        data.links.forEach((l) => counts.set(l.url, (counts.get(l.url) || 0) + 1));
        return new Set([...counts].filter(([, c]) => c > 1).map(([u]) => u));
      },

      subscribe(fn) {
        listeners.push(fn);
      },

      addFolder(name) {
        name = String(name || "").trim();
        if (!name) return null;
        if (data.folders.some((f) => f.name === name)) return null;
        const folder = { id: uid(), name, order: data.folders.length };
        delete data.tombstones.folders[name];
        data.folders.push(folder);
        save();
        return folder;
      },

      renameFolder(id, name) {
        name = String(name || "").trim();
        const folder = data.folders.find((f) => f.id === id);
        if (!folder || !name) return null;
        if (data.folders.some((f) => f.id !== id && f.name === name)) return null;
        folder.name = name;
        save();
        return folder;
      },

      deleteFolder(id) {
        const folder = data.folders.find((f) => f.id === id);
        if (!folder) return false;
        data.tombstones.folders[folder.name] = Date.now();
        data.folders = data.folders.filter((f) => f.id !== id);
        data.links.forEach((l) => {
          if (l.folderId === id) l.folderId = null;
        });
        save();
        return true;
      },

      // folder: "all" | "none" | "inbox"(フォルダ・タグなし) | "archived" | folderId
      // アーカイブ済みは "archived" ビュー以外に出さない
      filterLinks({ folder = "all", tags = [], query = "" } = {}) {
        const q = normText(query.trim());
        const special = folder === "all" || folder === "none" || folder === "inbox" || folder === "archived";
        return data.links.filter((l) => {
          if (folder === "archived") {
            if (!l.archived) return false;
          } else if (l.archived) {
            return false;
          }
          if (folder === "none" && l.folderId !== null) return false;
          if (folder === "inbox" && (l.folderId !== null || l.tags.length)) return false;
          if (!special && l.folderId !== folder) return false;
          if (tags.length && !tags.every((t) => l.tags.includes(t))) return false;
          if (q) {
            const haystack = normText([l.title, l.url, l.note, ...l.tags].join("\n"));
            if (!haystack.includes(q)) return false;
          }
          return true;
        });
      },

      tagCounts() {
        const counts = new Map();
        data.links.forEach((l) => {
          if (l.archived) return;
          l.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
        });
        return [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"));
      },

      folderCounts() {
        const counts = new Map();
        data.links.forEach((l) => {
          if (l.archived) return;
          const key = l.folderId === null ? "none" : l.folderId;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
      },

      // items: [{ url, title, folderName }] フォルダは名前で自動作成、URL重複はスキップ
      bulkAdd(items) {
        let added = 0;
        let skipped = 0;
        const urls = new Set(data.links.map((l) => l.url));
        for (const it of items) {
          const url = typeof it.url === "string" ? it.url.trim() : "";
          if (!url || urls.has(url)) {
            skipped++;
            continue;
          }
          let folderId = null;
          if (it.folderName) {
            let f = data.folders.find((x) => x.name === it.folderName);
            if (!f) {
              f = { id: uid(), name: it.folderName, order: data.folders.length };
              data.folders.push(f);
            }
            folderId = f.id;
          }
          const now = Date.now();
          data.links.push({
            id: uid(),
            url,
            title: (it.title || "").trim() || url,
            tags: [],
            folderId,
            note: "",
            pinned: false,
            archived: false,
            clicks: 0,
            createdAt: now,
            updatedAt: now,
          });
          urls.add(url);
          added++;
        }
        save();
        return { added, skipped };
      },

      exportJSON() {
        return JSON.stringify(data, null, 2);
      },

      importJSON(json, mode = "replace") {
        const raw = typeof json === "string" ? JSON.parse(json) : json;
        if (!raw || !Array.isArray(raw.links) ||
            raw.links.some((l) => !l || typeof l.url !== "string" || !l.url.trim()) ||
            (raw.folders !== undefined && (!Array.isArray(raw.folders) ||
              raw.folders.some((f) => !f || typeof f.name !== "string")))) {
          throw new Error("リンク棚のバックアップ形式ではありません");
        }
        const incoming = normalize(raw);
        if (mode === "replace") {
          data = incoming;
        } else {
          const nameToId = new Map(data.folders.map((f) => [f.name, f.id]));
          const idMap = new Map();
          incoming.folders.forEach((f) => {
            if (nameToId.has(f.name)) {
              idMap.set(f.id, nameToId.get(f.name));
            } else {
              const nf = { id: uid(), name: f.name, order: data.folders.length };
              data.folders.push(nf);
              nameToId.set(f.name, nf.id);
              idMap.set(f.id, nf.id);
            }
          });
          const existingUrls = new Set(data.links.map((l) => l.url));
          incoming.links.forEach((l) => {
            if (existingUrls.has(l.url)) return;
            data.links.push({ ...l, id: uid(), folderId: idMap.get(l.folderId) ?? null });
            existingUrls.add(l.url);
          });
        }
        save();
        return data;
      },

      // Gist同期用のマージ取り込み。リンクごとの updatedAt が新しい方を採用し、
      // 削除はトゥームストーンで伝播する。変更がなければ save しない。
      // 戻り値: { added, updated, removed, changed }
      mergeRemote(json) {
        const remote = normalize(typeof json === "string" ? JSON.parse(json) : json);
        let added = 0;
        let updated = 0;
        let removed = 0;
        let changed = false;

        // フォルダは名前でマージ
        const idMap = new Map(); // remoteのfolderId → ローカルのfolderId
        remote.folders.forEach((rf) => {
          const lf = data.folders.find((f) => f.name === rf.name);
          if (lf) {
            idMap.set(rf.id, lf.id);
            return;
          }
          const tomb = data.tombstones.folders[rf.name];
          if (tomb) {
            // ローカルで削除済みのフォルダは、削除後に更新されたリンクが残る場合のみ復活
            const alive = remote.links.some((l) => l.folderId === rf.id && l.updatedAt > tomb);
            if (!alive) {
              idMap.set(rf.id, null);
              return;
            }
            delete data.tombstones.folders[rf.name];
          }
          const nf = { id: uid(), name: rf.name, order: data.folders.length };
          data.folders.push(nf);
          idMap.set(rf.id, nf.id);
          changed = true;
        });

        const byId = new Map(data.links.map((l) => [l.id, l]));
        const byUrl = new Map(data.links.map((l) => [l.url, l]));
        remote.links.forEach((rl) => {
          const tomb = data.tombstones.links[rl.id];
          if (tomb && tomb >= rl.updatedAt) return; // ローカルで削除済み
          const mappedFolder = rl.folderId === null ? null : idMap.get(rl.folderId) ?? null;
          const target = byId.get(rl.id) || byUrl.get(rl.url);
          if (target) {
            if (rl.updatedAt > target.updatedAt) {
              Object.assign(target, {
                url: rl.url,
                title: rl.title,
                tags: [...rl.tags],
                note: rl.note,
                pinned: rl.pinned,
                archived: rl.archived,
                folderId: mappedFolder,
                updatedAt: rl.updatedAt,
              });
              updated++;
              changed = true;
            }
            if (rl.clicks > target.clicks) {
              target.clicks = rl.clicks;
              changed = true;
            }
          } else {
            const nl = { ...rl, tags: [...rl.tags], folderId: mappedFolder };
            data.links.push(nl);
            byId.set(nl.id, nl);
            byUrl.set(nl.url, nl);
            if (tomb) delete data.tombstones.links[rl.id];
            added++;
            changed = true;
          }
        });

        // リモートの削除記録を反映（ローカル側がその後に編集していれば残す）
        Object.entries(remote.tombstones.links).forEach(([id, at]) => {
          const l = byId.get(id);
          if (!l) {
            if ((data.tombstones.links[id] || 0) < at) {
              data.tombstones.links[id] = at;
              changed = true;
            }
            return;
          }
          if (l.updatedAt <= at) {
            data.links = data.links.filter((x) => x.id !== id);
            byId.delete(id);
            data.tombstones.links[id] = Math.max(at, data.tombstones.links[id] || 0);
            removed++;
            changed = true;
          }
        });
        Object.entries(remote.tombstones.folders).forEach(([name, at]) => {
          const f = data.folders.find((x) => x.name === name);
          if (f) {
            const alive = data.links.some((l) => l.folderId === f.id && l.updatedAt > at);
            if (alive) return;
            data.folders = data.folders.filter((x) => x.id !== f.id);
            data.links.forEach((l) => {
              if (l.folderId === f.id) l.folderId = null;
            });
            data.tombstones.folders[name] = Math.max(at, data.tombstones.folders[name] || 0);
            changed = true;
          } else if ((data.tombstones.folders[name] || 0) < at) {
            data.tombstones.folders[name] = at;
            changed = true;
          }
        });

        if (changed) save();
        return { added, updated, removed, changed };
      },
    };
  }

  return { createStore, normalize, normText, STORAGE_KEY };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = LinkShelfStore;
}
