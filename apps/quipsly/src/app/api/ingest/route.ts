import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import path from 'node:path';

// Store simple state in memory for this prototype (a real app would use Redis or Postgres)
const ingestJobs: Record<string, { status: string, proxyProgress: number, uploadProgress: number }> = {};

export async function POST(request: Request) {
  try {
    const { sourceDir } = await request.json();
    const targetPath = sourceDir || "/Volumes/Bender/DCIM/107CANON";

    // Spawn the ingest worker as a detached process so it doesn't block the API
    const scriptPath = path.join(process.cwd(), "..", "..", "scripts", "ingest-media.mjs");
    
    console.log(`Starting background ingest from ${targetPath}`);
    
    // In a real implementation we'd pass the job ID and read progress via IPC or DB.
    // For now we just kick off the worker we built earlier!
    const child = exec(`node ${scriptPath} "${targetPath}"`);
    
    child.stdout?.on('data', (data) => console.log(`[Ingest Worker]: ${data}`));
    child.stderr?.on('data', (data) => console.error(`[Ingest Error]: ${data}`));

    return NextResponse.json({ success: true, message: "Smart Ingest Pipeline Started." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  // Return the mock in-memory state
  return NextResponse.json({ jobs: ingestJobs });
}
