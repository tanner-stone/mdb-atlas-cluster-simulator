/**
 * ============================================================================
 *  APP SHELL — overall 3-panel layout
 * ============================================================================
 *    ┌──────────────┬──────────────────────────────────────┐
 *    │              │            Panel B  (canvas)          │
 *    │  Panel A     ├──────────────────────────────────────┤
 *    │  (config)    │            Panel C  (console tray)    │
 *    └──────────────┴──────────────────────────────────────┘
 *  Panel A is a fixed-width left sidebar (~25%). Panels B + C share the
 *  remaining ~75% stacked vertically (canvas on top, console tray below).
 *  Everything is wrapped in the SimulatorProvider state engine.
 * ============================================================================
 */

import { SimulatorProvider } from './state/SimulatorContext';
import ConfigPanel from './components/ConfigPanel';
import ArchitectureCanvas from './components/ArchitectureCanvas';
import WalkthroughConsole from './components/WalkthroughConsole';

export default function App() {
  return (
    <SimulatorProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-200">
        {/* Subtle radial backdrop for depth */}
        <div
          className="pointer-events-none fixed inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(1200px 600px at 70% -10%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(900px 500px at 0% 110%, rgba(56,189,248,0.06), transparent 60%)',
          }}
        />

        {/* PANEL A — Configuration sidebar (left, compact) */}
        <div className="relative z-10 w-[260px] shrink-0 border-r border-slate-800 bg-slate-900/40 backdrop-blur-sm">
          <ConfigPanel />
        </div>


        {/* PANELS B + C — main stage (right, 75%) */}
        <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
          {/* Top app bar */}
          <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-5 py-2.5 backdrop-blur-sm">
            <h1 className="text-sm font-bold tracking-tight text-slate-100">
              MongoDB Atlas Global Cluster Simulator
              <span className="ml-2 font-normal text-slate-500">
                — Multi-Cloud Reference Build
              </span>
            </h1>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500">
              <Legend swatch="bg-purple-500" label="Shard 0 Primary" />
              <Legend swatch="bg-emerald-500" label="Shard 1 Primary" />
              <Legend swatch="bg-slate-600" label="Secondary" />
            </div>
          </header>

          {/* Panel B — interactive architecture canvas (fills available space) */}
          <main className="min-h-0 flex-1">
            <ArchitectureCanvas />
          </main>

          {/* Panel C — bottom console tray (fixed-ish height) */}
          <div className="h-[34%] min-h-[230px]">
            <WalkthroughConsole />
          </div>
        </div>
      </div>
    </SimulatorProvider>
  );
}

/** Tiny legend chip used in the header bar. */
function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
