import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { MathUtils, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";
import { sampleHeight, type TerrainData } from "../terrain/sampleHeight";
import type { GroundTrack } from "./track";

export default function RouteFlight({ route, terrain, exaggeration, progress, distance }: {
  route: GroundTrack;
  terrain: TerrainData;
  exaggeration: number;
  progress: number;
  distance: number;
}) {
  const { invalidate } = useThree();
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const vectors = useMemo(() => ({
    position: new Vector3(), aim: new Vector3(), behind: new Vector3(), ahead: new Vector3(), center: new Vector3(), heading: new Vector3(),
  }), []);
  useEffect(() => { invalidate(); }, [invalidate, progress]);

  useFrame(({ camera, controls }, delta) => {
    const orbit = controls as OrbitControls | null;
    if (!orbit?.enabled) return;
    const { position, aim, behind, ahead, center, heading } = vectors;
    const scale = 1000 / Math.max(...terrain.meta.size_m);
    route.getPointAt(progress, center);
    route.getPointAt(Math.max(0, progress - 110 / distance), behind);
    route.getPointAt(Math.min(1, progress + 150 / distance), ahead);
    heading.subVectors(ahead, behind);
    heading.y = 0;
    if (heading.lengthSq() < 0.001) return;
    heading.normalize();
    aim.copy(center).lerp(ahead, 0.32).multiplyScalar(scale);
    aim.y += 7;
    position.copy(center).multiplyScalar(scale).addScaledVector(heading, -165);
    position.x += heading.z * 47;
    position.z -= heading.x * 47;
    const [width, depth] = terrain.meta.size_m.map((length) => length * scale);
    position.x = MathUtils.clamp(position.x, -width / 2 + 7, width / 2 - 7);
    position.z = MathUtils.clamp(position.z, -depth / 2 + 7, depth / 2 - 7);
    const surface = sampleHeight(terrain, position.x / scale, position.z / scale) * exaggeration * scale;
    const horizontalSq = (position.x - aim.x) ** 2 + (position.z - aim.z) ** 2;
    const clearance = Math.sqrt(Math.max(0, (orbit.minDistance + 2) ** 2 - horizontalSq));
    position.y = Math.max(position.y + 88, surface + 53, aim.y + clearance);
    const alpha = reduced ? 1 : MathUtils.damp(0, 1, 3.7, Math.min(delta, 0.05));
    camera.position.lerp(position, alpha);
    orbit.target.lerp(aim, alpha);
    camera.lookAt(orbit.target);
    if (camera.position.distanceToSquared(position) + orbit.target.distanceToSquared(aim) > 0.25) invalidate();
  }, -0.5);

  return null;
}
