import { Metadata } from "next";
import { generateMeta } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "Auto-Numbering Settings",
    description: "Configure automatic numbering for CRM entities",
    canonical: "/crm/settings/auto-numbering"
  });
}

export default function AutoNumberingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
    </div>
  );
}

























