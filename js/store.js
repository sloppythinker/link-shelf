const LinkShelfStore = (() => {
  const STORAGE_KEY = "linkshelf-data";

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyData() {
    return { version: 1, folders: [], links: [] };
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
        .map((l) => ({
          id: String(l.id || uid()),
          url: l.url,
          title: typeof l.title === "string" && l.title ? l.title : l.url,
          tags: Array.isArray(l.tags)
            ? [...new Set(l.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()))]
            : [],
          folderId: folderIds.has(l.folderId) ? l.folderId : null,
          note: typeof l.note === "string" ? l.note : "",
          pinned: !!l.pinned,
          createdAt: typeof l.createdAt === "number" ? l.createdAt : Date.now(),
        }));
    }
    if (typeof raw.updatedAt === "number") data.updatedAt = raw.updatedAt;
    return data;
  }

  function createStore(storage) {
    let data;
    try {
      data = normalize(JSON.parse(storage.getItem(STORAGE_KEY)));
    } catch {
      data = emptyData();
    }

    function save() {
      data.updatedAt = Date.now();
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    return {
      getData() {
        return data;
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
        Object.assign(link, normalized, { id: link.id, createdAt: link.createdAt });
        save();
        return link;
      },

      deleteLink(id) {
        const before = data.links.length;
        data.links = data.links.filter((l) => l.id !== id);
        save();
        return data.links.length < before;
      },

      addFolder(name) {
        name = String(name || "").trim();
        if (!name) return null;
        if (data.folders.some((f) => f.name === name)) return null;
        const folder = { id: uid(), name, order: data.folders.length };
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
        const before = data.folders.length;
        data.folders = data.folders.filter((f) => f.id !== id);
        if (data.folders.length === before) return false;
        data.links.forEach((l) => {
          if (l.folderId === id) l.folderId = null;
        });
        save();
        return true;
      },

      // folder: "all" | "none" | folderId
      filterLinks({ folder = "all", tags = [], query = "" } = {}) {
        const q = query.trim().toLowerCase();
        return data.links.filter((l) => {
          if (folder === "none" && l.folderId !== null) return false;
          if (folder !== "all" && folder !== "none" && l.folderId !== folder) return false;
          if (tags.length && !tags.every((t) => l.tags.includes(t))) return false;
          if (q) {
            const haystack = [l.title, l.url, l.note, ...l.tags].join("\n").toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        });
      },

      tagCounts() {
        const counts = new Map();
        data.links.forEach((l) => l.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
        return [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"));
      },

      folderCounts() {
        const counts = new Map();
        data.links.forEach((l) => {
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
          data.links.push({
            id: uid(),
            url,
            title: (it.title || "").trim() || url,
            tags: [],
            folderId,
            note: "",
            pinned: false,
            createdAt: Date.now(),
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
        const incoming = normalize(typeof json === "string" ? JSON.parse(json) : json);
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
              idMap.set(f.id, nf.id);
            }
          });
          const existingUrls = new Set(data.links.map((l) => l.url));
          incoming.links.forEach((l) => {
            if (existingUrls.has(l.url)) return;
            data.links.push({ ...l, id: uid(), folderId: idMap.get(l.folderId) ?? null });
          });
        }
        save();
        return data;
      },
    };
  }

  return { createStore, normalize, STORAGE_KEY };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = LinkShelfStore;
}
