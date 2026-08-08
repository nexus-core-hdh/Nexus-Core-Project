// Thin re-export so the existing mount point (components/layout/header/index.tsx)
// and import path are undisturbed. The actual reusable Global Screen Search
// framework — trigger UI, keyboard shortcuts, data loading, dialog — lives in
// components/search/global-screen-search.tsx so it can be dropped in anywhere
// else in the app later without depending on the header.
export { GlobalScreenSearch as default } from "@/components/search/global-screen-search";
