export type ViewMode = "grid" | "list";
export type AssetType = "video" | "audio" | "image" | "document";

export type AssetItem = {
  id: string;
  name: string;
  type: AssetType;
  thumbnailUrl?: string;
  sizeBytes: number;
  createdAt: string;
  duration?: string;
};

export type FolderItem = {
  id: string;
  name: string;
  parentId: string | null;
  itemCount: number;
};

export const MOCK_FOLDERS: FolderItem[] = [
  { id: "root", name: "All Media", parentId: null, itemCount: 12 },
  { id: "f1", name: "A-Roll", parentId: "root", itemCount: 5 },
  { id: "f2", name: "B-Roll", parentId: "root", itemCount: 4 },
  { id: "f3", name: "Audio", parentId: "root", itemCount: 3 },
];

export const MOCK_ASSETS: AssetItem[] = [
  { id: "a1", name: "Interview_Main_Cam.mp4", type: "video", sizeBytes: 1024 * 1024 * 500, createdAt: new Date(Date.now() - 100000).toISOString(), duration: "12:34" },
  { id: "a2", name: "Product_Beauty_Shot.mov", type: "video", sizeBytes: 1024 * 1024 * 120, createdAt: new Date(Date.now() - 200000).toISOString(), duration: "00:15" },
  { id: "a3", name: "Background_Music.wav", type: "audio", sizeBytes: 1024 * 1024 * 15, createdAt: new Date(Date.now() - 300000).toISOString(), duration: "03:45" },
  { id: "a4", name: "Brand_Logo.png", type: "image", sizeBytes: 1024 * 500, createdAt: new Date(Date.now() - 400000).toISOString() },
  { id: "a5", name: "Script_Draft_v2.pdf", type: "document", sizeBytes: 1024 * 1200, createdAt: new Date(Date.now() - 500000).toISOString() },
  { id: "a6", name: "Drone_Flyover.mp4", type: "video", sizeBytes: 1024 * 1024 * 850, createdAt: new Date(Date.now() - 600000).toISOString(), duration: "01:20" },
];
