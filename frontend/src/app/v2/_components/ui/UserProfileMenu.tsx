"use client";

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { IconInstagram } from "./Icons";
import { InstagramAccountsModal } from "../InstagramAccountsModal";

interface UserProfileMenuProps {
  onSignOut?: () => void;
}

export function UserProfileMenu({ onSignOut }: UserProfileMenuProps) {
  const { user, userProfile, signOut } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [igModalOpen, setIgModalOpen] = React.useState(false);
  const [igConnected, setIgConnected] = React.useState<boolean>(false);
  const [igLoading, setIgLoading] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; kind?: "error" | "info" } | null>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsOpen(false);
      onSignOut?.();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const showToast = React.useCallback((msg: string, kind?: "error" | "info") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshIgStatus = React.useCallback(async () => {
    if (!user) return;
    setIgLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/accounts", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") return;
      setIgConnected(Boolean(data.connected));
    } catch {
      // silent
    } finally {
      setIgLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (!isOpen) return;
    refreshIgStatus();
  }, [isOpen, refreshIgStatus]);

  const handleIgDisconnect = React.useCallback(async () => {
    if (!user) return;
    setIgLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/instagram/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || data?.status !== "success") throw new Error(data?.message || "Failed to disconnect");
      showToast("Instagram desconectado", "info");
      setIgConnected(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast(msg, "error");
    } finally {
      setIgLoading(false);
    }
  }, [showToast, user]);

  const displayName = user?.displayName || userProfile?.displayName || "Usuario";
  const photoURL = user?.photoURL || userProfile?.photoURL;
  const email = user?.email || userProfile?.email;

  // Get initials from display name or email
  const initials = React.useMemo(() => {
    if (displayName && displayName !== "Usuario") {
      const names = displayName.split(" ");
      if (names.length >= 2) {
        return `${names[0][0]}${names[1][0]}`.toUpperCase();
      }
      return displayName.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return "US";
  }, [displayName, email]);

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-white/70 border-2 border-white/80 shadow-[0_8px_25px_rgba(0,0,0,0.08)] backdrop-blur-xl hover:shadow-[0_12px_35px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-[1px] overflow-hidden flex items-center justify-center"
        aria-label="Abrir menú de usuario"
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center">
            <span className="text-white text-base font-bold">{initials}</span>
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] w-64 rounded-[20px] bg-white/90 backdrop-blur-2xl border border-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden z-50">
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-slate-200/50">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {displayName}
            </p>
            {email && (
              <p className="text-xs text-slate-600 truncate mt-0.5">{email}</p>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <MenuButton
              onClick={() => {
                setIsOpen(false);
                // Disabled for now
              }}
              disabled
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
            >
              Mis referencias
            </MenuButton>

            <MenuButton
              onClick={() => {
                setIsOpen(false);
                // Disabled for now
              }}
              disabled
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              }
            >
              Mi marca
            </MenuButton>

            <MenuButton
              onClick={() => {
                setIsOpen(false);
                router.push("/v2/posts");
              }}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            >
              Mis posts
            </MenuButton>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-200/50 my-1" />

          {/* Instagram */}
          <div className="py-2">
            <button
              type="button"
              onClick={() => {
                if (!user) return;
                setIgModalOpen(true);
                setIsOpen(false);
              }}
              className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-sm font-medium transition-colors text-slate-700 hover:bg-slate-100/80"
              disabled={!user}
            >
              <span className="flex items-center gap-3 min-w-0">
                <IconInstagram className="w-5 h-5" />
                <span className="truncate">Instagram</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${igConnected ? "text-emerald-600" : "text-slate-500"}`}>
                  {igLoading ? "..." : igConnected ? "Conectado" : "No conectado"}
                </span>
                {igConnected ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleIgDisconnect();
                    }}
                    disabled={igLoading}
                    className="px-2.5 py-1.5 rounded-full text-xs font-semibold border border-white/70 bg-white/60 hover:bg-white/80 text-slate-900 disabled:opacity-50"
                  >
                    Desconectar
                  </button>
                ) : (
                  <span className="px-2.5 py-1.5 rounded-full text-xs font-semibold border border-white/70 bg-white/60 text-slate-900">
                    Conectar
                  </span>
                )}
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-200/50 my-1" />

          {/* Sign Out */}
          <div className="py-2">
            <MenuButton
              onClick={handleSignOut}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              }
              variant="danger"
            >
              Cerrar sesión
            </MenuButton>
          </div>
        </div>
      )}

      <InstagramAccountsModal
        isOpen={igModalOpen}
        onClose={() => {
          setIgModalOpen(false);
          refreshIgStatus();
        }}
        showToast={showToast}
      />

      {toast ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[60]">
          <div
            className={`px-3 py-2 rounded-2xl text-sm font-semibold shadow-[0_18px_55px_rgba(0,0,0,0.18)] border border-white/70 backdrop-blur-2xl ${
              toast.kind === "error" ? "bg-rose-50/90 text-rose-800" : "bg-white/90 text-slate-900"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface MenuButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "danger";
  disabled?: boolean;
}

function MenuButton({ onClick, icon, children, variant = "default", disabled = false }: MenuButtonProps) {
  const colorClasses =
    variant === "danger"
      ? "text-rose-600 hover:bg-rose-50/80"
      : "text-slate-700 hover:bg-slate-100/80";
  const disabledClasses = disabled
    ? "opacity-45 cursor-not-allowed hover:bg-transparent"
    : "";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium transition-colors ${colorClasses} ${disabledClasses}`}
      disabled={disabled}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

