/**
 * ============================================================================
 *  PANEL B — Interactive Architecture Canvas (Center Main Stage)
 * ============================================================================
 *  Three sequential vertical columns:
 *    Column 1  Azure Client Land  (Azure Private Link)
 *    Column 2  Atlas Unified Global Cluster Core (Shard 0 + Shard 1)
 *    Column 3  AWS Client Land    (AWS PrivateLink)
 *
 *  An absolutely-positioned <TraceRouter> overlay draws the animated request
 *  trace between component ids resolved straight off the live DOM.
 * ============================================================================
 */

import { useRef, type ReactNode } from 'react';
import { Boxes, Cloud, Network, ServerCog } from 'lucide-react';
import { useSimulator } from '../state/SimulatorContext';
import { CloudFlag, MongosBadge, NodeBadge } from './primitives';
import TraceRouter from './TraceRouter';
import {
  AWS_VNETS,
  AZURE_VNETS,
  SHARD0_BOXES,
  SHARD1_BOXES,
  type RegionBox,
} from '../data/clusterData';
import type { AppVNet, ClusterNode } from '../types';

/**
 * Static accent class maps.
 * NOTE: Tailwind's JIT compiler cannot see dynamically interpolated class
 * names (e.g. `text-${x}-400`), so we map every accent to fully-spelled
 * class strings here to guarantee they are emitted into the final CSS.
 */
const CLOUD_ACCENT = {
  sky: {
    text400: 'text-sky-400',
    text200: 'text-sky-200',
    text300: 'text-sky-300',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
    headerBorder: 'border-sky-500/30',
    headerBg: 'bg-sky-500/5',
  },
  orange: {
    text400: 'text-orange-400',
    text200: 'text-orange-200',
    text300: 'text-orange-300',
    border: 'border-orange-500/40',
    bg: 'bg-orange-500/10',
    headerBorder: 'border-orange-500/30',
    headerBg: 'bg-orange-500/5',
  },
} as const;

/* -------------------------------------------------------------------------- */
/*  Application VNet card (columns 1 & 3)                                      */
/* -------------------------------------------------------------------------- */
function VNetCard({ vnet, dead }: { vnet: AppVNet; dead: boolean }) {
  const { activeStep } = useSimulator();
  const isActive = activeStep?.activeElementIds.includes(vnet.id) ?? false;
  const a = CLOUD_ACCENT[vnet.cloud === 'Azure' ? 'sky' : 'orange'];

  return (
    <div
      id={vnet.id}
      className={[
        'relative rounded-lg border bg-slate-950/70 p-3 transition-all',
        isActive
          ? 'border-cyan-400 ring-2 ring-cyan-400/60 animate-pulse-active'
          : `border-slate-800`,
        dead ? 'opacity-30 grayscale line-through' : '',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={`font-mono text-[10px] uppercase tracking-wider ${a.text400}`}>
          {vnet.region}
        </span>
        <Cloud size={12} className={a.text400} />
      </div>
      <div
        className={`inline-block rounded-md border px-2 py-1 text-[11px] font-semibold ${a.border} ${a.bg} ${a.text200}`}
      >
        {vnet.name}
      </div>
      <div className="mt-1 text-[9px] text-slate-500">{vnet.workloadType}</div>
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/*  Regional infrastructure stack (a "box" inside a shard)                     */
/* -------------------------------------------------------------------------- */
function RegionStack({
  box,
  nodes,
  dead,
}: {
  box: RegionBox;
  nodes: ClusterNode[];
  dead: boolean;
}) {
  // Only render nodes that belong to this box, in declared order.
  const boxNodes = box.nodeIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is ClusterNode => Boolean(n));

  const regionAccent = CLOUD_ACCENT[box.cloud === 'Azure' ? 'sky' : 'orange'];

  return (
    <div
      id={box.id}
      className={[
        'rounded-lg border border-slate-700/70 bg-slate-950/60 p-2.5 transition-all',
        dead ? 'opacity-30 grayscale line-through border-rose-700/60' : '',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${regionAccent.text400}`}
        >
          {box.region}
        </span>

        {box.flag && <CloudFlag provider={box.flag} />}
      </div>

      <MongosBadge id={box.mongosId} dead={dead} />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {boxNodes.map((n) => (
          <NodeBadge key={n.id} node={n} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shard card (a horizontal zone of 3 region stacks)                          */
/* -------------------------------------------------------------------------- */
function ShardCard({
  title,
  subtitle,
  zoneKey,
  boxes,
  nodes,
  deadRegions,
  deadClouds,
  accent,
}: {
  title: string;
  subtitle: string;
  zoneKey: string;
  boxes: RegionBox[];
  nodes: ClusterNode[];
  deadRegions: string[];
  deadClouds: ('Azure' | 'AWS')[];
  accent: 'purple' | 'emerald';
}) {

  const ring =
    accent === 'purple'
      ? 'border-purple-700/40 bg-purple-950/10'
      : 'border-emerald-700/40 bg-emerald-950/10';
  const chip =
    accent === 'purple'
      ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';

  return (
    <div className={`rounded-xl border ${ring} p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-slate-100">{title}</div>
          <div className="text-[10px] text-slate-400">{subtitle}</div>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${chip}`}
        >
          {zoneKey}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {boxes.map((box) => (
          <RegionStack
            key={box.id}
            box={box}
            nodes={nodes}
            dead={
              deadRegions.includes(box.region) || deadClouds.includes(box.cloud)
            }
          />
        ))}

      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main canvas                                                                */
/* -------------------------------------------------------------------------- */
export default function ArchitectureCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { nodes, deadRegions, deadClouds, outage } = useSimulator();

  // A VNet is considered dead if its region OR its whole cloud is offline.
  const vnetDead = (cloud: 'Azure' | 'AWS', region: string) =>
    deadRegions.includes(region) || deadClouds.includes(cloud);

  // Find the killed node so the NODE_DOWN banner can describe it.
  const killedNode =
    outage === 'NODE_DOWN' ? nodes.find((n) => n.status === 'DOWN') : undefined;


  return (
    <div ref={canvasRef} className="relative h-full w-full overflow-auto px-3 py-4">

      {/* Animated trace overlay anchored to this container */}
      <TraceRouter containerRef={canvasRef} />

      {/* Outage banner */}
      {outage === 'AZURE_EAST' && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-rose-500/50 bg-rose-600/15 py-1.5 text-[11px] font-bold uppercase tracking-widest text-rose-300">
          <Network size={13} /> Azure eastus Region Offline — Shard 0 Primary failed over cross-cloud to AWS
        </div>
      )}
      {outage === 'NODE_DOWN' && killedNode && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-rose-500/50 bg-rose-600/15 py-1.5 text-[11px] font-bold uppercase tracking-widest text-rose-300">
          <Network size={13} /> Node {killedNode.name} ({killedNode.region}{' '}
          {killedNode.cloud}) offline — replica set quorum re-evaluated
        </div>
      )}



      <div className="grid grid-cols-12 gap-3">
        {/* COLUMN 1 — Azure Client Land (narrow flank) */}
        <div className="col-span-2 flex flex-col gap-2 min-w-0">

          <ColumnHeader
            icon={<Cloud size={13} />}
            title="Azure Client Land"
            sub="via Azure Private Link"
            accent="sky"
          />
          {AZURE_VNETS.map((v) => (
            <VNetCard key={v.id} vnet={v} dead={vnetDead(v.cloud, v.region)} />
          ))}
        </div>


        {/* COLUMN 2 — Atlas Global Cluster Core */}
        <div className="col-span-8">
          <div className="relative rounded-2xl border-2 border-dashed border-emerald-600/40 bg-slate-900/40 p-3">
            <div className="mb-3 flex items-center justify-center gap-2">
              <Boxes size={15} className="text-emerald-400" />
              <h2 className="text-center text-xs font-bold uppercase tracking-widest text-emerald-300">
                MongoDB Atlas Project Footprint
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              <ShardCard
                title="Shard 0 · Azure-First Zone"
                subtitle="Primary anchored in Azure eastus"
                zoneKey='location="Azure"'
                boxes={SHARD0_BOXES}
                nodes={nodes}
                deadRegions={deadRegions}
                deadClouds={deadClouds}
                accent="purple"
              />

              <ShardCard
                title="Shard 1 · AWS-First Zone"
                subtitle="Primary anchored in AWS us-east-1"
                zoneKey='location="AWS"'
                boxes={SHARD1_BOXES}
                nodes={nodes}
                deadRegions={deadRegions}
                deadClouds={deadClouds}
                accent="emerald"
              />

            </div>
          </div>
        </div>

        {/* COLUMN 3 — AWS Client Land (narrow flank) */}
        <div className="col-span-2 flex flex-col gap-2 min-w-0">

          <ColumnHeader
            icon={<ServerCog size={13} />}
            title="AWS Client Land"
            sub="via AWS PrivateLink"
            accent="orange"
          />
          {AWS_VNETS.map((v) => (
            <VNetCard key={v.id} vnet={v} dead={vnetDead(v.cloud, v.region)} />
          ))}
        </div>
      </div>

    </div>
  );
}

/** Column heading used at the top of each flank. */
function ColumnHeader({
  icon,
  title,
  sub,
  accent,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  accent: 'sky' | 'orange';
}) {
  const a = CLOUD_ACCENT[accent];
  return (
    <div className={`mb-1 rounded-lg border px-3 py-2 ${a.headerBorder} ${a.headerBg}`}>
      <div className={`flex items-center gap-2 ${a.text300}`}>
        {icon}
        <span className="text-xs font-bold">{title}</span>
      </div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

