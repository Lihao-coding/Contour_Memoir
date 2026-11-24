import { useEffect, useState } from "react";
import { asset } from "./assets";

const repository = "https://github.com/Lihao-coding/shanxingji";

export function GitHubLink() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetch("https://api.github.com/repos/Lihao-coding/shanxingji", {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).then((response) => {
      if (!response.ok) throw new Error("GitHub repository unavailable");
      return response.json();
    }).then(({ stargazers_count }) => {
      if (Number.isSafeInteger(stargazers_count) && stargazers_count >= 0) setStars(stargazers_count);
    }).catch(() => {
      // The repository link stays available without a live count.
    }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);

  return <a className="github-link" href={repository} target="_blank" rel="noreferrer">
    <img src={asset("icons/github.svg")} alt="" width="16" height="16" />
    <span>GitHub</span>
    {stars !== null && <span className="github-stars" aria-label={`${stars} 个 Star`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
        <path d="m8 1.4 2.03 4.13 4.56.66-3.3 3.22.78 4.55L8 11.81l-4.07 2.15.78-4.55L1.41 6.2l4.56-.67z" />
      </svg>
      {stars.toLocaleString("zh-CN")}
    </span>}
  </a>;
}

export function SupportDevelopment() {
  return <details className="project-support" onKeyDown={(event) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }}>
    <summary>支持开发</summary>
    <nav aria-label="支持开发方式">
      <a href={repository} target="_blank" rel="noreferrer">在 GitHub 点 Star</a>
      <a href={`${repository}/issues`} target="_blank" rel="noreferrer">反馈问题与建议</a>
    </nav>
  </details>;
}

export function ProjectFooter() {
  return <footer className="site-footer">
    <nav aria-label="项目许可">
      <a href={`${repository}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT 许可证</a>
      <a href={`${repository}/blob/main/ASSET_LICENSES.md`} target="_blank" rel="noreferrer">素材许可与署名</a>
    </nav>
    <small>© 2026 Li Hao</small>
  </footer>;
}
