import { isBackendConnected } from "@/lib/sheet";
import { getTitles } from "@/lib/titles";
import { getStaff, toPublicStaff } from "@/lib/staff";
import { SubmitForm } from "@/components/SubmitForm";

// Always render fresh — the title list comes from the live spreadsheet.
export const dynamic = "force-dynamic";

export default async function Home() {
  const connected = isBackendConnected();
  const [titles, staff] = await Promise.all([getTitles(), getStaff()]);

  return (
    <main
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
              borderRadius: 50,
              padding: "6px 16px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#fff",
              marginBottom: 14,
            }}
          >
            OPPESM
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" }}>
            Document <span style={{ color: "var(--accent)" }}>Tracking</span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 6 }}>
            Office of the Provincial Public Employment Service Manager
          </p>
        </div>

        {!connected && (
          <div
            style={{
              border: "1px solid rgba(251,191,36,0.3)",
              background: "rgba(251,191,36,0.08)",
              color: "var(--warn)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 18,
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <strong>Demo mode — spreadsheet not connected.</strong> You can explore the full
            interface. Submissions won&apos;t be saved until <code>GOOGLE_APPS_SCRIPT_URL</code> is
            set.
          </div>
        )}

        <SubmitForm initialTitles={titles} initialStaff={toPublicStaff(staff)} connected={connected} />

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--text2)" }}>
          <a
            href="/admin"
            style={{ borderBottom: "1px dashed var(--border)", paddingBottom: 1 }}
          >
            Admin Dashboard &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}
