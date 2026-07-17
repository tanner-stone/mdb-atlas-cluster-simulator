/**
 * ============================================================================
 *  DYNAMIC SIMULATION STEP ENGINE
 * ============================================================================
 *  Instead of hard-coding step arrays, we GENERATE a correct walkthrough from
 *  the live topology for any combination of:
 *      queryType     WRITE | READ
 *      collection    appdb.records | appdb.events
 *      readPreference nearest | primary | secondary | ...
 *      live nodes    (roles + HEALTHY/DOWN, mutated by the chaos engine)
 *
 *  CORE ROUTING MODEL (verified against real sharded-cluster behaviour):
 *
 *   1. A client app ALWAYS connects to the mongos router physically located in
 *      its OWN region (the nearest routing endpoint over Private Link). That
 *      mongos is cluster-wide — it can route to ANY shard, not just the shard
 *      whose data nodes happen to share its box.
 *
 *   2. The mongos parses the leading shard-key zone value and maps the query to
 *      the owning shard.
 *
 *   3. WRITES are forwarded to that shard's elected PRIMARY (wherever it lives,
 *      possibly cross-cloud after a failover). The primary then replicates to
 *      its healthy secondaries.
 *
 *   4. READS honour readPreference. With "nearest", the mongos picks the
 *      healthy member of the target shard with the lowest network distance to
 *      the mongos (same region > same cloud > cross-cloud). "primary" always
 *      routes to the primary; "secondary" forces a secondary; etc.
 * ============================================================================
 */

import type {
  ClusterNode,
  CollectionDef,
  ReadPreference,
  SimulationStep,
} from '../types';
import {
  shardForCollection,
  type RegionBox,
  type ScenarioLookups,
} from './clusterData';

/* -------------------------------------------------------------------------- */
/*  Distance heuristic for readPreference: "nearest"                          */
/* -------------------------------------------------------------------------- */

/** Lower is closer. Same region beats same cloud beats cross-cloud. */
function networkDistance(
  fromRegion: string,
  fromCloud: 'Azure' | 'AWS',
  node: ClusterNode
): number {
  if (node.region === fromRegion) return 0;
  if (node.cloud === fromCloud) return 1;
  return 2;
}

/** The box whose mongos id matches — used to discover the mongos's region/cloud. */
function boxByMongos(
  mongosId: string,
  lookups: ScenarioLookups
): RegionBox | undefined {
  return lookups.allBoxes.find((b) => b.mongosId === mongosId);
}

/* -------------------------------------------------------------------------- */
/*  Member selection                                                          */
/* -------------------------------------------------------------------------- */

interface Topology {
  nodes: ClusterNode[];
  /** Regions that are fully offline. */
  deadRegions: string[];
  /** Clouds that are fully offline (cloud-outage scenario). */
  deadClouds: ('Azure' | 'AWS')[];
}

function isAlive(n: ClusterNode, topo: Topology): boolean {
  return (
    n.status === 'HEALTHY' &&
    !topo.deadRegions.includes(n.region) &&
    !topo.deadClouds.includes(n.cloud)
  );
}

function shardMembers(shardId: string, topo: Topology): ClusterNode[] {
  return topo.nodes.filter((n) => n.shardId === shardId);
}

function livePrimary(shardId: string, topo: Topology): ClusterNode | undefined {
  return shardMembers(shardId, topo).find(
    (n) => n.role === 'PRIMARY' && isAlive(n, topo)
  );
}

/**
 * Resolve which member a READ should target given the readPreference and the
 * mongos's physical location (for nearest/proximity scoring).
 */
function selectReadTarget(
  shardId: string,
  pref: ReadPreference,
  mongosRegion: string,
  mongosCloud: 'Azure' | 'AWS',
  topo: Topology
): ClusterNode | undefined {
  const members = shardMembers(shardId, topo).filter((n) => isAlive(n, topo));
  if (members.length === 0) return undefined;

  const primary = members.find((n) => n.role === 'PRIMARY');
  const secondaries = members.filter((n) => n.role !== 'PRIMARY');

  const nearest = (pool: ClusterNode[]) =>
    [...pool].sort(
      (a, b) =>
        networkDistance(mongosRegion, mongosCloud, a) -
        networkDistance(mongosRegion, mongosCloud, b)
    )[0];

  switch (pref) {
    case 'primary':
      return primary ?? nearest(members);
    case 'secondary':
      return secondaries.length ? nearest(secondaries) : primary;
    case 'primaryPreferred':
      return primary ?? nearest(secondaries);
    case 'secondaryPreferred':
      return secondaries.length ? nearest(secondaries) : primary;
    case 'nearest':
    default:
      return nearest(members);
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers for human-readable region/cloud labels                            */
/* -------------------------------------------------------------------------- */

function loc(n: ClusterNode): string {
  return `${n.region} (${n.cloud})`;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export interface GenerateArgs {
  queryType: 'WRITE' | 'READ';
  collection: CollectionDef;
  clientVNet: { id: string; region: string; cloud: 'Azure' | 'AWS'; name: string };
  readPreference: ReadPreference;
  writeConcern: 'majority' | '1';
  topo: Topology;
  /** Scenario-scoped lookups (region -> mongos, list of boxes, etc). */
  lookups: ScenarioLookups;
}


/**
 * Build the full ordered step list for a simulation. Returns an empty array if
 * the query is impossible under the current topology (e.g. the target shard
 * has no reachable members) — the caller surfaces that as an error banner.
 */
export function generateSteps(args: GenerateArgs): SimulationStep[] {
  const { queryType, collection, clientVNet, readPreference, writeConcern, topo, lookups } = args;

  const shardId = shardForCollection(collection);
  // In multi-shard scenarios shard-0 is the Azure zone / shard-1 is the AWS
  // zone. In a single-shard scenario there is only one shard, so we describe
  // it generically.
  const isMultiShard = lookups.allBoxes.some((b) => b.shardId === 'shard-1');
  const shardLabel = !isMultiShard
    ? 'the sole shard'
    : shardId === 'shard-0'
      ? 'Shard 0 (Azure zone)'
      : 'Shard 1 (AWS zone)';
  const linkName = clientVNet.cloud === 'Azure' ? 'Azure Private Link' : 'AWS PrivateLink';

  // 1) Client connects to its OWN local mongos (nearest routing endpoint).
  const localMongosId = lookups.regionToMongos[clientVNet.region];
  const mongosBox = boxByMongos(localMongosId, lookups);
  const mongosRegion = mongosBox?.region ?? clientVNet.region;
  const mongosCloud = (mongosBox?.cloud ?? clientVNet.cloud) as 'Azure' | 'AWS';

  // If the client's own region/cloud is down, there is no local mongos to hit.
  const clientReachable =
    !topo.deadRegions.includes(clientVNet.region) &&
    !topo.deadClouds.includes(clientVNet.cloud);
  if (!localMongosId || !clientReachable) return [];

  const steps: SimulationStep[] = [];
  const push = (s: Omit<SimulationStep, 'stepIndex'>) =>
    steps.push({ ...s, stepIndex: steps.length });

  if (queryType === 'WRITE') {
    const primary = livePrimary(shardId, topo);
    if (!primary) return []; // no electable primary -> impossible write

    const crossCloud = primary.cloud !== clientVNet.cloud;

    // Step 1 — client issues insert
    push({
      title: 'Client issues insert',
      activeElementIds: [clientVNet.id],
      explanation: `[STEP] ${clientVNet.name} issues an insert into ${collection.namespace}.\n\nCode: db.${collection.namespace.split('.')[1]}.insertOne(${collection.sampleDoc})`,
    });

    // Step 2 — client -> local mongos (in its own region)
    push({
      title: 'Transit to local mongos',
      activeElementIds: [clientVNet.id, localMongosId],
      explanation: `[STEP] Frames travel over ${linkName} to the nearest routing node (mongos) — the one physically in ${mongosRegion} (${mongosCloud}).`,
      traceLinePath: [clientVNet.id, localMongosId],
    });

    // Step 3 — mongos parses shard key
    push({
      title: 'mongos parses shard key',
      activeElementIds: [localMongosId],
      explanation: `[STEP] mongos parses the leading shard-key zone and maps this write to ${shardLabel}. (${collection.residesOn === 'both' ? 'Geo-sharded collection routed by location key.' : 'Collection is zone-pinned to this shard.'})`,
    });

    // Step 4 — mongos -> primary (possibly cross-cloud)
    push({
      title: crossCloud ? 'Cross-cloud route to Primary' : 'Targeted route to Primary',
      activeElementIds: [localMongosId, primary.id],
      explanation: `[STEP] Targeted routing: mongos forwards the write to ${shardLabel}'s elected Primary in ${loc(primary)}${crossCloud ? ' — crossing the cloud backbone because the Primary lives in the other cloud.' : '.'}`,
      traceLinePath: [localMongosId, primary.id],
    });

    // Steps 5/6 — replication is split into TWO phases that mirror real
    // write-concern mechanics:
    //
    //   Phase 1 (synchronous, satisfies w:majority): the Primary replicates
    //   to its NEAREST healthy secondaries — typically the same-cloud /
    //   same-region peers — until a majority of voting members have committed.
    //
    //   Phase 2 (asynchronous tail): the ack returns to the client over
    //   mongos AT THE SAME TIME the Primary continues fanning the write out
    //   to the remaining (further, cross-cloud) secondaries in the background.
    //
    // For w:1, no peers are required for the ack, so Phase 1 simply shows
    // "primary commits locally" with no replication line, and ALL secondaries
    // pick up the write asynchronously alongside the ack in Phase 2.
    const allSecondaries = shardMembers(shardId, topo).filter(
      (n) => n.id !== primary.id && isAlive(n, topo)
    );

    // Sort secondaries by network distance from the PRIMARY so the closest
    // peers form the synchronous majority and the far ones tail asynchronously.
    const sortedSecs = [...allSecondaries].sort(
      (a, b) =>
        networkDistance(primary.region, primary.cloud, a) -
        networkDistance(primary.region, primary.cloud, b)
    );

    // How many peers must commit synchronously to satisfy the write concern?
    //
    // IMPORTANT: w:majority is computed against the total *configured* voting
    // members of the shard (including any that are currently DOWN), not just
    // the live ones. e.g. a 5-member shard with one dead node still requires
    // ceil(5/2)=3 acks, which means the primary + 2 surviving secondaries.
    //   w:majority => ceil(totalConfigured / 2) - 1 voting peers needed
    //   w:1        => 0 (primary alone)
    const totalConfigured = shardMembers(shardId, topo).length;
    const majorityPeers =
      writeConcern === 'majority' ? Math.ceil(totalConfigured / 2) - 1 : 0;

    // Clamp to the number of currently reachable secondaries so we never try
    // to draw more sync replication lines than we have live peers. (If
    // majorityPeers > allSecondaries.length, the write would actually block in
    // a real cluster, but the visualization still shows the closest survivors
    // attempting to commit.)
    const syncSecs = sortedSecs.slice(
      0,
      Math.max(0, Math.min(majorityPeers, allSecondaries.length))
    );
    const asyncSecs = sortedSecs.slice(syncSecs.length);


    // Step 5 — synchronous replication required by the write concern.
    if (syncSecs.length > 0) {
      push({
        title: `Replicate to majority (${syncSecs.length + 1}/${totalConfigured} voters)`,
        activeElementIds: [primary.id, ...syncSecs.map((s) => s.id)],
        explanation: `[STEP] The Primary commits locally and replicates synchronously to its ${syncSecs.length} nearest healthy ${syncSecs.length === 1 ? 'peer' : 'peers'} (${syncSecs.map(loc).join(', ')}). With w:majority on a ${totalConfigured}-voter shard, once ${syncSecs.length + 1} of ${totalConfigured} voting members have applied the write, the write concern is satisfied.`,
        traceLinePath: [primary.id, ...syncSecs.map((s) => s.id)],
        branch: true,
      });
    } else {

      push({
        title: 'Primary commits locally',
        activeElementIds: [primary.id],
        explanation: `[STEP] With w:1, the Primary commits the write locally and is free to acknowledge immediately — no peer commit is required for the response. Replication to the ${allSecondaries.length} secondaries proceeds asynchronously.`,
      });
    }

    // Step 6 — ack returns to client AND the remaining (async) replication
    // fans out simultaneously. We render this with two trace groups:
    //   • the ack chain primary -> mongos -> client
    //   • a concurrent branched fan-out from primary to async secondaries
    const ackPath = [primary.id, localMongosId, clientVNet.id];
    const groups: Array<{ path: string[]; branch?: boolean }> = [
      { path: ackPath },
    ];
    if (asyncSecs.length > 0) {
      groups.push({
        path: [primary.id, ...asyncSecs.map((s) => s.id)],
        branch: true,
      });
    }

    push({
      title:
        asyncSecs.length > 0
          ? 'Ack returns + async replication tail'
          : 'Acknowledged success returns',
      activeElementIds: [
        primary.id,
        localMongosId,
        clientVNet.id,
        ...asyncSecs.map((s) => s.id),
      ],
      explanation:
        asyncSecs.length > 0
          ? `[STEP] Write concern w:${writeConcern} is satisfied — an ack returns to ${clientVNet.name} via mongos in <2ms. In parallel, the Primary continues fanning the write out asynchronously to the ${asyncSecs.length} remaining secondaries: ${asyncSecs.map(loc).join(', ')}.`
          : `[STEP] Write concern w:${writeConcern} satisfied. The acknowledgement returns via mongos to ${clientVNet.name}.`,
      traceLineGroups: groups,
    });


    return reindex(steps);
  }

  /* ----------------------------- READ track ----------------------------- */

  const target = selectReadTarget(
    shardId,
    readPreference,
    mongosRegion,
    mongosCloud,
    topo
  );
  if (!target) return []; // no reachable member -> impossible read

  const dist = networkDistance(mongosRegion, mongosCloud, target);
  const proximity =
    dist === 0
      ? 'a co-located member in the SAME region'
      : dist === 1
        ? 'a member in the same cloud'
        : 'a cross-cloud member';
  const crossCloud = target.cloud !== clientVNet.cloud;

  // Step 1 — client requests document
  push({
    title: 'Client requests document',
    activeElementIds: [clientVNet.id],
    explanation: `[STEP] ${clientVNet.name} reads from ${collection.namespace}.\n\nCode: db.${collection.namespace.split('.')[1]}.find(${collection.sampleDoc}).readPref("${readPreference}")`,
  });

  // Step 2 — client -> local mongos
  push({
    title: 'Transit to local mongos',
    activeElementIds: [clientVNet.id, localMongosId],
    explanation: `[STEP] Traffic connects over ${linkName} to the local routing node (mongos) in ${mongosRegion} (${mongosCloud}).`,
    traceLinePath: [clientVNet.id, localMongosId],
  });

  // Step 3 — mongos evaluates read preference
  push({
    title: 'mongos evaluates read preference',
    activeElementIds: [localMongosId],
    explanation: `[STEP] mongos maps the read to ${shardLabel} and applies readPreference="${readPreference}".`,
  });

  // Step 4 — mongos -> chosen member
  push({
    title: crossCloud ? 'Route to cross-cloud member' : 'Route to local member',
    activeElementIds: [localMongosId, target.id],
    explanation: `[STEP] readPreference="${readPreference}" resolves to ${target.role} in ${loc(target)} — ${proximity}.`,
    traceLinePath: [localMongosId, target.id],
  });

  // Step 5 — data returns
  push({
    title: 'Data returns to client',
    activeElementIds: [target.id, localMongosId, clientVNet.id],
    explanation: `[STEP] The document is returned via mongos to ${clientVNet.name}${crossCloud ? ' (this hop crossed the cloud backbone).' : ' without leaving the local cloud.'}`,
    traceLinePath: [target.id, localMongosId, clientVNet.id],
  });

  return reindex(steps);
}

/** Rewrites [STEP] placeholders into "[n/total]" prefixes. */
function reindex(steps: SimulationStep[]): SimulationStep[] {
  const total = steps.length;
  return steps.map((s, i) => ({
    ...s,
    stepIndex: i,
    explanation: s.explanation.replace('[STEP]', `[${i + 1}/${total}]`),
  }));
}
