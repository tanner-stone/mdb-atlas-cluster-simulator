/**
 * ============================================================================
 *  PANEL A — Configuration Panel (Left Sidebar)
 * ============================================================================
 *  Hosts all operator controls:
 *    - Read Preference + Write Concern dropdowns
 *    - Query type arming toggles (Write / Read)
 *    - Chaos Sandboxing (Kill Azure East + Total Cloud Partition)
 *    - Reference Collection Ledger
 * ============================================================================
 */

import {
  AlertTriangle,
  BookText,
  Database,
  FlaskConical,
  Layers,
  MousePointerClick,
  PenLine,
  RotateCcw,
  Search,
  Table2,
  Zap,
} from 'lucide-react';

import type { ReactNode } from 'react';
import { useSimulator } from '../state/SimulatorContext';
import { GlassPanel } from './primitives';
import type { ReadPreference, WriteConcern } from '../types';


/** Small labelled section header. */
function SectionTitle({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {

  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      {icon}
      {children}
    </div>
  );
}

export default function ConfigPanel() {
  const {
    readPreference,
    writeConcern,
    queryType,
    collectionId,
    outage,
    failoverActive,
    scenario,
    scenarios,
    setScenario,
    setReadPreference,
    setWriteConcern,
    setCollection,
    armQuery,
    killAzureEast,
    clearOutage,
  } = useSimulator();

  const azureEastDead = outage === 'AZURE_EAST';
  const outageActive = outage !== 'NONE';
  const collections = scenario.collections;



  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
      {/* Brand header */}
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
          <Database size={18} />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-100">
            Atlas Global Cluster
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Multi-Cloud Reference Build
          </p>
        </div>
      </div>

      {/* Scenario picker */}
      <GlassPanel className="p-4">
        <SectionTitle icon={<Layers size={13} />}>Cluster Scenario</SectionTitle>
        <select
          value={scenario.id}
          onChange={(e) => setScenario(e.target.value)}
          className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] leading-snug text-slate-500">
          {scenario.description}
        </p>
      </GlassPanel>

      {/* Read / Write settings */}
      <GlassPanel className="p-4">
        <SectionTitle icon={<PenLine size={13} />}>Read / Write Settings</SectionTitle>

        <label className="mb-1 block text-[11px] text-slate-400">Read Preference</label>
        <select
          value={readPreference}
          onChange={(e) => setReadPreference(e.target.value as ReadPreference)}
          className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
        >
          <option value="nearest">nearest (Set as Default)</option>
          <option value="primary">primary</option>
          <option value="secondary">secondary</option>
          <option value="primaryPreferred">primaryPreferred</option>
          <option value="secondaryPreferred">secondaryPreferred</option>
        </select>

        <label className="mb-1 block text-[11px] text-slate-400">Write Concern</label>
        <select
          value={writeConcern}
          onChange={(e) => setWriteConcern(e.target.value as WriteConcern)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
        >
          <option value="majority">w:majority (Set as Default)</option>
          <option value="1">w:1</option>
        </select>
      </GlassPanel>

      {/* Query type selector */}
      <GlassPanel className="p-4">
        <SectionTitle icon={<Zap size={13} />}>Query Type Selector</SectionTitle>
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => armQuery('WRITE')}
            className={[
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all',
              queryType === 'WRITE'
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 shadow-[0_0_18px_-2px_rgba(16,185,129,0.5)]'
                : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-emerald-500/60',
            ].join(' ')}
          >
            <PenLine size={14} /> Simulate Write Query
          </button>
          <button
            onClick={() => armQuery('READ')}
            className={[
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-all',
              queryType === 'READ'
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_18px_-2px_rgba(56,189,248,0.5)]'
                : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-cyan-500/60',
            ].join(' ')}
          >
            <Search size={14} /> Simulate Read Query
          </button>
        </div>
        {failoverActive && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-300">
            Failover active — Write simulations now reroute cross-cloud to the
            newly elected AWS Primary.
          </p>
        )}
      </GlassPanel>

      {/* Chaos sandbox */}
      <GlassPanel className="border-rose-900/50 bg-rose-950/20 p-4">
        <SectionTitle icon={<FlaskConical size={13} />}>
          <span className="text-rose-300">Interactive Chaos Sandbox</span>
        </SectionTitle>

        {/* Regional kill */}
        <button
          onClick={killAzureEast}
          disabled={outageActive}
          className={[
            'mb-2 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-all',
            outageActive
              ? 'cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-500'
              : 'border-rose-500/60 bg-rose-600/20 text-rose-200 hover:bg-rose-600/40 hover:shadow-[0_0_20px_-2px_rgba(244,63,94,0.6)]',
          ].join(' ')}
        >
          <AlertTriangle size={14} />
          {azureEastDead ? 'Azure East — OFFLINE' : 'Kill Azure East Region'}
        </button>

        {/* Targeted single-node sabotage hint */}
        <div
          className={[
            'mb-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[10px] leading-snug',
            outageActive
              ? 'border-slate-700 bg-slate-900/60 text-slate-500'
              : 'border-rose-500/30 bg-rose-950/30 text-rose-200/90',
          ].join(' ')}
        >
          <MousePointerClick size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold uppercase tracking-wide">
              Targeted Node Failure:
            </span>{' '}
            click any data-bearing member [P] / [S] on the canvas to take that
            single member offline. If a Primary is killed, the surviving shard
            members will hold a Raft election and promote a new Primary.
          </span>
        </div>


        {/* Clear / restore */}
        <button
          onClick={clearOutage}
          disabled={!outageActive}
          className={[
            'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-all',
            !outageActive
              ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600'
              : 'border-emerald-500/60 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/40',
          ].join(' ')}
        >
          <RotateCcw size={14} /> Reset to Healthy State
        </button>
      </GlassPanel>

      {/* Collection target + reference ledger */}
      <GlassPanel className="p-4">
        <SectionTitle icon={<Table2 size={13} />}>Target Collection</SectionTitle>
        <select
          value={collectionId}
          onChange={(e) => setCollection(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {c.namespace}
            </option>
          ))}
        </select>

        <SectionTitle icon={<BookText size={13} />}>Collection Ledger</SectionTitle>
        <div className="flex flex-col gap-2">
          {collections.map((c) => {
            const selected = c.id === collectionId;
            const isMultiShard = scenario.shards.length > 1;
            const zone = !isMultiShard
              ? 'Single shard'
              : c.residesOn === 'both'
                ? 'Both shards (geo)'
                : c.residesOn === 'shard-0'
                  ? 'Shard 0 (Azure)'
                  : 'Shard 1 (AWS)';
            return (
              <button
                key={c.id}
                onClick={() => setCollection(c.id)}
                className={[
                  'rounded-lg border p-3 text-left transition-all',
                  selected
                    ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-600',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-emerald-300">
                    {c.namespace}
                  </span>
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                    {zone}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-400">
                  shardKey: {c.shardKey}
                </div>
                <div className="mt-1 text-[10px] leading-snug text-slate-500">{c.note}</div>
              </button>
            );
          })}
        </div>
      </GlassPanel>


      <div className="mt-auto pt-2 text-center text-[10px] text-slate-600">
        Engineering visualizer · not a live cluster
      </div>
    </aside>
  );
}
