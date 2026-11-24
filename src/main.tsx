import { Canvas, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Group, RepeatWrapping, Texture, TextureLoader, Vector3 } from "three";
import FlatToSandbox from "./atmosphere/FlatToSandbox";
import SandboxControls from "./atmosphere/SandboxControls";
import SunRig from "./atmosphere/SunRig";
import { lightingAt } from "./atmosphere/solar";
import FieldMarker, { FocusField } from "./field/FieldMarker";
import OfflinePack from "./field/OfflinePack";
import { nearestRoute, onTerrain } from "./field/position";
import { useLocation } from "./field/useLocation";
import { importProject, readTrailFile, sceneData, type TrailProject } from "./project/import";
import HeightmapTerrain from "./terrain/HeightmapTerrain";
import { sampleHeight } from "./terrain/sampleHeight";
import RouteFlight from "./trail/RouteFlight";
import TrackLine from "./trail/TrackLine";
import { distanceAtTime, GroundTrack, trackOffset } from "./trail/track";
import { trackTexture } from "./trail/trackTexture";
import { flightSpeed, usePlayback } from "./walker/usePlayback";
import "./styles.css";

const asset = (path: string) => new URL(path, new URL(import.meta.env.BASE_URL, location.href)).href;
const daylight = lightingAt();
const lowLight = lightingAt({ altitude: 18, bearing: 315, moonAltitude: -20, moonBearing: 0 });
const noAction = () => {};
const distanceLabel = (metres: number) => `${(metres / 1000).toFixed(2)} 公里`;

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function downloadProject(project: TrailProject) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = project.title.replace(/[\\/:*?"<>|]/g, "-") + ".trail.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PlanPreview({ project, progress, fallback }: { project: TrailProject; progress: number; fallback: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const [width, depth] = project.size;
    function draw() {
      if (!context) return;
      const { clientWidth, clientHeight } = canvas;
      const dpr = Math.min(2, window.devicePixelRatio);
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scale = Math.min(clientWidth / width, clientHeight / depth) * 0.81;
      const px = (x: number) => clientWidth / 2 + x * scale;
      const py = (z: number) => clientHeight / 2 + z * scale;
      context.fillStyle = "#202a27";
      context.fillRect(px(-width / 2), py(-depth / 2), width * scale, depth * scale);
      context.strokeStyle = "#f7a05a";
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.beginPath();
      project.samples.forEach(([x, z], i) => i ? context.lineTo(px(x), py(z)) : context.moveTo(px(x), py(z)));
      context.stroke();
      const time = progress * project.samples.at(-1)![3];
      const index = Math.max(1, project.samples.findIndex((point) => point[3] >= time));
      const [ax, az, , at] = project.samples[index - 1];
      const [bx, bz, , bt] = project.samples[index];
      const t = Math.max(0, Math.min(1, (time - at) / (bt - at)));
      context.beginPath();
      context.arc(px(ax + (bx - ax) * t), py(az + (bz - az) * t), 5, 0, Math.PI * 2);
      context.fillStyle = "#fff0d4";
      context.fill();
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [project, progress]);
  return <div className="plan-preview"><canvas ref={ref} aria-label="路线平面图" />
    {fallback && <p role="status">此设备未能启动 WebGL，已切换到路线平面图。</p>}
  </div>;
}

function PlaybackCursor({ route, progress, size }: { route: GroundTrack; progress: number; size: number }) {
  const point = route.getPointAt(progress);
  return <mesh position={[point.x, point.y + size * 0.003, point.z]}>
    <sphereGeometry args={[size * 0.0045, 16, 12]} />
    <meshBasicMaterial color="#ffebbe" toneMapped={false} />
  </mesh>;
}

function SceneInvalidator({ progress }: { progress: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => { invalidate(); }, [invalidate, progress]);
  return null;
}

const initialCamera = { position: [850, 790, 1060] as [number, number, number], fov: 43, near: 4, far: 6000 };

function RouteWorkbench({ project, demo }: { project: TrailProject; demo: boolean }) {
  const prepared = useMemo(() => sceneData(project), [project]);
  const { data, track, profile, max, hasElevation } = prepared;
  const [compact] = useState(() => matchMedia("(max-width: 650px), (pointer: coarse)").matches);
  const [flat, setFlat] = useState(false);
  const [reset, setReset] = useState(0);
  const [lightMode, setLightMode] = useState(false);
  const [spin, setSpin] = useState(demo);
  const [expanded, setExpanded] = useState(false);
  const [flying, setFlying] = useState(false);
  const [zoom, setZoom] = useState({ steps: 0, direction: 0 });
  const [aim, setAim] = useState<Vector3 | null>(null);
  const [detail, setDetail] = useState<Texture | null>(null);
  const terrain = useRef<Group>(null);
  const treatment = useRef<HTMLDivElement>(null);
  const locationStatus = useLocation(project.frame);
  const mapSize = Math.max(...project.size);
  const verticalSpan = data.meta.elev_max - data.meta.elev_min;
  const exaggeration = Math.min(project.terrain ? 1.45 : 1, mapSize / (2 * verticalSpan));
  const effectiveOffset = Math.max(0.03, mapSize * trackOffset / 5700);
  const route = useMemo(() => new GroundTrack(track, data, exaggeration, effectiveOffset, profile),
    [data, track, exaggeration, effectiveOffset, profile]);
  const trace = useMemo(() => project.terrain ? trackTexture(route, track.distance_m, data.meta.size_m, compact ? 1024 : 1536) : null,
    [route, track, data, compact, project.terrain]);
  const playback = usePlayback(track.duration_s, true);
  const distance = distanceAtTime(track, playback.elapsed);
  const progress = distance / track.distance_m;
  const coastal = project.terrain?.coastal === true;
  const lake = project.terrain?.lakeLevel;
  const lakeLevel = lake === undefined ? undefined : lake - (coastal ? 0 : project.terrain!.min);
  const cinematic = lightMode && !flat;
  const light = cinematic ? lowLight : daylight;
  const fix = locationStatus.fix;
  const livePoint = onTerrain(fix?.point ?? null, project.size) ? fix!.point : null;
  const match = livePoint && fix && !fix.stale && fix.accuracy <= 60 ? nearestRoute(livePoint, track) : null;

  useEffect(() => () => trace?.dispose(), [trace]);
  useEffect(() => {
    if (!project.terrain) return;
    let cancelled = false;
    const loader = new TextureLoader();
    const texture = loader.load(asset("demo/surface-detail.webp"), (loaded) => {
      if (!cancelled) setDetail(loaded);
    });
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return () => { cancelled = true; texture.dispose(); };
  }, [project.terrain]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  function stopFlight() {
    if (!flying) return;
    setFlying(false);
    playback.changeSpeed(1);
  }

  function view(next: boolean) {
    stopFlight();
    setAim(null);
    setFlat(next);
  }

  function toggleFlight() {
    if (flying) { stopFlight(); return; }
    setAim(null);
    setFlying(true);
    playback.changeSpeed(flightSpeed);
    if (!playback.playing) playback.toggle();
  }

  const fallback = <PlanPreview project={project} progress={playback.elapsed / track.duration_s} fallback />;
  return <section className={"workbench" + (expanded ? " is-expanded" : "")} aria-label="路线工作区">
    <div className="scene-layout">
      <div className="viewport">
        <SceneBoundary fallback={fallback}>
          <Canvas frameloop="demand" dpr={compact ? 1 : [1, 1.25]} camera={initialCamera} fallback={fallback}>
            <SunRig light={light} />
            <HeightmapTerrain data={data} exaggeration={exaggeration} detail={detail} trace={trace} light={light}
              terrain={terrain} coastal={coastal} lakeLevel={lakeLevel} profileOnly={!project.terrain} cinematic={cinematic}
              animateWater={cinematic && (coastal || lakeLevel !== undefined) && !compact}>
              <TrackLine route={route} distance={track.distance_m} />
              <PlaybackCursor route={route} progress={progress} size={mapSize} />
              {livePoint && <FieldMarker point={livePoint} data={data} exaggeration={exaggeration}
                accuracy={fix?.accuracy} simulated={false} stale={fix?.stale ?? false} />}
            </HeightmapTerrain>
            <SandboxControls flat={flat} autoSpin={spin && !flat && !playback.playing && !locationStatus.watching}
              reset={reset} focusRequest={0} zoom={zoom} data={data} exaggeration={exaggeration} terrain={terrain}
              onInput={() => { setAim(null); stopFlight(); }} />
            <FlatToSandbox flat={flat} reset={reset} terrain={terrain} treatment={treatment} onSettled={noAction} />
            <SceneInvalidator progress={progress} />
            {flying && <RouteFlight route={route} terrain={data} exaggeration={exaggeration} progress={progress} distance={track.distance_m} />}
            <FocusField aim={aim} />
          </Canvas>
        </SceneBoundary>
        <div className="viewport-modes" role="group" aria-label="显示方式">
          <button type="button" aria-pressed={!flat} onClick={() => view(false)}>3D 沙盘</button>
          <button type="button" aria-pressed={flat} onClick={() => view(true)}>平面</button>
        </div>
        <button type="button" className="expand-view" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "退出放大" : "放大视图"}</button>
        {!flat && project.terrain && <button className="light-toggle" type="button" aria-pressed={lightMode} onClick={() => setLightMode(!lightMode)}>山海光影</button>}
        <div className="zoom-controls" role="group" aria-label="地图缩放">
          <button type="button" aria-label="放大地图" onClick={() => { stopFlight(); setZoom({ steps: zoom.steps + 1, direction: -1 }); }}>+</button>
          <button type="button" aria-label="缩小地图" onClick={() => { stopFlight(); setZoom({ steps: zoom.steps + 1, direction: 1 }); }}>−</button>
        </div>
      </div>
      <footer className="scene-note">
        <span>{project.terrain ? (demo ? "Copernicus DEM · 30 米" : "自定义高程网格") : hasElevation ? "GPX 轨迹高程" : "GPX 平面轨迹"}</span>
        <span>范围 {project.size.map((metres) => (metres / 1000).toFixed(2)).join(" × ")} 公里</span>
      </footer>
    </div>
    <aside className="control-panel" aria-label="沙盘工具">
      <div className="panel-head"><h2>路线回放</h2>
        <button type="button" onClick={() => { stopFlight(); setAim(null); setReset((value) => value + 1); }}>复位视角</button>
      </div>
      <dl className="metrics">
        <div><dt>总里程</dt><dd>{distanceLabel(track.distance_m)}</dd></div>
        <div><dt>最高高程</dt><dd>{project.terrain || hasElevation ? `${Math.round(project.terrain?.max ?? max)} 米` : "—"}</dd></div>
      </dl>
      <div className="timeline">
        <label htmlFor="progress">轨迹进度</label>
        <output htmlFor="progress">{distanceLabel(distance)}</output>
        <input id="progress" type="range" min="0" max={track.duration_s} step="any" value={playback.elapsed}
          aria-valuetext={distanceLabel(distance)} onChange={(event) => playback.seek(Number(event.currentTarget.value))} />
      </div>
      <div className="playback">
        <button className="primary" type="button" onClick={playback.toggle}>{playback.playing ? "暂停" : "播放"}</button>
        <button type="button" aria-pressed={flying} disabled={flat} onClick={toggleFlight}>沿线飞行</button>
      </div>
      <section className="panel-section">
        <h2>视图设置</h2>
        <div className="view-actions">
          <button type="button" aria-pressed={spin} disabled={flat} onClick={() => setSpin(!spin)}>自动巡览</button>
          <button type="button" onClick={() => downloadProject(project)}>导出路线包</button>
        </div>
        {!project.terrain && <p>{hasElevation ? "轨迹按 GPX 高程绘制。导入带 DEM 的路线包可显示周边地形。" : "这条路线缺少完整高程，已按平面绘制。"}</p>}
      </section>
      {locationStatus.supported && <section className="panel-section">
        <h2>徒步定位</h2>
        <div className="view-actions">
          <button type="button" onClick={locationStatus.toggle}>{locationStatus.watching ? "停止定位" : "开始定位"}</button>
          {livePoint && <button type="button" onClick={() => {
            stopFlight();
            const y = flat ? 0 : sampleHeight(data, livePoint.x, livePoint.z) * exaggeration;
            setAim(new Vector3(livePoint.x, y, livePoint.z).multiplyScalar(1000 / mapSize));
          }}>定位居中</button>}
        </div>
        {locationStatus.watching && <p role="status">{locationStatus.issue || (fix
          ? fix.stale ? "位置暂未更新。" : livePoint
            ? `水平精度约 ${Math.ceil(fix.accuracy)} 米${match ? ` · 距轨迹约 ${Math.round(match.offset)} 米` : ""}${fix.altitude === null ? "" : ` · 设备高度 ${Math.round(fix.altitude)} 米`}`
            : "当前位置在沙盘范围之外。"
          : "正在等待设备定位…")}</p>}
      </section>}
      <section className="panel-section source">
        <h2>数据说明</h2>
        <p>{demo ? "麦理浩径西贡段演示。轨迹已简化，播放时间为估算。" : "导入文件由浏览器本地处理。"}</p>
        <details>
          <summary>地形来源与使用说明</summary>
          <p>本页面为个人徒步轨迹的地形示意，非测绘成果，不作为导航依据。</p>
          <p>地形与影像来自公开数据集，不代表官方测绘数据。</p>
          <p>如涉及具体地理信息需求，请以自然资源主管部门发布的标准地图为准。</p>
          {project.terrain && <p>{project.terrain.attribution}</p>}
        </details>
        <OfflinePack />
      </section>
    </aside>
  </section>;
}

function App() {
  const [demo, setDemo] = useState<TrailProject | null>(null);
  const [custom, setCustom] = useState<TrailProject[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demoError, setDemoError] = useState(false);
  const [importRevision, setImportRevision] = useState(0);
  const generation = useRef(0);
  const project = selected === null ? demo : custom[selected];
  useEffect(() => {
    const controller = new AbortController();
    fetch(asset("demo/maclehose.trail.json"), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((json) => setDemo(importProject(json)))
      .catch(() => { if (!controller.signal.aborted) setDemoError(true); });
    return () => controller.abort();
  }, []);

  async function importFile(file: File) {
    const token = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const routes = await readTrailFile(file);
      if (generation.current !== token) return;
      setCustom(routes);
      setImportRevision(token);
      setSelected(0);
    } catch (reason) {
      if (generation.current === token) setError(reason instanceof Error ? reason.message : "无法导入这个文件。");
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }

  return <main className="shell">
    <header className="site-top">
      <div className="wordmark">山行纪 <span>Trail Sandbox</span></div>
      <div className="header-actions">
        {selected !== null && demo && <button type="button" onClick={() => { setSelected(null); setError(""); }}>查看示例</button>}
        <label className="import-button">
          <input type="file" accept=".gpx,.json,application/gpx+xml,application/json" disabled={loading} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importFile(file);
          }} />
          {loading ? "正在导入…" : "导入路线"}
        </label>
      </div>
    </header>
    <div className="intro">
      <div><h1>{project?.title ?? "路线沙盘"}</h1><p>{selected === null ? "麦理浩径示例" : "本机导入"} <span>· 支持 GPX 和 Trail JSON</span></p></div>
      {selected !== null && custom.length > 1 && <label className="segments">路线段
        <select value={selected} onChange={(event) => setSelected(Number(event.currentTarget.value))}>
          {custom.map((route, index) => <option key={index} value={index}>{route.title}</option>)}
        </select>
      </label>}
    </div>
    {error && <p className="import-error" role="alert">{error}</p>}
    {project ? <RouteWorkbench key={selected === null ? "demo" : `${importRevision}-${selected}`} project={project} demo={selected === null} />
      : <section className="empty" role="status">{demoError ? "示例加载失败，你仍可以导入本机路线。" : "正在读取麦理浩径地形…"}</section>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
