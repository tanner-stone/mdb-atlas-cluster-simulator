/**
 * ============================================================================
 *  SIMULATOR STATE ENGINE (React Context)
 * ============================================================================
 *  Single source of truth for the whole app:
 *    - active scenario (topology preset)                 -> scenario switcher
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
import {
  DEFAULT_SCENARIO_ID,
  getScenario,
  scenarioLookups,
  SCENARIOS,
  type Scenario,
} from '../data/clusterData';
import { generateSteps } from '../data/stepEngine';

/* -------------------------------------------------------------------------- */
/*  State shape                                                               */
/* -------------------------------------------------------------------------- */

interface SimulatorState {
  scenarioId: string;
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

/** Build a pristine state slice for the given scenario. */
function freshScenarioState(scenarioId: string): SimulatorState {
  const scenario = getScenario(scenarioId);
  return {
    scenarioId: scenario.id,
    nodes: scenario.nodes.map((n) => ({ ...n })),
    readPreference: 'nearest',
    writeConcern: 'majority',
    collectionId: scenario.collections[0].id,
    queryType: null,
    currentStep: -1,
    steps: [],
    deadRegions: [],
    deadClouds: [],
    outage: 'NONE',
    failoverActive: false,
    log: [...scenario.healthyLog],
  };
}

const initialState: SimulatorState = freshScenarioState(DEFAULT_SCENARIO_ID);

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

type Action =
  | { type: 'SET_SCENARIO'; value: string }
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

function getCollectionFromScenario(
  scenario: Scenario,
  id: string
): CollectionDef {
  return scenario.collections.find((c) => c.id === id) ?? scenario.collections[0];
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

  const scenario = getScenario(state.scenarioId);
  const lookups = scenarioLookups(scenario);
  const collection = getCollectionFromScenario(scenario, state.collectionId);

  // Pick the originating client. Prefer the collection's default client, but if
  // that VNet's region/cloud is offline, fall back to the nearest surviving
  // client (same cloud first, then any cloud) so the simulation still runs and
  // demonstrates the rerouting.
  const isVNetAlive = (region: string, cloud: 'Azure' | 'AWS') =>
    !state.deadRegions.includes(region) && !state.deadClouds.includes(cloud);

  const defaultClient = lookups.allVNets.find(
    (v) => v.id === collection.defaultClientVNetId
  )!;

  let clientVNet = defaultClient;
  if (!isVNetAlive(defaultClient.region, defaultClient.cloud)) {
    clientVNet =
      lookups.allVNets.find(
        (v) => v.cloud === defaultClient.cloud && isVNetAlive(v.region, v.cloud)
      ) ??
      lookups.allVNets.find((v) => isVNetAlive(v.region, v.cloud)) ??
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
    lookups,
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
    case 'SET_SCENARIO': {
      if (action.value === state.scenarioId) return state;
      const scenario = getScenario(action.value);
      const fresh = freshScenarioState(scenario.id);
      // Preserve operator's read/write preferences across scenario swaps.
      return {
        ...fresh,
        readPreference: state.readPreference,
        writeConcern: state.writeConcern,
        log: [
          ...fresh.log,
          `system> Loaded scenario "${scenario.label}".`,
        ],
      };
    }

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

      const scenario = getScenario(state.scenarioId);

      // Take everyone in eastus down. Preferred promotion node lives on the
      // scenario itself; if it is not present or not eligible, we fall back to
      // a healthy secondary of the affected shard(s).
      const preferPromoteId = scenario.azureEastPromotionNodeId;

      // First, mark eastus DOWN.
      let nodes = state.nodes.map((n) =>
        n.region === 'eastus' ? { ...n, status: 'DOWN' as const } : n
      );

      // Any shards that lost their primary need a re-election. Prefer the
      // scenario-suggested node when it belongs to the shard in question.
      const orphanShards = Array.from(
        new Set(
          nodes
            .filter((n) => n.region === 'eastus' && n.role === 'PRIMARY')
            .map((n) => n.shardId)
        )
      );

      const promotions: string[] = [];
      for (const shardId of orphanShards) {
        const survivors = nodes.filter(
          (n) =>
            n.shardId === shardId &&
            n.status === 'HEALTHY' &&
            n.role === 'SECONDARY'
        );
        let candidate =
          survivors.find((n) => n.id === preferPromoteId) ??
          // otherwise pick the same-cloud (Azure) survivor if any, else any survivor
          survivors.find((n) => n.cloud === 'Azure') ??
          survivors[0];
        if (candidate) {
          promotions.push(
            `${shardId}: ${candidate.region} (${candidate.cloud})`
          );
          nodes = nodes.map((n) =>
            n.id === candidate!.id ? { ...n, role: 'PRIMARY' as const } : n
          );
        }
      }

      return {
        ...state,
        nodes,
        deadRegions: ['eastus'],
        deadClouds: [],
        outage: 'AZURE_EAST',
        failoverActive: promotions.length > 0,
        queryType: null,
        steps: [],
        currentStep: -1,
        log: [
          ...state.log,
          '',
          '!! [CRITICAL CRASH SYSTEM EVENT DECLARED]',
          '   -> Azure eastus region dropped offline unexpectedly.',
          '   -> Initiating cross-cloud heartbeat check protocols.',
          ...(promotions.length
            ? promotions.map(
                (p) => `   -> Raft election complete: PROMOTED to PRIMARY at ${p}.`
              )
            : ['   -> No primaries were lost — replica set quorum preserved.']),
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


    case 'CLEAR_OUTAGE': {
      const fresh = freshScenarioState(state.scenarioId);
      return {
        ...fresh,
        // preserve operator config choices
        readPreference: state.readPreference,
        writeConcern: state.writeConcern,
        collectionId: state.collectionId,
        log: [...state.log, '', 'system> Outage cleared. Topology restored to healthy baseline.'],
      };
    }

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
  scenario: Scenario;
  scenarios: Scenario[];
  setScenario: (id: string) => void;
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

  const setScenario = useCallback(
    (id: string) => dispatch({ type: 'SET_SCENARIO', value: id }),
    []
  );
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

  const scenario = getScenario(state.scenarioId);
  const collection = getCollectionFromScenario(scenario, state.collectionId);

  const value = useMemo<SimulatorContextValue>(
    () => ({
      ...state,
      activeStep,
      collection,
      scenario,
      scenarios: SCENARIOS,
      setScenario,
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
      scenario,
      setScenario,
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
