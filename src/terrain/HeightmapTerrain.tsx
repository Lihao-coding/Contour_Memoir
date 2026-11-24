import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, Group, LinearFilter, Mesh, MeshStandardMaterial, PlaneGeometry, RedFormat, Texture } from "three";
import { flatHeightScale } from "../atmosphere/FlatToSandbox";
import type { Lighting } from "../atmosphere/solar";
import { sampleHeight, TerrainData } from "./sampleHeight";
import { terrainMaterial } from "./terrainMaterial";

function buildMesh(data: TerrainData, exaggeration: number) {
  const { meta } = data;
  const [width, depth] = meta.size_m;
  const plane = new PlaneGeometry(width, depth, meta.grid - 1, meta.grid - 1).rotateX(-Math.PI / 2);
  const vertices = plane.getAttribute("position");
  const heights = new Float32Array(vertices.count);
  for (let i = 0; i < vertices.count; i++) {
    const height = sampleHeight(data, vertices.getX(i), vertices.getZ(i));
    vertices.setY(i, height * exaggeration);
    heights[i] = height;
  }
  plane.setAttribute("elevation", new Float32BufferAttribute(heights, 1));
  const shoreline = new Float32Array(vertices.count);
  const stride = meta.grid;
  for (let i = 0; i < shoreline.length; i++) {
    shoreline[i] = heights[i] > 2 ? 0 : 24;
    if (i % stride > 0) shoreline[i] = Math.min(shoreline[i], shoreline[i - 1] + 1);
    if (i >= stride) shoreline[i] = Math.min(shoreline[i], shoreline[i - stride] + 1);
  }
  for (let i = shoreline.length - 1; i >= 0; i--) {
    if (i % stride < stride - 1) shoreline[i] = Math.min(shoreline[i], shoreline[i + 1] + 1);
    if (i + stride < shoreline.length) shoreline[i] = Math.min(shoreline[i], shoreline[i + stride] + 1);
  }
  plane.setAttribute("shoreline", new Float32BufferAttribute(shoreline, 1));
  plane.computeVertexNormals();

  const last = meta.grid - 1;
  const perimeter = [
    ...Array.from({ length: last }, (_, i) => i),
    ...Array.from({ length: last }, (_, i) => i * meta.grid + last),
    ...Array.from({ length: last }, (_, i) => last * meta.grid + last - i),
    ...Array.from({ length: last }, (_, i) => (last - i) * meta.grid),
  ];
  const strata = [new Color("#414137"), new Color("#514a3c"), new Color("#41392f"), new Color("#302b25")];
  const thickness = Math.max(width, depth) * 0.045;
  const floor = meta.elev_min * exaggeration - thickness;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i];
    const b = perimeter[(i + 1) % perimeter.length];
    const point = (index: number, band: number) => {
      const top = vertices.getY(index);
      const y = band === 0 ? top : floor + (1 - band / strata.length) * thickness;
      return [vertices.getX(index), y, vertices.getZ(index)];
    };
    strata.forEach((color, band) => {
      positions.push(...point(a, band), ...point(b, band), ...point(b, band + 1),
        ...point(a, band), ...point(b, band + 1), ...point(a, band + 1));
      for (let j = 0; j < 6; j++) colors.push(color.r, color.g, color.b);
    });
  }
  const walls = new BufferGeometry();
  walls.setAttribute("position", new Float32BufferAttribute(positions, 3));
  walls.setAttribute("color", new Float32BufferAttribute(colors, 3));
  walls.computeVertexNormals();
  return { plane, walls, floor, width, depth };
}

export default function HeightmapTerrain({ data, exaggeration, detail, trace, light, cinematic, animateWater, coastal, lakeLevel, profileOnly, terrain, children }: {
  data: TerrainData;
  exaggeration: number;
  detail: Texture | null;
  trace: Texture | null;
  light: Lighting;
  cinematic: boolean;
  animateWater: boolean;
  coastal: boolean;
  lakeLevel?: number;
  profileOnly: boolean;
  terrain: RefObject<Group>;
  children?: ReactNode;
}) {
  const { plane, walls, floor, width, depth } = useMemo(() => buildMesh(data, exaggeration), [data, exaggeration]);
  const material = useMemo(() => terrainMaterial(detail, coastal, lakeLevel, profileOnly), [detail, coastal, lakeLevel, profileOnly]);
  const shadowMap = useMemo(() => {
    const samples = Uint8Array.from(data.heightmap, (height) => Math.round(height / 257));
    const map = new DataTexture(samples, data.meta.grid, data.meta.grid, RedFormat);
    map.minFilter = map.magFilter = LinearFilter;
    map.needsUpdate = true;
    return map;
  }, [data]);
  const wallsRef = useRef<Mesh<BufferGeometry, MeshStandardMaterial>>(null);
  const baseRef = useRef<Mesh<PlaneGeometry, MeshStandardMaterial>>(null);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => () => { plane.dispose(); walls.dispose(); }, [plane, walls]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => shadowMap.dispose(), [shadowMap]);
  useEffect(() => {
    material.uniforms.heightField.value = shadowMap;
    material.uniforms.terrainSize.value = data.meta.size_m;
    material.uniforms.heightSpan.value = data.meta.elev_max - data.meta.elev_min;
    material.uniforms.heightFloor.value = data.meta.elev_min;
    material.uniforms.cinematic.value = cinematic;
    invalidate();
  }, [material, data, cinematic, shadowMap, invalidate]);
  useEffect(() => {
    if (!animateWater) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      if (!document.hidden && !motion.matches) invalidate();
    }, 1000 / 30);
    return () => window.clearInterval(timer);
  }, [animateWater, invalidate]);
  useEffect(() => {
    material.uniforms.verticalScale.value = exaggeration;
    material.uniforms.trackMask.value = trace;
    material.uniforms.showTrackMask.value = !!trace;
    invalidate();
  }, [material, trace, exaggeration, invalidate]);
  useLayoutEffect(() => {
    for (const [name, value] of Object.entries(light)) {
      if (name !== "sky") material.uniforms[name].value = value;
    }
    invalidate();
  }, [material, light, invalidate]);
  const scale = 1000 / Math.max(width, depth);
  useFrame(({ camera }) => {
    const lift = ((terrain.current?.scale.y ?? 1) - flatHeightScale) / (1 - flatHeightScale);
    material.uniforms.lift.value = lift;
    if (cinematic) {
      material.uniforms.eye.value.copy(camera.position).multiplyScalar(1 / scale);
      if (animateWater && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        material.uniforms.waterTime.value = performance.now() / 1000;
      }
    }
    const parts = [wallsRef.current, baseRef.current] as const;
    for (const part of parts) {
      if (!part || part.material.opacity === lift) continue;
      part.visible = lift > 0.001;
      part.material.opacity = lift;
      part.material.transparent = lift < 0.999;
      part.material.depthWrite = !part.material.transparent;
    }
  });
  return (
    <group ref={terrain}>
      <group scale={scale}>
        <mesh name="elevation-surface" geometry={plane} material={material} />
        <mesh ref={wallsRef} geometry={walls}>
          <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.96} />
        </mesh>
        <mesh ref={baseRef} position={[0, floor, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color="#302b25" side={DoubleSide} />
        </mesh>
        {children}
      </group>
    </group>
  );
}
