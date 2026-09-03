import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { NextResponse } from "next/server";

import { artifactById } from "@/features/command-center/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const hostHeader = request.headers.get("host") ?? "";
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : hostHeader.split(":")[0];
  const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (process.env.VERCEL || !localHostnames.has(hostname)) {
    return NextResponse.json(
      { message: "Personal workspace files are available only on Zack's Mac." },
      { status: 404 },
    );
  }

  const artifact = artifactById((await params).artifactId);
  if (!artifact) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  try {
    const file = await readFile(artifact.path);
    const extension = extname(artifact.fileName).toLowerCase();
    const disposition = extension === ".pdf" || extension === ".md" || extension === ".csv"
      ? "inline"
      : "attachment";
    return new NextResponse(file, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${disposition}; filename=\"${artifact.fileName.replaceAll('"', "")}\"`,
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "This source file is not currently available on this Mac." },
      { status: 404 },
    );
  }
}
