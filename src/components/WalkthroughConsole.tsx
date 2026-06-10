/**
 * ============================================================================
 *  PANEL C — Transaction Walkthrough Console (Horizontal Bottom Tray)
 * ============================================================================
 *  Stretches across the bottom of the canvas. Provides playback controls
 *  (Reset / Previous / Next), a STEP n OF m indicator, and a code-console
 *  window that prints the architectural trace description for the current
 *  timeline checkpoint plus a scrolling transcript log.
 * ============================================================================
 */

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Terminal } from 'lucide-react';
import { useSimulator } from '../state/SimulatorContext';

export default function WalkthroughConsole() {
  const {
    queryType,
    steps,
    currentStep,
    activeStep,
    log,
    nextStep,
    prevStep,
    resetWalkthrough,
  } = useSimulator();


  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the transcript to the newest line.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const total = steps.length;
  const isArmed = currentStep >= 0 && total > 0;
  const atFirst = currentStep <= 0;
  const atLast = currentStep >= total - 1;

  // Color theming follows the active query track.
  const accent =
    queryType === 'WRITE'
      ? { text: 'text-emerald-300', dot: 'bg-emerald-400', ring: 'ring-emerald-500/40' }
      : queryType === 'READ'
        ? { text: 'text-cyan-300', dot: 'bg-cyan-400', ring: 'ring-cyan-500/40' }
        : { text: 'text-slate-300', dot: 'bg-slate-500', ring: 'ring-slate-700' };

  return (
    <section className="flex h-full w-full flex-col gap-3 border-t border-slate-800 bg-slate-900/60 p-3 backdrop-blur-md">
      {/* Header row: title + step indicator + controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal size={15} className={accent.text} />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-200">
            Transaction Walkthrough Console
          </h3>
          {isArmed && (
            <span
              className={`ml-2 rounded-md bg-slate-950/80 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider ${accent.text} ring-1 ${accent.ring}`}
            >
              STEP {currentStep + 1} OF {total}
            </span>
          )}
          {queryType && (
            <span className="rounded-md bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {queryType} trace
            </span>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={resetWalkthrough}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
          >
            <RotateCcw size={13} /> Reset
          </button>

          <button
            onClick={prevStep}
            disabled={!isArmed || atFirst}
            className={[
              'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
              !isArmed || atFirst
                ? 'cursor-not-allowed border-slate-800 bg-slate-950/40 text-slate-600'
                : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500 hover:text-slate-100',
            ].join(' ')}
          >
            <ChevronLeft size={14} /> Previous Step
          </button>
          <button
            onClick={nextStep}
            disabled={!isArmed || atLast}
            className={[
              'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-bold transition-all',
              !isArmed || atLast
                ? 'cursor-not-allowed border-slate-800 bg-slate-950/40 text-slate-600'
                : 'border-green-400 bg-green-500/20 text-green-200 animate-btn-pulse hover:bg-green-500/35',
            ].join(' ')}
          >
            Next Step <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Two-up console: current step description + transcript log */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        {/* Current checkpoint description (code console styled) */}
        <div className="overflow-auto rounded border border-slate-800 bg-black p-4 font-mono text-sm text-slate-300">
          {activeStep ? (
            <>
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500">
                <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
                {activeStep.title}
              </div>
              <pre className="whitespace-pre-wrap break-words leading-relaxed">
                {activeStep.explanation}
              </pre>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-xs text-slate-600">
              No active trace. Arm a Write or Read simulation from the left panel,
              then step through the transaction timeline.
            </div>
          )}
        </div>

        {/* Append-only transcript / system event log */}
        <div
          ref={logRef}
          className="overflow-auto rounded border border-slate-800 bg-black p-4 font-mono text-[11px] leading-relaxed text-slate-400"
        >
          {log.map((line, i) => {
            const isCritical = line.startsWith('!!');
            const isStep = line.startsWith('step');
            const isClient = line.startsWith('client>');
            return (
              <div
                key={i}
                className={[
                  'whitespace-pre-wrap break-words',
                  isCritical ? 'font-bold text-rose-400' : '',
                  isStep ? 'text-emerald-300/80' : '',
                  isClient ? 'text-cyan-300/80' : '',
                ].join(' ')}
              >
                {line || '\u00A0'}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
