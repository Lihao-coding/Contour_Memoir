import { Html, Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { useCameraFlight } from "../atmosphere/useCameraFlight";
import { sampleHeight, type TerrainData } from "../terrain/sampleHeight";
import { onTerrain, type MapPoint } from "./position";

export default function FieldMarker({ point, accuracy, data, exaggeration, simulated, stale }: {
  point: MapPoint;
  accuracy?: number;
  data: TerrainData;
  exaggeration: number;
  simulated: boolean;
  stale: boolean;
}) {
  const color = stale ? "#a2b4b5" : simulated ? "#f3c879" : "#62e4ec";
  const height = sampleHeight(data, point.x, point.z) * exaggeration;
  const ring = useMemo(() => {
    if (!accuracy || accuracy > 100) return null;
    const points = Array.from({ length: 49 }, (_, i) => {
      const angle = i * Math.PI * 2 / 48;
      const x = point.x + Math.cos(angle) * accuracy;
      const z = point.z + Math.sin(angle) * accuracy;
      if (!onTerrain({ x, z }, data.meta.size_m)) return null;
      return new Vector3(x, sampleHeight(data, x, z) * exaggeration + 2, z);
    });
    return points.every((vertex) => vertex !== null) ? points : null;
  }, [point, accuracy, data, exaggeration]);
  return <>
    {ring && <Line points={ring} color={color} transparent opacity={0.48} lineWidth={1} />}
    <group position={[point.x, height + 1, point.z]}>
      <mesh position={[0, 17, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 34, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={[0, 34, 0]} center zIndexRange={[10, 10]} style={{ pointerEvents: "none" }}>
        <span className="field-pin" style={{ color }} aria-hidden="true" />
      </Html>
    </group>
  </>;
}

export function FocusField({ aim, distance = 430 }: { aim: Vector3 | null; distance?: number }) {
  const { camera, orbit, moveTo, cancel } = useCameraFlight();
  useEffect(() => {
    if (!aim || !orbit) return;
    const offset = camera.position.clone().sub(orbit.target);
    offset.y = Math.max(offset.y, Math.hypot(offset.x, offset.z) * 1.1);
    offset.setLength(Math.min(offset.length(), distance));
    moveTo(aim.clone().add(offset), aim, 650);
    return cancel;
  }, [aim, camera, distance, orbit, moveTo, cancel]);
  return null;
}
