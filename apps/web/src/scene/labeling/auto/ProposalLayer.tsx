import { Html, Line } from "@react-three/drei";
import type { Portals } from "@rashomon/schema";
import { useMemo } from "react";
import type { Candidate } from "./candidates";
import { useProposalStore, type Proposal } from "./proposalStore";

const PROPOSAL_COLOR = "#ffd24a";
const GRAPH_COLOR = "#7fd1ff";
const GRAPH_LIFT_M = 0.03;

type Point = [number, number, number];

function boxEdges(candidate: Candidate): Point[] {
  const [x0, y0, z0] = candidate.bounds.min;
  const [x1, y1, z1] = candidate.bounds.max;
  const c: Point[] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return pairs.flatMap(([a, b]) => [c[a!]!, c[b!]!]);
}

function ProposalBox({ proposal }: { proposal: Proposal }) {
  const { candidate } = proposal;
  const points = useMemo(() => boxEdges(candidate), [candidate]);
  const top: Point = [candidate.position[0], candidate.bounds.max[1], candidate.position[2]];
  return (
    <>
      <Line points={points} segments dashed dashSize={0.12} gapSize={0.08} color={PROPOSAL_COLOR} lineWidth={1.5} />
      <Html position={top} center style={{ pointerEvents: "none" }}>
        <div style={{ color: PROPOSAL_COLOR, font: "600 12px system-ui, sans-serif", whiteSpace: "nowrap", textShadow: "0 0 3px #000" }}>
          {proposal.number} {proposal.label} · {Math.round(proposal.confidence * 100)}%
        </div>
      </Html>
    </>
  );
}

function WalkableGraph({ portals, y }: { portals: Portals; y: number }) {
  const points = useMemo(() => {
    const byId = new Map(portals.waypoints.map((w) => [w.id, w]));
    return portals.edges.flatMap(([a, b]): Point[] => {
      const from = byId.get(a);
      const to = byId.get(b);
      return from && to ? [[from.x, y, from.z], [to.x, y, to.z]] : [];
    });
  }, [portals, y]);
  return (
    <>
      {points.length > 0 ? <Line points={points} segments color={GRAPH_COLOR} transparent opacity={0.3} lineWidth={1} /> : null}
      {portals.waypoints.map((w) => (
        <mesh key={w.id} position={[w.x, y, w.z]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshBasicMaterial color={GRAPH_COLOR} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

export function ProposalLayer() {
  const proposals = useProposalStore((state) => state.proposals);
  const portals = useProposalStore((state) => state.portals);
  const y0 = useProposalStore((state) => state.y0);
  return (
    <>
      {proposals.map((proposal) => (
        <ProposalBox key={proposal.candidate.id} proposal={proposal} />
      ))}
      {portals ? <WalkableGraph portals={portals} y={y0 + GRAPH_LIFT_M} /> : null}
    </>
  );
}
