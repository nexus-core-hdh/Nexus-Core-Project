import type { ScreenEntry } from "@/lib/search/screen-index";

export interface ResolvedTabTitle {
  title: string;
  icon?: ScreenEntry["icon"];
}

const MODE_PREFIXES: Record<string, string> = {
  create: "New ",
  new: "New ",
  edit: "Edit ",
  update: "Edit ",
};

/** "Purchase Orders" -> "Purchase Order", "Fabric Cards" -> "Fabric Card". Only
 *  used on menu titles borrowed from an *owning* list screen (see
 *  findOwningEntry) — a wrong guess here never touches a screen's own exact
 *  menu title, just the derived New/Edit form label two priority levels down. */
function singularize(title: string): string {
  if (/ies$/i.test(title)) return title.replace(/ies$/i, "y");
  if (/ss$/i.test(title)) return title;
  if (/s$/i.test(title)) return title.replace(/s$/i, "");
  return title;
}

function humanizeSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Last-resort label when nothing in the menu/registry relates to this route:
 *  a clean title from the route's final segment, stripping a trailing
 *  "-list" (the segment then names the record type, not "the list of them"). */
function humanizeFallback(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? pathname;
  return humanizeSegment(last.replace(/-list$/i, ""));
}

function resolveMode(href: string): string | null {
  const qIndex = href.indexOf("?");
  if (qIndex === -1) return null;
  try {
    return new URLSearchParams(href.slice(qIndex + 1)).get("mode");
  } catch {
    return null;
  }
}

/** Finds the menu entry that best "owns" a base path that isn't itself a menu
 *  item — tried in order: its "-list" sibling (Legacy ERP's list+form
 *  convention: /purchase-orders is owned by /purchase-orders-list), then the
 *  longest registered ancestor path (covers nested module sub-screens).
 *  Naming-convention-based, not a per-screen map — works for any module. */
function findOwningEntry(key: string, entryByHref: Map<string, ScreenEntry>): ScreenEntry | undefined {
  const listKey = key.endsWith("-list") ? key : `${key}-list`;
  const listSibling = entryByHref.get(listKey);
  if (listSibling) return listSibling;

  let best: ScreenEntry | undefined;
  let bestLen = -1;
  for (const [href, entry] of entryByHref) {
    const base = href.endsWith("-list") ? href.slice(0, -"-list".length) : href;
    if (base.length <= bestLen) continue;
    if (key === base || key.startsWith(`${base}/`)) {
      best = entry;
      bestLen = base.length;
    }
  }
  return best;
}

/**
 * Central screen-title resolution for the Workspace tab bar — the single
 * place a tab's route/query gets turned into the human-readable label shown
 * on screen. Priority order:
 *   1. An explicit title carried on the tab itself (set via openTab/
 *      setTabTitle, e.g. useWorkspaceTabTitle) — the screen that owns the tab
 *      knows its own title best, when it chooses to provide one.
 *   2. An exact match in the live menu index — covers every screen that is
 *      itself a sidebar entry (the majority of the app).
 *   3. The "owning" list screen's menu title (Legacy ERP's list+form
 *      convention, or any registered ancestor route), singularized and
 *      prefixed for New/Edit from the `mode` query param — covers
 *      detail/create/edit form screens that aren't themselves menu items.
 *   4. A humanized version of the route's final segment — always readable,
 *      never a raw "/dashboard/..." path, even with zero menu presence.
 *
 * Works for every module (Legacy ERP, PLM, Settings, Finance, BPM, ...)
 * without a per-screen title map: new screens get a correct label the moment
 * they're linked from the menu, and a clean fallback even before that.
 */
export function resolveWorkspaceTabTitle(
  tab: { key: string; href: string; title?: string },
  entryByHref: Map<string, ScreenEntry>
): ResolvedTabTitle {
  if (tab.title) {
    return { title: tab.title, icon: entryByHref.get(tab.key)?.icon };
  }

  const exact = entryByHref.get(tab.key);
  if (exact) {
    return { title: exact.title, icon: exact.icon };
  }

  const owner = findOwningEntry(tab.key, entryByHref);
  if (owner) {
    const base = singularize(owner.title);
    const mode = resolveMode(tab.href);
    const prefix = mode ? MODE_PREFIXES[mode.toLowerCase()] : undefined;
    return { title: prefix ? `${prefix}${base}` : base, icon: owner.icon };
  }

  return { title: humanizeFallback(tab.key) };
}
