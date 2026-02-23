"use client";

import * as React from "react";

type Props = {
  email?: string | null;
  onSignOut: () => Promise<void> | void;
};

export function AccessPendingScreen({ email, onSignOut }: Props) {
  return (
    <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
      <div className="w-full max-w-[560px] rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Acceso pendiente</h2>
        <p className="mt-3 text-slate-600">
          Iniciaste sesión correctamente, pero tu cuenta todavía no tiene acceso a la beta de Postty.
        </p>
        {email ? (
          <p className="mt-2 text-sm text-slate-500">
            Cuenta: <span className="font-medium text-slate-700">{email}</span>
          </p>
        ) : null}
        <p className="mt-4 text-sm text-slate-500">
          Pedile al administrador que te habilite en la lista de invitaciones.
        </p>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="mt-7 inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
