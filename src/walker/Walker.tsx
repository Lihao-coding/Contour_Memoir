import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import { DoubleSide, Vector3 } from "three";
import { trackOffset, type GroundTrack } from "../trail/track";

export const walkerHeight = 48;
export const walkerFootOffset = 1.7;

export default function Walker({ route, progress, metres, moving, modelUrl }: {
  route: GroundTrack;
  progress: number;
  metres: number;
  moving: boolean;
  modelUrl: string;
}) {
  const { scene } = useGLTF(modelUrl);
  const actor = useMemo(() => {
    const model = scene.clone(true);
    return {
      model,
      arms: [model.getObjectByName("ArmLeft"), model.getObjectByName("ArmRight")],
      legs: [model.getObjectByName("LegLeft"), model.getObjectByName("LegRight")],
    };
  }, [scene]);
  const point = route.getPointAt(progress);
  const tangent = route.getTangentAt(progress, new Vector3());
  const heading = Math.atan2(tangent.x, tangent.z);
  const phase = metres * Math.PI * 2 / 1.5;
  const stride = moving ? Math.sin(phase) * 0.17 : 0;
  const rise = moving ? (1 - Math.cos(phase * 2)) * 0.012 : 0;

  useLayoutEffect(() => {
    actor.legs.forEach((leg, i) => { if (leg) leg.rotation.x = i === 0 ? stride : -stride; });
    actor.arms.forEach((arm, i) => { if (arm) arm.rotation.x = i === 0 ? -stride * 0.45 : stride * 0.45; });
  }, [actor, stride]);

  return (
    <group position={[point.x, point.y + walkerFootOffset - trackOffset, point.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[12, 15, 20]} />
        <meshBasicMaterial color="#f5e2b8" side={DoubleSide} toneMapped={false} />
      </mesh>
      <group rotation={[0, heading, 0]} scale={walkerHeight} position={[0, rise * walkerHeight, 0]}>
        <primitive object={actor.model} dispose={null} />
      </group>
    </group>
  );
}
