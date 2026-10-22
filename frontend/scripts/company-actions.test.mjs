// Companies screen (app/[company]/(auth)/pages/companies + lib/companies/company-details.ts):
// View company shows only the row's own company; Create Company is offered only when the backend's
// GET /companies/access says canCreate, validates its form, posts to POST /companies and refreshes
// the list; Delete stays unavailable with its reason.
//   Run: npm run test:company-actions
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const {
  unwrapCompany, sameCompanyOrError, companyDetailRows, COMPANY_DELETE_UNAVAILABLE,
  suggestCompanySlug, validateCompanyForm, toCreateCompanyPayload, fieldForServerError, EMPTY_COMPANY_FORM,
  defaultTrialEndDate, utcToday, subscriptionLabel, FIRST_ADMIN_STATUS_LABEL,
} = await import("@/lib/companies/company-details");
const src = (f) => readFileSync(new URL(`../app/[company]/(auth)/pages/companies/${f}`, import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

const ACME = {
  id: "c-1", name: "Acme", slug: "acme", email: "ops@acme.test", phone: null, address: "", website: "https://acme.test",
  industry: "Apparel", plan: "pro", subscriptionStatus: "active", billingCycle: "monthly",
  subscriptionStartDate: "2026-01-01T00:00:00.000Z", subscriptionEndDate: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z",
  branches: [{ id: "b-1", name: "HQ" }, { id: "b-2", name: "Lahore" }], _count: { users: 4 },
};

describe("View company", () => {
  it("reads the company whether or not it is still wrapped in { data }", () => {
    assert.equal(unwrapCompany(ACME).id, "c-1");
    assert.equal(unwrapCompany({ data: ACME }).id, "c-1");
    assert.equal(unwrapCompany(null), null);
    assert.equal(unwrapCompany({ data: null }), null);
  });

  it("shows the company only when it is the row that was opened", () => {
    assert.equal(sameCompanyOrError("c-1", ACME), null);
    assert.match(sameCompanyOrError("c-2", ACME), /only view your own company/);
    assert.match(sameCompanyOrError("c-1", null), /could not be loaded/);
  });

  it("lists the company's details, with — for empty values", () => {
    const rows = Object.fromEntries(companyDetailRows(ACME, (iso) => iso.slice(0, 10)));
    assert.equal(rows["Name"], "Acme");
    assert.equal(rows["Company URL"], "acme");
    assert.equal(rows["Phone"], "—");
    assert.equal(rows["Branches"], "HQ, Lahore");
    assert.equal(rows["Users"], "4");
    assert.equal(rows["Subscription End"], "—");
  });

  it("loads your own company by default and another company only through the platform route", () => {
    const table = src("data-table.tsx");
    const page = src("page.tsx");
    assert.match(table, /<DropdownMenuItem onSelect=\{view\}>/);
    assert.match(table, /createContext<\(id: string\) => Promise<any>>\(\(id\) => companiesApi\.getCompany\(id\)\)/);
    assert.match(table, /sameCompanyOrError\(company\.id, loaded\)/);
    assert.match(page, /access\.canViewAll && id !== ownCompanyId \? companiesApi\.getAnyCompany\(id\) : companiesApi\.getCompany\(id\)/);
    assert.match(apiSrc, /getAnyCompany: \(id: string\) => apiRequest\(`\/companies\/\$\{encodeURIComponent\(id\)\}`/);
  });
});

describe("Create Company form", () => {
  const form = (over) => ({ ...EMPTY_COMPANY_FORM, ...over });

  it("suggests the Company URL from the name, the same way the backend does", () => {
    assert.equal(suggestCompanySlug("Acme Apparel"), "acme-apparel");
    assert.equal(suggestCompanySlug("  Nexus  Core (PK) "), "nexus-core-pk");
    assert.equal(suggestCompanySlug("Ünïcode Ltd."), "u-ni-code-ltd"); // backend slugifyCompanyName gives the same
  });

  it("requires a name and a well-formed Company URL; checks the email format", () => {
    assert.deepEqual(Object.keys(validateCompanyForm(form({}))).sort(), ["name", "slug"]);
    assert.match(validateCompanyForm(form({ name: "A", slug: "Bad Slug" })).slug, /lowercase letters, numbers and single hyphens/);
    assert.match(validateCompanyForm(form({ name: "A", slug: "a--b" })).slug, /single hyphens/);
    assert.match(validateCompanyForm(form({ name: "A", slug: "acme", email: "nope" })).email, /valid email/);
    assert.deepEqual(validateCompanyForm(form({ name: "Acme", slug: "acme", email: "a@b.co" })), {});
  });

  it("sends trimmed values and leaves blanks out", () => {
    assert.deepEqual(toCreateCompanyPayload(form({ name: " Acme ", slug: " ACME ", email: " a@b.co ", phone: "  ", industry: "Apparel" })),
      { name: "Acme", slug: "acme", email: "a@b.co", industry: "Apparel" });
  });

  it("puts a duplicate or reserved Company URL and a duplicate email on their fields", () => {
    assert.equal(fieldForServerError('The Company URL "acme" is already in use.'), "slug");
    assert.equal(fieldForServerError('"legacy-erp" is reserved — choose another Company URL.'), "slug");
    assert.equal(fieldForServerError("A company with the email a@b.co already exists."), "email");
    assert.equal(fieldForServerError("Only the platform owner company can manage other companies."), null);
  });
});

describe("Companies page", () => {
  const page = src("page.tsx");
  const table = src("data-table.tsx");
  const dialog = src("create-company-form.tsx");

  it("offers Create Company only when the backend says canCreate, otherwise explains who can", () => {
    assert.match(page, /companiesApi\.getAccess\(\)/);
    assert.ok(page.includes("{access.canCreate && <CreateCompanyButton onCreated={() => getCompanies(access)} trialDefaultDays={access.trialDefaultDays} canInviteAdmin={access.canInviteAdmin} />}"));
    assert.match(page, /\{!access\.canCreate && \(/);
  });

  it("submits to POST /companies and refreshes the Companies list after success", () => {
    assert.match(dialog, /companiesApi\.createCompany\(toCreateCompanyPayload\(form\)\)/);
    assert.match(dialog, /setCreated\(company\);\s*onCreated\(company\);/);
    assert.match(apiSrc, /createCompany: \(company: any\) => apiRequest\('\/companies', \{\s*method: 'POST'/);
    assert.match(dialog, /validateCompanyForm\(form\)/);
    assert.match(dialog, /\$\{origin\}\/\$\{created\.slug\}/, "shows the new company's URL");
  });

  it("Delete stays disabled with its reason, and nothing calls a delete API", () => {
    assert.match(table, /<DropdownMenuItem disabled>\s*<Trash2 \/> Delete/);
    assert.match(table, /\{COMPANY_DELETE_UNAVAILABLE\}/);
    assert.ok(![page, table, dialog].some((s) => /deleteCompany/.test(s)));
    assert.match(COMPANY_DELETE_UNAVAILABLE, /users, branches and every business record/);
  });
});

describe("Demo company on a Trial", () => {
  const form = (over) => ({ ...EMPTY_COMPANY_FORM, name: "Acme", slug: "acme", ...over });
  const NOW = new Date("2026-10-20T10:00:00Z");

  it("defaults the trial end from the server's COMPANY_TRIAL_DAYS, or leaves it to be chosen", () => {
    assert.equal(defaultTrialEndDate(30, NOW), "2026-11-19");
    assert.equal(defaultTrialEndDate(null, NOW), "");
    assert.equal(utcToday(NOW), "2026-10-20");
  });

  it("a Demo company needs a trial end after today; Standard needs none", () => {
    assert.match(validateCompanyForm(form({ accountType: "Demo", trialEndDate: "" }), NOW).trialEndDate, /Choose the trial end date/);
    assert.match(validateCompanyForm(form({ accountType: "Demo", trialEndDate: "2026-10-20" }), NOW).trialEndDate, /after today/);
    assert.deepEqual(validateCompanyForm(form({ accountType: "Demo", trialEndDate: "2026-10-21" }), NOW), {});
    assert.deepEqual(validateCompanyForm(form({ accountType: "Standard", trialEndDate: "" }), NOW), {});
  });

  it("sends accountType and trialEndDate only for a Demo company — never a subscription or plan", () => {
    assert.deepEqual(toCreateCompanyPayload(form({ accountType: "Demo", trialEndDate: "2026-11-19" })), { name: "Acme", slug: "acme", accountType: "Demo", trialEndDate: "2026-11-19" });
    assert.deepEqual(toCreateCompanyPayload(form({ accountType: "Standard", trialEndDate: "2026-11-19" })), { name: "Acme", slug: "acme" });
    assert.equal(fieldForServerError("The trial end date must be after today."), "trialEndDate");
  });

  it("details show the account type, Trial / Trial (expired) and the trial end", () => {
    const rows = Object.fromEntries(companyDetailRows({ ...ACME, accountType: "Demo", subscriptionStatus: "Trial", trialEndDate: "2026-11-19T23:59:59.999Z", trialExpired: false }, (iso) => iso.slice(0, 10)));
    assert.deepEqual([rows["Account Type"], rows["Status"], rows["Trial Ends"]], ["Demo", "Trial", "2026-11-19 (end of day, UTC)"]);
    assert.equal(subscriptionLabel({ subscriptionStatus: "Trial", trialExpired: true }), "Trial (expired)");
    assert.equal(subscriptionLabel({ subscriptionStatus: "Active" }), "Active");
    assert.equal(Object.fromEntries(companyDetailRows({ ...ACME, subscriptionStatus: "Active", trialEndDate: "2026-11-19" }, (x) => x))["Trial Ends"], "—");
  });
});

describe("Create First Admin (the Users screen's own dialog)", () => {
  const panel = src("first-admin-panel.tsx");
  const dialog = src("create-company-form.tsx");
  const table = src("data-table.tsx");
  const usersDialog = readFileSync(new URL("../app/[company]/(auth)/pages/users/create-user-dialog.tsx", import.meta.url), "utf8");
  const has = (text, s, label = text) => assert.ok(s.includes(text), label);

  it("labels every status", () => {
    assert.deepEqual(FIRST_ADMIN_STATUS_LABEL, { not_configured: "Not configured", awaiting_first_sign_in: "Awaiting first sign-in", active: "Active", not_eligible: "Not applicable" });
  });

  it("is offered on the confirmation screen and in View company for OTHER companies only, to users allowed to", () => {
    has("{canInviteAdmin && <FirstAdminPanel companyId={created.id}", dialog);
    has("{canInviteAdmin && details.id !== ownCompanyId && <FirstAdminPanel", table);
    has('canInvite && status === "not_configured"', panel);
  });

  it("opens the existing create-user dialog — no separate user form — aimed at the company, its Main Branch and Admin", () => {
    has('import { CreateUserDialog } from "../users/create-user-dialog";', panel);
    has("<CreateUserDialog", panel);
    has("create: (body) => companiesApi.createFirstAdmin(companyId, body),", panel);
    has('roleName: "Admin",', panel);
    assert.ok(!/<Input|<form/.test(panel), "the panel has no inputs of its own");
    has("createFirstAdmin: (id: string, body: { name: string; email: string; password: string; phone?: string; department?: string })", apiSrc);
  });

  it("the dialog's first-admin mode reuses Add New User: generated temporary password shown once, read-only company/branch/role", () => {
    has("if (firstAdmin) return createFirstAdmin(data);", usersDialog);
    has("const temporaryPassword = generateTemporaryPassword();\n      await firstAdmin.create({", usersDialog.replace(/\r\n/g, "\n"));
    has("setCreatedUserPassword(temporaryPassword);\n      setShowPasswordDialog(true);", usersDialog.replace(/\r\n/g, "\n"));
    has('<ReadOnlyField label="Company" value={firstAdmin.companyName} />', usersDialog);
    has('<ReadOnlyField label="Branch" value={firstAdmin.branchName} />', usersDialog);
    has('<ReadOnlyField label="Role" value={firstAdmin.roleName} />', usersDialog);
    has('const menuItems = firstAdmin ? allMenuItems.filter((m) => m.id === "manual") : allMenuItems;', usersDialog);
    // the body sent to the platform endpoint never carries a company, branch or role
    const body = /await firstAdmin\.create\(\{([\s\S]*?)\}\);/.exec(usersDialog)[1];
    assert.ok(!/companyId|branchId|roleId|role:/.test(body), body);
    // the normal Add New User path still creates users in the signed-in user's own company
    has("await usersApi.createUser(userData);", usersDialog);
  });

  it("email is a separate, optional notification and never blocks creation", () => {
    has("companiesApi.sendFirstAdminSetupLink(companyId)", panel);
    has("Email notifications: {state.emailConfigured ? \"configured\" : \"not configured\"} — creating the administrator does not need email.", panel);
    has('canInvite && status === "awaiting_first_sign_in"', panel);
    has("<span>{emailResult.message}</span>", panel);
    assert.ok(!/emailConfigured[^\n]*Create First Admin/.test(panel), "Create First Admin does not depend on email");
  });

  it("refreshes the company details (user count) after creation", () => {
    has("onSuccess={() => { load(); onChanged?.(); }}", panel);
    has("canInvite onChanged={refresh} />", table);
  });
});

describe("Create-user dialog rules (lib/users/create-user-rules.ts)", async () => {
  const { shouldClearUnofferedRole, hiddenFieldErrors, fieldForCreateUserError } = await import("@/lib/users/create-user-rules");
  const usersDialog = readFileSync(new URL("../app/[company]/(auth)/pages/users/create-user-dialog.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const has = (text) => assert.ok(usersDialog.includes(text), text);

  it("regression: in Create First Admin mode the fixed role is never cleared (no role list is loaded there)", () => {
    // The bug: with no role list ('idle', no items) the role was cleared, the hidden required field failed and nothing was sent.
    assert.equal(shouldClearUnofferedRole({ firstAdminMode: true, role: "first-admin", status: "idle", offeredIds: [] }), false);
    // Add New User keeps its rule: a role the reloaded list no longer offers is cleared, never while loading.
    assert.equal(shouldClearUnofferedRole({ firstAdminMode: false, role: "r1", status: "ready", offeredIds: ["r2"] }), true);
    assert.equal(shouldClearUnofferedRole({ firstAdminMode: false, role: "r1", status: "loading", offeredIds: [] }), false);
    assert.equal(shouldClearUnofferedRole({ firstAdminMode: false, role: "r1", status: "ready", offeredIds: ["r1"] }), false);
    has("shouldClearUnofferedRole({ firstAdminMode: !!firstAdmin,");
  });

  it("a validation error on a field the user cannot see is reported, never swallowed", () => {
    assert.deepEqual(hiddenFieldErrors({ role: { message: "Role is required" }, name: { message: "Name is required" } }, ["name", "email"]), ["role: Role is required"]);
    assert.deepEqual(hiddenFieldErrors({ name: { message: "Name is required" } }, ["name", "email"]), []);
    has("onSubmit={form.handleSubmit(onSubmit, onInvalid)}");
  });

  it("server errors are shown — under the field they concern and as a toast", () => {
    assert.equal(fieldForCreateUserError("Email already registered"), "email");
    assert.equal(fieldForCreateUserError("This company already has users"), null);
    assert.equal(fieldForCreateUserError("Only the platform owner company can set up another company's administrator."), null);
    has("if (field) form.setError(field, { type: \"server\", message });");
    has("toast.error(\"Failed to create the first administrator\", { description: message });");
  });

  it("one request at a time; the button is disabled while it runs", () => {
    has("if (!firstAdmin || submittingRef.current) return;");
    has("submittingRef.current = false;\n      setIsSubmitting(false);");
    has("disabled={\n                isSubmitting ||");
  });

  it("the temporary password is shown once; closing that screen any way refreshes the company and status", () => {
    has("setCreatedUserPassword(temporaryPassword);\n      setShowPasswordDialog(true);");
    has("<Dialog open={showPasswordDialog} onOpenChange={(o) => { if (!o) finishAfterPassword(); }}>");
    has("setCreatedUserPassword(null);\n    form.reset();\n    onSuccess?.();");
    has("This temporary password is shown only once");
    const panel = src("first-admin-panel.tsx");
    assert.ok(panel.includes('canInvite && branchName && (status === "not_configured" || dialogOpen)'), "dialog stays mounted until the password screen is closed");
  });
});
