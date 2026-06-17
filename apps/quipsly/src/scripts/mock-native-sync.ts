/**
 * mock-native-sync.ts
 * 
 * Simulates a MacOS/iOS Native App operating offline, capturing edits,
 * and performing a bi-directional conflict-resolving sync when returning online.
 * 
 * Run via: npx tsx src/scripts/mock-native-sync.ts <USER_TOKEN>
 */

import crypto from "crypto";

const API_URL = "http://localhost:3000/api/v1/notes/sync";

// Mock local SQLite database
const LocalStore = {
  lastSyncAt: null as string | null,
  notes: new Map<string, any>(),
};

async function sync(token: string) {
  console.log(`\n[SYNC] Pushing offline notes... Last Sync: ${LocalStore.lastSyncAt}`);
  
  const clientNotes = Array.from(LocalStore.notes.values());
  
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      lastSyncAt: LocalStore.lastSyncAt,
      clientNotes,
    }),
  });

  if (!response.ok) {
    console.error("[SYNC] Error", await response.text());
    return;
  }

  const data = await response.json();
  
  // Apply server changes to local store
  for (const serverNote of data.serverNotes) {
    console.log(`[SYNC] Reconciling Note from Server: ${serverNote.title}`);
    LocalStore.notes.set(serverNote.id, serverNote);
  }

  LocalStore.lastSyncAt = data.syncCompletedAt;
  console.log(`[SYNC] Completed. New Last Sync: ${LocalStore.lastSyncAt}`);
}

async function run() {
  const token = process.argv[2];
  if (!token) {
    console.error("Please provide a Firebase ID Token as an argument.");
    process.exit(1);
  }

  console.log("=== 1. Initial Sync ===");
  await sync(token);

  console.log("\n=== 2. Going Offline & Creating Note ===");
  const noteId = crypto.randomUUID();
  LocalStore.notes.set(noteId, {
    id: noteId,
    title: "Offline Thoughts",
    content: "This is my initial thought.",
    folderName: "MacOS Drafts",
    tags: ["offline", "test"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log("\n=== 3. Restoring Connection & Syncing ===");
  await sync(token);

  console.log("\n=== 4. Going Offline Again & Editing ===");
  // We simulate going offline. While offline, someone on the Web Hub edits this exact note.
  // Then we edit the note locally.
  const note = LocalStore.notes.get(noteId);
  note.content = "This is my initial thought.\n\nOffline edit appended!";
  note.updatedAt = new Date().toISOString();
  LocalStore.notes.set(noteId, note);

  console.log("-> Local Note Content:", note.content);
  console.log("\n[ACTION REQUIRED]: Now go to the Web Hub and edit the exact same block simultaneously. Then press Enter here to trigger the conflicted sync...");
  
  process.stdin.once('data', async () => {
    console.log("\n=== 5. Restoring Connection & Resolving Conflicts ===");
    await sync(token);

    console.log("\nFinal Local State after Merge:");
    console.log(LocalStore.notes.get(noteId).content);
    process.exit(0);
  });
}

run().catch(console.error);
