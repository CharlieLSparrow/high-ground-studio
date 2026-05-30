import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Activity, Cloud, Settings, X, HardDrive, Database, UploadCloud, Trash2, CheckCircle2, Video, Cpu, RefreshCw, Smartphone, ScanLine } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      hideWindow: () => void;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'status'|'cloud'|'ingest'|'migration'>('migration');
  const [wsStatus, setWsStatus] = useState<'connecting'|'online'|'offline'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  const [renderJobs, setRenderJobs] = useState<any[]>([]);
  const [ingestJobs, setIngestJobs] = useState<any[]>([]);
  const [cloudSyncData, setCloudSyncData] = useState<any>({ isSyncing: false, pendingFiles: [], cloudVault: [] });
  const [syncProgress, setSyncProgress] = useState(0);

  const [insta360Data, setInsta360Data] = useState<{ isScanning: boolean; error?: string; videos: any[] }>({ isScanning: false, videos: [] });
  const [sourceDir, setSourceDir] = useState('/Volumes/Bender/DCIM/107CANON');
  const [availableProjects, setAvailableProjects] = useState<{id: string, name: string}[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

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
        if (type === 'INSTA360_SCAN_RESULT') {
          if (payload.error) {
             setInsta360Data({ isScanning: false, videos: [], error: payload.error });
          } else {
             setInsta360Data({ isScanning: false, videos: payload.videos });
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
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'cloud' ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <Cloud className="w-4 h-4" /> Cloud Sync
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
                            <span className="text-sm text-zinc-300 truncate w-40">{vid.name}</span>
                            <span className="text-xs text-amber-500 font-mono">{vid.size} • Proprietary format</span>
                          </div>
                          <button className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-400 px-2 py-1 rounded">Migrate</button>
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
                  <div className="flex-1 p-3 overflow-y-auto flex items-center justify-center">
                    <div className="text-sm text-zinc-500 text-center">
                      Migrated videos will appear here.
                    </div>
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

          {activeTab === 'cloud' && (
            <>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-2xl font-black text-white">Cloud Sync</h1>
                  <p className="text-sm text-zinc-400">Smart Media Pipeline to GCS Vault</p>
                </div>
                <button 
                  onClick={triggerSync}
                  disabled={cloudSyncData.isSyncing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 transition-colors text-white text-sm font-bold rounded shadow-lg flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  {cloudSyncData.isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
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

        </div>
      </div>
    </div>
  );
}
