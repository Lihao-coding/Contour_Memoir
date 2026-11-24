import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import type { Lighting } from "./solar";

export default function SunRig({ light }: { light: Lighting }) {
  const { gl, invalidate } = useThree();
  useLayoutEffect(() => {
    gl.toneMappingExposure = light.exposure;
    invalidate();
  }, [gl, light.exposure, invalidate]);

  return (
    <>
      <primitive attach="background" object={light.sky} />
      <ambientLight color={light.fill} intensity={light.fillPower} />
      <directionalLight position={light.sun.toArray()} color={light.key} intensity={light.keyPower * light.sunWeight} />
      <directionalLight position={light.moon.toArray()} color="#5a7fff" intensity={light.keyPower * light.moonWeight} />
    </>
  );
}
