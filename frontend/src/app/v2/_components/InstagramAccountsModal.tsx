"use client";

import * as React from "react";
import { GlassCard } from "./ui/GlassCard";
import { GradientButton } from "./ui/GradientButton";
import { IconInstagram } from "./ui/Icons";
import { useAuth } from "@/contexts/AuthContext";

type IgAccount = {
  accountId: string;
  label: string;
  igUserId: string;
  pageId: string;
};

export function InstagramAccountsModal({
  isOpen,
  onClose,
  showToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, kind?: "error" | "info") => void;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [accounts, setAccounts] = React.useState<IgAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = React.useState<string | null>(null);
  const [rememberMe, setRememberMe] = React.useState(true);

  const loadAccounts = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/accounts", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") {
        throw new Error(data?.message || "Failed to load Instagram accounts");
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setActiveAccountId(typeof data.activeAccountId === "string" ? data.activeAccountId : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, user]);

  React.useEffect(() => {
    if (!isOpen) return;
    loadAccounts();
  }, [isOpen, loadAccounts]);

  const handleSelect = async (accountId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") throw new Error(data?.message || "Failed to select account");
      showToast("Instagram conectado", "info");
      await loadAccounts();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleForget = async (accountId: string) => {
    if (!user) return;
    if (!confirm("¿Olvidar esta cuenta de Instagram?")) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/forget", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") throw new Error(data?.message || "Failed to forget account");
      showToast("Cuenta olvidada", "info");
      await loadAccounts();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/connect-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          remember: rememberMe,
          returnTo: typeof window !== "undefined" ? `${window.location.origin}/v2` : "/v2",
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success" || typeof data.connectUrl !== "string") {
        throw new Error(data?.message || "Failed to start Instagram connect");
      }
      window.location.href = data.connectUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const activeKind =
    typeof activeAccountId === "string"
      ? activeAccountId.startsWith("acc:")
        ? "acc"
        : activeAccountId.startsWith("sess:")
          ? "sess"
          : null
      : null;
  const activeAccId = activeKind === "acc" ? activeAccountId!.slice(4) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[560px]">
        <GlassCard className="p-6 sm:p-8">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-900/60 hover:text-slate-900 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-white/70 border border-white/70 shadow-[0_12px_35px_rgba(0,0,0,0.08)] flex items-center justify-center">
              <IconInstagram className="text-slate-900" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Instagram</h2>
              <p className="mt-1 text-sm text-slate-700">Elegí una cuenta guardada o agregá una nueva.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {accounts.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white/55 border border-white/70 text-slate-700 text-sm">
                No tenés cuentas guardadas todavía.
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((a) => {
                  const isActive = activeAccId === a.accountId;
                  return (
                    <div
                      key={a.accountId}
                      className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/55 border border-white/70 shadow-[0_12px_35px_rgba(0,0,0,0.06)]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{a.label}</p>
                        <p className="text-xs text-slate-600 truncate mt-0.5">{isActive ? "Activa" : "Guardada"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleForget(a.accountId)}
                          className="px-3 py-2 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-100/80 transition-colors border border-white/70 bg-white/60 disabled:opacity-50"
                        >
                          Olvidar
                        </button>
                        <button
                          type="button"
                          disabled={loading || isActive}
                          onClick={() => handleSelect(a.accountId)}
                          className={`px-3 py-2 rounded-full text-sm font-semibold transition-colors border border-white/70 disabled:opacity-50 ${
                            isActive ? "bg-slate-900 text-white" : "bg-white/60 text-slate-900 hover:bg-white/80"
                          }`}
                        >
                          {isActive ? "Seleccionada" : "Seleccionar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-800 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-400/60"
                disabled={loading}
              />
              Recordarme
            </label>

            <GradientButton variant="instagram" onClick={handleAddNew} disabled={loading || !user} className="px-6">
              <IconInstagram className="text-white" />
              <span className="text-base font-semibold">{loading ? "Cargando..." : "Agregar cuenta"}</span>
            </GradientButton>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}


