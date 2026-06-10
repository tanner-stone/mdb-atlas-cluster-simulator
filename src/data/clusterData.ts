/**
 * ============================================================================
 *  DEFAULT CLUSTER PRESET — "Global Zoned Multi-Cloud Topology"
 * ============================================================================
 *  Pre-populates the simulator with a multi-cloud Atlas Global Cluster that
 *  spans Azure and AWS. Two zone-keyed shards each replicate across BOTH
 *  clouds so reads can be served locally regardless of which cloud the calling
 *  application lives in.
 *
 *  ID CONVENTIONS (these strings are reused by the SVG trace router):
 *    - VNets:        vnet-<region>            e.g. vnet-eastus
 *    - Shard boxes:  box-<shard>-<region>     e.g. box-s0-eastus
 *    - mongos:       mongos-<shard>-<region>  e.g. mongos-s0-eastus
 *    - data nodes:   node-<shard>-<region>-<n>
 * ============================================================================
 */

import type { AppVNet, ClusterNode, CollectionDef } from '../types';


/* --------------------------------------------------------------------------
 *  COLUMN 1 — Azure Client Land (left wing flank, Azure Private Link)
 * ------------------------------------------------------------------------ */
export const AZURE_VNETS: AppVNet[] = [
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

/* --------------------------------------------------------------------------
 *  COLUMN 3 — AWS Client Land (right wing flank, AWS PrivateLink)
 * ------------------------------------------------------------------------ */
export const AWS_VNETS: AppVNet[] = [
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

/* --------------------------------------------------------------------------
 *  COLUMN 2 — Atlas Unified Global Cluster Core
 *  Each "box" represents a regional infrastructure stack (mongos + nodes).
 *  We describe the layout declaratively so the canvas and the trace router
 *  stay perfectly in sync.
 * ------------------------------------------------------------------------ */

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

type CloudProviderTag = 'Azure' | 'AWS';

/**
 * SHARD 0 — Azure-First zone (Zone Key: location="Azure")
 * Primary lives in Azure eastus; secondaries fan out across Azure + AWS.
 */
export const SHARD0_BOXES: RegionBox[] = [
  // Visual order (left -> right): same-cloud Azure stacks adjacent to the
  // Azure VNet column, AWS cross-cloud secondaries on the far right.
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
    flag: 'AWS', // cross-cloud secondary members living inside AWS
    nodeIds: ['node-s0-us-west-1-s1', 'node-s0-us-west-1-s2'],
  },
];


/**
 * SHARD 1 — AWS-First zone (Zone Key: location="AWS")
 * Primary lives in AWS us-east-1; secondaries fan out across AWS + Azure.
 */
export const SHARD1_BOXES: RegionBox[] = [
  // Visual order (left -> right): Azure cross-cloud secondary first (closest
  // to the Azure VNet column), then the same-cloud AWS stacks adjacent to
  // the AWS VNet column on the right.
  {
    id: 'box-s1-westus',
    shardId: 'shard-1',
    region: 'westus',
    cloud: 'Azure',
    mongosId: 'mongos-s1-westus',
    flag: 'Azure', // cross-cloud secondary members living inside Azure
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


/* --------------------------------------------------------------------------
 *  Flat node registry — the canonical source of truth for node role/status.
 *  The failover engine mutates copies of these records.
 * ------------------------------------------------------------------------ */
export const DEFAULT_NODES: ClusterNode[] = [
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

/* --------------------------------------------------------------------------
 *  COLLECTION LEDGER
 *  The operator may target any of these for a Read/Write simulation. The
 *  `residesOn` field drives how the dynamic step engine routes the query:
 *    - 'both'    => geo-sharded; mongos routes by the leading "location" key
 *    - 'shard-0' => pinned entirely to the Azure-first zone
 *    - 'shard-1' => pinned entirely to the AWS-first zone
 * ------------------------------------------------------------------------ */
export const COLLECTION_LEDGER: CollectionDef[] = [
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

/* --------------------------------------------------------------------------
 *  TOPOLOGY LOOKUP HELPERS
 *  Used by the dynamic step engine to resolve correct routing without
 *  hard-coding step arrays. All client regions coincide with a shard-box
 *  region, so the "local mongos" a client connects to is the mongos sitting
 *  in that same physical region (it can route to ANY shard, cluster-wide).
 * ------------------------------------------------------------------------ */

export const ALL_BOXES: RegionBox[] = [...SHARD0_BOXES, ...SHARD1_BOXES];

export const ALL_VNETS: AppVNet[] = [...AZURE_VNETS, ...AWS_VNETS];

/** Region => the mongos id physically located in that region (client entry). */
export const REGION_TO_MONGOS: Record<string, string> = ALL_BOXES.reduce(
  (acc, b) => {
    acc[b.region] = b.mongosId;
    return acc;
  },
  {} as Record<string, string>
);

/** Region => the shard-box id physically located in that region. */
export const REGION_TO_BOX: Record<string, RegionBox> = ALL_BOXES.reduce(
  (acc, b) => {
    acc[b.region] = b;
    return acc;
  },
  {} as Record<string, RegionBox>
);

/** Which shard a collection's leading zone-key targets ("Azure" => shard-0). */
export function shardForCollection(
  c: CollectionDef
): 'shard-0' | 'shard-1' {
  if (c.residesOn === 'shard-1') return 'shard-1';
  // 'shard-0' and 'both' (default sample doc uses location:"Azure") => shard-0
  return 'shard-0';
}

