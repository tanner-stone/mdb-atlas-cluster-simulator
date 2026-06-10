/**
 * ============================================================================
 *  SIMULATOR STATE ENGINE (React Context)
 * ============================================================================
 *  Single source of truth for the whole app:
 *    - cluster node topology (roles / health)            -> failover engine
 *    - read preference / write concern configuration
 *    - the selected collection                           -> step generation
 *    - the currently armed query track + step pointer     -> walkthrough
 *    - chaos state: dead regions / dead clouds            -> chaos sandbox
 *    - the console transcript log
 *
 *  Walkthrough steps are GENERATED dynamically (see data/stepEngine.ts) from
 *  the live topology + selected collection, so routing always reflects the
 *  real cluster state (including failover & cloud outages).
 * ============================================================================
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  ClusterNode,
  CollectionDef,
  OutageKind,
  QueryType,
  ReadPreference,
  SimulationStep,
  WriteConcern,
} from '../types';
import { COLLECTION_LEDGER, DEFAULT_NODES, ALL_VNETS } from '../data/clusterData';
import { generateSteps } from '../data/stepEngine';

/* -------------------------------------------------------------------------- */
/*  State shape                                                               */
/* -------------------------------------------------------------------------- */

interface SimulatorState {
  nodes: ClusterNode[];
  readPreference: ReadPreference;
  writeConcern: WriteConcern;
  collectionId: string;
  queryType: QueryType;
  currentStep: number; // -1 means "armed but not started"
  steps: SimulationStep[];
  /** Region ids fully offline. */
  deadRegions: string[];
  /** Clouds fully offline (cloud-outage scenario). */
  deadClouds: ('Azure' | 'AWS')[];
  outage: OutageKind;
  failoverActive: boolean;
  log: string[];
}

const HEALTHY_LOG = [
  'system> Atlas Global Cluster online. 2 shards / 10 data-bearing members across Azure + AWS.',
  'system> Pick a collection, then arm a Write or Read simulation to begin.',
];

const initialState: SimulatorState = {
  nodes: DEFAULT_NODES.map((n) => ({ ...n })),
  readPreference: 'nearest',
  writeConcern: 'majority',
  collectionId: COLLECTION_LEDGER[0].id,
  queryType: null,
  currentStep: -1,
  steps: [],
  deadRegions: [],
  deadClouds: [],
  outage: 'NONE',
  failoverActive: false,
  log: [...HEALTHY_LOG],
};

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

type Action =
  | { type: 'SET_READ_PREF'; value: ReadPreference }
  | { type: 'SET_WRITE_CONCERN'; value: WriteConcern }
  | { type: 'SET_COLLECTION'; value: string }
  | { type: 'ARM_QUERY'; queryType: QueryType }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET_WALKTHROUGH' }
  | { type: 'KILL_AZURE_EAST' }
  | { type: 'NODE_DOWN'; nodeId: string }
  | { type: 'CLEAR_OUTAGE' };


/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function getCollection(id: string): CollectionDef {
  return COLLECTION_LEDGER.find((c) => c.id === id) ?? COLLECTION_LEDGER[0];
}

/** Removes a leading "[n/m] " tag from explanations for the log feed. */
function stripTag(text: string): string {
  return text.replace(/^\[\d+\/\d+\]\s*/, '').split('\n')[0];
}

/**
 * Rebuild the walkthrough for the currently armed query against the live
 * topology. Returns a partial state slice (steps / currentStep / log additions).
 */
function buildWalkthrough(
  state: SimulatorState,
  queryType: QueryType
): Partial<SimulatorState> {
  if (queryType === null) {
    return { queryType: null, steps: [], currentStep: -1 };
  }

  const collection = getCollection(state.collectionId);

  // Pick the originating client. Prefer the collection's default client, but if
  // that VNet's region/cloud is offline, fall back to the nearest surviving
  // client (same cloud first, then any cloud) so the simulation still runs and
  // demonstrates the rerouting.
  const isVNetAlive = (region: string, cloud: 'Azure' | 'AWS') =>
    !state.deadRegions.includes(region) && !state.deadClouds.includes(cloud);

  const defaultClient = ALL_VNETS.find(
    (v) => v.id === collection.defaultClientVNetId
  )!;

  let clientVNet = defaultClient;
  if (!isVNetAlive(defaultClient.region, defaultClient.cloud)) {
    clientVNet =
      ALL_VNETS.find(
        (v) => v.cloud === defaultClient.cloud && isVNetAlive(v.region, v.cloud)
      ) ??
      ALL_VNETS.find((v) => isVNetAlive(v.region, v.cloud)) ??
      defaultClient;
  }


  const steps = generateSteps({
    queryType,
    collection,
    clientVNet: {
      id: clientVNet.id,
      region: clientVNet.region,
      cloud: clientVNet.cloud,
      name: clientVNet.name,
    },
    readPreference: state.readPreference,
    writeConcern: state.writeConcern,
    topo: {
      nodes: state.nodes,
      deadRegions: state.deadRegions,
      deadClouds: state.deadClouds,
    },
  });


  if (steps.length === 0) {
    return {
      queryType,
      steps: [],
      currentStep: -1,
      log: [
        ...state.log,
        `!! client> ${queryType} on ${collection.namespace} is UNREACHABLE under the current outage — ${
          clientVNet.name
        } or its target shard has no surviving members.`,
      ],
    };
  }

  return {
    queryType,
    steps,
    currentStep: 0,
    log: [
      ...state.log,
      `client> Armed ${queryType} on ${collection.namespace} (${steps.length} steps).`,
      `step 1> ${stripTag(steps[0].explanation)}`,
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Reducer                                                                   */
/* -------------------------------------------------------------------------- */

function reducer(state: SimulatorState, action: Action): SimulatorState {
  switch (action.type) {
    case 'SET_READ_PREF': {
      const next = { ...state, readPreference: action.value };
      // If a READ is currently armed, regenerate so the new pref takes effect.
      if (state.queryType === 'READ') {
        return { ...next, ...buildWalkthrough(next, 'READ') };
      }
      return next;
    }

    case 'SET_WRITE_CONCERN':
      return { ...state, writeConcern: action.value };

    case 'SET_COLLECTION': {
      const next = { ...state, collectionId: action.value };
      // Re-arm the current query (if any) against the new collection.
      if (state.queryType) {
        return { ...next, ...buildWalkthrough(next, state.queryType) };
      }
      return next;
    }

    case 'ARM_QUERY':
      return { ...state, ...buildWalkthrough(state, action.queryType) };

    case 'NEXT_STEP': {
      if (state.currentStep < 0 || state.currentStep >= state.steps.length - 1) {
        return state;
      }
      const next = state.currentStep + 1;
      const step = state.steps[next];
      return {
        ...state,
        currentStep: next,
        log: [...state.log, `step ${next + 1}> ${stripTag(step.explanation)}`],
      };
    }

    case 'PREV_STEP':
      return state.currentStep <= 0
        ? state
        : { ...state, currentStep: state.currentStep - 1 };

    case 'RESET_WALKTHROUGH':
      return {
        ...state,
        queryType: null,
        steps: [],
        currentStep: -1,
        log: [...state.log, 'system> Walkthrough reset. Trace cleared.'],
      };

    case 'KILL_AZURE_EAST': {
      if (state.outage !== 'NONE') return state;

      // Mark eastus DOWN; promote the surviving Shard-0 secondary in AWS us-west-1.
      const promotedId = 'node-s0-us-west-1-s1';
      const nodes = state.nodes.map((n) => {
        if (n.region === 'eastus') return { ...n, status: 'DOWN' as const };
        if (n.id === promotedId) return { ...n, role: 'PRIMARY' as const };
        return n;
      });

      return {
        ...state,
        nodes,
        deadRegions: ['eastus'],
        deadClouds: [],
        outage: 'AZURE_EAST',
        failoverActive: true,
        queryType: null,
        steps: [],
        currentStep: -1,
        log: [
          ...state.log,
          '',
          '!! [CRITICAL CRASH SYSTEM EVENT DECLARED]',
          '   -> Shard 0 Primary node in Azure eastus dropped offline unexpectedly.',
          '   -> Initiating cross-cloud heartbeat check protocols.',
          '   -> Raft election complete: Shard 0 Secondary (AWS us-west-1) PROMOTED to PRIMARY.',
          'system> Cluster degraded but available. Re-arm a Write/Read to see rerouting.',
        ],
      };
    }

    case 'NODE_DOWN': {
      if (state.outage !== 'NONE') return state;

      const target = state.nodes.find((n) => n.id === action.nodeId);
      if (!target) return state;

      // Take the targeted member offline.
      let nodes = state.nodes.map((n) =>
        n.id === target.id ? { ...n, status: 'DOWN' as const } : n
      );

      // If the failed member was a Primary, re-elect among the shard's
      // surviving secondaries. Prefer same-cloud peers first (fast election),
      // then any healthy secondary regardless of cloud.
      const promotions: string[] = [];
      if (target.role === 'PRIMARY') {
        const peers = nodes.filter(
          (n) =>
            n.shardId === target.shardId &&
            n.id !== target.id &&
            n.role === 'SECONDARY' &&
            n.status === 'HEALTHY'
        );
        const sameCloud = peers.filter((p) => p.cloud === target.cloud);
        const candidate = sameCloud[0] ?? peers[0];
        if (candidate) {
          promotions.push(
            `${target.shardId}: ${candidate.region} (${candidate.cloud})`
          );
          nodes = nodes.map((n) =>
            n.id === candidate.id ? { ...n, role: 'PRIMARY' as const } : n
          );
        }
      }

      const failoverActive = target.role === 'PRIMARY';

      return {
        ...state,
        nodes,
        deadRegions: [],
        deadClouds: [],
        outage: 'NODE_DOWN',
        failoverActive,
        queryType: null,
        steps: [],
        currentStep: -1,
        log: [
          ...state.log,
          '',
          `!! [NODE FAILURE DECLARED — ${target.name}]`,
          `   -> Member ${target.name} (${target.role}) in ${target.region} (${target.cloud}) has gone offline.`,
          ...(failoverActive
            ? [
                '   -> Initiating Raft re-election among surviving shard members.',
                ...(promotions.length
                  ? promotions.map(
                      (p) => `   -> Raft election complete: PROMOTED to PRIMARY at ${p}.`
                    )
                  : ['   -> No surviving secondaries available — shard write-unavailable.']),
              ]
            : ['   -> Replica set quorum preserved; no re-election required.']),
          'system> Re-arm a Write/Read to see how routing adapts.',
        ],
      };
    }


    case 'CLEAR_OUTAGE':
      return {
        ...initialState,
        // preserve operator config choices
        readPreference: state.readPreference,
        writeConcern: state.writeConcern,
        collectionId: state.collectionId,
        log: [...state.log, '', 'system> Outage cleared. Topology restored to healthy baseline.'],
      };

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/*  Context plumbing                                                          */
/* -------------------------------------------------------------------------- */

interface SimulatorContextValue extends SimulatorState {
  activeStep: SimulationStep | null;
  collection: CollectionDef;
  setReadPreference: (v: ReadPreference) => void;
  setWriteConcern: (v: WriteConcern) => void;
  setCollection: (id: string) => void;
  armQuery: (q: QueryType) => void;
  nextStep: () => void;
  prevStep: () => void;
  resetWalkthrough: () => void;
  killAzureEast: () => void;
  killNode: (nodeId: string) => void;
  clearOutage: () => void;
}


const SimulatorContext = createContext<SimulatorContextValue | null>(null);

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setReadPreference = useCallback(
    (v: ReadPreference) => dispatch({ type: 'SET_READ_PREF', value: v }),
    []
  );
  const setWriteConcern = useCallback(
    (v: WriteConcern) => dispatch({ type: 'SET_WRITE_CONCERN', value: v }),
    []
  );
  const setCollection = useCallback(
    (id: string) => dispatch({ type: 'SET_COLLECTION', value: id }),
    []
  );
  const armQuery = useCallback(
    (q: QueryType) => dispatch({ type: 'ARM_QUERY', queryType: q }),
    []
  );
  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), []);
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), []);
  const resetWalkthrough = useCallback(
    () => dispatch({ type: 'RESET_WALKTHROUGH' }),
    []
  );
  const killAzureEast = useCallback(() => dispatch({ type: 'KILL_AZURE_EAST' }), []);
  const killNode = useCallback(
    (nodeId: string) => dispatch({ type: 'NODE_DOWN', nodeId }),
    []
  );
  const clearOutage = useCallback(() => dispatch({ type: 'CLEAR_OUTAGE' }), []);


  const activeStep =
    state.currentStep >= 0 && state.steps[state.currentStep]
      ? state.steps[state.currentStep]
      : null;

  const collection = getCollection(state.collectionId);

  const value = useMemo<SimulatorContextValue>(
    () => ({
      ...state,
      activeStep,
      collection,
      setReadPreference,
      setWriteConcern,
      setCollection,
      armQuery,
      nextStep,
      prevStep,
      resetWalkthrough,
      killAzureEast,
      killNode,
      clearOutage,
    }),
    [
      state,
      activeStep,
      collection,
      setReadPreference,
      setWriteConcern,
      setCollection,
      armQuery,
      nextStep,
      prevStep,
      resetWalkthrough,
      killAzureEast,
      killNode,
      clearOutage,
    ]

  );

  return (
    <SimulatorContext.Provider value={value}>{children}</SimulatorContext.Provider>
  );
}

/** Strongly-typed consumer hook. */
export function useSimulator(): SimulatorContextValue {
  const ctx = useContext(SimulatorContext);
  if (!ctx) {
    throw new Error('useSimulator must be used within a <SimulatorProvider>');
  }
  return ctx;
}
