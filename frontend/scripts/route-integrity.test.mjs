// Every link the app generates must land on a page that exists, or the user gets "404 Page not found":
// company-slug URLs (lib/company-path.ts + proxy.ts), sidebar menu hrefs (frontend fallback menu and
// backend seeds) and the workspace registry (tabs open its paths). Read from the real files.
//   Run: npm run test:route-integrity
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { isServedByPage, loadAppRoutes, loadCompanyRoutes, loadReservedSegments } from "./stale-route-guard.mjs";

register("./workspace-test-loader.mjs", import.meta.url);
const { APP_ROOT_SEGMENTS, isAppPath, isReservedSlug, stripCompanySlug, withCompanySlug, slugFromPathname } = await import("@/lib/company-path");

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(FRONTEND, "..", "nexuscore-backend");
const APP = path.join(FRONTEND, "app");
const APP_AUTH = path.join(APP, "[company]", "(auth)");
const COMPANY = loadCompanyRoutes(APP);
const GUEST = loadAppRoutes(path.join(APP, "(guest)"));

// Menu entries without a page are allowed only as "coming soon" (isComing: the launcher and search skip
// them). This one is tracked so the flag is dropped when its screen is built.
const COMING_SOON_WITHOUT_PAGE = "/plm/general-definitions/fabric-type-cards";
// (auth) folders that are not app modules: shared components, and onboarding — a guest page at the root.
const NOT_APP_MODULES = new Set(["components", "onboarding-flow"]);

const allStaticRoutes = [...COMPANY.statics].filter((r) => !NOT_APP_MODULES.has(r.split("/")[1]));
const resolves = (href) => {
  const [pathname] = href.split(/[?#]/);
  if (isAppPath(pathname)) return isServedByPage(`/acme${pathname}`, COMPANY);
  return GUEST.statics.has(pathname) || GUEST.dynamic.some((re) => re.test(pathname));
};

/** `{ href, isComing }` for every one-object menu entry literal (`{ title, href, ... }`) in a source file. */
function menuEntries(file) {
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/\{[^{}]*?href:\s*(["'])(\/[^"'$]*)\1[^{}]*\}/g)]
    .map((m) => ({ href: m[2], isComing: /\bisComing:\s*true\b/.test(m[0]) }))
    .filter((e) => e.href !== "/");
}

describe("company-slug URLs", () => {
  it("every app module folder is an app path segment, and every segment is a real folder", () => {
    const folders = fs.readdirSync(APP_AUTH, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const folder of folders) {
      if (NOT_APP_MODULES.has(folder)) continue;
      // A module missing here is never given the company prefix: proxy.ts reads its first segment as a
      // company slug and redirects the rest of the path to a page that does not exist.
      assert.ok(APP_ROOT_SEGMENTS.has(folder), `app/[company]/(auth)/${folder} is missing from APP_ROOT_SEGMENTS`);
    }
    for (const segment of APP_ROOT_SEGMENTS) assert.ok(folders.includes(segment), `APP_ROOT_SEGMENTS lists "${segment}" but there is no such folder`);
  });

  it("every page round-trips through the company slug and is served behind it", () => {
    for (const route of allStaticRoutes) {
      const url = withCompanySlug(route, "acme");
      assert.equal(url, `/acme${route}`, route);
      assert.equal(slugFromPathname(url), "acme", route);
      assert.equal(stripCompanySlug(url), route, route);
      assert.ok(isServedByPage(url, COMPANY), route);
    }
  });

  it("query strings (form records, ?id=) survive the round trip", () => {
    const href = "/legacy-erp/work-orders?id=42&mode=view";
    assert.equal(withCompanySlug(href, "acme"), `/acme${href}`);
    assert.equal(stripCompanySlug("/acme/legacy-erp/work-orders") + "?id=42&mode=view", href);
  });

  it("guest pages never get a company prefix", () => {
    for (const href of ["/login/v1", "/register/v1", "/forgot-password", "/error/404", "/onboarding-flow"]) {
      assert.equal(withCompanySlug(href, "acme"), href);
      assert.ok(resolves(href), href);
    }
  });
});

describe("sidebar menu hrefs", () => {
  const sources = [
    path.join(FRONTEND, "components", "layout", "sidebar", "nav-main.tsx"),
    path.join(BACKEND, "prisma", "seed.ts"),
    ...(fs.existsSync(path.join(BACKEND, "scripts"))
      ? fs.readdirSync(path.join(BACKEND, "scripts")).filter((f) => f.endsWith(".ts")).map((f) => path.join(BACKEND, "scripts", f))
      : []),
  ];

  for (const file of sources) {
    const entries = menuEntries(file);
    if (!entries.length) continue;
    it(`${path.relative(path.join(FRONTEND, ".."), file)}: every href opens a page or is marked coming soon`, () => {
      const broken = entries.filter((e) => !e.isComing && !resolves(e.href)).map((e) => e.href);
      assert.deepEqual(broken, []);
    });
  }

  it("Fabric Type Cards stays 'coming soon' in the seed and the fallback menu while it has no page", () => {
    assert.equal(resolves(COMING_SOON_WITHOUT_PAGE), false, "its page now exists — drop isComing in seed.ts, nav-main.tsx and the DB");
    for (const file of [sources[0], sources[1]]) {
      const entry = menuEntries(file).find((e) => e.href === COMING_SOON_WITHOUT_PAGE);
      assert.ok(entry?.isComing, `${path.basename(file)}: Fabric Type Cards must be isComing`);
    }
  });

  it("the launcher and screen search skip coming-soon entries (so they never link to a missing page)", () => {
    const launcher = fs.readFileSync(path.join(FRONTEND, "components", "layout", "sidebar", "module-launcher.tsx"), "utf8");
    const search = fs.readFileSync(path.join(FRONTEND, "lib", "search", "screen-index.ts"), "utf8");
    assert.match(launcher, /if \(item\.isComing\) continue;/);
    assert.match(search, /!item\.isComing/);
  });
});

describe("guard assumptions", () => {
  it("every root route folder is a reserved company slug (a company can never shadow it)", () => {
    // Public files (403.svg, ...) can never collide: slugs are [a-z0-9-] only (slugifyCompanyName).
    const folders = [...loadReservedSegments(APP)].filter((s) => !s.includes("."));
    for (const segment of folders) assert.ok(isReservedSlug(segment), `"${segment}" is a root route or public folder but not in RESERVED_SEGMENTS`);
  });

  it("notFound() is only called from page files (the stale-route guard reads pages to tell genuine 404s apart)", () => {
    const offenders = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.(tsx?|jsx?)$/.test(e.name) && !/^page\./.test(e.name) && /\bnotFound\s*\(/.test(fs.readFileSync(f, "utf8"))) offenders.push(path.relative(FRONTEND, f));
      }
    })(path.join(FRONTEND, "app"));
    for (const dir of ["components", "hooks"]) {
      (function walk(d) {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) walk(f);
          else if (/\.(tsx?|jsx?)$/.test(e.name) && /\bnotFound\s*\(/.test(fs.readFileSync(f, "utf8"))) offenders.push(path.relative(FRONTEND, f));
        }
      })(path.join(FRONTEND, dir));
    }
    assert.deepEqual(offenders, []);
  });
});

describe("workspace registry", () => {
  const src = fs.readFileSync(path.join(FRONTEND, "lib", "workspace", "registry.generated.ts"), "utf8");

  it("every workspace module a tab can open is a page on disk", () => {
    const paths = [...src.matchAll(/\{ path: "([^"]+)"/g)].map((m) => m[1]);
    assert.ok(paths.length > 100);
    assert.deepEqual(paths.filter((p) => !COMPANY.statics.has(p)), []);
  });

  it("every record route a tab can open is a page on disk", () => {
    const list = src.slice(src.indexOf("GENERATED_RECORD_ROUTES"));
    const routes = [...list.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(routes.includes("/plm/style-cards/[id]"));
    for (const route of routes) {
      const sample = route.replace(/\[[^\]]+\]/g, "x1");
      const file = path.join(APP_AUTH, ...route.split("/").filter(Boolean), "page.tsx");
      assert.ok(fs.existsSync(file), route);
      // pages/products/[id] calls notFound() for missing records, so the stale-route guard skips it.
      if (route !== "/pages/products/[id]") assert.ok(isServedByPage(`/acme${sample}`, COMPANY), route);
    }
  });
});
