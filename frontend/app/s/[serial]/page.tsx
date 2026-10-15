// Serial Card scan page — what a phone opens from a label's QR Code (<ERP>/s/<Serial No>).
// ERP login required, like every ERP screen: no session -> login, then straight back here
// (login honours a same-origin ?next=, lib/safe-next.ts). The data itself comes from the
// permission-checked Serial Cards API, so the user also needs serial-cards read permission.
// Kept outside the dashboard shell (no sidebar / workspace tabs) so it reads well on a phone.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SerialCardScanView } from "@/components/legacy-erp/serial-card-scan-view";

export const dynamic = "force-dynamic";

export default async function SerialCardScanPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const serialNo = decodeURIComponent(serial ?? "").trim();
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) {
    redirect(`/login/v1?next=${encodeURIComponent(`/s/${encodeURIComponent(serialNo)}`)}`);
  }
  return <SerialCardScanView serialNo={serialNo} />;
}

export async function generateMetadata({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  return { title: `Serial Card ${decodeURIComponent(serial ?? "")}`, robots: { index: false, follow: false } };
}
