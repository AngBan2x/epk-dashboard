import { NextResponse } from "next/server";

export async function POST() {
  try {
    return NextResponse.json({
      status: "ok",
      message: "Sync endpoint ready — F4",
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Sync failed" }, { status: 500 });
  }
}
