"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";

// Retired: this CRM-template "Custom Fields" page saved through a no-op /custom-fields stub, so
// nothing it showed was ever stored. Custom field administration now lives in Administration >
// User Defined Fields, which manages the real CustomField engine — any old link lands there.
const USER_DEFINED_FIELDS_PATH = "/dashboard/administration/user-defined-fields";

export default function RetiredCustomFieldsPage() {
  const router = useRouter();
  useEffect(() => { navigateOrOpenTab(router, USER_DEFINED_FIELDS_PATH); }, [router]);
  return (
    <p className="p-8 text-center text-sm text-muted-foreground">
      Custom fields are managed in Administration › User Defined Fields. Opening it…
    </p>
  );
}
