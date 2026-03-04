import { useState, useEffect, useRef } from "react";
const CHANNEL_COLORS = {
  "@MBCNEWS11":"#3b82f6","@Jtvnews2021":"#8b5cf6","@g1tvnews":"#f97316",
  "@KTV이매진":"#ec4899","@NATV_korea":"#ef4444","@이재명tv":"#22c55e",
  "@dailyminjoo":"#06b6d4","@KTV_korea":"#f59e0b",
};
const INIT_CHANNELS = [
  { id:1, handle:"@MBCNEWS11", checked:true },
  { id:2, handle:"@Jtvnews2021", checked:true },
  { id:3, handle:"@g1tvnews", checked:true },
  { id:4, handle:"@KTV이매진", checked:true },
  { id:5, handle:"@NATV_korea", checked:true },
  { id:6, handle:"@이재명tv", checked:true },
  { id:7, handle:"@dailyminjoo", checked:true },
  { id:8, handle:"@KTV_korea", checked:true },
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
const publishedAfterISO = (tr) => {
  const map={"5분":5,"10분":10,"30분":30,"1시간":60,"3시간":180,"6시간":360,"12시간":720,"24시간":1440};
  return new Date(Date.now()-(map[tr]||60)*60000).toISOString();
};
const ytGet = async (url) => {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(`[${d.error.code}] ${d.error.message}`);
  return d;
};
const getChannelId = (handle, key) =>
  ytGet(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`)
    .then(d => d.items?.[0]?.id || null);
const searchVideos = (channelId, key, publishedAfter, keywords) => {
  const p = new URLSearchParams({
    part:"snippet", channelId, type:"video", order:"date", maxResults:"50", key, publishedAfter,
  });
  if (keywords) p.set("q", keywords);
  return ytGet(`https://www.googleapis.com/youtube/v3/search?${p}`).then(d => d.items||[]);
};
const getVideoDetails = (ids, key) =>
  ytGet(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${key}`)
    .then(d => d.items||[]);
export default function App() {
  const [channels, setChannels] = useState(INIT_CHANNELS);
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
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("yt_api_key")||"");
  const [showApiKey, setShowApiKey] = useState(false);
  const logRef = useRef(null);
  const cancelRef = useRef(false);
  const logsRef = useRef([]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);
  useEffect(() => {
    const fn = e => { if (e.key==="Escape") setSelectedVideo(null); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  const ts = () => {
    const n = new Date();
    return `[${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}]`;
  };
  const log = (msg) => { logsRef.current=[...logsRef.current,msg]; setLogs([...logsRef.current]); };
  const startScan = async () => {
    if (scanning) return;
    if (!apiKey.trim()) { log(`${ts()} ❌ API 키를 먼저 입력해주세요`); return; }
    cancelRef.current = false;
    logsRef.current = [];
    setScanning(true); setLogs([]); setResults(0); setVideos([]);
    const chs = channels.filter(c=>c.checked);
    const allVideos = [];
    const pa = publishedAfterISO(timeRange);
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
        try { items = await searchVideos(cid, apiKey, pa, keywords); }
        catch(e) { log(`${ts()} ❌ ${ch.handle} – ${e.message}`); continue; }
        if (!items.length) { log(`${ts()} ℹ️ ${ch.handle} – 해당 기간 영상 없음`); continue; }
        if (cancelRef.current) break;
        const ids = items.map(v=>v.id?.videoId).filter(Boolean);
        let details;
        try { details = await getVideoDetails(ids, apiKey); }
        catch(e) { log(`${ts()} ❌ ${ch.handle} – ${e.message}`); continue; }
        const color = CHANNEL_COLORS[ch.handle]||"#94a3b8";
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
      if (!cancelRef.current) log(`${ts()} ✅ 스캔 완료 – 총 ${allVideos.length}개 영상 발견`);
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
      <style>{`*{box-sizing:border-box} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:#0f0f1a} ::-webkit-scrollbar-thumb{background:#2d2d4a;border-radius:3px} select option{background:#1a1a2e} @keyframes spin{to{transform:rotate(360deg)}} .thumb-wrap:hover .play-overlay{opacity:1!important} .video-row:hover{background:#161628!important}`}</style>
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
        <div style={{ background:"#16213e", border:`1px solid ${apiKey?"#22c55e44":"#ef444455"}`, borderRadius:"10px", padding:"14px 16px", marginBottom:"12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize:"13px", color:"#94a3b8", width:"108px", flexShrink:0 }}>🔑 YouTube API 키</span>
            <div style={{ flex:1, position:"relative" }}>
              <input
                type={showApiKey?"text":"password"}
                value={apiKey}
                onChange={e=>{setApiKey(e.target.value);localStorage.setItem("yt_api_key",e.target.value);}}
                placeholder="Google Cloud Console에서 발급받은 API 키"
                style={{ ...I, width:"100%", borderColor:apiKey?"#22c55e55":"#ef444455", paddingRight:"36px" }}
              />
              <button onClick={()=>setShowApiKey(!showApiKey)} style={{ position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"#64748b", cursor:"pointer", fontSize:"14px", padding:0 }}>
                {showApiKey?"🙈":"👁"}
              </button>
            </div>
            <span style={{ fontSize:"12px", color:apiKey?"#22c55e":"#ef4444", flexShrink:0, whiteSpace:"nowrap" }}>{apiKey?"✓ 저장됨":"⚠ 필수"}</span>
          </div>
          {!apiKey&&(
            <div style={{ marginTop:"8px", fontSize:"11px", color:"#f59e0b", paddingLeft:"118px" }}>
              💡 <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>Google Cloud Console</a> → YouTube Data API v3 활성화 → 사용자 인증 정보 → API 키 생성 (무료 10,000 유닛/일 ≈ 약 12회 전체 스캔)
            </div>
          )}
        </div>
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"16px", marginBottom:"12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
            <span style={{ fontWeight:"600" }}>📋 채널 ({channels.length}개)</span>
            <div style={{ display:"flex", gap:"8px" }}>
              <button onClick={()=>setShowAdd(!showAdd)} style={{ background:"#d97706", border:"none", borderRadius:"7px", padding:"7px 13px", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:"600" }}>📁 채널 불러오기</button>
              <button onClick={()=>setChannels(INIT_CHANNELS)} style={{ background:"#3b82f6", border:"none", borderRadius:"7px", padding:"7px 13px", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:"600" }}>🔄 초기화</button>
              <button onClick={()=>{const a=channels.every(c=>c.checked);setChannels(channels.map(c=>({...c,checked:!a})));}} style={{ background:"#22c55e", border:"none", borderRadius:"7px", padding:"7px 13px", color:"#fff", fontSize:"12px", cursor:"pointer", fontWeight:"700" }}>✓ 전체</button>
            </div>
          </div>
          {showAdd&&(
            <div style={{ display:"flex", gap:"8px", marginBottom:"10px" }}>
              <input value={newCh} onChange={e=>setNewCh(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&(()=>{if(!newCh.trim())return;const h=newCh.startsWith("@")?newCh:"@"+newCh;setChannels([...channels,{id:Date.now(),handle:h,checked:true}]);setNewCh("");setShowAdd(false);})()}
                placeholder="@채널명 입력" style={{ ...I, flex:1, borderColor:"#22c55e" }} />
              <button onClick={()=>{if(!newCh.trim())return;const h=newCh.startsWith("@")?newCh:"@"+newCh;setChannels([...channels,{id:Date.now(),handle:h,checked:true}]);setNewCh("");setShowAdd(false);}} style={{ background:"#22c55e", border:"none", borderRadius:"7px", padding:"8px 16px", color:"#fff", cursor:"pointer", fontWeight:"700" }}>추가</button>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"7px" }}>
            {channels.map(ch=>(
              <div key={ch.id} onClick={()=>setChannels(channels.map(c=>c.id===ch.id?{...c,checked:!c.checked}:c))} style={{ background:ch.checked?"#1a4731":"#1e1e3a", border:`1px solid ${ch.checked?"#22c55e":"#3d3d5c"}`, borderRadius:"8px", padding:"9px 12px", display:"flex", alignItems:"center", gap:"8px", cursor:"pointer" }}>
                <div style={{ width:"17px", height:"17px", borderRadius:"4px", background:ch.checked?"#22c55e":"transparent", border:`2px solid ${ch.checked?"#22c55e":"#555"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:"10px", color:"#fff" }}>{ch.checked?"✓":""}</div>
                <span style={{ fontSize:"13px", flex:1 }}>{ch.handle}</span>
                <button onClick={e=>{e.stopPropagation();setChannels(channels.filter(c=>c.id!==ch.id));}} style={{ background:"transparent", border:"none", color:"#475569", cursor:"pointer", fontSize:"16px", padding:0 }}>×</button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"16px", marginBottom:"12px" }}>
          {[
            {l:"🎬 영상 타입",c:(<div style={{ display:"flex", background:"#0f0f1a", borderRadius:"8px", overflow:"hidden", border:"1px solid #2d2d4a" }}>{["롱폼","쇼츠"].map(t=><button key={t} onClick={()=>setVideoType(t)} style={{ padding:"8px 26px", border:"none", background:videoType===t?"#22c55e":"transparent", color:videoType===t?"#fff":"#94a3b8", fontSize:"13px", cursor:"pointer", fontWeight:videoType===t?"700":"400" }}>{t}</button>)}</div>)},
            {l:"👁 최소 조회수",c:(<div style={{ display:"flex", alignItems:"center", gap:"10px" }}><input value={minViews} onChange={e=>setMinViews(e.target.value.replace(/\D/g,""))} style={{ ...I, width:"160px" }} placeholder="숫자만 입력" /><span style={{ fontSize:"12px", color:"#475569" }}>숫자만 입력</span></div>)},
            {l:"🔍 추적 기능",c:(<button onClick={()=>setTracking(!tracking)} style={{ background:tracking?"#22c55e":"#374151", border:"none", borderRadius:"8px", padding:"8px 20px", color:"#fff", fontSize:"13px", cursor:"pointer", fontWeight:"700" }}>{tracking?"✓ 활성화":"비활성화"}</button>)},
            {l:"⏰ 시간 범위",c:(<div style={{ position:"relative" }}><select value={timeRange} onChange={e=>setTimeRange(e.target.value)} style={{ ...I, paddingRight:"28px", appearance:"none", cursor:"pointer" }}>{["5분","10분","30분","1시간","3시간","6시간","12시간","24시간"].map(t=><option key={t}>{t}</option>)}</select><span style={{ position:"absolute", right:"8px", top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"#94a3b8", fontSize:"10px" }}>▾</span></div>)},
            {l:"🔎 검색 키워드",c:(<div style={{ display:"flex", alignItems:"center", gap:"10px" }}><input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="제목 키워드 (선택)" style={{ ...I, width:"340px" }} /><span style={{ fontSize:"11px", color:"#475569" }}>쉼표로 구분 (예: 속보,뉴스)</span></div>)},
          ].map(({l,c})=>(
            <div key={l} style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"13px" }}>
              <span style={{ fontSize:"13px", color:"#94a3b8", width:"108px", flexShrink:0 }}>{l}</span>{c}
            </div>
          ))}
        </div>
        <div style={{ background:"#16213e", border:"1px solid #252545", borderRadius:"10px", padding:"13px 16px", marginBottom:"12px", display:"flex", alignItems:"center", gap:"10px" }}>
          <button onClick={startScan} disabled={scanning} style={{ background:scanning?"#166534":"#22c55e", border:"none", borderRadius:"8px", padding:"10px 24px", color:"#fff", fontSize:"14px", cursor:scanning?"not-allowed":"pointer", fontWeight:"700", display:"flex", alignItems:"center", gap:"7px", opacity:scanning?0.8:1 }}>
            {scanning?<><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>🔄</span>스캔 중...</>:"🔍 스캔 시작"}
          </button>
          <button onClick={stopScan} disabled={!scanning} style={{ background:"#2d2d4a", border:"none", borderRadius:"8px", padding:"10px 20px", color:scanning?"#e2e8f0":"#555", fontSize:"14px", cursor:scanning?"pointer":"not-allowed", fontWeight:"700" }}>⛔ 중지</button>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:"14px", color:"#22c55e", fontWeight:"700" }}>결과: {results.toLocaleString()}개</span>
          <button onClick={()=>{setResults(0);setVideos([]);setLogs([]);logsRef.current=[];}} style={{ background:"#2d2d4a", border:"none", borderRadius:"7px", padding:"8px 13px", color:"#94a3b8", fontSize:"12px", cursor:"pointer" }}>🗑 초기화</button>
        </div>
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
