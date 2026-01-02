"use client";

import * as React from "react";
import { TopBar } from "./ui/TopBar";

interface AgentSelectionScreenProps {
  userName: string;
  onBack: () => void;
  onAgentSelect: (agentId: string) => void;
  showToast: (message: string, kind?: "error" | "info") => void;
}

export function AgentSelectionScreen({
  userName,
  onBack,
  onAgentSelect,
  showToast,
}: AgentSelectionScreenProps) {
  const agents = [
    {
      id: "product-showcase",
      name: "Product Showcase",
      description: "Crea contenido profesional para tus productos",
      icon: "📸",
      gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
      available: true,
    },
    {
      id: "agent-2",
      name: "Agent 2",
      description: "Próximamente",
      icon: "🎨",
      gradient: "from-cyan-500 via-sky-500 to-blue-500",
      available: false,
    },
    {
      id: "agent-3",
      name: "Agent 3",
      description: "Próximamente",
      icon: "✨",
      gradient: "from-emerald-500 via-teal-500 to-green-500",
      available: false,
    },
    {
      id: "agent-4",
      name: "Agent 4",
      description: "Próximamente",
      icon: "🚀",
      gradient: "from-orange-500 via-amber-500 to-yellow-500",
      available: false,
    },
  ];

  const handleAgentClick = (agent: typeof agents[0]) => {
    if (!agent.available) {
      showToast("Próximamente disponible", "info");
      return;
    }
    onAgentSelect(agent.id);
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex flex-col">
      <TopBar onBack={onBack} />

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[960px]">
          <div className="text-center mb-12">
            <h1 className="text-[42px] sm:text-[64px] leading-[0.95] font-black tracking-tight">
              ¿Qué te gustaría crear hoy?
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-slate-700 font-medium">
              Elige un agente para comenzar
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleAgentClick(agent)}
                disabled={!agent.available}
                className={[
                  "group relative overflow-hidden rounded-3xl p-6 sm:p-8",
                  "bg-white/70 backdrop-blur-xl border border-white/70",
                  "shadow-[0_12px_35px_rgba(0,0,0,0.08)]",
                  "transition-all duration-300",
                  agent.available
                    ? "hover:shadow-[0_20px_50px_rgba(0,0,0,0.12)] hover:-translate-y-1 cursor-pointer"
                    : "opacity-60 cursor-not-allowed",
                ].join(" ")}
              >
                {/* Gradient background on hover */}
                <div
                  className={[
                    "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300",
                    agent.gradient,
                    agent.available ? "group-hover:opacity-5" : "",
                  ].join(" ")}
                />

                {/* Content */}
                <div className="relative z-10 text-left">
                  <div className="text-5xl sm:text-6xl mb-4">{agent.icon}</div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                    {agent.name}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600">
                    {agent.description}
                  </p>
                </div>

                {/* Badge for available agents */}
                {agent.available && (
                  <div className="absolute top-4 right-4">
                    <div
                      className={[
                        "px-3 py-1 rounded-full text-xs font-semibold text-white",
                        `bg-gradient-to-r ${agent.gradient}`,
                      ].join(" ")}
                    >
                      Disponible
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

