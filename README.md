# MongoDB Atlas Global Cluster Simulator — AA NXOP Reference Build

A premium, dark-mode React engineering visualizer that demonstrates the runtime
mechanics of a **multi-cloud (Azure + AWS) MongoDB Atlas Global Cluster** to
enterprise architecture stakeholders.

Built with **React + TypeScript + Vite**, **Tailwind CSS**, and **lucide-react**.

---

## What it shows

The simulator ships with **multiple selectable cluster scenarios** (see the
"Cluster Scenario" picker in the left panel):

- **Global 2-Shard (Azure + AWS)** — 2 geo-sharded zones:
  - **Shard 0** (`location="Azure"`) — Primary anchored in Azure `eastus`, with
    cross-cloud secondaries in AWS `us-west-1`.
  - **Shard 1** (`location="AWS"`) — Primary anchored in AWS `us-east-1`, with
    cross-cloud secondaries in Azure `westus`.

- **Single-Shard 2-2-1 (Azure/AWS/Azure)** — 1 replica-set shard, 5 voting
  members spread across 3 regions and 2 clouds:
  - 2 members in Azure `eastus` (Primary + Secondary)
  - 2 members in AWS `us-west-1` (Secondaries)
  - 1 member in Azure `centralus` (Secondary / tiebreaker)
  - Majority = 3/5, preserved even after any single region outage.
- **3-column stage**: Azure client land (Private Link) → Atlas cluster core →
  AWS client land (PrivateLink).
- **Animated request traces** drawn as live SVG overlays (neon **green** for
  writes, neon **cyan** for reads) that anchor to real DOM node ids.
- **Step-by-step walkthrough console** with Reset / Previous / Next playback and
  a running mono-spaced transcript.

## Interactive features

| Control | Behaviour |
| --- | --- |
| **Read Preference / Write Concern** | Re-arms reads so `nearest` vs `primary` routing changes live. |
| **Target Collection** | Switches the namespace & origin client; geo collections route per-shard. |
| **Simulate Write / Read** | Generates a fresh step sequence from the *live* topology. |
| **Kill Azure East Region** | Greys out `eastus`, declares a crash event, and **promotes** the surviving AWS `us-west-1` secondary to Primary. |
| **Azure / AWS Cloud Outage** | Drops an entire cloud and re-elects primaries per shard on the surviving cloud. |
| **Reset to Healthy State** | Restores the baseline topology (keeps operator config). |

### Dynamic routing engine

Walkthrough steps are **generated from the current cluster state**
(`src/data/stepEngine.ts`), not hard-coded. So after a failover or cloud outage:

- A write whose default origin client is offline automatically **falls back** to
  the nearest surviving client in the same cloud.
- Routing always targets the **currently elected Primary**, demonstrating
  cross-cloud rerouting after an Azure `eastus` failure.

---

## Project structure

```
src/
  types.ts                     Core domain types (nodes, VNets, steps, outages)
  data/
    clusterData.ts             Topology presets (shards, region boxes, VNets, collections)
    stepEngine.ts              Dynamic step/trace generator from live topology
  state/
    SimulatorContext.tsx       Central reducer state engine + failover logic
  components/
    primitives.tsx             Shared badges (nodes, mongos, cloud flags, glass panel)
    ConfigPanel.tsx            Panel A — configuration sidebar
    ArchitectureCanvas.tsx     Panel B — interactive 3-column stage
    TraceRouter.tsx            SVG overlay path router (animated traces)
    WalkthroughConsole.tsx     Panel C — playback + transcript console
  App.tsx                      Layout shell
```

---

## Run locally

```bash
npm install
npm run dev      # start Vite dev server
npm run build    # type-check + production build
```

> This is an **engineering visualizer** — it does not connect to a live cluster.
