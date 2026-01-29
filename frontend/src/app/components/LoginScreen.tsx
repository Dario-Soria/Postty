"use client";

import * as React from "react";
import { signInWithGoogle } from "@/lib/firebase/auth";

export default function LoginScreen() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle(true);
    } catch (err: unknown) {
      console.error("Google sign-in error:", err);
      setError("Failed to sign in with Google. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-white overflow-hidden">
      {/* Left side - Image Collage (55%) */}
      <div className="h-full overflow-hidden relative" style={{ width: '55%' }}>
        <div 
          className="absolute flex"
          style={{ left: '-70px', right: '12px', top: '0', bottom: '0', gap: '12px' }}
        >
          {/* Column 1 - Cut off on left side */}
          <div className="flex flex-col shrink-0" style={{ width: 'calc(33.33% - 8px)', gap: '12px', height: '100%' }}>
            {/* Skincare - touches left and top */}
            <div className="overflow-hidden bg-gray-200" style={{ height: '58%', borderRadius: '0 0 16px 0' }}>
              <img
                src="/collage/2.jpg"
                alt="Skincare product"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Sony glasses - touches left and bottom */}
            <div className="overflow-hidden bg-gray-200 flex-1" style={{ borderRadius: '0 16px 0 0' }}>
              <img
                src="/collage/7.jpg"
                alt="Sony glasses"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Column 2 - Fashion model + Food (offset = gap) */}
          <div className="flex flex-col shrink-0" style={{ width: 'calc(33.33% - 8px)', marginTop: '12px', height: 'calc(100% - 12px)', gap: '12px' }}>
            {/* Fashion model - top edge cut off */}
            <div className="overflow-hidden bg-gray-200" style={{ height: '70%', borderRadius: '16px' }}>
              <img
                src="/collage/4.jpg"
                alt="Fashion model"
                className="w-full h-full object-cover"
                style={{ objectPosition: 'center 20%' }}
              />
            </div>
            {/* Gourmet food - touches bottom */}
            <div className="overflow-hidden bg-gray-200 flex-1" style={{ borderRadius: '16px 16px 0 0' }}>
              <img
                src="/collage/8.jpg"
                alt="Gourmet food"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Column 3 - Drone + Prada */}
          <div className="flex flex-col shrink-0" style={{ width: 'calc(33.33% - 8px)', gap: '12px', height: '100%' }}>
            {/* Drone - touches top */}
            <div className="overflow-hidden bg-gray-200" style={{ height: '38%', borderRadius: '0 0 16px 16px' }}>
              <img
                src="/collage/9.jpg"
                alt="Drone"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Prada bag - touches bottom */}
            <div className="overflow-hidden bg-gray-200 flex-1" style={{ borderRadius: '16px 16px 0 0' }}>
              <img
                src="/collage/5.jpg"
                alt="Prada bag"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login (45%) */}
      <div className="w-[45%] h-full bg-white flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-8">
          {/* Logo */}
          <h1 
            className="text-5xl text-black"
            style={{ 
              fontFamily: 'var(--font-logo)',
              letterSpacing: '-0.04em',
              fontStyle: 'normal',
              transform: 'scaleY(0.85)'
            }}
          >
            Postty
          </h1>

          {/* Sign in section */}
          <div className="flex flex-col items-center gap-4">
            <h2 className="text-base font-medium text-black">Sign in</h2>

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ease-out active:scale-[0.98]"
              style={{
                boxShadow: `
                  2px 2px 4px rgba(0,0,0,0.06),
                  -1px -1px 2px rgba(255,255,255,0.8),
                  inset 0 0 0 1px rgba(255,255,255,0.9)
                `,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `
                  3px 3px 6px rgba(0,0,0,0.04),
                  -2px -2px 4px rgba(255,255,255,0.9),
                  inset 0 0 0 1px rgba(255,255,255,1),
                  0 4px 8px rgba(0,0,0,0.03)
                `;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `
                  2px 2px 4px rgba(0,0,0,0.06),
                  -1px -1px 2px rgba(255,255,255,0.8),
                  inset 0 0 0 1px rgba(255,255,255,0.9)
                `;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Google Icon */}
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-gray-700 text-sm font-medium">
                {isLoading ? "Signing in..." : "Continue with Google"}
              </span>
            </button>

            {/* Error message */}
            {error && (
              <p className="text-red-500 text-sm text-center max-w-xs">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
