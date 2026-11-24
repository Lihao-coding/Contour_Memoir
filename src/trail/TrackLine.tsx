import { useEffect, useMemo } from "react";
import { GroundTrack } from "./track";

export default function TrackLine({ route, distance }: {
  route: GroundTrack;
  distance: number;
}) {
  const tube = useMemo(() => route.createTube(distance), [route, distance]);
  useEffect(() => () => tube.dispose(), [tube]);
  return (
    <mesh geometry={tube} name="trail-route">
      <meshStandardMaterial color="#ff7a2f" emissive="#ff641f" emissiveIntensity={1.5} roughness={0.65} toneMapped={false} />
    </mesh>
  );
}
