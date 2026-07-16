import { NextResponse } from "next/server";
import { getTitles } from "@/lib/titles";

// Public — used by the submission form dropdown.
export async function GET() {
  return NextResponse.json(await getTitles());
}
