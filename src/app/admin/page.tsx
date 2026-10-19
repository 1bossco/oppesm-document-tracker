import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDocuments, computeStats } from "@/lib/documents";
import { getAuditTrail } from "@/lib/audit";
import { getPrintData } from "@/lib/printing";
import { getStaff, toPublicStaff } from "@/lib/staff";
import { getProcessData } from "@/lib/processes";
import { isBackendConnected } from "@/lib/sheet";
import { ADMIN_NAME_COOKIE } from "@/lib/auth";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Sessions from before names were recorded have no name — sign in again.
  const adminName = (await cookies()).get(ADMIN_NAME_COOKIE)?.value;
  if (!adminName) redirect("/login");

  const [docs, audit, printData, staff, processes] = await Promise.all([
    getDocuments(),
    getAuditTrail(),
    getPrintData(),
    getStaff(),
    getProcessData(),
  ]);
  const stats = computeStats(docs);

  return (
    <AdminDashboard
      initialDocs={docs}
      initialStats={stats}
      initialAudit={audit}
      initialPrintData={printData}
      initialProcesses={processes}
      staff={toPublicStaff(staff)}
      adminName={adminName}
      connected={isBackendConnected()}
    />
  );
}
