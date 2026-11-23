/** Case reconstruction board: the team's own current selections laid out as a connected chain. It only repeats what the team has picked (empty = dashed); it never says whether a pick is right. */
type Pick = { label: string; value: string; x: number; y: number };
export function CaseBoard({ lure, capture, session, exportId, insider, linked, hypothesis }: { lure: string; capture: string; session: string; exportId: string; insider: string; linked: string; hypothesis: string }) {
  const nodes: Pick[] = [
    { label: "LURE", value: lure, x: 9, y: 14 }, { label: "CAPTURE", value: capture, x: 29, y: 14 }, { label: "SESSION", value: session, x: 49, y: 14 }, { label: "EXPORT", value: exportId, x: 69, y: 14 },
    { label: "INSIDER", value: insider, x: 49, y: 38 }, { label: "EVIDENCE", value: linked, x: 29, y: 38 },
  ];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [4, 3], [5, 2]];
  const sealed = !!(lure && capture && session && exportId && insider && hypothesis);
  return <figure className="cn-board" aria-hidden="true">
    <svg viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" focusable="false">
      {edges.map(([a, b]) => { const p = nodes[a], q = nodes[b], on = !!(p.value && q.value); return <line key={`${a}${b}`} className={on ? "on" : ""} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />; })}
      <line className={hypothesis && exportId ? "on" : ""} x1="69" y1="14" x2="90" y2="26" /><line className={hypothesis && insider ? "on" : ""} x1="49" y1="38" x2="90" y2="26" />
      {nodes.map(n => <g key={n.label} className={n.value ? "node on" : "node"}><circle cx={n.x} cy={n.y} r="5.2" /><text className="lb" x={n.x} y={n.y - 8}>{n.label}</text><text className="vl" x={n.x} y={n.y + 1.2}>{n.value ? "●" : "○"}</text><text className="id" x={n.x} y={n.y + 10}>{n.value || "—"}</text></g>)}
      <g className={sealed ? "seal on" : "seal"}><circle cx="90" cy="26" r="8.4" /><circle cx="90" cy="26" r="6.4" /><text className="lb" x="90" y="14">VERDICT</text><text className="sl" x="90" y="27.2">{sealed ? "READY" : "OPEN"}</text><text className="id" x="90" y="39">{hypothesis || "—"}</text></g>
    </svg>
  </figure>;
}
