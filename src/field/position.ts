import type { TrackData } from "../trail/track";

export type MapPoint = { x: number; z: number };

export function onTerrain(point: MapPoint | null, [width, depth]: [number, number]): point is MapPoint {
  return !!point && Math.abs(point.x) <= width / 2 && Math.abs(point.z) <= depth / 2;
}

export function nearestRoute(point: MapPoint, { points }: TrackData) {
  let offset = Infinity;
  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az, start] = points[i - 1];
    const [bx, bz, end] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    if (!lengthSquared) continue;
    const fraction = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lengthSquared));
    const gap = Math.hypot(point.x - (ax + fraction * dx), point.z - (az + fraction * dz));
    if (gap < offset) {
      offset = gap;
      distance = start + fraction * (end - start);
    }
  }
  return Number.isFinite(offset) ? { offset, distance } : null;
}
