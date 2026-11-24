import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { MathUtils, Spherical, Vector3, type Group } from "three";
import type { OrbitControls } from "three-stdlib";

export const flatHeightScale = 0.001;
const flatView = new Spherical(1530, 0.001, 0);
const sandboxView = new Spherical(1430, MathUtils.degToRad(55), Math.atan2(850, 1060));

type Transition = {
  from: Spherical;
  to: Spherical;
  target: Vector3;
  aim: Vector3;
  lift: number;
  started: number;
  duration: number;
};

export default function FlatToSandbox({ flat, reset, terrain, treatment, onSettled }: {
  flat: boolean;
  reset: number;
  terrain: RefObject<Group>;
  treatment: RefObject<HTMLDivElement>;
  onSettled: () => void;
}) {
  const { camera, controls, invalidate } = useThree();
  const orbit = controls as OrbitControls | null;
  const transition = useRef<Transition>();
  const previous = useRef<{ flat: boolean; reset: number }>();
  const pose = useRef(new Spherical());
  const lift = useRef(1);

  useLayoutEffect(() => {
    if (!orbit) return;
    const last = previous.current;
    previous.current = { flat, reset };
    const from = new Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    const to = (flat ? flatView : sandboxView).clone();
    to.theta = from.theta + MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, 2 * Math.PI) - Math.PI;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    transition.current = {
      from, to, target: orbit.target.clone(), aim: new Vector3(0, flat ? 0 : -52, 0), lift: lift.current,
      started: performance.now(), duration: !last || reduced ? 0 : last.flat === flat ? 0 : 600,
    };
    orbit.enabled = false;
    invalidate();
  }, [camera, orbit, flat, reset, invalidate]);

  useFrame(({ size }) => {
    const move = transition.current;
    const t = move?.duration ? MathUtils.clamp((performance.now() - move.started) / move.duration, 0, 1) : 1;
    const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    if (move) lift.current = MathUtils.lerp(move.lift, flat ? 0 : 1, eased);
    const aspect = size.width / size.height;
    const sandboxZoom = Math.min(0.84, aspect * (size.width <= 560 ? 0.76 : 0.82));
    const zoom = MathUtils.lerp(Math.min(1, aspect), sandboxZoom, lift.current);
    if (camera.zoom !== zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
    if (!move || !orbit) return;
    if (terrain.current) terrain.current.scale.y = MathUtils.lerp(flatHeightScale, 1, lift.current);
    if (treatment.current) treatment.current.style.opacity = String(lift.current);
    pose.current.set(
      MathUtils.lerp(move.from.radius, move.to.radius, eased),
      MathUtils.lerp(move.from.phi, move.to.phi, eased),
      MathUtils.lerp(move.from.theta, move.to.theta, eased),
    );
    orbit.target.lerpVectors(move.target, move.aim, eased);
    camera.position.setFromSpherical(pose.current).add(orbit.target);
    // Update camera directly so residual orbit damping cannot pull the authored path off course.
    camera.lookAt(orbit.target);
    if (t < 1) invalidate();
    else {
      transition.current = undefined;
      orbit.enabled = true;
      onSettled();
    }
  }, -2);
  return null;
}
