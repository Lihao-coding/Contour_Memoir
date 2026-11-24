import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { MathUtils, Spherical, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";

type Flight = {
  from: Spherical;
  to: Spherical;
  target: Vector3;
  aim: Vector3;
  started: number;
  duration: number;
};

export function useCameraFlight() {
  const { camera, controls, invalidate } = useThree();
  const orbit = controls as OrbitControls | null;
  const flight = useRef<Flight>();
  const pose = useRef(new Spherical());
  const cancel = useCallback(() => { flight.current = undefined; }, []);

  useEffect(() => {
    orbit?.addEventListener("start", cancel);
    return () => { orbit?.removeEventListener("start", cancel); };
  }, [orbit, cancel]);

  const moveTo = useCallback((destination: Vector3, aim: Vector3, duration: number) => {
    if (!orbit?.enabled) return false;
    const from = new Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    const to = new Spherical().setFromVector3(destination.clone().sub(aim));
    to.radius = MathUtils.clamp(to.radius, orbit.minDistance, orbit.maxDistance);
    to.theta = from.theta + MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, 2 * Math.PI) - Math.PI;
    flight.current = {
      from, to, target: orbit.target.clone(), aim,
      started: performance.now(),
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration,
    };
    invalidate();
    return true;
  }, [camera, orbit, invalidate]);

  useFrame(() => {
    const move = flight.current;
    if (!move || !orbit?.enabled) return;
    const t = move.duration ? Math.min(1, (performance.now() - move.started) / move.duration) : 1;
    const ease = t * t * (3 - 2 * t);
    pose.current.set(MathUtils.lerp(move.from.radius, move.to.radius, ease),
      MathUtils.lerp(move.from.phi, move.to.phi, ease), MathUtils.lerp(move.from.theta, move.to.theta, ease));
    orbit.target.lerpVectors(move.target, move.aim, ease);
    camera.position.setFromSpherical(pose.current).add(orbit.target);
    camera.lookAt(orbit.target);
    if (t < 1) invalidate();
    else cancel();
  }, -0.5);

  return { camera, orbit, moveTo, cancel };
}
