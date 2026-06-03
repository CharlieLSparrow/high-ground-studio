import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Activity, Cloud, Settings, X, HardDrive, Database, UploadCloud, Trash2, CheckCircle2, Video, Cpu, RefreshCw, Smartphone, ScanLine, Folder, File, ChevronLeft } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      hideWindow: () => void;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'status'|'cloud'|'ingest'|'migration'|'files'|'reports'>('files');
  const [wsStatus, setWsStatus] = useState<'connecting'|'online'|'offline'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  const [renderJobs, setRenderJobs] = useState<any[]>([]);
  const [ingestJobs, setIngestJobs] = useState<any[]>([]);
  const [cloudSyncData, setCloudSyncData] = useState<any>({ isSyncing: false, pendingFiles: [], cloudVault: [] });
  const [syncProgress, setSyncProgress] = useState(0);

  const [insta360Data, setInsta360Data] = useState<{ isScanning: boolean; error?: string; videos: any[] }>({ isScanning: false, videos: [] });
  const [fileBrowserData, setFileBrowserData] = useState<{ isScanning: boolean; error?: string; files: any[], currentPath: string, root: 'icloud'|'desktop' }>({ isScanning: false, files: [], currentPath: '', root: 'desktop' });
  const [verifiedHashes, setVerifiedHashes] = useState<Record<string, string>>({});
  const [pushingFiles, setPushingFiles] = useState<Record<string, number>>({});
  const [sourceDir, setSourceDir] = useState('/Volumes/Bender/DCIM/107CANON');
  const [availableProjects, setAvailableProjects] = useState<{id: string, name: string}[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:4000');
    
    ws.onopen = () => {
      setWsStatus('online');
      ws.send(JSON.stringify({ type: 'GET_STATUS' }));
      ws.send(JSON.stringify({ type: 'FETCH_PROJECTS' }));
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        if (type === 'RENDER_PROGRESS') setRenderJobs(payload);
        if (type === 'INGEST_PROGRESS') setIngestJobs(payload);
        if (type === 'REPORTS_UPDATED') setReports(payload);
        if (type === 'SYNC_STATUS') {
          setCloudSyncData(payload);
          if (!payload.isSyncing && syncProgress > 0 && syncProgress < 100) {
            setSyncProgress(100);
          }
        }
        if (type === 'SYNC_PROGRESS') {
          setSyncProgress(payload.progress);
          setCloudSyncData(payload.status);
        }
        if (type === 'FILE_PUSH_PROGRESS') {
          setPushingFiles((prev: any) => {
             const updated = { ...prev, [payload.fileName]: payload.progress };
             if (payload.progress >= 100) delete updated[payload.fileName];
             return updated;
          });
        }
        if (type === 'INSTA360_SCAN_RESULT') {
          if (payload.error) {
             setInsta360Data({ isScanning: false, videos: [], error: payload.error });
          } else {
             setInsta360Data({ isScanning: false, videos: payload.videos });
          }
        }
        if (type === 'LOCAL_DIR_RESULT') {
          if (payload.error) {
             setFileBrowserData((prev: any) => ({ ...prev, isScanning: false, error: payload.error }));
          } else {
             setFileBrowserData({ isScanning: false, files: payload.files, currentPath: payload.currentPath, root: payload.root, error: undefined });
          }
        }
        if (type === 'FILE_CHECKSUM_RESULT') {
          if (payload.md5) {
             setVerifiedHashes((prev: any) => ({ ...prev, [payload.fileName]: payload.md5 }));
          }
        }
        if (type === 'PROJECTS_LIST') {
          setAvailableProjects(payload);
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      setWsStatus('offline');
      setTimeout(connectWebSocket, 3000);
    };
    wsRef.current = ws;
  };

  const triggerSync = () => {
    if (wsRef.current && wsStatus === 'online') {
      wsRef.current.send(JSON.stringify({ type: 'START_CLOUD_SYNC' }));
      setSyncProgress(0);
    }
  };

  const triggerIngest = () => {
    if (wsRef.current && wsStatus === 'online') {
      wsRef.current.send(JSON.stringify({ type: 'START_INGEST', payload: { sourceDir, projectIds: selectedProjectIds } }));
    }
  };

  const triggerInsta360Scan = () => {
    if (wsRef.current && wsStatus === 'online') {
      setInsta360Data({ isScanning: true, videos: [], error: undefined });
      wsRef.current.send(JSON.stringify({ type: 'SCAN_INSTA360' }));
    }
  };

  const loadLocalDir = (root: 'icloud'|'desktop', subpath: string = '') => {
    if (wsRef.current && wsStatus === 'online') {
      setFileBrowserData(prev => ({ ...prev, isScanning: true, error: undefined, root }));
      wsRef.current.send(JSON.stringify({ type: 'READ_LOCAL_DIR', payload: { root, subpath } }));
    }
  };

  const openGcsBucket = () => {
    if (wsRef.current && wsStatus === 'online') {
      wsRef.current.send(JSON.stringify({ type: 'OPEN_GCS_BUCKET' }));
    }
  };

  const closeWindow = () => {
    if (window.electronAPI) {
      window.electronAPI.hideWindow();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black/90 text-white rounded-xl overflow-hidden border border-zinc-800 shadow-2xl backdrop-blur-xl">
      {/* Draggable Titlebar */}
      <div className="h-8 drag-region flex justify-end items-center px-4 pt-2">
        <button onClick={closeWindow} className="no-drag text-zinc-500 hover:text-white p-1 rounded hover:bg-red-500/20 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-black/40 border-r border-zinc-800/50 p-4 flex flex-col gap-2 no-drag">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2 px-2">Quipsly Local Nest</h2>
          <button 
            onClick={() => setActiveTab('status')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'status' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <Activity className="w-4 h-4" /> Status
          </button>
          <button 
            onClick={() => setActiveTab('ingest')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'ingest' ? 'bg-purple-500/10 text-purple-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <Video className="w-4 h-4" /> Ingest SD
          </button>
          <button 
            onClick={() => setActiveTab('migration')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'migration' ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <Smartphone className="w-4 h-4" /> 360 Migration
          </button>
          <button 
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'files' ? 'bg-sky-500/10 text-sky-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <Folder className="w-4 h-4" /> Local Files
          </button>
          <button 
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'cloud' ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <Database className="w-4 h-4" /> Cloud Sync
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'reports' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <File className="w-4 h-4" /> AI Reports
          </button>
          <button className="flex items-center gap-3 px-3 py-2 rounded text-sm font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors mt-auto">
            <Settings className="w-4 h-4" /> Settings
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 no-drag overflow-y-auto">
          
          {activeTab === 'status' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">Quipsly Local Nest</h1>
                  <p className="text-sm text-zinc-400">Connected via IPC WebSocket</p>
                </div>
                <div className={`px-3 py-1 rounded-full border text-xs font-bold uppercase flex items-center gap-2 ${wsStatus === 'online' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${wsStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                  {wsStatus === 'online' ? 'Online' : 'Offline'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg">
                  <p className="text-xs text-zinc-500 font-bold mb-1 flex items-center gap-2"><Cpu className="w-4 h-4" /> CPU USAGE</p>
                  <p className="text-xl font-mono text-white">12.4%</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg">
                  <p className="text-xs text-zinc-500 font-bold mb-1 flex items-center gap-2"><Activity className="w-4 h-4" /> MEMORY</p>
                  <p className="text-xl font-mono text-white">842 MB</p>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <HardDrive className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold">Active Render Tasks</h3>
                </div>
                <div className="space-y-4">
                  {renderJobs.length === 0 ? (
                    <div className="text-sm text-zinc-500 text-center py-4">No active renders</div>
                  ) : (
                    renderJobs.map(job => (
                      <div key={job.id}>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-zinc-300">{job.name} - {job.status}</span>
                          <span className="text-blue-400">{job.progress}%</span>
                        </div>
                        <div className="w-full bg-black rounded-full h-1.5 border border-zinc-800">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${job.progress}%` }}></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'migration' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">Insta360 Migration Tool</h1>
                  <p className="text-sm text-zinc-400">Agentic UI Automation Scraper</p>
                </div>
                <button 
                  onClick={triggerInsta360Scan}
                  disabled={insta360Data.isScanning}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900 disabled:text-amber-400 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2"
                >
                  <ScanLine className={`w-4 h-4 ${insta360Data.isScanning ? 'animate-spin' : ''}`} />
                  {insta360Data.isScanning ? 'Dispatching a Quipsly...' : 'Scan Insta360 App'}
                </button>
              </div>

              {insta360Data.error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-6 text-sm font-bold">
                  {insta360Data.error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-6 h-96">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex items-center gap-2 text-amber-400 text-sm font-bold">
                    <Smartphone className="w-4 h-4" />
                    Stuck in Insta360 Cloud
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto space-y-2">
                    {insta360Data.videos.length > 0 ? (
                      insta360Data.videos.map((vid: any) => (
                        <div key={vid.id} className="bg-black/50 border border-zinc-800 p-2 rounded flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="text-sm text-zinc-300 truncate w-64" title={vid.name}>{vid.name}</span>
                            {(() => {
                              const match = vid.name.match(/VID_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
                              if (match) {
                                const [_, y, m, d, h, min, s] = match;
                                const date = new Date(`${y}-${m}-${d}T${h}:${min}:${s}`);
                                const dateStr = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
                                return <span className="text-sm text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded mt-1 mb-1 inline-block w-fit">{dateStr}</span>;
                              }
                              return null;
                            })()}
                            <span className="text-xs text-amber-500 font-mono">{vid.size} • {vid.path ? 'Local Drive' : 'Proprietary format'}</span>
                          </div>
                          <button 
                            className="text-[10px] uppercase font-bold bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 px-2 py-1 rounded transition-colors"
                            onClick={() => wsRef.current?.send(JSON.stringify({ type: 'EXECUTE_INSTA360_CLICK', payload: { box: vid.download_btn_box } }))}
                          >
                            Migrate
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-zinc-500 text-center py-12 px-4">
                        Click "Scan Insta360 App" to dispatch a Quipsly Agent. It will physically open Insta360 Studio and scrape your cloud videos for you!
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex items-center gap-2 text-zinc-400 text-sm font-bold">
                    <Database className="w-4 h-4" />
                    High Ground GCS Vault
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto space-y-2">
                    {(!cloudSyncData?.cloudVault || cloudSyncData.cloudVault.length === 0) ? (
                      <div className="h-full flex items-center justify-center text-sm text-zinc-500 text-center">
                        Migrated videos will appear here.
                      </div>
                    ) : (
                      cloudSyncData.cloudVault.map((v: any, i: number) => (
                        <div key={i} className="bg-black/50 border border-zinc-800 p-2 rounded flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-zinc-300 truncate w-48" title={v.filename}>{v.filename}</span>
                            <div className="flex items-center gap-2 mt-1">
                               <span className="text-xs text-blue-400 bg-blue-500/10 px-2 rounded">{v.sizeMb} MB</span>
                               <span className="text-[10px] text-zinc-500 font-mono">MD5: {v.md5 ? v.md5.substring(0,8) + '...' : 'Unknown'}</span>
                            </div>
                          </div>
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'ingest' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">Ingest SD Card</h1>
                  <p className="text-sm text-zinc-400">Generate Proxies & Stitch Insta360 Packages</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 bg-black border border-zinc-800 rounded flex items-center px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
                   <HardDrive className="w-4 h-4 text-zinc-500 mr-2" />
                   <input type="text" className="bg-transparent border-none outline-none text-sm w-full font-mono text-zinc-300" value={sourceDir} onChange={e => setSourceDir(e.target.value)} />
                </div>
                <button onClick={triggerIngest} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-sm transition-colors shadow-lg">Start Ingest</button>
              </div>

              <div className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 block flex items-center gap-2">
                  <Database className="w-4 h-4" /> Tag Media to Projects
                </label>
                <div className="flex gap-2 flex-wrap">
                  {availableProjects.length === 0 ? (
                    <span className="text-sm text-zinc-500 italic">No active projects found...</span>
                  ) : availableProjects.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => setSelectedProjectIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                      className={`px-3 py-1.5 rounded text-sm font-bold border transition-colors ${selectedProjectIds.includes(p.id) ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <h3 className="font-bold mb-4 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-purple-400"/> Proxy Queue</h3>
                <div className="space-y-4">
                  {ingestJobs.length === 0 ? (
                    <div className="text-sm text-zinc-500 text-center py-4">No active ingests</div>
                  ) : (
                    ingestJobs.map(job => (
                      <div key={job.id} className="bg-black/50 p-3 rounded border border-zinc-800 relative overflow-hidden">
                        {job.status === 'error' && <div className="absolute inset-0 bg-red-500/10 pointer-events-none"></div>}
                        <div className="flex justify-between text-sm font-bold mb-2">
                          <span className="text-zinc-300 truncate w-64" title={job.filename}>{job.filename}</span>
                          <span className={job.status === 'error' ? 'text-red-400' : 'text-zinc-500'}>{job.status}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500 mb-1">
                               <span>Proxy</span>
                               <span className={job.status === 'error' ? 'text-red-400' : 'text-purple-400'}>{job.proxyProgress}%</span>
                            </div>
                            <div className="w-full bg-black rounded-full h-1.5 border border-zinc-800">
                              <div className={`h-1.5 rounded-full transition-all ${job.status === 'error' ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${job.proxyProgress}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500 mb-1">
                               <span>Cloud Backup</span>
                               <span className={job.status === 'error' ? 'text-red-400' : 'text-blue-400'}>{job.uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-black rounded-full h-1.5 border border-zinc-800">
                              <div className={`h-1.5 rounded-full transition-all ${job.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${job.uploadProgress}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'files' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">Local Files</h1>
                  <p className="text-sm text-zinc-400">Scan and migrate assets from your local drives</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => loadLocalDir('desktop', '')}
                    disabled={fileBrowserData.isScanning}
                    className={`px-4 py-2 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2 ${fileBrowserData.root === 'desktop' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                  >
                    <Folder className={`w-4 h-4 ${fileBrowserData.isScanning && fileBrowserData.root === 'desktop' ? 'animate-pulse' : ''}`} />
                    Desktop
                  </button>
                  <button 
                    onClick={() => loadLocalDir('icloud', '')}
                    disabled={fileBrowserData.isScanning}
                    className={`px-4 py-2 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2 ${fileBrowserData.root === 'icloud' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                  >
                    <Cloud className={`w-4 h-4 ${fileBrowserData.isScanning && fileBrowserData.root === 'icloud' ? 'animate-pulse' : ''}`} />
                    iCloud Drive
                  </button>
                  <div className="w-px h-8 bg-zinc-800 mx-2 self-center"></div>
                  <button 
                    onClick={openGcsBucket}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2"
                  >
                    <Database className="w-4 h-4" />
                    Open Bucket
                  </button>
                </div>
              </div>

              {fileBrowserData.error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg mb-6 text-sm font-bold">
                  {fileBrowserData.error}
                </div>
              )}

              <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden h-[500px]">
                <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between gap-2 text-sky-400 text-sm font-bold">
                  <div className="flex items-center gap-2">
                    {fileBrowserData.currentPath ? (
                      <button 
                        onClick={() => loadLocalDir(fileBrowserData.root, fileBrowserData.currentPath.split('/').slice(0, -1).join('/'))}
                        className="p-1 hover:bg-sky-500/20 rounded mr-1 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    ) : (
                      fileBrowserData.root === 'icloud' ? <Cloud className="w-4 h-4" /> : <Folder className="w-4 h-4" />
                    )}
                    {fileBrowserData.root === 'icloud' ? 'iCloud Drive' : 'Desktop'} {fileBrowserData.currentPath ? `/ ${fileBrowserData.currentPath}` : ''}
                  </div>
                  <span className="text-xs text-zinc-500">{fileBrowserData.files.length} items found</span>
                </div>
                <div className="flex-1 p-3 overflow-y-auto space-y-2">
                  {fileBrowserData.files.length > 0 ? (
                    fileBrowserData.files.map((vid: any) => (
                      <div 
                        key={vid.id} 
                        className={`bg-black/50 border border-zinc-800 p-3 rounded flex justify-between items-center transition-colors ${vid.isDirectory ? 'hover:bg-zinc-800 cursor-pointer' : 'hover:border-zinc-700'}`}
                        onClick={vid.isDirectory ? () => loadLocalDir(fileBrowserData.root, fileBrowserData.currentPath ? `${fileBrowserData.currentPath}/${vid.name}` : vid.name) : undefined}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center ${vid.isDirectory ? 'text-amber-500' : 'text-sky-500'}`}>
                             {vid.isDirectory ? <Folder className="w-5 h-5" /> : <File className="w-5 h-5" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-zinc-300">{vid.name}</span>
                            <span className="text-xs text-zinc-500 font-mono">{vid.isDirectory ? 'Folder' : vid.size} • {vid.date}</span>
                          </div>
                        </div>
                        {(() => {
                          const vaultMatch = !vid.isDirectory && cloudSyncData?.cloudVault?.find((v: any) => v.filename === vid.name);
                          
                          if (vid.isDirectory) return null;
                          
                          if (vaultMatch) {
                            const localHash = verifiedHashes[vid.name];
                            if (localHash && localHash === vaultMatch.md5) {
                              return (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] uppercase font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Vaulted
                                  </span>
                                  <button 
                                    className="text-[10px] uppercase font-bold bg-red-500/20 hover:bg-red-500/40 text-red-400 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                                    onClick={(e) => { e.stopPropagation(); wsRef.current?.send(JSON.stringify({ type: 'DELETE_LOCAL_FILE', payload: { fileName: vid.name, root: fileBrowserData.root, subpath: fileBrowserData.currentPath } })); }}
                                  >
                                    <Trash2 className="w-3 h-3" /> Delete Local
                                  </button>
                                </div>
                              );
                            }
                            
                            return (
                               <button 
                                 className="text-[10px] uppercase font-bold bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                                 onClick={(e) => { e.stopPropagation(); wsRef.current?.send(JSON.stringify({ type: 'VERIFY_FILE_CHECKSUM', payload: { fileName: vid.name, root: fileBrowserData.root, subpath: fileBrowserData.currentPath } })); }}
                               >
                                 Verify Safe to Delete
                               </button>
                            );
                          }
                          
                          if (pushingFiles[vid.name] !== undefined) {
                            const progress = pushingFiles[vid.name];
                            return (
                              <div className="flex flex-col gap-1 w-32">
                                <span className="text-[10px] uppercase font-bold text-blue-400 flex items-center justify-between">
                                  <span>{progress === 0 ? 'Hashing...' : 'Uploading'}</span>
                                  <span>{progress > 0 ? `${progress}%` : ''}</span>
                                </span>
                                <div className="w-full bg-black rounded-full h-1.5 border border-zinc-800">
                                  <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${Math.max(5, progress)}%` }}></div>
                                </div>
                              </div>
                            );
                          }
                          
                          return (
                            <button 
                              className="text-[10px] uppercase font-bold bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                              onClick={(e) => { 
                                 e.stopPropagation(); 
                                 setPushingFiles((prev: any) => ({...prev, [vid.name]: 0}));
                                 wsRef.current?.send(JSON.stringify({ type: 'PUSH_LOCAL_TO_VAULT', payload: { fileName: vid.name, root: fileBrowserData.root, subpath: fileBrowserData.currentPath } })); 
                              }}
                            >
                              <UploadCloud className="w-3 h-3" /> Push to Vault
                            </button>
                          );
                        })()}
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3">
                       {fileBrowserData.root === 'icloud' ? <Cloud className="w-12 h-12 text-zinc-700" /> : <Folder className="w-12 h-12 text-zinc-700" />}
                       <div className="text-sm text-center px-8">
                         {fileBrowserData.isScanning ? 'Loading directory...' : `Click "Desktop" or "iCloud" to view your files.`}
                       </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'cloud' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">Cloud Sync</h1>
                  <p className="text-sm text-zinc-400">Smart Media Pipeline to GCS Vault</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={openGcsBucket}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2"
                  >
                    <Database className="w-4 h-4" />
                    Open Bucket
                  </button>
                  <button 
                    onClick={triggerSync}
                    disabled={cloudSyncData.isSyncing}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {cloudSyncData.isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </div>

              {cloudSyncData.isSyncing && (
                <div className="bg-zinc-900 border border-blue-900/50 rounded-lg p-5 mb-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                  <div className="flex justify-between text-xs font-bold mb-2">
                    <span className="text-zinc-300">Uploading pending files...</span>
                    <span className="text-blue-400 font-mono">{syncProgress}%</span>
                  </div>
                  <div className="w-full bg-black rounded-full h-2 border border-zinc-800">
                    <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${syncProgress}%` }}></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6 h-96">
                {/* Local Pane */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-zinc-400 text-sm font-bold">
                      <HardDrive className="w-4 h-4" />
                      Local Ingest
                    </div>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto space-y-2">
                    {!cloudSyncData.isSyncing && syncProgress === 0 ? (
                      cloudSyncData.pendingFiles?.length > 0 ? cloudSyncData.pendingFiles.map((file: any) => (
                        <div key={file.filename} className="bg-black/50 border border-zinc-800 p-2 rounded flex justify-between items-center group">
                          <div className="flex flex-col">
                            <span className="text-sm text-zinc-300 truncate w-40" title={file.filename}>{file.filename}</span>
                            <span className="text-xs text-zinc-500 font-mono">{file.sizeMb} MB • Pending</span>
                          </div>
                        </div>
                      )) : (
                        <div className="text-sm text-zinc-500 text-center py-8">No files in ingest directory</div>
                      )
                    ) : syncProgress === 100 ? (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-50" />
                        <span className="text-xs font-bold">Local storage optimized</span>
                        <span className="text-[10px]">All files safely in the cloud</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Cloud Vault Pane */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-zinc-400 text-sm font-bold">
                      <Database className="w-4 h-4" />
                      Cloud Vault
                    </div>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto space-y-2">
                     {cloudSyncData.cloudVault?.map((file: any) => (
                      <div key={file.filename} className="bg-black/50 border border-zinc-800 p-2 rounded flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-sm text-zinc-300 truncate w-40" title={file.filename}>{file.filename}</span>
                          <span className="text-xs text-zinc-500 font-mono">{file.sizeMb} MB • {file.date}</span>
                        </div>
                        <Cloud className="w-4 h-4 text-blue-500" />
                      </div>
                     ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'reports' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">AI Reports</h1>
                  <p className="text-sm text-zinc-400">Gemini 2.5 Auto-Logging & Offload Reports</p>
                </div>
              </div>

              <div className="space-y-4">
                {reports.length === 0 ? (
                  <div className="text-sm text-zinc-500 text-center py-12">No reports generated in this session yet. Run an offload!</div>
                ) : (
                  reports.map((report, idx) => {
                    const cropJob = croppingJobs[report.sourceFile];
                    
                    return (
                    <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex gap-6">
                      <div className="w-64 h-36 bg-black rounded-lg border border-zinc-800 overflow-hidden flex-shrink-0">
                        {report.thumbnailPath ? (
                          <img src={`file://${report.thumbnailPath}`} alt="thumbnail" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700">No Thumb</div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            {report.smartName && (
                              <h2 className="text-xl font-bold text-amber-400 mb-1 flex items-center gap-2">
                                ✨ {report.smartName}
                              </h2>
                            )}
                            <h3 className="text-sm text-zinc-400 mb-3">{report.sourceFile.split('/').pop()}</h3>
                          </div>
                          
                          {/* Slice to Vertical Button / Status */}
                          <div className="flex flex-col items-end gap-2 w-48">
                            {cropJob && cropJob.status === 'SLICING' ? (
                               <div className="w-full">
                                  <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase mb-1">
                                     <span>Cropping...</span>
                                     <span className="text-emerald-400">{cropJob.progress}%</span>
                                  </div>
                                  <div className="w-full bg-black rounded-full h-1.5 border border-zinc-800">
                                     <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-300" style={{width: `${cropJob.progress}%`}}></div>
                                  </div>
                               </div>
                            ) : cropJob && cropJob.status === 'COMPLETE' ? (
                               <div className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/30">
                                 <CheckCircle2 className="w-4 h-4" /> Sliced to Vertical
                               </div>
                            ) : (
                               <button 
                                 onClick={() => triggerSliceToVertical(report.sourceFile)}
                                 className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white text-xs font-bold rounded shadow flex items-center gap-2"
                               >
                                 <ScanLine className="w-3 h-3" />
                                 Slice to Vertical
                               </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                          {report.tags && report.tags.map((tag: string, i: number) => (
                            <span key={i} className="px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-full text-xs font-bold border border-indigo-500/30">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="text-xs font-mono text-zinc-500 grid grid-cols-2 gap-x-8 gap-y-2">
                          <p>Size: {report.sizeMb} MB</p>
                          <p>Hash: <span className="text-emerald-400">{report.hashHex?.substring(0,10)}...</span></p>
                          <p className="col-span-2 text-[10px]">Drives: {report.destinations?.join(', ')}</p>
                        </div>
                      </div>
                    </div>
                  )})
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
