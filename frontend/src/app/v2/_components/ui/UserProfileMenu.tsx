"use client";

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfileMenuProps {
  onSignOut?: () => void;
}

export function UserProfileMenu({ onSignOut }: UserProfileMenuProps) {
  const { user, userProfile, signOut } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

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
                // TODO: Navigate to references page
                console.log("Navigate to My References");
              }}
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
                // TODO: Navigate to brand page
                console.log("Navigate to My Brand");
              }}
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
                // TODO: Navigate to posts page
                console.log("Navigate to My Posts");
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
    </div>
  );
}

interface MenuButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "danger";
}

function MenuButton({ onClick, icon, children, variant = "default" }: MenuButtonProps) {
  const colorClasses =
    variant === "danger"
      ? "text-rose-600 hover:bg-rose-50/80"
      : "text-slate-700 hover:bg-slate-100/80";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium transition-colors ${colorClasses}`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

