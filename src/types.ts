/**
 * ============================================================================
 *  CORE DOMAIN TYPES
 *  MongoDB Atlas Global Cluster Simulator — Multi-Cloud Reference Build
 * ============================================================================
 *  Centralized type definitions that describe the runtime topology of the
 *  multi-cloud MongoDB Atlas Global Cluster, the surrounding application
 *  VNets, and the step-by-step simulation framework that drives the animated
 *  trace visualizer.
 * ============================================================================
 */

export type CloudProvider = 'Azure' | 'AWS';

export type NodeRole = 'PRIMARY' | 'SECONDARY' | 'READ_ONLY';

export type NodeStatus = 'HEALTHY' | 'DOWN';

/** A single mongod data-bearing replica-set member living inside a shard zone. */
export interface ClusterNode {
  id: string;
  name: string; // e.g., "s0-p", "s1-s1"
  shardId: string; // "shard-0" (Azure-focused) or "shard-1" (AWS-focused)
  role: NodeRole;
  cloud: CloudProvider;
  region: string; // "eastus", "us-east-1", "westus", etc.
  status: NodeStatus;
}

/** An application network (VNet / VPC) consuming the cluster via Private Link. */
export interface AppVNet {
  id: string;
  name: string; // e.g., "Payroll App (Azure)", "Scheduling App (AWS)"
  cloud: CloudProvider;
  region: string;
  workloadType: string;
}

/** A single discrete checkpoint inside an animated transaction walkthrough. */
export interface SimulationStep {
  stepIndex: number;
  title: string;
  activeElementIds: string[]; // DOM element ids to visually pulse / highlight
  explanation: string;
  /**
   * Ordered sequence of node/element ids the SVG router should connect with an
   * animated trace line. A single trace may fan out to multiple endpoints when
   * `branch` is true (e.g. replication to all secondaries).
   */
  traceLinePath?: string[];
  /** When true, every hop after the first source connects from the source. */
  branch?: boolean;
  /**
   * Optional MULTIPLE simultaneous trace groups. Each group renders its own
   * line(s) — useful when a step shows e.g. an ack returning to the client
   * AND additional async replication fan-out happening concurrently.
   */
  traceLineGroups?: Array<{ path: string[]; branch?: boolean }>;
}


/** Read preference options exposed in the configuration panel. */
export type ReadPreference =
  | 'nearest'
  | 'primary'
  | 'secondary'
  | 'primaryPreferred'
  | 'secondaryPreferred';

/** Write concern options exposed in the configuration panel. */
export type WriteConcern = 'majority' | '1';

/** Which simulation track is currently armed / playing. */
export type QueryType = 'WRITE' | 'READ' | null;

/**
 * A logical collection the operator can target. Geo-sharded collections live
 * on BOTH shards (routed by the leading shard-key zone); app-pinned collections
 * are zoned entirely onto a single shard.
 */
export interface CollectionDef {
  id: string;
  namespace: string; // e.g. "global.flights"
  label: string; // friendly name shown in the picker
  shardKey: string;
  /**
   * Which shard(s) hold this collection's data.
   *  - 'shard-0'  : pinned to the Azure-first zone
   *  - 'shard-1'  : pinned to the AWS-first zone
   *  - 'both'     : geo-sharded across both zones
   */
  residesOn: 'shard-0' | 'shard-1' | 'both';
  /** The default originating client VNet id for simulations on this collection. */
  defaultClientVNetId: string;
  /** A representative document/zone value used in generated code snippets. */
  sampleDoc: string;
  note: string;
}

/** The kind of regional/cloud chaos currently injected into the topology. */
export type OutageKind = 'NONE' | 'AZURE_EAST' | 'NODE_DOWN';


