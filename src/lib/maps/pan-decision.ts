export type LatLngLiteral = { lat: number; lng: number };
export type PanDecision = { kind: "none" } | { kind: "pan"; to: LatLngLiteral } | { kind: "fit"; points: LatLngLiteral[] };

/** Spec "Map behavior": move only when a highlighted pin is off-screen; never move back. */
export function panDecision(targets: LatLngLiteral[], inView: (p: LatLngLiteral) => boolean): PanDecision {
  if (targets.length === 0 || targets.every(inView)) return { kind: "none" };
  if (targets.length === 1) return { kind: "pan", to: targets[0] };
  return { kind: "fit", points: targets };
}
