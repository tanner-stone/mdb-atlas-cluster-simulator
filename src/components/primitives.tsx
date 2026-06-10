/**
 * ============================================================================
 *  SHARED UI PRIMITIVES
 * ============================================================================
 *  Small, presentational building blocks reused across the architecture
 *  canvas: cloud provider flags, individual data node badges, and the
 *  glass card wrapper. Kept dependency-light and fully controlled.
 * ============================================================================
 */

import type { ReactNode } from 'react';
import { useSimulator } from '../state/SimulatorContext';
import type { ClusterNode } from '../types';

/** Frosted-glass panel used for all major cards. */
export function GlassPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        'bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-xl ' +
        className
      }
    >
      {children}
    </div>
  );
}

/** A tiny cloud-provider chip used as a "foreign cloud" flag on cross stacks. */
export function CloudFlag({ provider }: { provider: 'AWS' | 'Azure' }) {
  const styles =
    provider === 'AWS'
      ? 'bg-orange-500/15 text-orange-300 border-orange-500/40'
      : 'bg-sky-500/15 text-sky-300 border-sky-500/40';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {provider === 'AWS' ? '☁ AWS' : '☁ Azure'}
    </span>
  );
}

/**
 * Renders a single data-bearing replica-set member.
 * - PRIMARY in Shard 0 -> flashing deep purple border
 * - PRIMARY in Shard 1 -> flashing emerald green border
 * - DOWN nodes are greyed + crossed out
 * - members referenced by the active step gain a cyan active pulse
 */
export function NodeBadge({ node }: { node: ClusterNode }) {
  const { activeStep, outage, killNode } = useSimulator();
  const isActive = activeStep?.activeElementIds.includes(node.id) ?? false;
  const isDown = node.status === 'DOWN';

  const isPrimary = node.role === 'PRIMARY';
  const isShard0 = node.shardId === 'shard-0';

  // Base palette by role.
  let roleClasses =
    'border-slate-600 bg-slate-800/80 text-slate-300'; // SECONDARY default
  let label = 'S';
  if (isPrimary) {
    label = 'P';
    roleClasses = isShard0
      ? 'border-purple-500 bg-purple-950/50 text-purple-200 animate-pulse-purple'
      : 'border-emerald-500 bg-emerald-950/50 text-emerald-200 animate-pulse-emerald';
  }

  // The chaos sandbox supports targeted single-node kills only when no other
  // outage is currently active. Clicking a healthy node dispatches NODE_DOWN.
  const canKill = !isDown && outage === 'NONE';

  return (
    <button
      id={node.id}
      data-node-id={node.id}
      type="button"
      disabled={!canKill}
      onClick={() => canKill && killNode(node.id)}
      title={
        canKill
          ? `Click to kill ${node.name} (${node.role} · ${node.region} ${node.cloud})`
          : `${node.name} · ${node.role} · ${node.region} (${node.cloud})`
      }
      className={[
        'relative flex h-9 min-w-[2.75rem] items-center justify-center gap-1 rounded-md border px-2 text-xs font-bold transition-all',
        roleClasses,
        isActive ? 'ring-2 ring-cyan-400 animate-pulse-active' : '',
        isDown
          ? 'opacity-30 grayscale line-through border-rose-700/60 !animate-none cursor-not-allowed'
          : canKill
            ? 'cursor-pointer hover:ring-2 hover:ring-rose-400/70 hover:shadow-[0_0_12px_-2px_rgba(244,63,94,0.6)]'
            : 'cursor-default',
      ].join(' ')}
    >
      <span className="font-mono">[{label}]</span>
      <span className="text-[10px] font-normal text-slate-400">{node.name}</span>
    </button>
  );
}


/** A mongos router pill. */
export function MongosBadge({ id, dead }: { id: string; dead?: boolean }) {
  const { activeStep } = useSimulator();
  const isActive = activeStep?.activeElementIds.includes(id) ?? false;
  return (
    <div
      id={id}
      data-node-id={id}
      title="mongos query router"
      className={[
        'flex h-7 items-center justify-center rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wider transition-all',
        'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
        isActive ? 'ring-2 ring-cyan-400 animate-pulse-active' : '',
        dead ? 'opacity-30 grayscale line-through border-rose-700/60' : '',
      ].join(' ')}
    >
      ⇄ mongos
    </div>
  );
}
