import { useState, useEffect, useRef } from "react";
const GROUP_COLORS = ["#3b82f6","#8b5cf6","#f97316","#ec4899","#22c55e","#06b6d4","#f59e0b","#ef4444","#64748b"];
const CHANNEL_COLORS = {
  "@MBCNEWS11":"#3b82f6","@Jtvnews2021":"#8b5cf6","@g1tvnews":"#f97316",
  "@KTV이매진":"#ec4899","@NATV_korea":"#ef4444","@이재명tv":"#22c55e",
  "@dailyminjoo":"#06b6d4","@KTV_korea":"#f59e0b",
};
const INIT_CHANNELS = [
  { id:1, handle:"@MBCNEWS11", checked:true, group:"정치" },
  { id:2, handle:"@Jtvnews2021", checked:true, group:"정치" },
  { id:3, handle:"@g1tvnews", checked:true, group:"정치" },
  { id:4, handle:"@KTV이매진", checked:true, group:"정치" },
  { id:5, handle:"@NATV_korea", checked:true, group:"정치" },
  { id:6, handle:"@KTV_korea", checked:true, group:"정치" },
  { id:7, handle:"@이재명tv", checked:true, group:"정치" },
  { id:8, handle:"@dailyminjoo", checked:true, group:"정치" },
];
const parseISO8601 = (d) => {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "0:00";
  const [h,mn,s] = [+(m[1]||0), +(m[2]||0), +(m[3]||0)];
  return h>0 ? `${h}:${String(mn).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${mn}:${String(s).padStart(2,"0")}`;
};
const parseSecs = (d) => {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1]||0))*3600 + (+(m[2]||0))*60 + (+(m[3]||0)) : 0;
};
const fmtViews = (n) => {
  n = parseInt(n)||0;
  if (n>=100000000) return `${(n/100000000).toFixed(1)}억`;
  if (n>=10000) return `${(n/10000).toFixed(1)}만`;
  if (n>=1000) return `${(n/1000).toFixed(1)}천`;
  return n.toLocaleString();
};
const fmtDate = (s) => {
  const diff = Date.now() - new Date(s).getTime();
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000), d=Math.floor(diff/86400000);
  if (m<1) return "방금 전"; if (m<60) return `${m}분 전`; if (h<24) return `${h}시간 전`;
  if (d<2) return "1일 전"; if (d<30) return `${d}일 전`;
  if (d<365) return `${Math.floor(d/30)}개월 전`; return `${Math.floor(d/365)}년 전`;
};
const SCAN_INTERVAL_MS = {"1분":60000,"5분":300000,"10분":600000,"30분":1800000,"1시간":3600000,"3시간":10800000,"6시간":21600000};
const ytGet = async (url) => {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(`[${d.error.code}] ${d.error.message}`);
  return d;
};
const getChannelId = (handle, key) =>
  ytGet(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`)
    .then(d => d.items?.[0]?.id || null);
const searchVideos = (channelId, key, keywords) => {
  const p = new URLSearchParams({ part:"snippet", channelId, type:"video", order:"date", maxResults:"50", key });
  if (keywords) p.set("q", keywords);
  return ytGet(`https://www.googleapis.com/youtube/v3/search?${p}`).then(d => d.items||[]);
};
const getVideoDetails = (ids, key) =>
  ytGet(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${key}`)
    .then(d => d.items||[]);
export default function App() {
  const [channels, setChannels] = useState(INIT_CHANNELS);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [videoType, setVideoType] = useState("롱폼");
  const [minViews, setMinViews] = useState("10000");
  const [tracking, setTracking] = useState(true);
  const [timeRange, setTimeRange] = useState("1시간");
  const [keywords, setKeywords] = useState("");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(0);
  const [videos, setVideos] = useState([]);
  const [logs, setLogs] = useState([]);
  const [sort, setSort] = useState("최신순");
  const [newCh, setNewCh] = useState("");
  const [newChGroup, setNewChGroup] = useState("뉴스");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("yt_api_key")||"");
  const [showApiKey, setShowApiKey] = useState(false);
  const logRef = useRef(null);
  const cancelRef = useRef(false);
  const logsRef = useRef([]);
  const fileInputRef = useRef(null);
  const startScanRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);
  useEffect(() => {
    const fn = e => { if (e.key==="Escape") setSelectedVideo(null); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => { startScanRef.current = startScan; });
  useEffect(() => {
    if (!tracking) return;
    const ms = SCAN_INTERVAL_MS[timeRange] || 3600000;
    const timer = setInterval(() => {
      if (startScanRef.current) startScanRef.current();
    }, ms);
    return () => clearInterval(timer);
  }, [tracking, timeRange]);
  const groups = [...new Set(channels.map(c => c.group||"기본"))];
  const groupColor = (g) => GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length];
  const ts = () => {
    const n = new Date();
    return `[${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}]`;
  };
  const log = (msg) => { logsRef.current=[...logsRef.current,msg]; setLogs([...logsRef.current]); };
  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
      let currentGroup = "기본";
      const existingHandles = new Set(channels.map(c=>c.handle));
      const toAdd = [];
      lines.forEach(line => {
        if (line.startsWith('[') && line.endsWith(']')) {
          currentGroup = line.slice(1,-1).trim() || "기본";
        } else {
          const raw = line.split(/\s/)[0];
          const handle = raw.startsWith('@') ? raw : '@'+raw;
          if (handle.length > 1 && !existingHandles.has(handle)) {
            toAdd.push({ id:Date.now()+Math.random(), handle, checked:true, group:currentGroup });
            existingHandles.add(handle);
          }
        }
      });
      if (toAdd.length) setChannels(prev => [...prev, ...toAdd]);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };
  const addChannel = () => {
    if (!newCh.trim()) return;
    const handle = newCh.trim().startsWith('@') ? newCh.trim() : '@'+newCh.trim();
    const group = newChGroup.trim() || groups[0] || "기본";
    setChannels(prev => [...prev, { id:Date.now(), handle, checked:true, group }]);
    setNewCh("");
    setShowAdd(false);
  };
  const toggleGroupCheck = (group) => {
    const groupChs = channels.filter(c=>(c.group||"기본")===group);
    const allChecked = groupChs.every(c=>c.checked);
    setChannels(channels.map(c=>(c.group||"기본")===group ? {...c,checked:!allChecked} : c));
  };
  const deleteGroup = (group) => {
    setChannels(prev => prev.filter(c=>(c.group||"기본")!==group));
  };
  const startScan = async () => {
    if (scanning) return;
    if (!apiKey.trim()) { log(`${ts()} ❌ API 키를 먼저 입력해주세요`); return; }
    cancelRef.current = false;
    logsRef.current = [];
    setScanning(true); setLogs([]); setResults(0); setVideos([]);
    const chs = channels.filter(c=>c.checked);
    const allVideos = [];
    const minV = parseInt(minViews||0);
    try {
      for (const ch of chs) {
        if (cancelRef.current) break;
        log(`${ts()} 🔍 ${ch.handle} 스크래핑 중...`);
        let cid;
        try { cid = await getChannelId(ch.handle, apiKey); }
        catch(e) { log(`${ts()} ❌ ${ch.handle} – ${e.message}`); continue; }
        if (!cid) { log(`${ts()} ⚠️ ${ch.handle} – 채널을 찾을 수 없음`); continue; }
        if (cancelRef.current) break;
        let items;
        try { items = await searchVideos(cid, apiKey, keywords); }
        catch(e) { log(`${ts()} ❌ ${ch.handle} – ${e.message}`); continue; }
        if (!items.length) { log(`${ts()} ℹ️ ${ch.handle} – 영상 없음`); continue; }
        if (cancelRef.current) break;
        const ids = items.map(v=>v.id?.videoId).filter(Boolean);
        let details;
        try { details = await getVideoDetails(ids, apiKey); }
        catch(e) { log(`${ts()} ❌ ${ch.handle} – ${e.message}`); continue; }
        const color = CHANNEL_COLORS[ch.handle] || groupColor(ch.group||"기본");
        const parsed = details.map(v => {
          const secs = parseSecs(v.contentDetails?.duration||"PT0S");
          const isShort = secs>0 && secs<=60;
          if (videoType==="롱폼" && isShort) return null;
          if (videoType==="쇼츠" && !isShort) return null;
          const vc = parseInt(v.statistics?.viewCount||0);
          if (minV && vc<minV) return null;
          return {
            id: v.id, youtubeId: v.id, channel: ch.handle,
            title: v.snippet.title,
            thumbnail: v.snippet.thumbnails?.medium?.url || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`,
            date: fmtDate(v.snippet.publishedAt),
            publishedAt: v.snippet.publishedAt,
            duration: parseISO8601(v.contentDetails?.duration||"PT0S"),
            views: fmtViews(v.statistics?.viewCount||0),
            rawViews: parseInt(v.statistics?.viewCount||0),
            color,
          };
        }).filter(Boolean);
        log(`${ts()} ✅ ${ch.handle} – ${parsed.length}개 영상 발견`);
        allVideos.push(...parsed);
        setVideos([...allVideos]);
        setResults(allVideos.length);
      }
      log(cancelRef.current
        ? `${ts()} ⛔ 스캔 중지됨`
        : `${ts()} 🏁 전체 스캔 완료 – 총 ${allVideos.length}개 영상`);
    } catch(e) {
      log(`${ts()} ❌ 오류: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };
  const stopScan = () => { cancelRef.current = true; };
  const sortedVideos = [...videos].sort((a,b) => {
    if (sort==="최신순") return new Date(b.publishedAt)-new Date(a.publishedAt);
    if (sort==="조회수순") return b.rawViews-a.rawViews;
    if (sort==="채널순") return a.channel.localeCompare(b.channel);
    return 0;
  });
  const I = { background:"#0f0f1a", border:"1px solid #2d2d4a", borderRadius:"8px", padding:"8px 12px", color:"#e2e8f0", fontSize:"13px", outline:"none" };
  return (
    <div style={{ fontFamily:"'Malgun Gothic','Apple SD Gothic Neo',sans-serif", background:"#1a1a2e", minHeight:"100vh", color:"#e2e8f0" }}>
      <style>{`*{box-sizing:border-box} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:#0f0f1a} ::-webkit-scrollbar-thumb{background:#2d2d4a;border-radius:3px} select option{background:#1a1a2e} @keyframes spin{to{transform:rotate(360deg)}} .thumb-wrap:hover .play-overlay{opacity:1!important} .video-row:hover{background:#161628!important} .ch-del{opacity:0} .ch-item:hover .ch-del{opacity:1}`}</style>
      <div style={{ background:"#0d0d1f", borderBottom:"1px solid #252540", padding:"6px 16px", display:"flex", gap:"18px", fontSize:"12px", color:"#666" }}>
        {["File","Edit","View","Window","Help"].map(m=><span key={m}>{m}</span>)}
      </div>
      <div style={{ background:"#0d0d1f", borderBottom:"1px solid #252540", padding:"11px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
          <span style={{ fontSize:"20px" }}>📺</span>
          <span style={{ fontSize:"17px", fontWeight:"700", color:"#f0f4f8" }}>YouTube Channel Scanner</span>
          <span style={{ fontSize:"11px", color:"#4a5568" }}>v2.0.0</span>
        </div>
        <span style={{ fontSize:"11px", color:"#4a5568" }}>macOS · Windows</span>
      </div>
      <div style={{ padding:"16px 20px", maxWidth:"980px", margin:"0 auto" }}>
        {/* API Key */}
        <div style={{ background:"#16213e", border:`1px solid ${apiKey?"#22c55e44":"#ef444455"}`, borderRadius:"10px", padding:"14px 16px", marginBottom:"12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize:"13px", color:"#94a3b8", width:"108px", flexShrink:0 }}>🔑 YouTube API 키</span>
            <div style={{ flex:1, position:"relative" }}>
              <input type={showApiKey?"text":"password"} value={apiKey}
                onChange={e=>{setApiKey(e.target.value);localStorage.setItem("yt_api_key",e.target.value);}}
                placeholder="Google Cloud Console에서 발급받은 API 키"
                style={{ ...I, width:"100%", borderColor:apiKey?"#22c55e55":"#ef444455", paddingRight:"36px" }} />
              <button onClick={()=>setShowApiKey(!showApiKey)} style={{ position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:"14px", padding:0 }}>
                {showApiKey?"🙈":"👁"}
              </button>
            </div>
            <span style={{ fontSize:"12px", color:apiKey?"#22c55e":"#ef4444", flexShrink:0, whiteSpace:"nowrap" }}>{apiKey?"✓ 저장됨":"⚠ 필수"}</span>
          </div>
          {!apiKey&&(
            <div style={{ marginTop:"8px", fontSize:"11px", color:"#f59e0b", paddingLeft:"118px" }}>
              💡 <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>Google Cloud Console</a> → YouTube Data API v3 활성화 → 사용자 인증 정보 → API 키 생성
            </div>
          )}
        </div>
        {/* Channels with Groups */}
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"16px", marginBottom:"12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
            <span style={{ fontWeight:"600" }}>📋 채널 ({channels.length}개) · {groups.length}개 그룹</span>
            <div style={{ display:"flex", gap:"8px" }}>
              <input ref={fileInputRef} type="file" accept=".txt" style={{ display:"none" }} onChange={handleFileImport} />
              <button onClick={()=>fileInputRef.current?.click()} style={{ background:"#d97706", border:"none", borderRadius:"7px", padding:"7px 13px", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:"600" }}>📁 파일로 가져오기</button>
              <button onClick={()=>setChannels(INIT_CHANNELS)} style={{ background:"#3b82f6", border:"none", borderRadius:"7px", padding:"7px 13px", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:"600" }}>🔄 초기화</button>
              <button onClick={()=>{const a=channels.every(c=>c.checked);setChannels(channels.map(c=>({...c,checked:!a})));}} style={{ background:"#22c55e", border:"none", borderRadius:"7px", padding:"7px 13px", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:"700" }}>✓ 전체</button>
            </div>
          </div>
          <div style={{ fontSize:"11px", color:"#475569", marginBottom:"10px", padding:"8px 10px", background:"#0f0f1a", borderRadius:"6px", border:"1px solid #1e2d40" }}>
            📄 .txt 파일 형식: <span style={{ color:"#60a5fa" }}>[그룹명]</span> 으로 그룹 구분, 한 줄에 @채널명 하나씩 입력 &nbsp;|&nbsp; 예: <code style={{ color:"#94a3b8" }}>[뉴스]</code> → <code style={{ color:"#94a3b8" }}>@MBCNEWS11</code>
          </div>
          {showAdd&&(
            <div style={{ display:"flex", gap:"8px", marginBottom:"12px", padding:"12px", background:"#0f0f1a", borderRadius:"8px", border:"1px solid #2d2d4a" }}>
              <input value={newCh} onChange={e=>setNewCh(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addChannel()}
                placeholder="@채널명" style={{ ...I, flex:1 }} autoFocus />
              <input value={newChGroup} onChange={e=>setNewChGroup(e.target.value)} list="group-datalist"
                placeholder="그룹명" style={{ ...I, width:"120px" }} />
              <datalist id="group-datalist">{groups.map(g=><option key={g} value={g}/>)}</datalist>
              <button onClick={addChannel} style={{ background:"#22c55e", border:"none", borderRadius:"7px", padding:"8px 16px", color:"#fff", cursor:"pointer", fontWeight:"700" }}>추가</button>
              <button onClick={()=>setShowAdd(false)} style={{ background:"#374151", border:"none", borderRadius:"7px", padding:"8px 12px", color:"#94a3b8", cursor:"pointer" }}>취소</button>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {groups.map((group) => {
              const groupChs = channels.filter(c=>(c.group||"기본")===group);
              const allChecked = groupChs.every(c=>c.checked);
              const someChecked = groupChs.some(c=>c.checked);
              const collapsed = collapsedGroups[group];
              const gc = groupColor(group);
              return (
                <div key={group} style={{ border:`1px solid ${gc}33`, borderRadius:"9px", overflow:"hidden" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"9px 12px", background:gc+"14", cursor:"pointer" }}
                    onClick={()=>setCollapsedGroups(prev=>({...prev,[group]:!prev[group]}))}>
                    <span style={{ fontSize:"11px", color:"#64748b", width:"10px", textAlign:"center" }}>{collapsed?"▶":"▼"}</span>
                    <div onClick={e=>{e.stopPropagation();toggleGroupCheck(group);}}
                      style={{ width:"16px", height:"16px", borderRadius:"3px", background:allChecked?gc:someChecked?gc+"77":"transparent", border:`2px solid ${allChecked||someChecked?gc:"#555"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:"9px", color:"#fff", cursor:"pointer" }}>
                      {allChecked?"✓":someChecked?"–":""}
                    </div>
                    <span style={{ fontSize:"13px", fontWeight:"700", color:gc }}>{group}</span>
                    <span style={{ fontSize:"11px", color:"#64748b" }}>{groupChs.filter(c=>c.checked).length}/{groupChs.length}개 선택</span>
                    <div style={{ flex:1 }} />
                    <button onClick={e=>{e.stopPropagation();deleteGroup(group);}}
                      style={{ background:"transparent", border:"1px solid #374151", borderRadius:"5px", padding:"2px 8px", color:"#ef4444", fontSize:"11px", cursor:"pointer" }}>그룹 삭제</button>
                  </div>
                  {!collapsed&&(
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"6px", padding:"10px" }}>
                      {groupChs.map(ch=>(
                        <div key={ch.id} className="ch-item" onClick={()=>setChannels(channels.map(c=>c.id===ch.id?{...c,checked:!c.checked}:c))}
                          style={{ background:ch.checked?gc+"22":"#1e1e3a", border:`1px solid ${ch.checked?gc:"#3d3d5c"}`, borderRadius:"7px", padding:"8px 10px", display:"flex", alignItems:"center", gap:"7px", cursor:"pointer", position:"relative" }}>
                          <div style={{ width:"15px", height:"15px", borderRadius:"3px", background:ch.checked?gc:"transparent", border:`2px solid ${ch.checked?gc:"#555"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:"9px", color:"#fff" }}>{ch.checked?"✓":""}</div>
                          <span style={{ fontSize:"12px", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ch.handle}</span>
                          <button className="ch-del" onClick={e=>{e.stopPropagation();setChannels(channels.filter(c=>c.id!==ch.id));}}
                            style={{ background:"transparent", border:"none", color:"#ef4444", cursor:"pointer", fontSize:"15px", padding:0, lineHeight:1 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
            <button onClick={()=>{setShowAdd(v=>!v);setNewChGroup(groups[0]||"기본");}}
              style={{ background:"#1e293b", border:"1px solid #374151", borderRadius:"7px", padding:"7px 14px", color:"#94a3b8", fontSize:"12px", cursor:"pointer" }}>+ 채널 추가</button>
            <button onClick={()=>{setShowAdd(true);setNewChGroup("");setTimeout(()=>document.querySelector('[list="group-datalist"]')?.focus(),50);}}
              style={{ background:"#1e293b", border:"1px solid #374151", borderRadius:"7px", padding:"7px 14px", color:"#94a3b8", fontSize:"12px", cursor:"pointer" }}>+ 새 그룹 만들기</button>
          </div>
        </div>
        {/* Options */}
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"16px", marginBottom:"12px" }}>
          {[
            {l:"🎬 영상 타입",c:(<div style={{ display:"flex", background:"#0f0f1a", borderRadius:"8px", overflow:"hidden", border:"1px solid #2d2d4a" }}>{["롱폼","쇼츠"].map(t=><button key={t} onClick={()=>setVideoType(t)} style={{ padding:"8px 26px", border:"none", background:videoType===t?"#22c55e":"transparent", color:videoType===t?"#fff":"#94a3b8", fontSize:"13px", cursor:"pointer", fontWeight:videoType===t?"700":"400" }}>{t}</button>)}</div>)},
            {l:"👁 최소 조회수",c:(<div style={{ display:"flex", alignItems:"center", gap:"10px" }}><input value={minViews} onChange={e=>setMinViews(e.target.value.replace(/\D/g,""))} style={{ ...I, width:"160px" }} placeholder="숫자만 입력" /><span style={{ fontSize:"12px", color:"#475569" }}>숫자만 입력</span></div>)},
            {l:"🔍 추적 기능",c:(<button onClick={()=>setTracking(!tracking)} style={{ background:tracking?"#22c55e":"#374151", border:"none", borderRadius:"8px", padding:"8px 20px", color:"#fff", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>{tracking?"✓ 활성화":"비활성화"}</button>)},
            {l:"⏰ 재스캔 간격",c:(<div style={{ display:"flex", alignItems:"center", gap:"10px" }}><div style={{ position:"relative" }}><select value={timeRange} onChange={e=>setTimeRange(e.target.value)} style={{ ...I, paddingRight:"28px", appearance:"none", cursor:"pointer" }}>{["1분","5분","10분","30분","1시간","3시간","6시간"].map(t=><option key={t}>{t}</option>)}</select><span style={{ position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"#94a3b8", fontSize:"10px" }}>▾</span></div><span style={{ fontSize:"11px", color: tracking?"#22c55e":"#475569" }}>{tracking?`✓ 추적 활성 – ${timeRange}마다 자동 재스캔`:"추적 비활성 시 적용 안 됨"}</span></div>)},
            {l:"🔎 검색 키워드",c:(<div style={{ display:"flex", alignItems:"center", gap:"10px" }}><input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="제목 키워드 (선택)" style={{ ...I, width:"340px" }} /><span style={{ fontSize:"11px", color:"#475569" }}>쉼표로 구분 (예: 속보,뉴스)</span></div>)},
          ].map(({l,c})=>(
            <div key={l} style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"13px" }}>
              <span style={{ fontSize:"13px", color:"#94a3b8", width:"108px", flexShrink:0 }}>{l}</span>{c}
            </div>
          ))}
        </div>
        {/* Scan bar */}
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"13px 16px", marginBottom:"12px", display:"flex", alignItems:"center", gap:"10px" }}>
          <button onClick={startScan} disabled={scanning} style={{ background:scanning?"#166534":"#22c55e", border:"none", borderRadius:"8px", padding:"10px 24px", color:"#fff", fontSize:"14px", cursor:scanning?"not-allowed":"pointer", fontWeight:"700", display:"flex", alignItems:"center", gap:"7px", opacity:scanning?0.8:1 }}>
            {scanning?<><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>🔄</span>스캔 중...</>:"🔍 스캔 시작"}
          </button>
          <button onClick={stopScan} disabled={!scanning} style={{ background:"#2d2d4a", border:"none", borderRadius:"8px", padding:"10px 20px", color:scanning?"#e2e8f0":"#555", fontSize:"14px", cursor:scanning?"pointer":"not-allowed", fontWeight:"700" }}>⛔ 중지</button>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:"14px", color:"#22c55e", fontWeight:"700" }}>결과: {results.toLocaleString()}개</span>
          <button onClick={()=>{setResults(0);setVideos([]);setLogs([]);logsRef.current=[];}} style={{ background:"#2d2d4a", border:"none", borderRadius:"7px", padding:"8px 13px", color:"#94a3b8", fontSize:"12px", cursor:"pointer" }}>🗑 초기화</button>
        </div>
        {/* Video list */}
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"16px", marginBottom:"12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
            <span style={{ fontWeight:"600" }}>📋 영상 목록</span>
            <div style={{ position:"relative" }}>
              <select value={sort} onChange={e=>setSort(e.target.value)} style={{ ...I, fontSize:"12px", paddingRight:"26px", appearance:"none", cursor:"pointer" }}>
                <option>최신순</option><option>조회수순</option><option>채널순</option>
              </select>
              <span style={{ position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"#94a3b8", fontSize:"10px" }}>▾</span>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
            {sortedVideos.length===0?(
              <div style={{ textAlign:"center", padding:"40px", color:"#475569" }}>
                {apiKey?"스캔을 시작하면 영상이 표시됩니다.":"⚠ 상단에 YouTube API 키를 입력해주세요."}
              </div>
            ):sortedVideos.map(v=>(
              <div key={v.id} className="video-row" onClick={()=>setSelectedVideo(v)} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"10px 12px", borderRadius:"8px", background:"#0f0f1a", border:"1px solid #1e1e3a", cursor:"pointer", transition:"background 0.15s" }}>
                <div className="thumb-wrap" style={{ width:"96px", height:"54px", borderRadius:"6px", flexShrink:0, position:"relative", overflow:"hidden", background:v.color+"22" }}>
                  <img src={v.thumbnail} alt={v.title} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} onError={e=>{e.target.style.display="none";}} />
                  <div className="play-overlay" style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity 0.15s" }}>
                    <div style={{ width:"28px", height:"28px", borderRadius:"50%", background:"rgba(255,255,255,0.9)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", paddingLeft:"2px", color:"#000" }}>▶</div>
                  </div>
                </div>
                <div style={{ background:v.color+"22", border:`1px solid ${v.color}44`, borderRadius:"6px", padding:"4px 9px", fontSize:"11px", color:v.color, fontWeight:"700", flexShrink:0, minWidth:"106px", textAlign:"center" }}>{v.channel}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"13px", fontWeight:"500", marginBottom:"4px", lineHeight:"1.4" }}>{v.title}</div>
                  <div style={{ display:"flex", gap:"10px", fontSize:"11px", color:"#64748b" }}><span>📅 {v.date}</span><span>⏱ {v.duration}</span></div>
                </div>
                <span style={{ fontSize:"14px", fontWeight:"700", color:"#22c55e", flexShrink:0 }}>{v.views}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Logs */}
        <div style={{ background:"#0a0a18", border:"1px solid #252545", borderRadius:"10px", padding:"12px 16px" }}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:"8px" }}>
            <span style={{ fontWeight:"600" }}>📄 로그</span>
            <button onClick={()=>{setLogs([]);logsRef.current=[];}} style={{ marginLeft:"auto", background:"transparent", border:"1px solid #2d2d4a", borderRadius:"6px", padding:"3px 10px", color:"#64748b", fontSize:"11px", cursor:"pointer" }}>지우기</button>
          </div>
          <div ref={logRef} style={{ height:"115px", overflowY:"auto", fontFamily:"Consolas,'Courier New',monospace", fontSize:"12px", lineHeight:"1.9" }}>
            {logs.map((l,i)=>(<div key={i} style={{ color:l.includes("✅")?"#22c55e":l.includes("⛔")||l.includes("❌")?"#ef4444":l.includes("🏁")?"#f59e0b":l.includes("⚠")?"#f59e0b":"#94a3b8" }}>{l}</div>))}
            {logs.length===0&&<span style={{ color:"#475569" }}>로그가 여기에 표시됩니다...</span>}
          </div>
        </div>
      </div>
      {/* Video modal */}
      {selectedVideo&&(
        <div onClick={()=>setSelectedVideo(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#0f0f1a", borderRadius:"12px", padding:"20px", maxWidth:"820px", width:"100%", border:"1px solid #252545", position:"relative", boxShadow:"0 24px 64px rgba(0,0,0,0.9)" }}>
            <button onClick={()=>setSelectedVideo(null)} style={{ position:"absolute", top:"12px", right:"12px", width:"32px", height:"32px", borderRadius:"50%", background:"#374151", border:"none", color:"#e2e8f0", fontSize:"16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            <div style={{ marginBottom:"14px", paddingRight:"40px" }}>
              <div style={{ display:"inline-block", background:selectedVideo.color+"22", border:`1px solid ${selectedVideo.color}44`, borderRadius:"6px", padding:"3px 10px", fontSize:"11px", color:selectedVideo.color, fontWeight:"700", marginBottom:"8px" }}>{selectedVideo.channel}</div>
              <div style={{ fontSize:"15px", fontWeight:"600", lineHeight:"1.5", color:"#f0f4f8" }}>{selectedVideo.title}</div>
              <div style={{ display:"flex", gap:"12px", marginTop:"6px", fontSize:"12px", color:"#64748b" }}>
                <span>📅 {selectedVideo.date}</span><span>⏱ {selectedVideo.duration}</span><span>👁 {selectedVideo.views} 조회</span>
              </div>
            </div>
            <div style={{ position:"relative", width:"100%", paddingBottom:"56.25%", height:0, borderRadius:"8px", overflow:"hidden" }}>
              <iframe key={selectedVideo.youtubeId} src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&rel=0&modestbranding=1`} title={selectedVideo.title} allowFullScreen allow="autoplay; encrypted-media; fullscreen" style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none", borderRadius:"8px" }} />
            </div>
            <div style={{ marginTop:"10px", fontSize:"11px", color:"#475569", textAlign:"center" }}>ESC 또는 바깥 클릭으로 닫기</div>
          </div>
        </div>
      )}
    </div>
  );
}
