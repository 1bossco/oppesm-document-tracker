import { getDocuments, computeStats } from "@/lib/documents";
import { getAuditTrail } from "@/lib/audit";
import { getPrintData } from "@/lib/printing";
import { getStaff } from "@/lib/staff";
import { isBackendConnected } from "@/lib/sheet";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [docs, audit, printData, staff] = await Promise.all([
    getDocuments(),
    getAuditTrail(),
    getPrintData(),
    getStaff(),
  ]);
  const stats = computeStats(docs);

  return (
    <AdminDashboard
      initialDocs={docs}
      initialStats={stats}
      initialAudit={audit}
      initialPrintData={printData}
      staff={staff}
      connected={isBackendConnected()}
    />
  );
}
