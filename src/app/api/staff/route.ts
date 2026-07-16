import { NextResponse } from "next/server";
import { getStaff } from "@/lib/staff";

// Public — used by the submission form's staff picker.
export async function GET() {
  return NextResponse.json(await getStaff());
}
