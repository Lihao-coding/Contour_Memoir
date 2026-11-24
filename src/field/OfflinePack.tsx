import { useEffect, useRef, useState } from "react";

type PackState = "checking" | "available" | "saving" | "ready" | "error";

function askWorker(worker: ServiceWorker, command: "status" | "download") {
  return new Promise<boolean>((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => {
      window.clearTimeout(timeout);
      channel.port1.close();
    };
    const timeout = window.setTimeout(() => {
      close();
      reject(new Error("Offline pack timed out"));
    }, command === "download" ? 120_000 : 8000);
    channel.port1.onmessage = ({ data }) => {
      close();
      if (data.error) reject(new Error("Offline pack failed"));
      else resolve(data.ready === true);
    };
    worker.postMessage(command, [channel.port2]);
  });
}

export default function OfflinePack() {
  const available = window.isSecureContext && "serviceWorker" in navigator && import.meta.env.PROD;
  const [state, setState] = useState<PackState>("checking");
  const [retry, setRetry] = useState(0);
  const worker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!available) return;
    let mounted = true;
    const update = async () => {
      const registration = await navigator.serviceWorker.register(new URL("offline-worker.js", location.href));
      await navigator.serviceWorker.ready;
      if (!mounted || !registration.active) return;
      worker.current = registration.active;
      const ready = await askWorker(registration.active, "status");
      if (mounted) setState(ready ? "ready" : "available");
    };
    const refresh = () => {
      update().catch(() => { if (mounted) setState("error"); });
    };
    navigator.serviceWorker.addEventListener("controllerchange", refresh);
    refresh();
    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", refresh);
    };
  }, [available, retry]);

  async function download() {
    if (!worker.current) {
      setState("checking");
      setRetry((value) => value + 1);
      return;
    }
    setState("saving");
    try {
      setState(await askWorker(worker.current, "download") ? "ready" : "error");
    } catch {
      setState("error");
    }
  }

  if (!available) return null;
  return <div className="offline-pack">
    <button type="button" disabled={state === "checking" || state === "saving" || state === "ready"} onClick={download}>
      {state === "ready" ? "离线示例已保存" : state === "saving" ? "正在下载…" : state === "checking" ? "正在检查…" : state === "error" ? "重试离线下载" : "下载离线示例"}
    </button>
    <small role="status">
      {state === "ready" ? "断网后从同一网址打开沙盘。"
        : state === "error" ? "下载未完成，请检查网络或设备空间。"
          : "保存页面和麦理浩径示例。自定义路线请导出备份。"}
    </small>
  </div>;
}
