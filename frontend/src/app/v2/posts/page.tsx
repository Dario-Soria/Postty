"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "../_components/ui/TopBar";
import { IconComment, IconHeart, IconPlay, IconRefresh, IconShare } from "../_components/ui/Icons";

type PostKind = "image" | "video";
type PostStatus = "ready_to_upload" | "published" | "discarded" | "failed" | "generating" | "publishing";

type UserPost = {
  id: string;
  kind: PostKind;
  status: PostStatus;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  caption?: string | null;
  mediaUrl?: string | null;
  previewUrl?: string | null;
  instagramPermalink?: string | null;
  instagramMediaId?: string | null;
  error?: string | null;
};

type PostAnalytics = {
  likes?: number;
  comments?: number;
  viewsOrReach?: number;
  shares?: number;
  source?: { views: "views" | "reach" | "impressions" | null };
};

function formatStatusLabel(status: PostStatus): string {
  switch (status) {
    case "ready_to_upload":
      return "Listo para subir";
    case "published":
      return "Publicado";
    case "generating":
      return "Generando";
    case "publishing":
      return "Subiendo";
    case "failed":
      return "Falló";
    case "discarded":
      return "Descartado";
    default:
      return status;
  }
}

export default function MisPostsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [items, setItems] = React.useState<UserPost[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<UserPost | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [captionByPostId, setCaptionByPostId] = React.useState<Record<string, string>>({});
  const [captionLoadingByPostId, setCaptionLoadingByPostId] = React.useState<Record<string, boolean>>({});
  const [analyticsByMediaId, setAnalyticsByMediaId] = React.useState<Record<string, PostAnalytics>>(
    {}
  );

  const load = React.useCallback(async (): Promise<UserPost[]> => {
    if (!user) return [];
    setError(null);
    const token = await user.getIdToken();
    const res = await fetch("/api/posts", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || data?.status !== "success") {
      throw new Error(data?.message || "Failed to load posts");
    }
    const posts = Array.isArray(data.posts) ? (data.posts as UserPost[]) : [];
    setItems(posts);
    return posts;
  }, [user]);

  const loadAnalytics = React.useCallback(
    async (posts: UserPost[]) => {
      if (!user) return;
      const mediaIds = Array.from(
        new Set(
          posts
            .filter((p) => p.status === "published" && !!p.instagramMediaId)
            .map((p) => p.instagramMediaId!)
        )
      );

      if (mediaIds.length === 0) {
        setAnalyticsByMediaId({});
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/posts/analytics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaIds }),
        cache: "no-store",
      });

      const data = await res.json();
      if (!res.ok || data?.status !== "success") {
        throw new Error(data?.message || "Failed to load analytics");
      }

      const analytics =
        data?.analyticsByMediaId && typeof data.analyticsByMediaId === "object"
          ? (data.analyticsByMediaId as Record<string, PostAnalytics>)
          : {};
      setAnalyticsByMediaId(analytics);
    },
    [user]
  );

  const refreshAll = React.useCallback(async () => {
    const posts = await load();
    await loadAnalytics(posts);
  }, [load, loadAnalytics]);

  // Auto-refresh while any items are generating so the UI swaps to the ready preview quickly.
  React.useEffect(() => {
    if (!user) return;
    const hasGenerating = items.some((p) => p.status === "generating");
    if (!hasGenerating) return;
    let stopped = false;
    const t = window.setInterval(() => {
      if (stopped) return;
      load().catch(() => null);
    }, 4000);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [items, load, user]);

  React.useEffect(() => {
    if (!user) return;
    refreshAll().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [refreshAll, user]);

  // Auto-fill caption for reels that are ready to upload (prompt + original product image previewUrl).
  React.useEffect(() => {
    if (!user) return;
    if (!selected) return;
    if (!(selected.kind === "video" && selected.status === "ready_to_upload")) return;

    const postId = selected.id;
    const already = typeof captionByPostId[postId] === "string" && captionByPostId[postId].trim().length > 0;
    if (already) return;

    const basePrompt = (selected.prompt || "").trim();
    if (!basePrompt) return;

    const productImageUrl = (selected.previewUrl || "").trim();
    setCaptionLoadingByPostId((p) => ({ ...p, [postId]: true }));

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/caption", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            base_prompt: basePrompt,
            ...(productImageUrl ? { product_image_url: productImageUrl } : {}),
          }),
        });
        const data = await res.json();
        const nextCaption = typeof data?.caption?.text === "string" ? data.caption.text : "";
        if (nextCaption.trim().length === 0) return;
        setCaptionByPostId((p) => ({ ...p, [postId]: nextCaption }));
      } catch {
        // ignore; user can still type
      } finally {
        setCaptionLoadingByPostId((p) => ({ ...p, [postId]: false }));
      }
    })();
  }, [captionByPostId, selected, user]);

  const handleUpload = async (postId: string) => {
    if (!user) return;
    setBusyId(postId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/video/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId, caption: captionByPostId[postId] }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") {
        throw new Error(data?.message || "Upload failed");
      }
      await refreshAll();
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (postId: string) => {
    if (!user) return;
    const ok = window.confirm("¿Seguro que querés descartar este video? Esta acción no se puede deshacer.");
    if (!ok) return;
    setBusyId(postId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/video/discard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") {
        throw new Error(data?.message || "Discard failed");
      }
      setSelected(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[radial-gradient(1200px_circle_at_20%_-10%,#FCE3C8,transparent_60%),radial-gradient(1000px_circle_at_90%_0%,#EAD5FF,transparent_55%),radial-gradient(900px_circle_at_35%_95%,#BFE7FF,transparent_55%),linear-gradient(180deg,#FCE3C8_0%,#EAD5FF_45%,#BFE7FF_100%)] text-slate-900">
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-5 sm:py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] w-full bg-[radial-gradient(1200px_circle_at_20%_-10%,#FCE3C8,transparent_60%),radial-gradient(1000px_circle_at_90%_0%,#EAD5FF,transparent_55%),radial-gradient(900px_circle_at_35%_95%,#BFE7FF,transparent_55%),linear-gradient(180deg,#FCE3C8_0%,#EAD5FF_45%,#BFE7FF_100%)] text-slate-900">
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-5 sm:py-10">
          <TopBar
            onBack={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.push("/v2");
              }
            }}
          />
          <div className="mt-8 rounded-[28px] bg-white/55 border border-white/70 backdrop-blur-2xl shadow-[0_18px_55px_rgba(0,0,0,0.12)] p-6">
            <p className="text-lg font-semibold">Iniciá sesión para ver tus posts.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[radial-gradient(1200px_circle_at_20%_-10%,#FCE3C8,transparent_60%),radial-gradient(1000px_circle_at_90%_0%,#EAD5FF,transparent_55%),radial-gradient(900px_circle_at_35%_95%,#BFE7FF,transparent_55%),linear-gradient(180deg,#FCE3C8_0%,#EAD5FF_45%,#BFE7FF_100%)] text-slate-900">
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-5 sm:py-10">
        <TopBar
          onBack={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/v2");
            }
          }}
        />

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[34px] sm:text-[46px] font-black tracking-tight">Mis posts</h1>
            <p className="mt-1 text-slate-700 font-medium">Tus imágenes y reels generados</p>
          </div>
          <button
            type="button"
            onClick={() => refreshAll().catch((e) => setError(e instanceof Error ? e.message : "Error"))}
            className="h-11 px-4 rounded-2xl bg-white/70 border border-white/80 backdrop-blur-xl shadow-sm font-semibold text-slate-900 hover:bg-white/80 transition"
          >
            Actualizar
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-[24px] bg-rose-50/70 border border-rose-200/70 p-4 text-rose-700 font-medium">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {items.map((p) => {
            const isReady = p.kind === "video" && p.status === "ready_to_upload";
            const isPublished = p.status === "published" && !!p.instagramPermalink;
            const a = p.instagramMediaId ? analyticsByMediaId[p.instagramMediaId] : undefined;

            const fmt = (n?: number) =>
              typeof n === "number"
                ? new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n)
                : "—";

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (isPublished) {
                    window.open(p.instagramPermalink!, "_blank");
                    return;
                  }
                  setSelected(p);
                }}
                className="group relative rounded-[18px] overflow-hidden bg-white/35 border border-white/60 backdrop-blur-xl shadow-[0_14px_40px_rgba(0,0,0,0.10)] transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.12)] hover:-translate-y-1"
              >
                <div className="aspect-[9/16] w-full bg-slate-200/40">
                  {p.mediaUrl ? (
                    p.kind === "video" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video
                        src={p.mediaUrl}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.mediaUrl} alt={p.prompt} className="h-full w-full object-cover" />
                    )
                  ) : p.kind === "video" && p.status === "generating" && p.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.previewUrl} alt={p.prompt} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-600 text-sm font-semibold">
                      {formatStatusLabel(p.status)}
                    </div>
                  )}
                </div>

                {/* Subtle page-palette tint on hover (same feel as agent cards) */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#FCE3C8] via-[#EAD5FF] to-[#BFE7FF] opacity-0 group-hover:opacity-[0.08] transition-opacity duration-300 pointer-events-none" />

                <div className="absolute left-2 top-2 px-2 py-1 rounded-full bg-white/75 border border-white/80 text-[11px] font-bold text-slate-800">
                  {formatStatusLabel(p.status)}
                </div>

                {p.kind === "video" && p.status === "generating" ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/40 text-white border border-white/20 backdrop-blur-md">
                      <IconRefresh className="animate-spin" />
                      <span className="text-xs font-semibold">Generando</span>
                    </div>
                  </div>
                ) : null}

                {isReady ? (
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/55 to-transparent">
                    <div className="text-white text-xs font-semibold">Listo para subir</div>
                  </div>
                ) : null}

                {isPublished ? (
                  <div className="absolute inset-x-3 bottom-2 pointer-events-none">
                    <div className="rounded-xl bg-black/55 border border-white/20 backdrop-blur-md px-2.5 py-1.5 text-white">
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-1.5">
                          <IconHeart className="h-4 w-4" />
                          <span className="text-[10px] font-semibold tabular-nums">{fmt(a?.likes)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IconComment className="h-4 w-4" />
                          <span className="text-[10px] font-semibold tabular-nums">
                            {fmt(a?.comments)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IconPlay className="h-4 w-4" />
                          <span className="text-[10px] font-semibold tabular-nums">
                            {fmt(a?.viewsOrReach)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IconShare className="h-4 w-4" />
                          <span className="text-[10px] font-semibold tabular-nums">
                            {fmt(a?.shares)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            />
            <div className="relative w-full max-w-[880px] rounded-[28px] bg-white/85 border border-white/80 backdrop-blur-2xl shadow-[0_30px_100px_rgba(0,0,0,0.25)] overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200/60 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {selected.kind === "video" ? "Reel" : "Post"}
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{selected.prompt}</p>
                </div>
                <button
                  type="button"
                  className="h-10 px-4 rounded-2xl bg-white/70 border border-white/80 font-semibold text-slate-900 hover:bg-white/80 transition"
                  onClick={() => setSelected(null)}
                >
                  Cerrar
                </button>
              </div>

              <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl overflow-hidden bg-slate-100/60 border border-white/70">
                  {selected.mediaUrl ? (
                    selected.kind === "video" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={selected.mediaUrl} className="w-full h-auto" controls playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.mediaUrl} alt="preview" className="w-full h-auto" />
                    )
                  ) : (
                    <div className="p-6 text-slate-700 font-semibold">{formatStatusLabel(selected.status)}</div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl bg-white/60 border border-white/70 p-4">
                    <p className="text-sm font-bold text-slate-900">Estado</p>
                    <p className="mt-1 text-sm text-slate-700">{formatStatusLabel(selected.status)}</p>
                    {selected.error ? (
                      <p className="mt-2 text-sm text-rose-700 font-medium">{selected.error}</p>
                    ) : null}
                  </div>

                  {selected.kind === "video" && selected.status === "ready_to_upload" ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-white/60 border border-white/70 p-4">
                        <p className="text-sm font-bold text-slate-900">Caption</p>
                        <textarea
                          value={captionByPostId[selected.id] ?? ""}
                          onChange={(e) =>
                            setCaptionByPostId((p) => ({ ...p, [selected.id]: e.target.value }))
                          }
                          placeholder="Escribí el caption para tu reel…"
                          rows={5}
                          disabled={busyId === selected.id || !!captionLoadingByPostId[selected.id]}
                          className="mt-2 w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm resize-none"
                        />
                        {captionLoadingByPostId[selected.id] ? (
                          <div className="mt-2 text-xs text-slate-500 font-medium flex items-center gap-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-400" />
                            Generando caption…
                          </div>
                        ) : null}
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={busyId === selected.id}
                          onClick={() => handleUpload(selected.id)}
                          className="flex-1 h-11 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-60"
                        >
                          {busyId === selected.id ? "Subiendo..." : "Upload"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === selected.id}
                          onClick={() => handleDiscard(selected.id)}
                          className="flex-1 h-11 rounded-2xl bg-white/80 border border-slate-200 font-bold text-slate-900 hover:bg-white disabled:opacity-60"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selected.status === "published" && selected.instagramPermalink ? (
                    <button
                      type="button"
                      onClick={() => window.open(selected.instagramPermalink!, "_blank")}
                      className="w-full h-11 rounded-2xl bg-white/80 border border-slate-200 font-bold text-slate-900 hover:bg-white"
                    >
                      Ver en Instagram
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}


