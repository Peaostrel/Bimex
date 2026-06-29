import { stroopsAMXNe } from "../stellar/contrato";

export const SITE_URL = "https://bimex-frontend.vercel.app";

export const DEFAULT_META = {
  title: "Bimex — Crowdfunding de Impacto Social",
  description: "Aporta MXNe a proyectos sociales. El rendimiento financia el impacto. Tu capital siempre regresa.",
  image: `${SITE_URL}/og-image.png`,
  url: SITE_URL,
};

function setMetaTag(selector, attrs) {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    document.head.appendChild(tag);
  }
  Object.entries(attrs).forEach(([key, value]) => tag.setAttribute(key, value));
}

export function crearMetaProyecto(proyecto) {
  if (!proyecto) return DEFAULT_META;
  const nombre = proyecto.nombre || "Proyecto Bimex";
  const raised = stroopsAMXNe(proyecto.aportado ?? 0);
  const remaining = stroopsAMXNe((proyecto.meta ?? 0) > (proyecto.aportado ?? 0) ? (proyecto.meta - proyecto.aportado) : 0n);
  return {
    title: `${nombre} — Bimex`,
    description: `${raised} recaudados · faltan ${remaining} para la meta`,
    image: DEFAULT_META.image,
    url: `${SITE_URL}/proyectos/${proyecto.id}`,
  };
}

export function aplicarMeta(meta) {
  document.title = meta.title;
  setMetaTag('meta[name="description"]', { name: "description", content: meta.description });
  setMetaTag('meta[property="og:title"]', { property: "og:title", content: meta.title });
  setMetaTag('meta[property="og:description"]', { property: "og:description", content: meta.description });
  setMetaTag('meta[property="og:image"]', { property: "og:image", content: meta.image });
  setMetaTag('meta[property="og:url"]', { property: "og:url", content: meta.url });
  setMetaTag('meta[name="twitter:title"]', { name: "twitter:title", content: meta.title });
  setMetaTag('meta[name="twitter:description"]', { name: "twitter:description", content: meta.description });
  setMetaTag('meta[name="twitter:image"]', { name: "twitter:image", content: meta.image });
}

export function leerProyectoIdDesdePath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/proyectos\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}
