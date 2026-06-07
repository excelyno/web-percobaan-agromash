'use client';

import { useState } from 'react';
import { 
  Upload, Server, Waypoints, Activity, AlertCircle, Map, Network, Cpu, 
  Database, PlayCircle, ChevronRight, ChevronLeft, CheckCircle2, ListFilter
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  // Navigation & Simulation Step States
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentSession, setCurrentSession] = useState(1);
  const [bfSubTab, setBfSubTab] = useState(3); // Default view setup 3 server untuk Brute Force

  // Client-side processed states for the detailed session trace
  const [parsedData, setParsedData] = useState([]);
  const [distanceMatrix, setDistanceMatrix] = useState([]);
  const [adjacencyList, setAdjacencyList] = useState({});
  const [graphEdges, setGraphEdges] = useState([]);

  const API_URL = "http://178.83.188.227:5000/api/calculate";

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        // --- SESI 1: Parsing Data CSV Murni ---
        const nodes = lines.slice(1).map(line => {
          const cols = line.split(',');
          if(cols.length < 5) return null;
          return { 
            id: cols[0].trim(), 
            name: cols[1].trim().replace(/"/g, ""), 
            type: cols[2].trim(),
            x: parseFloat(cols[3]), 
            y: parseFloat(cols[4]), 
            z: parseFloat(cols[5]) || 0 
          };
        }).filter(Boolean);
        
        setParsedData(nodes);

        // Ambil batas jarak transmisi (default dinamis atau fallback ke 150)
        const maxRange = result?.config?.max_transmission_range_meter || 150;

        // --- SESI 2 & 3: Kalkulasi Euclidean & Adjacency List ---
        const matrix = [];
        const edges = [];
        const adj = {};

        // Inisialisasi list penampung tetangga
        nodes.forEach(n => { adj[n.name] = []; });

        for (let i = 0; i < nodes.length; i++) {
          for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dz = nodes[i].z - nodes[j].z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Simpan semua kombinasi berpasangan untuk Sesi 2 (tampilkan satu arah i < j di tabel agar rapi)
            if (i < j) {
              matrix.push({ 
                source: nodes[i].name, 
                target: nodes[j].name, 
                dx: dx.toFixed(1), 
                dy: dy.toFixed(1), 
                dz: dz.toFixed(1), 
                dist 
              });
            }
            
            // Hubungkan jika masuk range transmisi fisik
            if (dist <= maxRange) {
              if (i < j) edges.push({ source: nodes[i], target: nodes[j], dist });
              adj[nodes[i].name].push({ name: nodes[j].name, dist });
            }
          }
        }
        setDistanceMatrix(matrix);
        setGraphEdges(edges);
        setAdjacencyList(adj);
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Silakan pilih file CSV terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(API_URL, { method: "POST", body: formData });
      if (!response.ok) throw new Error(`Server Error (${response.status}): Gagal memproses data di VPS.`);
      
      const data = await response.json();
      if (data.status === "error") throw new Error(data.message || "Terjadi kesalahan algoritma pada C++.");

      setResult(data);
      setActiveTab('trace'); // Alihkan otomatis ke tab trace interaktif
      setCurrentSession(1);  // Mulai dari Sesi awal 1
    } catch (err) {
      setError(err.message || "Gagal terhubung ke Backend VPS Server.");
    } finally {
      setLoading(false);
    }
  };

  const getBruteForceChartData = () => {
    if (!result?.brute_force_optimization) return [];
    const bf = result.brute_force_optimization;
    return [
      { name: '1 Server', Jarak: bf.single_server.avg_distance_meter, Hop: bf.single_server.avg_hop },
      { name: '2 Server', Jarak: bf.two_servers.avg_distance_meter, Hop: bf.two_servers.avg_hop },
      { name: '3 Server', Jarak: bf.three_servers.avg_distance_meter, Hop: bf.three_servers.avg_hop },
    ];
  };

  // --- ENGINE ENGINE VISUALISASI GRAF PER SESI (MURNI SVG RESPONSIVE) ---
  const renderSessionGraph = () => {
    if (parsedData.length === 0) return null;
    
    // Auto scaling terpusat agar sebaran node muat sempurna di dalam box SVG 700x400
    const pad = 40;
    const maxX = Math.max(...parsedData.map(d => d.x), 100);
    const maxY = Math.max(...parsedData.map(d => d.y), 100);
    const scaleX = (700 - pad * 2) / maxX;
    const scaleY = (400 - pad * 2) / maxY;
    
    const maxRange = result?.config?.max_transmission_range_meter || 150;
    const centralNodeName = result?.best_central_node?.name;

    // Ambil daftar server brute force yang aktif berdasarkan sub-tab pilihan user di Sesi 5
    let activeBfServers = [];
    if (result && currentSession === 5) {
      if (bfSubTab === 1) activeBfServers = [result.brute_force_optimization.single_server.servers[0]];
      if (bfSubTab === 2) activeBfServers = result.brute_force_optimization.two_servers.servers;
      if (bfSubTab === 3) activeBfServers = result.brute_force_optimization.three_servers.servers;
    }
    // Bersihkan quotes pembungkus dari server name agar pencocokan string valid
    activeBfServers = activeBfServers.map(s => s.replace(/"/g, ""));

    return (
      <div className="relative bg-slate-950 rounded-2xl border border-slate-800 p-2 shadow-inner overflow-hidden">
        <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-800 text-xs px-3 py-1 rounded-md text-slate-400 font-mono z-10">
          Status Map Visualizer: Sesi {currentSession}
        </div>
        <svg viewBox="0 0 700 400" className="w-full h-auto">
          {/* Sesi 2, 3, dan 4: Gambar Garis Infrastruktur Fisik Jaringan (Edges) */}
          {(currentSession === 2 || currentSession === 3 || currentSession === 4) && graphEdges.map((edge, i) => {
            let isRoutingPath = false;
            
            // Sesi 4: Sorot khusus rute Dijkstra terpendek menuju Gateway Utama dengan warna Hijau Neon
            if (currentSession === 4 && result?.routes) {
              result.routes.forEach(r => {
                const cleanPath = r.path?.map(p => p.replace(/"/g, "")) || [];
                for (let p = 0; p < cleanPath.length - 1; p++) {
                  if ((cleanPath[p] === edge.source.name && cleanPath[p+1] === edge.target.name) ||
                      (cleanPath[p] === edge.target.name && cleanPath[p+1] === edge.source.name)) {
                    isRoutingPath = true;
                  }
                }
              });
            }

            return (
              <line 
                key={`edge-${i}`} 
                x1={edge.source.x * scaleX + pad} y1={edge.source.y * scaleY + pad} 
                x2={edge.target.x * scaleX + pad} y2={edge.target.y * scaleY + pad} 
                stroke={isRoutingPath ? "#10b981" : currentSession === 3 ? "#1e293b" : "#334155"} 
                strokeWidth={isRoutingPath ? 3.5 : 1.2}
                strokeDasharray={currentSession === 2 && edge.dist > maxRange ? "4 4" : "0"}
                opacity={isRoutingPath ? 1 : 0.4}
              />
            );
          })}

          {/* Sesi 5: Gambar Garis Cluster Pembagian Distribusi Beban Server Terdekat */}
          {currentSession === 5 && graphEdges.map((edge, i) => {
            // Cek jika node terhubung langsung dengan salah satu cluster gateway pemenang brute force
            const sourceIsServer = activeBfServers.includes(edge.source.name);
            const targetIsServer = activeBfServers.includes(edge.target.name);
            const isClusterLink = sourceIsServer || targetIsServer;

            return (
              <line 
                key={`bf-edge-${i}`} 
                x1={edge.source.x * scaleX + pad} y1={edge.source.y * scaleY + pad} 
                x2={edge.target.x * scaleX + pad} y2={edge.target.y * scaleY + pad} 
                stroke={isClusterLink ? "#0ea5e9" : "#1e293b"} 
                strokeWidth={isClusterLink ? 1.5 : 0.8}
                opacity={isClusterLink ? 0.7 : 0.2}
              />
            );
          })}

          {/* Gambar Semua Titik Node Sensor */}
          {parsedData.map((node, i) => {
            let nodeColor = "#0ea5e9"; // Default: Biru Langit (Sensor Biasa)
            let nodeRadius = 6;
            let isHighlightedNode = false;

            if (currentSession === 3) {
              // Sesi 3: Ukuran lingkaran dinamis mengikuti tingkat kepadatan relasi tetangga (Degree Centrality)
              const degree = adjacencyList[node.name]?.length || 0;
              nodeRadius = 4 + (degree * 1.2);
            } else if (currentSession === 4) {
              // Sesi 4: Tandai Server Pusat Pilihan Dijkstra dengan Warna Hijau & Ukuran Besar
              if (node.name === centralNodeName) {
                nodeColor = "#10b981";
                nodeRadius = 10;
                isHighlightedNode = true;
              }
            } else if (currentSession === 5) {
              // Sesi 5: Warnai Emas/Kuning khusus untuk node terpilih sebagai Multi-Gateway Server
              if (activeBfServers.includes(node.name)) {
                nodeColor = "#f59e0b";
                nodeRadius = 9;
                isHighlightedNode = true;
              }
            }

            return (
              <g key={`node-${i}`} className="cursor-pointer group">
                {isHighlightedNode && (
                  <circle 
                    cx={node.x * scaleX + pad} cy={node.y * scaleY + pad} 
                    r={nodeRadius + 4} fill={nodeColor} opacity="0.2" className="animate-ping"
                  />
                )}
                <circle 
                  cx={node.x * scaleX + pad} cy={node.y * scaleY + pad} 
                  r={nodeRadius} fill={nodeColor}
                  className="transition-all duration-300 group-hover:stroke-white group-hover:stroke-2"
                />
                <text 
                  x={node.x * scaleX + pad} y={node.y * scaleY + pad + (nodeRadius + 10)} 
                  fontSize="9" fill="#94a3b8" textAnchor="middle" className="font-mono pointer-events-none font-bold"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER UTAMA */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl"><Waypoints className="w-8 h-8" /></div>
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">AgroMesh Analytics</h1>
              <p className="text-slate-400 text-sm mt-1">Live Multi-Session Algorithm Workspace Simulator</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 md:mt-0 flex items-center gap-3 w-full md:w-auto">
            <label className="flex-1 cursor-pointer bg-slate-800 border border-slate-700 hover:border-emerald-500 transition-colors px-4 py-3 rounded-xl flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium truncate max-w-[150px]">{file ? file.name : "Pilih File CSV"}</span>
              <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            </label>
            <button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg flex items-center gap-2">
              {loading ? <Activity className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
              {loading ? "Menganalisis..." : "Jalankan Simulasi"}
            </button>
          </form>
        </header>

        {error && <div className="bg-red-950/50 border border-red-900/50 text-red-400 p-4 rounded-xl flex items-center gap-3 animate-pulse"><AlertCircle className="w-6 h-6" /><p>{error}</p></div>}

        {/* TAB CONTROL UTAMA */}
        {result && (
          <div className="flex gap-4 border-b border-slate-800 pb-2">
            <button onClick={() => setActiveTab('trace')} className={`pb-2 px-4 font-semibold transition-colors border-b-2 ${activeTab === 'trace' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              ⚙️ Sesi Trace & Alur Algoritma (Interactive)
            </button>
            <button onClick={() => setActiveTab('dashboard')} className={`pb-2 px-4 font-semibold transition-colors border-b-2 ${activeTab === 'dashboard' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              📊 Hasil Akhir (Dashboard Summary)
            </button>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB WORKSPACE: TRACE ALGORITMA MULTI SESI                      */}
        {/* =============================================================== */}
        {result && activeTab === 'trace' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* STEPPER NAVIGATOR */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap justify-between items-center gap-4 shadow-md">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((step) => (
                  <button
                    key={step}
                    onClick={() => setCurrentSession(step)}
                    className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center transition-all ${
                      currentSession === step 
                        ? 'bg-emerald-600 text-white shadow-lg ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' 
                        : currentSession > step 
                        ? 'bg-slate-800 text-emerald-400 border border-emerald-900/50' 
                        : 'bg-slate-800 text-slate-500 border border-slate-700/50'
                    }`}
                  >
                    {currentSession > step ? <CheckCircle2 className="w-5 h-5" /> : step}
                  </button>
                ))}
                <span className="ml-3 font-semibold text-white hidden sm:inline">
                  {currentSession === 1 && "Sesi 1: Parsing & Plot Koordinat"}
                  {currentSession === 2 && "Sesi 2: Perhitungan Matriks Euclidean"}
                  {currentSession === 3 && "Sesi 3: Matriks Relasi (Adjacency List)"}
                  {currentSession === 4 && "Sesi 4: Perutean Terpendek Dijkstra"}
                  {currentSession === 5 && "Sesi 5: Optimasi Multi-Gateway Brute Force"}
                </span>
              </div>

              <div className="flex gap-2 w-full sm:w-auto justify-between">
                <button 
                  disabled={currentSession === 1}
                  onClick={() => setCurrentSession(p => p - 1)}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 border border-slate-700"
                >
                  <ChevronLeft className="w-4 h-4"/> Sesi Sebelumnya
                </button>
                <button 
                  disabled={currentSession === 5}
                  onClick={() => setCurrentSession(p => p + 1)}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 shadow-md"
                >
                  Sesi Berikutnya <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>

            {/* AREA UTAMA SESI: DEKSTRIPSI & DUA KOLOM (VISUAL GRAPH VS TABEL DATA MUTASI) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* PANEL GRAFIK VISUALISASI JALUR SESI */}
              <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-lg space-y-4">
                <div>
                  <h4 className="text-white font-bold text-lg mb-1 flex items-center gap-2">
                    <SlidersIcon className="text-emerald-400 w-5 h-5"/> Peta Lahan Hasil Pemrosesan Sesi {currentSession}
                  </h4>
                  <p className="text-slate-400 text-xs">Peta topologi spasial diperbarui secara real-time berdasarkan state komputasi pada langkah saat ini.</p>
                </div>
                
                {renderSessionGraph()}
                
                {/* Legenda Dinamis Mengikuti Perubahan Sesi */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap gap-4 text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-sky-500 block"></span> Sensor Aktif</div>
                  {currentSession >= 2 && <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-slate-600 block"></span> Relasi Transmisi</div>}
                  {currentSession === 3 && <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-sky-500 opacity-60 block"></span> Ukuran = Jumlah Tetangga (Degree)</div>}
                  {currentSession === 4 && <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 block"></span> Gateway Utama ({result?.best_central_node?.name})</div>}
                  {currentSession === 4 && <div className="flex items-center gap-2"><span className="w-6 h-1 bg-emerald-500 block"></span> Jalur Dijkstra Terpendek</div>}
                  {currentSession === 5 && <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 block"></span> Multi Gateway Terpilih</div>}
                </div>
              </div>

              {/* PANEL TABEL MUTASI DATA / DETAIL PERHITUNGAN SESI */}
              <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-lg">
                
                {/* ====== VIEW TABEL SESI 1: PARSING DATA MURNI ====== */}
                {currentSession === 1 && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <h4 className="text-white font-bold text-lg flex items-center gap-2"><Database className="text-emerald-400"/> Sesi 1: Ekstraksi Struktur Array Objek</h4>
                      <p className="text-slate-400 text-sm mt-1">String data teks dari baris file CSV dipecah menggunakan pembatas tanda koma (`,`), lalu diekstrak ke dalam array memory `Struct Sensor` di backend.</p>
                    </div>
                    <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 overflow-hidden">
                      <div className="overflow-y-auto h-[360px] custom-scrollbar">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-800 text-slate-300 sticky top-0">
                            <tr><th className="p-3">Index</th><th className="p-3">Nama Node</th><th className="p-3">Tipe Modul</th><th className="p-3">Koordinat (X, Y, Z)</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {parsedData.map((node, i) => (
                              <tr key={i} className="hover:bg-slate-800/20">
                                <td className="p-3 text-slate-500">sensors[{i}]</td>
                                <td className="p-3 text-emerald-400 font-bold">{node.name}</td>
                                <td className="p-3 text-slate-400">{node.type}</td>
                                <td className="p-3 text-sky-400">({node.x}, {node.y}, {node.z})</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== VIEW TABEL SESI 2: TABEL EUCLIDEAN LENGKAP ====== */}
                {currentSession === 2 && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <h4 className="text-white font-bold text-lg flex items-center gap-2"><Network className="text-emerald-400"/> Sesi 2: Matriks Euclidean Jarak Fisik</h4>
                      <p className="text-slate-400 text-sm mt-1">Mengukur jarak absolut antar ruang berpasangan dengan rumus: <code className="bg-slate-950 text-amber-400 px-1 py-0.5 rounded text-xs">d = √[Δx² + Δy² + Δz²]</code>. Ambang batas koneksi maksimal ditetapkan sebesar <b className="text-emerald-400">{result?.config?.max_transmission_range_meter} m</b>.</p>
                    </div>
                    <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 overflow-hidden">
                      <div className="overflow-y-auto h-[360px] custom-scrollbar">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-800 text-slate-300 sticky top-0">
                            <tr><th className="p-3">Pasangan Node</th><th className="p-3">Sub Kalkulasi Jarak</th><th className="p-3">Hasil Euclidean</th><th className="p-3">Status</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {distanceMatrix.map((mat, i) => {
                              const isConnected = mat.dist <= (result?.config?.max_transmission_range_meter || 150);
                              return (
                                <tr key={i} className="hover:bg-slate-800/20">
                                  <td className="p-3 text-slate-300">{mat.source} ↔ {mat.target}</td>
                                  <td className="p-3 text-slate-500">√({mat.dx}²+{mat.dy}²)</td>
                                  <td className="p-3 text-sky-400 font-bold">{mat.dist.toFixed(2)} m</td>
                                  <td className="p-3">
                                    {isConnected 
                                      ? <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-900/40 px-1.5 py-0.5 rounded text-[10px]">Terhubung</span> 
                                      : <span className="bg-red-500/10 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded text-[10px]">Putus</span>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== VIEW TABEL SESI 3: ADJACENCY LIST MAP ====== */}
                {currentSession === 3 && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <h4 className="text-white font-bold text-lg flex items-center gap-2"><ListFilter className="text-emerald-400"/> Sesi 3: Pembuatan Struktur Adjacency List</h4>
                      <p className="text-slate-400 text-sm mt-1">Mengonversi relasi spasial yang lolos sensor menjadi daftar tetangga terdekat terarah untuk mempercepat pembacaan pencarian graph rute.</p>
                    </div>
                    <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 overflow-hidden">
                      <div className="overflow-y-auto h-[360px] custom-scrollbar">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-800 text-slate-300 sticky top-0">
                            <tr><th className="p-3">Node Utama</th><th className="p-3">Relasi Hubungan Tetangga Langsung (Adjacency Edge)</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {Object.keys(adjacencyList).map((nodeName, i) => (
                              <tr key={i} className="hover:bg-slate-800/20">
                                <td className="p-3 text-emerald-400 font-bold">{nodeName}</td>
                                <td className="p-3 text-slate-300 flex flex-wrap gap-1.5">
                                  {adjacencyList[nodeName].length === 0 ? (
                                    <span className="text-slate-600 italic">Terisolasi (0 tetangga)</span>
                                  ) : adjacencyList[nodeName].map((neighbor, idx) => (
                                    <span key={idx} className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[11px] text-sky-300">
                                      {neighbor.name} ({neighbor.dist.toFixed(0)}m)
                                    </span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== VIEW TABEL SESI 4: TABEL DIJKSTRA RELAKSASI ====== */}
                {currentSession === 4 && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <h4 className="text-white font-bold text-lg flex items-center gap-2"><Map className="text-emerald-400"/> Sesi 4: Log Relaksasi Jalur Dijkstra</h4>
                      <p className="text-slate-400 text-sm mt-1">Memperlihatkan perubahan biaya dari kondisi awal tak terhingga (<span className="text-red-400">INF</span>) menjadi nilai optimal terkecil setelah rute relaksasi jalur menuju gateway berhasil dibentuk.</p>
                    </div>
                    <div className="bg-slate-950 rounded-xl border border-slate-800 flex-1 overflow-hidden">
                      <div className="overflow-y-auto h-[360px] custom-scrollbar">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-800 text-slate-300 sticky top-0">
                            <tr><th className="p-3">Sensor Target</th><th className="p-3">Mutasi Relaksasi Bobot</th><th className="p-3">Hop</th><th className="p-3">Jalur Transmisi Akhir</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {result?.routes?.map((route, i) => {
                              const isCentral = route.target_sensor_name === result?.best_central_node?.name;
                              return (
                                <tr key={i} className={`hover:bg-slate-800/20 ${isCentral ? 'bg-emerald-950/20' : ''}`}>
                                  <td className="p-3 text-emerald-400 font-bold">{route.target_sensor_name}</td>
                                  <td className="p-3">
                                    {route.total_distance_meter === -1 ? (
                                      <span className="text-red-400">INF</span>
                                    ) : (
                                      <span className="text-slate-400"><span className="line-through text-slate-600 mr-1">INF</span>→ {Number(route.total_distance_meter).toFixed(1)}m</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-sky-400">{route.hop_count === -1 ? "-" : route.hop_count}</td>
                                  <td className="p-3 text-[10px] text-slate-400 max-w-[180px] truncate" title={route.path?.join(" ➔ ")}>
                                    {route.path?.length > 0 ? route.path.join("➔") : "Terisolasi"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ====== VIEW TABEL SESI 5: KOMBINASI OPTIMAL BRUTE FORCE ====== */}
                {currentSession === 5 && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div>
                      <h4 className="text-white font-bold text-lg flex items-center gap-2"><Cpu className="text-emerald-400"/> Sesi 5: Analisis Kombinasi Brute Force</h4>
                      <p className="text-slate-400 text-sm mt-1">Mengevaluasi performa efisiensi jika kita menaruh lebih dari 1 server secara serentak di lapangan. Klik pilihan tombol sub-tab di bawah untuk memutasi sebaran peta di sebelah kiri.</p>
                    </div>

                    {/* Sub Tab Pemilih Kategori Server Brute Force */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          onClick={() => setBfSubTab(num)}
                          className={`py-2 text-xs font-bold rounded-lg transition-colors ${bfSubTab === num ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          Setup {num} Server
                        </button>
                      ))}
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4 flex-1 font-mono text-xs">
                      {bfSubTab === 1 && (
                        <div className="space-y-2">
                          <p className="text-amber-400 font-bold">// Kombinasi 1 Server Optimal O(N)</p>
                          <p className="text-slate-300">Server Terpilih: <span className="text-white font-bold">{result?.brute_force_optimization?.single_server?.servers[0]}</span></p>
                          <p className="text-slate-300">Rata-rata Jarak: <span className="text-white">{result?.brute_force_optimization?.single_server?.avg_distance_meter?.toFixed(2)} meter</span></p>
                          <p className="text-slate-300">Rata-rata Hop: <span className="text-white">{result?.brute_force_optimization?.single_server?.avg_hop?.toFixed(2)}</span></p>
                        </div>
                      )}
                      {bfSubTab === 2 && (
                        <div className="space-y-2">
                          <p className="text-amber-400 font-bold">// Kombinasi 2 Server Optimal O(N²)</p>
                          <p className="text-slate-300">Daftar Server Terpilih:</p>
                          <div className="flex gap-2 my-1">
                            {result?.brute_force_optimization?.two_servers?.servers?.map((s, idx) => (
                              <span key={idx} className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded">{s}</span>
                            ))}
                          </div>
                          <p className="text-slate-300">Rata-rata Jarak Jaringan: <span className="text-white">{result?.brute_force_optimization?.two_servers?.avg_distance_meter?.toFixed(2)} meter</span></p>
                          <p className="text-slate-300">Rata-rata Lompatan Hop: <span className="text-white">{result?.brute_force_optimization?.two_servers?.avg_hop?.toFixed(2)}</span></p>
                        </div>
                      )}
                      {bfSubTab === 3 && (
                        <div className="space-y-2">
                          <p className="text-amber-400 font-bold">// Kombinasi 3 Server Optimal O(N³)</p>
                          <p className="text-slate-300">Daftar Server Terpilih:</p>
                          <div className="flex gap-2 my-1">
                            {result?.brute_force_optimization?.three_servers?.servers?.map((s, idx) => (
                              <span key={idx} className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded">{s}</span>
                            ))}
                          </div>
                          <p className="text-slate-300">Rata-rata Jarak Jaringan: <span className="text-white">{result?.brute_force_optimization?.three_servers?.avg_distance_meter?.toFixed(2)} meter</span></p>
                          <p className="text-slate-300">Rata-rata Lompatan Hop: <span className="text-white">{result?.brute_force_optimization?.three_servers?.avg_hop?.toFixed(2)}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

        {/* =============================================================== */}
        {/* TAB WORKSPACE: DASHBOARD UTAMA SUMMARY (ASLI)                   */}
        {/* =============================================================== */}
        {result && activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Kartu Informasi Statistik Utama */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Server className="w-16 h-16" /></div>
                <p className="text-sm text-slate-400 font-medium mb-1">Server Utama Terbaik</p>
                <h3 className="text-2xl font-black text-emerald-400">{result.best_central_node.name}</h3>
                <p className="text-xs text-slate-500 mt-2">ID Pusat: {result.best_central_node.id}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg">
                <p className="text-sm text-slate-400 font-medium mb-1">Rata-rata Jarak Jaringan</p>
                <h3 className="text-2xl font-black text-white">{Number(result.best_central_node.average_distance_meter).toFixed(2)} <span className="text-sm text-slate-500 font-normal">m</span></h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg">
                <p className="text-sm text-slate-400 font-medium mb-1">Rata-rata Hop Data</p>
                <h3 className="text-2xl font-black text-white">{Number(result.best_central_node.average_hop).toFixed(2)} Hop</h3>
              </div>
              <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-800/50 p-6 rounded-2xl shadow-lg">
                <p className="text-sm text-emerald-200/70 font-medium mb-1">Batas Transmisi Fisik</p>
                <h3 className="text-2xl font-black text-emerald-400">{result.config.max_transmission_range_meter} m</h3>
              </div>
            </div>

            {/* Komparasi Efisiensi Multi Server BarChart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg">
                <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-400" />Efisiensi Multi-Server (Brute Force Analysis)</h2>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getBruteForceChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#94a3b8'}} />
                      <YAxis yAxisId="left" stroke="#64748b" tick={{fill: '#94a3b8'}} />
                      <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{fill: '#94a3b8'}} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff', borderRadius: '8px' }}/>
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar yAxisId="left" dataKey="Jarak" name="Rata-rata Jarak (m)" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="Hop" name="Rata-rata Hop" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg flex flex-col justify-between">
                <h2 className="text-lg font-bold text-white mb-4">Kombinasi Optimal</h2>
                <div className="space-y-4 flex-1">
                  <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Setup 2 Server</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {result.brute_force_optimization.two_servers.servers.map((s, i) => (<span key={i} className="bg-sky-500/20 text-sky-400 text-xs px-2 py-1 rounded-md border border-sky-500/30">{s}</span>))}
                    </div>
                    <p className="text-sm text-slate-300">Avg Jarak: <span className="font-bold text-white">{result.brute_force_optimization.two_servers.avg_distance_meter.toFixed(1)}m</span></p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Setup 3 Server</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {result.brute_force_optimization.three_servers.servers.map((s, i) => (<span key={i} className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded-md border border-indigo-500/30">{s}</span>))}
                    </div>
                    <p className="text-sm text-slate-300">Avg Jarak: <span className="font-bold text-white">{result.brute_force_optimization.three_servers.avg_distance_meter.toFixed(1)}m</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabel Utama Rute Terpendek */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Tabel Jalur Pusat Pengumpulan Data</h2>
                <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full">Menuju Gateway: {result.best_central_node.name}</span>
              </div>
              <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-950 sticky top-0 z-10 text-slate-400 uppercase text-xs">
                    <tr>
                      <th className="p-4 font-semibold">Target Sensor</th>
                      <th className="p-4 font-semibold">Total Jarak Tempuh</th>
                      <th className="p-4 font-semibold">Hop Count</th>
                      <th className="p-4 font-semibold">Alur Transmisi Hop (Path)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {result.routes?.map((route, idx) => {
                      const isCentral = route.target_sensor_name === result.best_central_node.name;
                      const isIsolated = route.total_distance_meter === -1;
                      return (
                        <tr key={idx} className={`hover:bg-slate-800/20 ${isCentral ? 'bg-emerald-950/10' : ''}`}>
                          <td className="p-4 font-medium text-emerald-400">{route.target_sensor_name} {isCentral && <span className="ml-2 bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded border border-emerald-500/30">Pusat ⭐</span>}</td>
                          <td className="p-4 text-slate-300">{isIsolated ? <span className="text-red-400 text-xs bg-red-950/30 border border-red-900/50 px-2 py-1 rounded">Terisolasi</span> : <span className="font-mono">{Number(route.total_distance_meter).toFixed(2)} m</span>}</td>
                          <td className="p-4 text-slate-300">{isIsolated ? "-" : <span className="bg-slate-800 px-2 py-1 rounded font-mono text-xs">{route.hop_count}</span>}</td>
                          <td className="p-4 text-xs font-mono text-slate-400">
                            {!isIsolated && route.path?.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {route.path.map((node, i) => (
                                  <span key={i} className="flex items-center">
                                    <span className={node.replace(/"/g, "") === result.best_central_node.name ? 'text-emerald-400 font-bold' : 'text-slate-300'}>{node.replace(/"/g, "")}</span>
                                    {i < route.path.length - 1 && <span className="text-slate-600 mx-1">➔</span>}
                                  </span>
                                ))}
                              </div>
                            ) : <span className="text-slate-600 italic">Jalur tidak tersedia</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// Komponen ikon mini pembantu tambahan
function SlidersIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="2" y1="14" x2="6" y2="14" /><line x1="10" y1="8" x2="14" y2="8" /><line x1="18" y1="16" x2="22" y2="16" /></svg>
  );
}