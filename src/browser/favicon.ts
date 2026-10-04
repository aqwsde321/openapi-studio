/** Keep the host page's declared icons; otherwise use assets beside the standalone script. */
export function installFavicon(scriptUrl: string): () => void {
  const existing = document.querySelector('link[rel~="icon" i], link[rel~="apple-touch-icon" i], link[rel~="apple-touch-icon-precomposed" i], link[rel~="mask-icon" i]');
  if (!scriptUrl || existing) return () => {};
  const source = new URL(scriptUrl);
  if (source.protocol !== "http:" && source.protocol !== "https:") return () => {};
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/svg+xml";
  favicon.href = new URL("favicon.svg", source).href;
  favicon.dataset.openapiStudio = "favicon";
  const touchIcon = document.createElement("link");
  touchIcon.rel = "apple-touch-icon";
  touchIcon.href = new URL("apple-touch-icon.png", source).href;
  touchIcon.dataset.openapiStudio = "favicon";
  document.head.append(favicon, touchIcon);
  return () => { favicon.remove(); touchIcon.remove(); };
}
