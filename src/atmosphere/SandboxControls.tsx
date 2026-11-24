import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, MathUtils, MOUSE, Raycaster, TOUCH, Vector2, Vector3, type Group } from "three";
import type { OrbitControls as Orbit } from "three-stdlib";
import { sampleHeight, type TerrainData } from "../terrain/sampleHeight";

const up = new Vector3(0, 1, 0);
const idleDelay = 1000;

export function wheelZoomLog(delta: number, mode: number, height: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return MathUtils.clamp(pixels, -110, 110) * 0.00072;
}

export default function SandboxControls({ flat, autoSpin, focusRequest, reset, zoom, onInput, data, exaggeration, terrain }: {
  flat: boolean;
  autoSpin: boolean;
  focusRequest: number;
  reset: number;
  zoom: { steps: number; direction: number };
  onInput: () => void;
  data: TerrainData;
  exaggeration: number;
  terrain: React.RefObject<Group>;
}) {
  const { camera, gl, invalidate } = useThree();
  const control = useRef<Orbit>(null);
  const input = useRef(onInput);
  input.current = onInput;
  const pending = useRef(0);
  const lastWheel = useRef(-Infinity);
  const held = useRef(false);
  const timer = useRef<number>();
  const turnRate = useRef(0);
  const idle = useRef(false);
  const seenZoomStep = useRef(zoom.steps);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const cache = useMemo(() => ({
    anchor: new Vector3(), raycaster: new Raycaster(), ndc: new Vector2(), box: new Box3(),
    entry: new Vector3(), exit: new Vector3(), point: new Vector3(), step: new Vector3(), offset: new Vector3(),
  }), []);

  function wakeAfterIdle() {
    idle.current = false;
    window.clearTimeout(timer.current);
    if (autoSpin && !reduced.matches) {
      timer.current = window.setTimeout(() => {
        idle.current = true;
        invalidate();
      }, idleDelay);
    }
  }

  useEffect(() => {
    wakeAfterIdle();
    const changed = () => { turnRate.current = 0; wakeAfterIdle(); invalidate(); };
    reduced.addEventListener("change", changed);
    return () => {
      window.clearTimeout(timer.current);
      reduced.removeEventListener("change", changed);
    };
  }, [autoSpin, focusRequest, reset, invalidate, reduced]);

  function start() {
    pending.current = 0;
    held.current = true;
    wakeAfterIdle();
    input.current();
  }

  function end() {
    held.current = false;
    wakeAfterIdle();
  }

  useEffect(() => {
    const canvas = gl.domElement;
    function wheel(event: WheelEvent) {
      const orbit = control.current;
      if (event.deltaY === 0 || !Number.isFinite(event.deltaY) || !orbit?.enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = canvas.getBoundingClientRect();
      const amount = wheelZoomLog(event.deltaY, event.deltaMode, rect.height);
      const now = performance.now();
      if (Math.abs(pending.current) < 0.003 || now - lastWheel.current > 140) {
        const { box, anchor, raycaster, ndc, entry, exit, point, step } = cache;
        anchor.copy(orbit.target);
        ndc.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
        raycaster.setFromCamera(ndc, camera);
        const [width, depth] = data.meta.size_m;
        const scale = 1000 / Math.max(width, depth);
        const heightScale = scale * exaggeration * (terrain.current?.scale.y ?? 1);
        box.min.set(-width * scale / 2, data.meta.elev_min * heightScale - 1, -depth * scale / 2);
        box.max.set(width * scale / 2, data.meta.elev_max * heightScale + 1, depth * scale / 2);
        const ray = raycaster.ray;
        const first = box.containsPoint(ray.origin) ? entry.copy(ray.origin) : ray.intersectBox(box, entry);
        if (first) {
          ray.at(7000, point);
          step.copy(ray.direction).negate();
          const stop = ray.clone().set(point, step).intersectBox(box, exit);
          if (stop) {
            const aboveGround = (p: Vector3) => p.y > sampleHeight(data, p.x / scale, p.z / scale) * heightScale;
            let previous = 0;
            for (let i = 0; i <= 96; i++) {
              const t = i / 96;
              if (aboveGround(point.lerpVectors(entry, exit, t))) {
                previous = t;
                continue;
              }
              let lo = previous;
              let hi = t;
              for (let j = 0; j < 8; j++) {
                const mid = (lo + hi) / 2;
                if (aboveGround(point.lerpVectors(entry, exit, mid))) lo = mid;
                else hi = mid;
              }
              anchor.lerpVectors(entry, exit, (lo + hi) / 2);
              break;
            }
          }
        }
      }
      lastWheel.current = now;
      pending.current = MathUtils.clamp(pending.current + amount, -0.29, 0.29);
      wakeAfterIdle();
      input.current();
      invalidate();
    }
    canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => canvas.removeEventListener("wheel", wheel, true);
  }, [cache, camera, data, exaggeration, gl, invalidate, terrain, autoSpin, reduced]);

  useEffect(() => {
    if (seenZoomStep.current === zoom.steps) return;
    seenZoomStep.current = zoom.steps;
    if (!control.current?.enabled) return;
    cache.anchor.copy(control.current.target);
    pending.current = MathUtils.clamp(pending.current + zoom.direction * 0.105, -0.29, 0.29);
    wakeAfterIdle();
    invalidate();
  }, [zoom, cache, invalidate, autoSpin, reduced]);

  useFrame((_, deltaTime) => {
    const orbit = control.current;
    if (!orbit?.enabled) {
      pending.current = 0;
      turnRate.current = 0;
      return;
    }
    const dt = Math.min(deltaTime, 0.05);
    const step = reduced.matches ? pending.current : pending.current * (1 - Math.exp(-17 * dt));
    if (Math.abs(pending.current) > 0.0002) {
      const radius = camera.position.distanceTo(orbit.target);
      const nextRadius = MathUtils.clamp(radius * Math.exp(step), orbit.minDistance, orbit.maxDistance);
      const factor = nextRadius / radius;
      camera.position.sub(cache.anchor).multiplyScalar(factor).add(cache.anchor);
      orbit.target.sub(cache.anchor).multiplyScalar(factor).add(cache.anchor);
      pending.current = factor === 1 ? 0 : pending.current - step;
      camera.lookAt(orbit.target);
      if (Math.abs(pending.current) > 0.0002) invalidate();
    } else {
      pending.current = 0;
    }
    const rotating = autoSpin && idle.current && !held.current && !reduced.matches;
    const desired = rotating ? 0.067 : 0;
    if (held.current || !idle.current || !autoSpin) turnRate.current = 0;
    else turnRate.current = MathUtils.damp(turnRate.current, desired, 2, dt);
    if (rotating) {
      cache.offset.copy(camera.position).sub(orbit.target).applyAxisAngle(up, turnRate.current * dt);
      camera.position.copy(orbit.target).add(cache.offset);
      camera.lookAt(orbit.target);
      invalidate();
    }
    const [width, depth] = data.meta.size_m;
    const scale = 1000 / Math.max(width, depth);
    const limited = cache.point.set(
      MathUtils.clamp(orbit.target.x, -0.73 * width * scale, 0.73 * width * scale),
      MathUtils.clamp(orbit.target.y, -145, data.meta.elev_max * exaggeration * scale + 145),
      MathUtils.clamp(orbit.target.z, -0.73 * depth * scale, 0.73 * depth * scale),
    );
    if (!limited.equals(orbit.target)) {
      camera.position.add(cache.offset.subVectors(limited, orbit.target));
      orbit.target.copy(limited);
      camera.lookAt(orbit.target);
    }
  }, -0.85);

  const mouseButtons = useMemo(() => ({ LEFT: flat ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }), [flat]);
  const touches = useMemo(() => ({ ONE: flat ? TOUCH.PAN : TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }), [flat]);

  return <OrbitControls ref={control} makeDefault enableDamping dampingFactor={0.10}
    mouseButtons={mouseButtons} touches={touches}
    enableRotate={!flat} rotateSpeed={0.55} zoomSpeed={0.43} panSpeed={0.72}
    minDistance={120} maxDistance={2600} maxPolarAngle={Math.PI / 2.05}
    onStart={start} onEnd={end} />;
}
