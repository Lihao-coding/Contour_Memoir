import { Color, ShaderMaterial, Texture, Vector3 } from "three";
import { lightingAt } from "../atmosphere/solar";

export function terrainMaterial(detail: Texture | null, coastal: boolean, lakeLevel: number | undefined, profileOnly: boolean) {
  const { sky: _, ...lighting } = lightingAt();
  return new ShaderMaterial({
    uniforms: {
      ...Object.fromEntries(Object.entries(lighting).map(([name, value]) => [name, { value }])),
      lift: { value: 1 },
      deepWater: { value: new Color("#124054") },
      coastWater: { value: new Color("#45a69b") },
      lowland: { value: new Color("#386549") },
      slope: { value: new Color("#7e9262") },
      ridge: { value: new Color("#bda481") },
      coastal: { value: coastal },
      hasLake: { value: lakeLevel !== undefined },
      lakeLevel: { value: lakeLevel ?? 0 },
      profileOnly: { value: profileOnly },
      detailMap: { value: detail },
      hasDetail: { value: !!detail },
      orthophoto: { value: null },
      hasOrthophoto: { value: false },
      orthophotoInset: { value: null },
      hasInset: { value: false },
      insetBounds: { value: [0, 0, 1, 1] },
      verticalScale: { value: 1.5 },
      trackMask: { value: null },
      showTrackMask: { value: false },
      trackColor: { value: new Color("#f38a40") },
      cinematic: { value: false },
      eye: { value: new Vector3() },
      waterTime: { value: 0 },
      heightField: { value: null },
      terrainSize: { value: [1, 1] },
      heightFloor: { value: 0 },
      heightSpan: { value: 1 },
    },
    vertexShader: `
      attribute float elevation;
      attribute float shoreline;
      varying float vHeight;
      varying float vShore;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec2 vMetres;
      void main() {
        vHeight = elevation;
        vShore = shoreline;
        vNormal = normal;
        vUv = uv;
        vMetres = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 deepWater;
      uniform vec3 coastWater;
      uniform vec3 lowland;
      uniform vec3 slope;
      uniform vec3 ridge;
      uniform bool coastal;
      uniform bool hasLake;
      uniform float lakeLevel;
      uniform bool profileOnly;
      uniform sampler2D detailMap;
      uniform bool hasDetail;
      uniform sampler2D orthophoto;
      uniform bool hasOrthophoto;
      uniform sampler2D orthophotoInset;
      uniform bool hasInset;
      uniform vec4 insetBounds;
      uniform float verticalScale;
      uniform sampler2D trackMask;
      uniform bool showTrackMask;
      uniform vec3 trackColor;
      uniform float lift;
      uniform vec3 sun;
      uniform vec3 moon;
      uniform vec3 key;
      uniform vec3 fill;
      uniform float sunWeight;
      uniform float moonWeight;
      uniform float keyPower;
      uniform float fillPower;
      uniform float exposure;
      uniform bool cinematic;
      uniform vec3 eye;
      uniform float waterTime;
      uniform sampler2D heightField;
      uniform vec2 terrainSize;
      uniform float heightFloor;
      uniform float heightSpan;
      varying float vHeight;
      varying float vShore;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec2 vMetres;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 surfaceNormal = normalize(vec3(normal.x * lift, normal.y, normal.z * lift));
        float rock = smoothstep(0.12, 0.48, 1.0 - normal.y);
        vec3 land = mix(lowland, slope, smoothstep(28.0, 255.0, vHeight));
        land = mix(land, ridge, rock * 0.62);
        vec3 grain = vec3(0.0);
        float strata = 0.0;
        float canopyShade = 0.0;
        if (hasDetail) {
          vec2 detailUv = vMetres / 560.0;
          grain = texture2D(detailMap, detailUv).rgb - 0.5;
          canopyShade = grain.r - (texture2D(detailMap, detailUv + sun.xz * 0.009).r - 0.5);
          vec2 rockUV = vec2(vMetres.x + 0.4 * vMetres.y, vHeight * 3.2) / 390.0;
          strata = texture2D(detailMap, rockUV).b - 0.5;
        }
        float forest = (1.0 - rock) * smoothstep(2.0, 22.0, vHeight);
        land *= 1.0 + forest * (0.19 * grain.r + 0.16 * grain.g + 0.33 * canopyShade * sunWeight)
          + rock * (0.29 * strata + 0.10 * grain.g);

        // Shore proximity colours the water; this does not model bathymetry.
        float coast = exp(-vShore * 0.18);
        vec3 water = mix(deepWater, coastWater, 0.5 * coast);
        float ripplePhase = dot(vMetres, vec2(0.17, 0.063)) + grain.g * 4.0;
        float ripple = sin(ripplePhase) * (1.0 - smoothstep(0.4, 2.7, fwidth(ripplePhase)));
        float crossPhase = dot(vMetres, vec2(-0.09, 0.21));
        float crossSwell = sin(crossPhase) * (1.0 - smoothstep(0.5, 2.7, fwidth(crossPhase)));
        water *= 1.0 + ripple * (0.035 + coast * 0.15) + crossSwell * 0.042 + grain.b * (0.07 + coast * 0.10);
        water += vec3(0.06, 0.14, 0.14) * coast * coast * smoothstep(0.46, 0.93, ripple) * 0.30;
        float landWeight = coastal ? smoothstep(0.05, 4.5, vHeight) : 1.0;
        if (hasLake) {
          float lake = (1.0 - smoothstep(0.12, 1.7, abs(vHeight - lakeLevel))) * smoothstep(0.993, 0.999, normal.y);
          landWeight *= 1.0 - lake;
          water = mix(water, vec3(0.035, 0.125, 0.125), lake * 0.58);
        }
        vec3 color = mix(water, land, landWeight);
        if (hasOrthophoto) {
          vec4 aerial = texture2D(orthophoto, vUv);
          vec3 photo = aerial.rgb;
          if (hasInset) {
            vec2 area = (vMetres - insetBounds.xy) / (insetBounds.zw - insetBounds.xy);
            if (all(greaterThanEqual(area, vec2(0.0))) && all(lessThanEqual(area, vec2(1.0)))) {
              vec4 inset = texture2D(orthophotoInset, vec2(area.x, 1.0 - area.y));
              photo = mix(photo, inset.rgb, inset.a);
            }
          }
          color = mix(color, photo * 1.14, aerial.a * 0.94);
        }
        if (profileOnly) color = vec3(0.075, 0.092, 0.091) + grain.r * 0.03;
        float sunlight = 1.0;
        vec3 reflection = vec3(0.0);
        if (cinematic && lift > 0.01) {
          // Trace a soft horizon into the elevation field in the direction of the sun.
          float stepMetres = 18.0;
          for (int sampleIndex = 0; sampleIndex < 9; ++sampleIndex) {
            vec2 uv = vec2(vUv.x, 1.0 - vUv.y) + sun.xz * stepMetres / terrainSize;
            if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
            float height = texture2D(heightField, uv).r * heightSpan + heightFloor;
            float ray = vHeight * verticalScale + 3.0 + sun.y * stepMetres;
            sunlight = min(sunlight, 1.0 - 0.84 * smoothstep(0.0, 5.0 + 0.022 * stepMetres, height * verticalScale - ray));
            stepMetres *= 1.66;
          }
          float waterWeight = (1.0 - landWeight) * smoothstep(0.972, 0.995, normal.y);
          if (waterWeight > 0.06) {
            // Layered wave normals keep the reflection attached to water as the camera orbits.
            vec2 p = vMetres;
            float gust = sin(dot(p, vec2(0.009, 0.011))) + 0.55 * cos(dot(p, vec2(-0.013, 0.004)));
            vec2 wind = p + vec2(31.0 * gust, 27.0 * sin(dot(p, vec2(0.016, -0.005)) + gust));
            float a = dot(wind, vec2(0.031, 0.070)) - waterTime * 1.15;
            float b = dot(wind, vec2(-0.092, 0.051)) + waterTime * 1.7 + sin(a * 0.32) * 1.6;
            float c = dot(wind, vec2(0.162, -0.086)) - waterTime * 1.9 + 2.5 * gust + grain.g * 1.6;
            vec2 waves = vec2(cos(a), sin(a + gust)) * 0.026 + vec2(sin(b), cos(b + gust)) * 0.021;
            waves += vec2(sin(c), cos(c + a * 0.41)) * 0.024 * (1.0 - smoothstep(0.9, 3.2, fwidth(c)));
            vec3 waterNormal = normalize(vec3(waves.x, 1.0, waves.y));
            vec3 view = normalize(eye - vec3(p.x, vHeight * verticalScale, p.y));
            vec3 halfway = normalize(view + sun);
            float alignment = max(dot(waterNormal, halfway), 0.0);
            float sheen = 0.86 + 0.23 * grain.b + 0.11 * sin(a * 0.17 + b * 0.13);
            float glint = pow(alignment, 24.0) * 0.17 + pow(alignment, 105.0) * 0.46 * sheen;
            float fresnel = pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
            reflection = waterWeight * (key * glint * sunlight + vec3(0.06, 0.18, 0.22) * fresnel)
              * (hasOrthophoto ? 0.55 : 1.0);
          }
        }
        float lambert = max(dot(surfaceNormal, sun), 0.0) * sunlight;
        float horizonGlow = 0.10 * (1.0 - smoothstep(0.0, 0.55, sun.y));
        float moonLambert = max(dot(surfaceNormal, moon), 0.0);
        vec3 skyLight = vec3(0.13, 0.15, 0.19) + mix(vec3(1.0), fill, 0.45) * fillPower * 0.82;
        if (cinematic) skyLight += vec3(0.04, 0.035, 0.025);
        vec3 directLight = keyPower * 0.54 * (
          key * (lambert + horizonGlow) * sunWeight + vec3(0.24, 0.38, 1.0) * moonLambert * moonWeight
        );
        vec3 shaded = color * (skyLight + directLight) * exposure + reflection;
        color = mix(color, shaded, lift);

        if (showTrackMask) {
          float trace = texture2D(trackMask, vUv).r;
          color = mix(color, trackColor, min(0.88, trace * 2.1));
        }
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
