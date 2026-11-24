# 山行纪 · Trail Sandbox

用平面或 3D 沙盘查看徒步路线。打开页面即可查看麦理浩径西贡段，也可以导入自己的 GPX 或带高程网格的 Trail JSON。项目使用 Vite、React、TypeScript 和 Three.js，支持纯静态部署。

## 使用

- 点「导入路线」，选择两步路、运动手表或其他工具导出的 WGS84 GPX。包含多段轨迹时可切换路段。
- GPX 有完整轨迹高程时可查看 3D 路线；缺少高程时仍可查看平面轨迹。要显示周边实际地形，导入带 DEM 的 Trail JSON。
- 可切换平面和 3D、缩放旋转、拖动进度或开启沿线飞行。带地理参考的自定义路线可以在 HTTPS 下使用设备定位。
- 导入和定位都在浏览器内处理。刷新前可用「导出路线包」保存路线。在安全上下文点击「下载离线示例」可离线重开应用，再从设备导入保存好的路线包。

## 开发

需要 Node.js 24。

```sh
npm ci
npm test
npm run dev
npm run build
npm run preview
```

生产产物为 `dist/`。源码维护在 `main`，GitHub Pages 从 `gh-pages` 分支的根目录发布。更新页面时，运行 `npm run build`，把 `dist/` 的内容同步到 `gh-pages` 根目录，保留空的 `.nojekyll`，再推送该分支。在新的仓库部署时，到 **Settings → Pages** 选择 **Deploy from a branch**，选 `gh-pages` 和 `/ (root)`。定位和离线缓存使用 HTTPS 或电脑回环地址。

## 生成自己的地形包

先导入 GPX 并导出 `*.trail.json`。准备覆盖整块路线沙盘的、带坐标参考且以米为高程单位的 DEM GeoTIFF。

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install rasterio numpy
python tools/add-dem.py route.trail.json dem.tif route-with-dem.trail.json \
  --attribution "你的 DEM 来源和署名"
```

重新导入 `route-with-dem.trail.json` 即可渲染。沿海 DEM 海面以零米编码时，可加 `--coastal` 开启海面材质；内陆默认关闭。工具会在源栅格有缺值或覆盖不足时给出错误。

### Trail JSON v1

| 字段 | 含义 |
| --- | --- |
| `version` | 固定为 `1` |
| `title` | 路线标题 |
| `size` | `[东西宽度米, 南北深度米]`，沙盘对角线不超过 15 公里 |
| `samples` | `[x, z, 高程米或 null, 从起点经过的秒数]`。中心为原点，向东为正 X，向南为正 Z，时间从 0 严格递增 |
| `time` | `recorded` 或 `estimated` |
| `frame` | 可选的 WGS84 中心 `{ lat, lon }`，用于自定义轨迹定位和 DEM 转换 |
| `terrain` | 可选的 `{ grid, min, max, heights, attribution, coastal?, lakeLevel? }`。网格为 `grid × grid`，由北到南、行内由西到东，以 Base64 包装 UInt16 小端高程。0 对应 `min`，65535 对应 `max`，网格边缘顶点与沙盘边缘重合。可选的 `lakeLevel` 用于表现 DEM 中已知的平坦湖面 |

`src/project/import.ts` 提供 `parseGpx`、`importProject` 与 `sceneData`，供其他页面调用。每次导入支持最多 12 MB、50,000 个轨迹点。

## 示例数据

麦理浩径西贡段演示使用简化后的路线形状和估算时间，不含原始 GPS 文件、拍摄时间、照片或个人资料。地形栅格由 Copernicus DEM GLO-30 裁剪、重采样和量化。示例用于地形与轨迹展示。

[Copernicus DEM 资料与许可](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved
