"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { api, clearTokens, getSessionToken, uploadToR2 } from "@/lib/api";
import { invalidateMediaUrl, resolveMediaUrl } from "@/lib/mediaUrl";
import { breadcrumbs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AuthError, HealthInfo, IndexSummary, LockedError, SharedFolderInfo, StorageItem } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { CardAction, FileCard } from "./FileCard";
import { FolderPasswordModal, LockMode } from "./FolderPasswordModal";
import { Icon } from "./Icons";
import { ImportToSharedModal } from "./ImportToSharedModal";
import { JoinSharedModal } from "./JoinSharedModal";
import { Login } from "./Login";
import { MediaViewer } from "./MediaViewer";
import { MoveModal } from "./MoveModal";
import { PromptModal } from "./PromptModal";
import { SearchInput } from "./SearchInput";
import { SharedManageModal } from "./SharedManageModal";
import { NavKey, Sidebar } from "./Sidebar";
import { ViewTab } from "./NavTab";
import { toast } from "@/lib/toast";
import { UploadJob, UploadTray } from "./UploadTray";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortKey = "name" | "date" | "size";
const MEDIA_TYPES = new Set(["image", "video", "audio"]);

export function CloudApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  const [nav, setNav] = useState<NavKey>("library");
  const [prefix, setPrefix] = useState("");
  const [folders, setFolders] = useState<StorageItem[]>([]);
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("name");
  const [summary, setSummary] = useState<IndexSummary | null>(null);

  const [viewer, setViewer] = useState<{ items: StorageItem[]; index: number } | null>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  // modals
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameItem, setRenameItem] = useState<StorageItem | null>(null);
  const [moveItem, setMoveItem] = useState<StorageItem | null>(null);
  const [tagsItem, setTagsItem] = useState<StorageItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<StorageItem | null>(null);
  const [lockModal, setLockModal] = useState<{ mode: LockMode; folder: string } | null>(null);

  const [sharedFolders, setSharedFolders] = useState<SharedFolderInfo[]>([]);
  const [activeShare, setActiveShare] = useState<SharedFolderInfo | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [manageShare, setManageShare] = useState<SharedFolderInfo | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createShareOpen, setCreateShareOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------- auth bootstrap ----------------------------- //
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    setAuthed(Boolean(getSessionToken()));
  }, []);

  // persisted view preference
  useEffect(() => {
    const v = localStorage.getItem("gcc-view");
    if (v === "grid" || v === "list") setView(v);
  }, []);
  useEffect(() => {
    localStorage.setItem("gcc-view", view);
  }, [view]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  const loadShared = useCallback(() => {
    if (authed) api.listShared().then((r) => setSharedFolders(r.folders)).catch(() => {});
  }, [authed]);
  useEffect(() => loadShared(), [loadShared]);

  // ------------------------------- data loading ----------------------------- //
  const refresh = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      if (activeShare) {
        const res = await api.sharedList(activeShare.id, prefix);
        if (debouncedQuery) {
          const q = debouncedQuery.toLowerCase();
          setFolders(res.folders.filter((f) => f.name.toLowerCase().includes(q)));
          setFiles(res.files.filter((f) => f.name.toLowerCase().includes(q)));
        } else {
          setFolders(res.folders);
          setFiles(res.files);
        }
      } else if (nav === "library" && !debouncedQuery) {
        const res = await api.list(prefix);
        setFolders(res.folders);
        setFiles(res.files);
      } else {
        const params: { q?: string; type?: string; favorites?: boolean } = { q: debouncedQuery };
        if (nav === "favorites") params.favorites = true;
        else if (nav !== "library") params.type = nav;
        const res = await api.search(params);
        setFolders([]);
        setFiles(res.items);
      }
    } catch (e) {
      if (e instanceof AuthError) {
        handleLogout();
      } else if (e instanceof LockedError) {
        setFolders([]);
        setFiles([]);
        setLockModal({ mode: "unlock", folder: e.folder });
      } else {
        toast(e instanceof Error ? e.message : "Failed to load", "error");
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, nav, prefix, debouncedQuery, activeShare]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadSummary = useCallback(() => {
    if (authed) api.summary().then(setSummary).catch(() => {});
  }, [authed]);
  useEffect(() => loadSummary(), [loadSummary]);

  // ------------------------------- navigation ------------------------------- //
  const navigateTo = (key: NavKey) => {
    setActiveShare(null);
    setNav(key);
    setPrefix("");
    setQuery("");
  };

  const openShared = (share: SharedFolderInfo) => {
    setActiveShare(share);
    setNav("library");
    setPrefix("");
    setQuery("");
  };

  const openFolder = (folderKey: string) => {
    setQuery("");
    setPrefix(folderKey);
  };

  // -------------------------------- sorting --------------------------------- //
  const sortItems = useCallback(
    (list: StorageItem[]) => {
      const sorted = [...list];
      sorted.sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "size") return (b.size ?? 0) - (a.size ?? 0);
        const da = a.last_modified ? Date.parse(a.last_modified) : 0;
        const db = b.last_modified ? Date.parse(b.last_modified) : 0;
        return db - da;
      });
      return sorted;
    },
    [sort],
  );

  const sortedFolders = useMemo(() => sortItems(folders), [folders, sortItems]);
  const sortedFiles = useMemo(() => sortItems(files), [files, sortItems]);
  const mediaFiles = useMemo(() => sortedFiles.filter((f) => MEDIA_TYPES.has(f.type)), [sortedFiles]);
  const isEmpty = !loading && sortedFolders.length === 0 && sortedFiles.length === 0;

  // -------------------------------- actions --------------------------------- //
  function handleLogout() {
    clearTokens();
    void signOut({ redirect: false });
    setAuthed(false);
    setFolders([]);
    setFiles([]);
  }

  const updateFileLocal = (key: string, patch: Partial<StorageItem>) => {
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    setViewer((v) =>
      v ? { ...v, items: v.items.map((f) => (f.key === key ? { ...f, ...patch } : f)) } : v,
    );
  };

  const toggleFavorite = async (item: StorageItem) => {
    const next = !item.favorite;
    updateFileLocal(item.key, { favorite: next });
    try {
      await api.favorite(item.key, next);
    } catch {
      updateFileLocal(item.key, { favorite: !next });
      toast("Couldn't update favorite", "error");
    }
  };

  const downloadItem = async (item: StorageItem) => {
    try {
      const url = await resolveMediaUrl(item.key, true, activeShare?.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast("Download failed", "error");
    }
  };

  const onCardAction = (action: CardAction, item: StorageItem) => {
    switch (action) {
      case "open":
        if (item.type === "folder") openFolder(item.key);
        else if (MEDIA_TYPES.has(item.type)) {
          const idx = mediaFiles.findIndex((f) => f.key === item.key);
          if (idx >= 0) setViewer({ items: mediaFiles, index: idx });
        } else downloadItem(item);
        break;
      case "favorite":
        toggleFavorite(item);
        break;
      case "download":
        downloadItem(item);
        break;
      case "rename":
        setRenameItem(item);
        break;
      case "move":
        setMoveItem(item);
        break;
      case "tags":
        setTagsItem(item);
        break;
      case "delete":
        setDeleteItem(item);
        break;
      case "lock":
        setLockModal({ mode: "set", folder: item.key });
        break;
      case "removeLock":
        setLockModal({ mode: "remove", folder: item.key });
        break;
      case "unlock":
        setLockModal({ mode: "unlock", folder: item.key });
        break;
    }
  };

  // create / rename / move / delete / tags
  const createFolder = async (name: string) => {
    setNewFolderOpen(false);
    try {
      if (activeShare) {
        await api.sharedCreateFolder(activeShare.id, prefix, name);
      } else {
        await api.createFolder(prefix, name);
      }
      toast(`Folder “${name}” created`, "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create folder", "error");
    }
  };

  const doRename = async (newName: string) => {
    const item = renameItem;
    setRenameItem(null);
    if (!item) return;
    const parent = item.key.endsWith("/")
      ? item.key.replace(/[^/]+\/$/, "")
      : item.key.replace(/[^/]+$/, "");
    try {
      await api.move(item.key, parent, newName);
      invalidateMediaUrl(item.key);
      toast("Renamed", "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rename failed", "error");
    }
  };

  const doMove = async (destPrefix: string) => {
    const item = moveItem;
    setMoveItem(null);
    if (!item) return;
    try {
      await api.move(item.key, destPrefix);
      invalidateMediaUrl(item.key);
      toast("Moved", "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Move failed", "error");
    }
  };

  const doDelete = async () => {
    const item = deleteItem;
    setDeleteItem(null);
    if (!item) return;
    try {
      if (activeShare) {
        await api.sharedDelete(activeShare.id, item.key);
      } else {
        await api.delete(item.key);
        loadSummary();
      }
      invalidateMediaUrl(item.key, activeShare?.id);
      toast(
        activeShare
          ? `Removed “${item.name}” from shared folder (your original is safe)`
          : `Deleted “${item.name}”`,
        "success",
      );
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  const doTags = async (value: string) => {
    const item = tagsItem;
    setTagsItem(null);
    if (!item) return;
    const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const res = await api.setTags(item.key, tags);
      updateFileLocal(item.key, { tags: res.tags });
      toast("Tags updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update tags", "error");
    }
  };

  const onLockDone = (mode: LockMode) => {
    setLockModal(null);
    if (mode === "set") toast("Folder protected", "success");
    if (mode === "remove") toast("Protection removed", "success");
    refresh();
  };

  // -------------------------------- uploads --------------------------------- //
  const reindex = async () => {
    toast("Reindexing library…", "info");
    try {
      const res = await api.reindex();
      let visual = "";
      if (res.visual_indexed != null) {
        visual = ` · ${res.visual_indexed} photo${res.visual_indexed === 1 ? "" : "s"} visually tagged`;
        if (res.visual_pending) visual += ` (${res.visual_pending} remaining)`;
        else if (res.visual_failed) visual += ` · ${res.visual_failed} could not be tagged`;
      }
      toast(`Indexed ${res.indexed} files${visual}`, "success");
      loadSummary();
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reindex failed", "error");
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    for (const file of list) {
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const relativePath = relPath && relPath.includes("/") ? relPath : undefined;
      const uploadName = relativePath ? relativePath.split("/").pop()! : file.name;

      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((prev) => [...prev, { id, name: relativePath || file.name, progress: 0, status: "uploading" }]);
      try {
        if (activeShare) {
          const { key, url, content_type } = await api.sharedUploadUrl(
            activeShare.id,
            prefix,
            uploadName,
            file.type || undefined,
            relativePath,
          );
          let usedProxy = false;
          try {
            await uploadToR2(url, file, (pct) =>
              setUploads((prev) => prev.map((j) => (j.id === id ? { ...j, progress: pct } : j))),
              content_type,
            );
          } catch {
            await api.sharedUploadFile(activeShare.id, prefix, file, (pct) =>
              setUploads((prev) => prev.map((j) => (j.id === id ? { ...j, progress: pct } : j))),
              relativePath,
            );
            usedProxy = true;
          }
          if (!usedProxy) await api.sharedIndexOne(activeShare.id, key);
        } else {
          const { key, url, content_type } = await api.uploadUrl(
            prefix,
            uploadName,
            file.type || undefined,
            relativePath,
          );
          let usedProxy = false;
          try {
            await uploadToR2(url, file, (pct) =>
              setUploads((prev) => prev.map((j) => (j.id === id ? { ...j, progress: pct } : j))),
              content_type,
            );
          } catch {
            await api.uploadFile(prefix, file, (pct) =>
              setUploads((prev) => prev.map((j) => (j.id === id ? { ...j, progress: pct } : j))),
              relativePath,
            );
            usedProxy = true;
          }
          if (!usedProxy) await api.indexOne(key);
        }
        setUploads((prev) =>
          prev.map((j) => (j.id === id ? { ...j, progress: 100, status: "done" } : j)),
        );
      } catch (e) {
        setUploads((prev) =>
          prev.map((j) =>
            j.id === id
              ? { ...j, status: "error", error: e instanceof Error ? e.message : "Failed" }
              : j,
          ),
        );
      }
    }
    refresh();
    if (!activeShare) loadSummary();
  };

  const createSharedFolder = async (name: string) => {
    setCreateShareOpen(false);
    try {
      const { folder, code } = await api.createShared(name);
      toast(`Shared folder created. Join code: ${code}`, "success");
      loadShared();
      openShared(folder);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create shared folder", "error");
    }
  };

  // drag & drop
  const [dragging, setDragging] = useState(false);
  const canUpload = Boolean(activeShare || (nav === "library" && !debouncedQuery));

  // open a result from chat
  const openFromChat = async (key: string, type: string) => {
    setChatOpen(false);
    if (MEDIA_TYPES.has(type)) {
      try {
        await resolveMediaUrl(key);
      } catch {
        /* ignore */
      }
      const item: StorageItem = {
        key,
        name: key.split("/").pop() || key,
        type: type as StorageItem["type"],
        size: null,
        last_modified: null,
      };
      setViewer({ items: [item], index: 0 });
    } else {
      openFolder(key.replace(/[^/]+$/, ""));
    }
  };

  // --------------------------------- render --------------------------------- //
  if (authed === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="spinner h-8 w-8" />
      </div>
    );
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  const sectionTitle = activeShare
    ? activeShare.name
    : nav === "library"
      ? "Library"
      : nav === "image"
        ? "Photos"
        : nav === "video"
          ? "Videos"
          : nav === "audio"
            ? "Audio"
            : "Favorites";
  const crumbs = breadcrumbs(prefix);
  const showBreadcrumbs = Boolean(activeShare) || nav === "library";

  const sidebarProps = {
    active: nav,
    onNavigate: navigateTo,
    summary,
    sharedFolders,
    activeShareId: activeShare?.id ?? null,
    onOpenShare: openShared,
    onCreateShare: () => setCreateShareOpen(true),
    onJoinShare: () => setJoinOpen(true),
    onManageShare: setManageShare,
    onOpenChat: () => setChatOpen(true),
    onLogout: () => setLogoutOpen(true),
  };

  return (
    <div className="glow-page flex h-dvh overflow-hidden text-[var(--foreground)]">
      {/* Sidebar (desktop) */}
      <aside className="hidden shrink-0 lg:block">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Main column */}
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
      >
        {/* Topbar */}
        <header className="glow-header z-20 flex flex-col gap-3 px-4 py-3 safe-pt sm:px-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {showBreadcrumbs ? (
                <div className="flex flex-wrap items-center gap-0.5 text-sm">
                  {activeShare && (
                    <span className="label-caps mr-1 text-[10px] text-muted-foreground">Shared</span>
                  )}
                  <button
                    onClick={() => setPrefix("")}
                    className="btn-ghost flex items-center gap-1 rounded-lg px-2 py-1 font-medium"
                    style={{ color: prefix ? "var(--muted-foreground)" : "var(--foreground)" }}
                  >
                    <Icon.Home size={15} /> {activeShare ? activeShare.name : "Home"}
                  </button>
                  {crumbs.map((c, i) => (
                    <span key={c.prefix} className="flex items-center gap-0.5">
                      <Icon.ChevronRight size={14} className="text-muted-foreground" />
                      <button
                        onClick={() => setPrefix(c.prefix)}
                        className="btn-ghost truncate rounded-lg px-2 py-1 font-medium"
                        style={{ color: i === crumbs.length - 1 ? "var(--foreground)" : "var(--muted-foreground)" }}
                      >
                        {c.name}
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <h1 className="label-caps text-sm">{sectionTitle}</h1>
              )}
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <ViewControls
                view={view}
                setView={setView}
                sort={sort}
                setSort={setSort}
                onReindex={reindex}
              />
              {canUpload && (
                <>
                  {activeShare && (
                    <button onClick={() => setImportOpen(true)} className="btn btn-surface">
                      Import
                    </button>
                  )}
                  <button onClick={() => setNewFolderOpen(true)} className="btn btn-surface">
                    <Icon.Plus size={17} /> Folder
                  </button>
                  <button onClick={() => folderInputRef.current?.click()} className="btn btn-surface hidden md:inline-flex">
                    <Icon.Folder size={17} /> Upload folder
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary">
                    <Icon.Upload size={17} /> Upload
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search + mobile actions */}
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={
                activeShare
                  ? `Search in ${activeShare.name}…`
                  : nav === "library"
                    ? "Search your whole library…"
                    : `Search ${sectionTitle.toLowerCase()}…`
              }
            />
            <div className="flex items-center gap-2 sm:hidden">
              {canUpload && (
                <>
                  <button onClick={() => setNewFolderOpen(true)} className="btn btn-surface !p-2.5" aria-label="New folder">
                    <Icon.Plus size={18} />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary !p-2.5" aria-label="Upload">
                    <Icon.Upload size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 py-5 safe-pb sm:px-6">
          {loading ? (
            <SkeletonGrid view={view} />
          ) : isEmpty ? (
            <EmptyState
              nav={nav}
              query={debouncedQuery}
              canUpload={canUpload}
              onUpload={() => fileInputRef.current?.click()}
            />
          ) : view === "grid" ? (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {[...sortedFolders, ...sortedFiles].map((item) => (
                <FileCard
                  key={item.key}
                  item={item}
                  view="grid"
                  onAction={onCardAction}
                  variant={activeShare ? "shared" : "personal"}
                  shareId={activeShare?.id}
                />
              ))}
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-0.5">
              {[...sortedFolders, ...sortedFiles].map((item) => (
                <FileCard
                  key={item.key}
                  item={item}
                  view="list"
                  onAction={onCardAction}
                  variant={activeShare ? "shared" : "personal"}
                  shareId={activeShare?.id}
                />
              ))}
            </div>
          )}
        </main>

        {/* Drag overlay */}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="glow-card flex flex-col items-center gap-3 border-2 border-dashed border-[var(--border-hover)] px-10 py-8">
              <Icon.Upload size={40} className="text-[var(--foreground)]" />
              <p className="text-lg font-semibold">Drop to upload</p>
              <p className="text-sm text-muted-foreground">to /{prefix || "Home"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Overlays */}
      {viewer && (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          onClose={() => setViewer(null)}
          onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onFavorite={toggleFavorite}
          onDelete={(item) => {
            setViewer(null);
            setDeleteItem(item);
          }}
          aiEnabled={Boolean(health?.openai_configured) && !activeShare}
          shareId={activeShare?.id}
        />
      )}

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        aiEnabled={Boolean(health?.openai_configured)}
        onOpenResult={openFromChat}
      />

      <UploadTray jobs={uploads} onClear={() => setUploads([])} />

      <PromptModal
        open={newFolderOpen}
        title="New folder"
        label="Folder name"
        placeholder="e.g. Vacation 2026"
        confirmLabel="Create"
        onCancel={() => setNewFolderOpen(false)}
        onConfirm={createFolder}
      />
      <PromptModal
        open={Boolean(renameItem)}
        title="Rename"
        label="New name"
        initialValue={renameItem?.name ?? ""}
        confirmLabel="Rename"
        onCancel={() => setRenameItem(null)}
        onConfirm={doRename}
      />
      <PromptModal
        open={Boolean(tagsItem)}
        title="Edit tags"
        label="Comma-separated tags"
        placeholder="beach, sunset, 2026"
        initialValue={(tagsItem?.tags ?? []).join(", ")}
        confirmLabel="Save tags"
        onCancel={() => setTagsItem(null)}
        onConfirm={doTags}
      />
      <MoveModal open={Boolean(moveItem)} item={moveItem} onClose={() => setMoveItem(null)} onMove={doMove} />
      <ConfirmDialog
        open={logoutOpen}
        title="Sign out?"
        message="You will need to sign in again to access your library."
        confirmLabel="Sign out"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false);
          handleLogout();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteItem)}
        title={`Delete ${deleteItem?.type === "folder" ? "folder" : "file"}?`}
        message={
          activeShare
            ? deleteItem?.type === "folder"
              ? `“${deleteItem?.name}” will be removed from the shared folder only. Members' personal copies are not affected.`
              : `“${deleteItem?.name}” will be removed from the shared folder. The original in your library stays safe.`
            : deleteItem?.type === "folder"
              ? `“${deleteItem?.name}” and everything inside it will be permanently deleted.`
              : `“${deleteItem?.name}” will be permanently deleted.`
        }
        onCancel={() => setDeleteItem(null)}
        onConfirm={doDelete}
      />
      <FolderPasswordModal
        open={Boolean(lockModal)}
        mode={lockModal?.mode ?? "unlock"}
        folder={lockModal?.folder ?? ""}
        onClose={() => setLockModal(null)}
        onDone={onLockDone}
      />
      <JoinSharedModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={loadShared} />
      <SharedManageModal
        open={Boolean(manageShare)}
        share={manageShare}
        onClose={() => setManageShare(null)}
        onDeleted={(id) => {
          if (activeShare?.id === id) {
            setActiveShare(null);
            setPrefix("");
          }
          loadShared();
        }}
      />
      <ImportToSharedModal
        open={importOpen}
        shareId={activeShare?.id ?? ""}
        destinationPrefix={prefix}
        onClose={() => setImportOpen(false)}
        onDone={refresh}
      />
      <PromptModal
        open={createShareOpen}
        title="Host shared folder"
        label="Folder name"
        placeholder="e.g. Team photos"
        confirmLabel="Create"
        onCancel={() => setCreateShareOpen(false)}
        onConfirm={createSharedFolder}
      />
    </div>
  );
}

// ------------------------------ sub components ------------------------------ //
function ViewControls({
  view,
  setView,
  sort,
  setSort,
  onReindex,
}: {
  view: "grid" | "list";
  setView: (v: "grid" | "list") => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  onReindex: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onReindex}
        className="btn btn-surface flex h-8 w-8 shrink-0 items-center justify-center p-0 transition-all duration-150 ease-out"
        title="Reindex library"
        aria-label="Reindex"
      >
        <Icon.Refresh size={17} />
      </button>
      <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
        <SelectTrigger className="h-8 w-[132px]" aria-label="Sort by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" sideOffset={6} className="w-[132px]">
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="date">Newest</SelectItem>
          <SelectItem value="size">Largest</SelectItem>
        </SelectContent>
      </Select>
      <div className="view-toggle">
        <ViewTab
          active={view === "grid"}
          onClick={() => setView("grid")}
          label="Grid view"
          icon={<Icon.Grid size={17} />}
        />
        <ViewTab
          active={view === "list"}
          onClick={() => setView("list")}
          label="List view"
          icon={<Icon.List size={17} />}
        />
      </div>
    </div>
  );
}

function SkeletonGrid({ view }: { view: "grid" | "list" }) {
  if (view === "list") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="skeleton h-11 w-11 rounded-lg" />
            <div className="flex-1">
              <div className="skeleton mb-2 h-3 w-1/3 rounded" />
              <div className="skeleton h-2.5 w-1/5 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton aspect-square w-full" />
          <div className="p-3">
            <div className="skeleton mb-2 h-3 w-2/3 rounded" />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  nav,
  query,
  canUpload,
  onUpload,
}: {
  nav: NavKey;
  query: string;
  canUpload: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
      <div
        className="mb-5 flex h-20 w-20 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)]"
      >
        {query ? <Icon.Search size={36} /> : <Icon.Cloud size={36} />}
      </div>
      <h2 className="text-lg font-semibold">
        {query ? "No results found" : nav === "favorites" ? "No favorites yet" : "Nothing here yet"}
      </h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {query
          ? `We couldn't find anything matching “${query}”.`
          : nav === "favorites"
            ? "Tap the star on any photo or video to save it here."
            : canUpload
              ? "Upload your photos, videos and audio to get started."
              : "Upload media from your Library to see it here."}
      </p>
      {!query && canUpload && (
        <button onClick={onUpload} className="btn btn-primary mt-5">
          <Icon.Upload size={17} /> Upload media
        </button>
      )}
    </div>
  );
}
