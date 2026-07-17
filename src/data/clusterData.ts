/**
 * ============================================================================
 *  CLUSTER SCENARIOS
 * ============================================================================
 *  The simulator supports multiple pre-built cluster topology "scenarios" that
 *  the operator can switch between at runtime. Each scenario is a fully
 *  self-contained topology description: client VNets, shard boxes, data-bearing
 *  nodes, and the collection ledger routed against them.
 *
 *  Two scenarios are provided out of the box:
 *
 *    1. "global-2shard"       — the original 2-zone Azure+AWS Global Cluster
 *                               (2 geo-sharded zones, 10 members total).
 *
 *    2. "single-shard-2-2-1"  — a simpler single-shard replica set spanning
 *                               3 regions across 2 clouds:
 *                                 • 2 members in Azure eastus (Primary + S)
 *                                 • 2 members in AWS us-west-1 (S + S)
 *                                 • 1 member  in Azure centralus (S / tiebreaker)
 *                               Total: 5 voting members, majority = 3.
 *
 *  ID CONVENTIONS (still reused by the SVG trace router):
 *    - VNets:        vnet-<region>            e.g. vnet-eastus
 *    - Shard boxes:  box-<shard>-<region>     e.g. box-s0-eastus
 *    - mongos:       mongos-<shard>-<region>  e.g. mongos-s0-eastus
 *    - data nodes:   node-<shard>-<region>-<n>
 *
 *  IMPORTANT: node/VNet IDs are unique per scenario (a scenario is loaded in
 *  its entirety); switching scenarios rebuilds the topology from scratch.
 * ============================================================================
 */

import type { AppVNet, ClusterNode, CollectionDef } from '../types';

type CloudProviderTag = 'Azure' | 'AWS';

export interface RegionBox {
  id: string; // box-<shard>-<region>
  shardId: string;
  region: string;
  cloud: CloudProviderTag;
  mongosId: string; // mongos-<shard>-<region>
  /** A small flag badge surfaced on cross-provisioned (foreign-cloud) stacks. */
  flag?: 'AWS' | 'Azure';
  nodeIds: string[];
}

/** A visual grouping of RegionBoxes that render together as one shard card. */
export interface ShardDef {
  id: string;                       // "shard-0" | "shard-1"
  title: string;                    // "Shard 0 · Azure-First Zone"
  subtitle: string;                 // "Primary anchored in Azure eastus"
  zoneKey: string;                  // 'location="Azure"'
  accent: 'purple' | 'emerald';
  boxes: RegionBox[];
}

/** A complete self-contained topology scenario. */
export interface Scenario {
  id: string;
  label: string;                    // shown in the scenario picker
  description: string;              // one-line summary
  azureVNets: AppVNet[];
  awsVNets: AppVNet[];
  shards: ShardDef[];
  nodes: ClusterNode[];
  collections: CollectionDef[];
  /**
   * Optional preset chaos action: which node id is promoted when the operator
   * triggers "Kill Azure East Region". If omitted or the node is missing, the
   * chaos handler falls back to a generic re-election.
   */
  azureEastPromotionNodeId?: string;
  /** Startup log lines describing this scenario. */
  healthyLog: string[];
  /** Banner text when Azure eastus is killed. */
  azureEastBannerText: string;
}


/* ==========================================================================
 *  SCENARIO 1 — "global-2shard" (the original multi-cloud Global Cluster)
 * ======================================================================== */

const S1_AZURE_VNETS: AppVNet[] = [
  {
    id: 'vnet-eastus',
    name: 'Payroll Application',
    cloud: 'Azure',
    region: 'eastus',
    workloadType: 'Payroll / Write-heavy',
  },
  {
    id: 'vnet-westus',
    name: 'Planning Application',
    cloud: 'Azure',
    region: 'westus',
    workloadType: 'Planning / Mixed',
  },
  {
    id: 'vnet-eastus2',
    name: 'Legacy Gateway Integration',
    cloud: 'Azure',
    region: 'eastus2',
    workloadType: 'Integration / Legacy',
  },
];

const S1_AWS_VNETS: AppVNet[] = [
  {
    id: 'vnet-us-east-1',
    name: 'Scheduling Application',
    cloud: 'AWS',
    region: 'us-east-1',
    workloadType: 'Scheduling / Mixed',
  },
  {
    id: 'vnet-us-west-1',
    name: 'Telemetry Service',
    cloud: 'AWS',
    region: 'us-west-1',
    workloadType: 'Telemetry / Read-heavy',
  },
  {
    id: 'vnet-us-east-2',
    name: 'Operations Service',
    cloud: 'AWS',
    region: 'us-east-2',
    workloadType: 'Operations / Mixed',
  },
];

const S1_SHARD0_BOXES: RegionBox[] = [
  {
    id: 'box-s0-eastus',
    shardId: 'shard-0',
    region: 'eastus',
    cloud: 'Azure',
    mongosId: 'mongos-s0-eastus',
    flag: 'Azure',
    nodeIds: ['node-s0-eastus-p', 'node-s0-eastus-s'],
  },
  {
    id: 'box-s0-eastus2',
    shardId: 'shard-0',
    region: 'eastus2',
    cloud: 'Azure',
    mongosId: 'mongos-s0-eastus2',
    flag: 'Azure',
    nodeIds: ['node-s0-eastus2-s'],
  },
  {
    id: 'box-s0-us-west-1',
    shardId: 'shard-0',
    region: 'us-west-1',
    cloud: 'AWS',
    mongosId: 'mongos-s0-us-west-1',
    flag: 'AWS',
    nodeIds: ['node-s0-us-west-1-s1', 'node-s0-us-west-1-s2'],
  },
];

const S1_SHARD1_BOXES: RegionBox[] = [
  {
    id: 'box-s1-westus',
    shardId: 'shard-1',
    region: 'westus',
    cloud: 'Azure',
    mongosId: 'mongos-s1-westus',
    flag: 'Azure',
    nodeIds: ['node-s1-westus-s1', 'node-s1-westus-s2'],
  },
  {
    id: 'box-s1-us-east-2',
    shardId: 'shard-1',
    region: 'us-east-2',
    cloud: 'AWS',
    mongosId: 'mongos-s1-us-east-2',
    flag: 'AWS',
    nodeIds: ['node-s1-us-east-2-s'],
  },
  {
    id: 'box-s1-us-east-1',
    shardId: 'shard-1',
    region: 'us-east-1',
    cloud: 'AWS',
    mongosId: 'mongos-s1-us-east-1',
    flag: 'AWS',
    nodeIds: ['node-s1-us-east-1-p', 'node-s1-us-east-1-s'],
  },
];

const S1_NODES: ClusterNode[] = [
  // Shard 0 (Azure-First)
  { id: 'node-s0-eastus-p', name: 's0-p', shardId: 'shard-0', role: 'PRIMARY', cloud: 'Azure', region: 'eastus', status: 'HEALTHY' },
  { id: 'node-s0-eastus-s', name: 's0-s0', shardId: 'shard-0', role: 'SECONDARY', cloud: 'Azure', region: 'eastus', status: 'HEALTHY' },
  { id: 'node-s0-us-west-1-s1', name: 's0-s1', shardId: 'shard-0', role: 'SECONDARY', cloud: 'AWS', region: 'us-west-1', status: 'HEALTHY' },
  { id: 'node-s0-us-west-1-s2', name: 's0-s2', shardId: 'shard-0', role: 'SECONDARY', cloud: 'AWS', region: 'us-west-1', status: 'HEALTHY' },
  { id: 'node-s0-eastus2-s', name: 's0-s3', shardId: 'shard-0', role: 'SECONDARY', cloud: 'Azure', region: 'eastus2', status: 'HEALTHY' },

  // Shard 1 (AWS-First)
  { id: 'node-s1-us-east-1-p', name: 's1-p', shardId: 'shard-1', role: 'PRIMARY', cloud: 'AWS', region: 'us-east-1', status: 'HEALTHY' },
  { id: 'node-s1-us-east-1-s', name: 's1-s0', shardId: 'shard-1', role: 'SECONDARY', cloud: 'AWS', region: 'us-east-1', status: 'HEALTHY' },
  { id: 'node-s1-westus-s1', name: 's1-s1', shardId: 'shard-1', role: 'SECONDARY', cloud: 'Azure', region: 'westus', status: 'HEALTHY' },
  { id: 'node-s1-westus-s2', name: 's1-s2', shardId: 'shard-1', role: 'SECONDARY', cloud: 'Azure', region: 'westus', status: 'HEALTHY' },
  { id: 'node-s1-us-east-2-s', name: 's1-s3', shardId: 'shard-1', role: 'SECONDARY', cloud: 'AWS', region: 'us-east-2', status: 'HEALTHY' },
];

const S1_COLLECTIONS: CollectionDef[] = [
  {
    id: 'appdb.records',
    namespace: 'appdb.records',
    label: 'App DB · Records',
    shardKey: '{ location: 1, recordId: 1 }',
    residesOn: 'shard-0',
    defaultClientVNetId: 'vnet-eastus',
    sampleDoc: '{ location: "Azure", recordId: "R-10001" }',
    note: 'Zone-pinned to Shard 0 (Azure). All data lives only in the Azure-first zone.',
  },
  {
    id: 'appdb.events',
    namespace: 'appdb.events',
    label: 'App DB · Events',
    shardKey: '{ location: 1, eventId: 1 }',
    residesOn: 'shard-1',
    defaultClientVNetId: 'vnet-us-east-1',
    sampleDoc: '{ location: "AWS", eventId: "EVT-4471" }',
    note: 'Zone-pinned to Shard 1 (AWS). All data lives only in the AWS-first zone.',
  },
];

const SCENARIO_GLOBAL_2SHARD: Scenario = {
  id: 'global-2shard',
  label: 'Global 2-Shard (Azure + AWS)',
  description:
    '2 geo-sharded zones spanning Azure + AWS. Shard 0 primary in Azure eastus, Shard 1 primary in AWS us-east-1.',
  azureVNets: S1_AZURE_VNETS,
  awsVNets: S1_AWS_VNETS,
  shards: [
    {
      id: 'shard-0',
      title: 'Shard 0 · Azure-First Zone',
      subtitle: 'Primary anchored in Azure eastus',
      zoneKey: 'location="Azure"',
      accent: 'purple',
      boxes: S1_SHARD0_BOXES,
    },
    {
      id: 'shard-1',
      title: 'Shard 1 · AWS-First Zone',
      subtitle: 'Primary anchored in AWS us-east-1',
      zoneKey: 'location="AWS"',
      accent: 'emerald',
      boxes: S1_SHARD1_BOXES,
    },
  ],
  nodes: S1_NODES,
  collections: S1_COLLECTIONS,
  azureEastPromotionNodeId: 'node-s0-us-west-1-s1',
  healthyLog: [
    'system> Atlas Global Cluster online. 2 shards / 10 data-bearing members across Azure + AWS.',
    'system> Pick a collection, then arm a Write or Read simulation to begin.',
  ],
  azureEastBannerText:
    'Azure eastus Region Offline — Shard 0 Primary failed over cross-cloud to AWS',
};


/* ==========================================================================
 *  SCENARIO 2 — "single-shard-2-2-1"
 *  1 shard, 5 members: 2 in Azure eastus, 2 in AWS us-west-1, 1 in Azure centralus.
 * ======================================================================== */

const S2_AZURE_VNETS: AppVNet[] = [
  {
    id: 'vnet-ss-eastus',
    name: 'Primary Application',
    cloud: 'Azure',
    region: 'eastus',
    workloadType: 'Line-of-business / Mixed',
  },
  {
    id: 'vnet-ss-centralus',
    name: 'Analytics Application',
    cloud: 'Azure',
    region: 'centralus',
    workloadType: 'Analytics / Read-heavy',
  },
];

const S2_AWS_VNETS: AppVNet[] = [
  {
    id: 'vnet-ss-us-west-1',
    name: 'West Coast Application',
    cloud: 'AWS',
    region: 'us-west-1',
    workloadType: 'Customer-facing / Mixed',
  },
];

const S2_SHARD0_BOXES: RegionBox[] = [
  {
    id: 'box-ss-eastus',
    shardId: 'shard-0',
    region: 'eastus',
    cloud: 'Azure',
    mongosId: 'mongos-ss-eastus',
    flag: 'Azure',
    nodeIds: ['node-ss-eastus-p', 'node-ss-eastus-s'],
  },
  {
    id: 'box-ss-centralus',
    shardId: 'shard-0',
    region: 'centralus',
    cloud: 'Azure',
    mongosId: 'mongos-ss-centralus',
    flag: 'Azure',
    nodeIds: ['node-ss-centralus-s'],
  },
  {
    id: 'box-ss-us-west-1',
    shardId: 'shard-0',
    region: 'us-west-1',
    cloud: 'AWS',
    mongosId: 'mongos-ss-us-west-1',
    flag: 'AWS',
    nodeIds: ['node-ss-us-west-1-s1', 'node-ss-us-west-1-s2'],
  },
];

const S2_NODES: ClusterNode[] = [
  { id: 'node-ss-eastus-p', name: 'ss-p', shardId: 'shard-0', role: 'PRIMARY', cloud: 'Azure', region: 'eastus', status: 'HEALTHY' },
  { id: 'node-ss-eastus-s', name: 'ss-s0', shardId: 'shard-0', role: 'SECONDARY', cloud: 'Azure', region: 'eastus', status: 'HEALTHY' },
  { id: 'node-ss-us-west-1-s1', name: 'ss-s1', shardId: 'shard-0', role: 'SECONDARY', cloud: 'AWS', region: 'us-west-1', status: 'HEALTHY' },
  { id: 'node-ss-us-west-1-s2', name: 'ss-s2', shardId: 'shard-0', role: 'SECONDARY', cloud: 'AWS', region: 'us-west-1', status: 'HEALTHY' },
  { id: 'node-ss-centralus-s', name: 'ss-s3', shardId: 'shard-0', role: 'SECONDARY', cloud: 'Azure', region: 'centralus', status: 'HEALTHY' },
];

const S2_COLLECTIONS: CollectionDef[] = [
  {
    id: 'appdb.records-ss',
    namespace: 'appdb.records',
    label: 'App DB · Records',
    shardKey: '{ _id: 1 }',
    residesOn: 'shard-0',
    defaultClientVNetId: 'vnet-ss-eastus',
    sampleDoc: '{ _id: "R-10001", type: "record" }',
    note: 'Single-shard replica set — all data lives on the sole shard, no zone key required.',
  },
  {
    id: 'appdb.events-ss',
    namespace: 'appdb.events',
    label: 'App DB · Events',
    shardKey: '{ _id: 1 }',
    residesOn: 'shard-0',
    defaultClientVNetId: 'vnet-ss-us-west-1',
    sampleDoc: '{ _id: "EVT-4471", severity: "info" }',
    note: 'Single-shard replica set — reads/writes default to a west-coast (AWS) client.',
  },
];

const SCENARIO_SINGLE_SHARD_221: Scenario = {
  id: 'single-shard-2-2-1',
  label: 'Single-Shard 2-2-1 (Azure/AWS/Azure)',
  description:
    '1 shard, 5 members: 2 in Azure eastus (P + S), 2 in AWS us-west-1 (S + S), 1 in Azure centralus (tiebreaker).',
  azureVNets: S2_AZURE_VNETS,
  awsVNets: S2_AWS_VNETS,
  shards: [
    {
      id: 'shard-0',
      title: 'Shard 0 · Single Replica Set',
      subtitle: 'Primary anchored in Azure eastus · 2–2–1 across 2 clouds',
      zoneKey: 'single-shard',
      accent: 'purple',
      boxes: S2_SHARD0_BOXES,
    },
  ],
  nodes: S2_NODES,
  collections: S2_COLLECTIONS,
  // When Azure eastus is killed, both members there die. The remaining
  // members are 2 in AWS us-west-1 + 1 in Azure centralus (3/5 = majority).
  // Promote one of the AWS us-west-1 secondaries.
  azureEastPromotionNodeId: 'node-ss-us-west-1-s1',
  healthyLog: [
    'system> Atlas replica-set online. 1 shard / 5 data-bearing members spanning Azure eastus, AWS us-west-1, Azure centralus.',
    'system> 2-2-1 topology preserves a majority (3/5) even after any single region outage.',
    'system> Pick a collection, then arm a Write or Read simulation to begin.',
  ],
  azureEastBannerText:
    'Azure eastus Region Offline — Primary failed over cross-cloud to AWS us-west-1 (3/5 majority preserved)',
};


/* ==========================================================================
 *  Scenario registry
 * ======================================================================== */

export const SCENARIOS: Scenario[] = [
  SCENARIO_GLOBAL_2SHARD,
  SCENARIO_SINGLE_SHARD_221,
];

export const DEFAULT_SCENARIO_ID = SCENARIO_GLOBAL_2SHARD.id;

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}


/* ==========================================================================
 *  Derived lookups for a scenario (used by the step engine + canvas)
 * ======================================================================== */

export interface ScenarioLookups {
  allBoxes: RegionBox[];
  allVNets: AppVNet[];
  regionToMongos: Record<string, string>;
  regionToBox: Record<string, RegionBox>;
}

export function scenarioLookups(scenario: Scenario): ScenarioLookups {
  const allBoxes = scenario.shards.flatMap((s) => s.boxes);
  const allVNets = [...scenario.azureVNets, ...scenario.awsVNets];
  const regionToMongos: Record<string, string> = {};
  const regionToBox: Record<string, RegionBox> = {};
  for (const b of allBoxes) {
    regionToMongos[b.region] = b.mongosId;
    regionToBox[b.region] = b;
  }
  return { allBoxes, allVNets, regionToMongos, regionToBox };
}

/** Which shard a collection targets. Preserves the original 2-shard semantics
 *  ("both" / "shard-1" => shard-1; otherwise shard-0) but is safe for any
 *  scenario since single-shard scenarios only ever declare shard-0. */
export function shardForCollection(c: CollectionDef): 'shard-0' | 'shard-1' {
  if (c.residesOn === 'shard-1') return 'shard-1';
  return 'shard-0';
}
