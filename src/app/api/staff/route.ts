import { NextResponse } from "next/server";
import { getStaff, toPublicStaff } from "@/lib/staff";

// Public — used by the submission form's staff picker. Names and positions
// only; emails are looked up server-side at submit time.
export async function GET() {
  return NextResponse.json(toPublicStaff(await getStaff()));
}
