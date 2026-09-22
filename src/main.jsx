import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AlertCircle, ArrowLeft, ArrowRight, BarChart3, BrainCircuit, Check, CheckCircle2,
  ChevronDown, Cloud, Cpu, Database, Download, FileCheck2, FileText, Gauge, KeyRound, Layers3,
  Menu, RefreshCw, Search, Send, Server, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X,
  Zap, CircleDollarSign, Network, BookOpen, SlidersHorizontal, Eye, LockKeyhole, Users, UserRound, Link2, GitBranch, CheckCheck
} from "lucide-react";
import "./styles.css";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const STEPS = ["Collect", "Analyze", "Optimize", "Review"];

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { detail: text }; }
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}

const number = (value) => Number(value || 0);
const money = (value, currency = "₹") => `${currency}${number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const lakhs = (value, currency = "₹") => `${currency}${(number(value) / 100000).toFixed(2)}L`;
const percent = (value) => `${number(value).toFixed(1)}%`;

function buildSignals(data, resources = [], resourceIntel = null, policyCount = 0) {
  const overview = data?.overview || {};
  const recommendations = data?.plan?.recommendations || [];
  const underutilized = resources.filter((r) => {
    const cpu = number(r.cpu_utilization);
    const state = String(r.state || "").toLowerCase();
    return (cpu > 0 && cpu < 20) || state.includes("stopped") || state.includes("available");
  }).length;
  const highCostServices = Object.values(data?.summary?.service_breakdown || {})
    .filter((v) => number(v) > Math.max(1, number(data?.summary?.total_monthly_cost) * 0.2)).length;
  const intelCount = Number(resourceIntel?.recommendations_count ?? resourceIntel?.opportunity_count ?? 0);
  return {
    underutilized: underutilized || Number(overview.optimization_candidates || 0),
    highCostServices,
    policyDocs: policyCount,
    opportunities: Math.max(recommendations.length, intelCount),
  };
}

function App() {
  const [view, setView] = useState("overview");
  const [step, setStep] = useState(0);
  const [data, setData] = useState(null);
  const [aws, setAws] = useState({ connected: false });
  const [awsForm, setAwsForm] = useState({ account_id: "", role_arn: "", region: "ap-south-1" });
  const [awsBusy, setAwsBusy] = useState(false);
  const [awsMessage, setAwsMessage] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resources, setResources] = useState([]);
  const [resourceIntel, setResourceIntel] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [serviceAnalysis, setServiceAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [rootCause, setRootCause] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [attribution, setAttribution] = useState(null);
  const [attributionLoading, setAttributionLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    // Load only the data required to render the workspace first. Expensive
    // secondary analytics are loaded afterward so large uploads (1,000+ rows)
    // do not leave the application looking stuck on the loading screen.
    const essentialRequests = [
      ["summary", api("/api/billing/summary", {})],
      ["overview", api("/api/metrics/overview", {})],
      ["plan", api("/api/pricing/optimization-plan", {})],
      ["insights", api("/api/ml/insights", {})],
      ["records", api("/api/billing/records?limit=100000", {})],
      ["awsStatus", api("/api/aws/status", {})],
      ["awsResources", api("/api/aws/resources?limit=100000", {})],
      ["awsIntel", api("/api/aws/resource-intelligence", {})],
      ["policyDocs", api("/api/rag/documents", {})],
      ["attribution", api("/api/attribution/summary", {})],
    ];
    const results = await Promise.all(essentialRequests.map(async ([key, promise]) => {
      try { return [key, await promise, null]; }
      catch (err) { return [key, null, err]; }
    }));
    const out = Object.fromEntries(results.map(([key, value]) => [key, value]));
    const failures = results.filter(([, value, err]) => err && !value);
    if (out.summary && out.overview && out.plan && out.insights && out.records) {
      setData({ summary: out.summary, overview: out.overview, plan: out.plan, insights: out.insights, records: out.records });
    } else {
      setData(null);
    }
    setAws(out.awsStatus || { connected: false });
    setResources(out.awsResources?.resources || []);
    setResourceIntel(out.awsIntel || null);
    setPolicies(out.policyDocs?.documents || []);
    setAttribution(out.attribution || null);
    const recs = out.plan?.recommendations || [];
    setSelected(recs.slice(0, 3).map((_, index) => index));
    if (failures.length) {
      const essentialFailed = ["summary", "overview", "plan", "insights", "records"].some(k => failures.some(([key]) => key === k));
      if (essentialFailed) setError("CloudSense backend is not fully available. Start the FastAPI backend and refresh.");
    }
    setLoading(false);

    // Secondary analytics are intentionally non-blocking.
    const secondary = [
      ["anomalies", "/api/ml/anomalies"],
      ["serviceData", "/api/ml/service-analysis"],
      ["rootCause", "/api/analytics/root-cause"],
      ["capabilities", "/api/system/capabilities"],
    ];
    Promise.all(secondary.map(async ([key, path]) => {
      try { return [key, await api(path, {})]; } catch { return [key, null]; }
    })).then(items => {
      const extra = Object.fromEntries(items);
      if (extra.anomalies) setAnomalies(extra.anomalies);
      if (extra.serviceData) setServiceAnalysis(extra.serviceData);
      if (extra.rootCause) setRootCause(extra.rootCause);
      if (extra.capabilities) setCapabilities(extra.capabilities);
    });
  };

  useEffect(() => { load(); }, []);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setError(""); setFileName(file.name);
    try {
      const form = new FormData(); form.append("file", file);
      const result = await api("/api/billing/upload", { method: "POST", body: form });
      await load(); setStep(1); setView("analyze");
    } catch (err) { setError(err.message || "Upload failed."); }
    finally { setUploading(false); }
  };

  const connectAws = async () => {
    setAwsBusy(true); setAwsMessage("");
    try {
      const result = await api("/api/aws/test-connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: awsForm.account_id, role_arn: awsForm.role_arn, region: awsForm.region }) });
      setAws(result); setAwsMessage(result.message || "AWS credentials verified.");
    } catch (err) { setAws({ connected: false }); setAwsMessage(err.message); }
    finally { setAwsBusy(false); }
  };

  const clearWorkspace = async () => {
    const confirmed = window.confirm(
      "Clear the CloudSense workspace?\n\nThis will remove all imported billing data, collected AWS resource data, analysis snapshots, attribution data, and the saved AWS connection status. It will NOT change anything in AWS."
    );
    if (!confirmed) return;
    setLoading(true); setError("");
    try {
      await api("/api/workspace/clear", { method: "POST" });
      setData(null); setAws({ connected: false }); setResources([]); setResourceIntel(null);
      setSelected([]); setPolicies([]); setAttribution(null); setAnomalies(null); setForecast(null); setServiceAnalysis(null);
      setAwsForm({ account_id: "", role_arn: "", region: "ap-south-1" });
      setAwsMessage("Workspace cleared."); setFileName(""); setView("collect"); setStep(0);
      await load();
    } catch (err) {
      setError(err.message || "Could not clear the workspace.");
    } finally { setLoading(false); }
  };

  const collectAws = async () => {
    setAwsBusy(true); setAwsMessage("");
    try {
      const result = await api("/api/aws/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_arn: awsForm.role_arn, region: awsForm.region, days: 30 }) });
      if (!result.success) throw new Error(result.message || "AWS collection failed.");
      setAws((s) => ({ ...s, connected: true, account_id: result.account_id, region: result.region, last_collected_at: result.collected_at }));
      setAwsMessage(`Collected ${result.records_saved || 0} billing rows and ${result.resource_records_saved || 0} resources.`);
      await load(); setView("analyze"); setStep(1);
    } catch (err) { setAwsMessage(err.message); }
    finally { setAwsBusy(false); }
  };

  const recommendations = data?.plan?.recommendations || [];
  const selectedRecommendations = selected.map((i) => recommendations[i]).filter(Boolean);
  const current = number(data?.summary?.total_monthly_cost);
  const selectedSaving = selectedRecommendations.reduce((sum, item) => sum + number(item.estimated_monthly_saving), 0);

  const navigate = (targetView, targetStep = null) => {
    setView(targetView); if (targetStep !== null) setStep(targetStep); setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signals = useMemo(() => buildSignals(data, resources, resourceIntel, policies.length), [data, resources, resourceIntel, policies.length]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><div className="logo"><Cloud size={21}/></div><div><strong>CloudSense</strong><span>AI FinOps Platform</span></div></div>
        <div className="workspace"><span>WORKSPACE</span><b>Cloud Cost Intelligence</b><small>Enterprise workspace</small></div>
        <nav className="side-nav">
          <SideItem icon={BarChart3} label="Overview" active={view === "overview"} onClick={() => navigate("overview")} />
          <SideItem icon={Cloud} label="AWS & Data" active={view === "collect"} onClick={() => navigate("collect", 0)} />
          <SideItem icon={BarChart3} label="Cost & Usage" active={view === "analyze"} onClick={() => navigate("analyze", 1)} />
          <SideItem icon={Users} label="User Attribution" active={view === "attribution"} onClick={() => navigate("attribution")} />
          <SideItem icon={Zap} label="Optimization" active={view === "optimize"} onClick={() => navigate("optimize", 2)} />
        </nav>
        <div className="sidebar-bottom">
          <div className={`aws-mini ${aws.connected ? "connected" : ""}`}><span className="status-dot"/><div><b>{aws.connected ? "AWS Connected" : "AWS Not Connected"}</b><small>{aws.connected ? `${aws.account_id || "Account"} · ${aws.region || ""}` : "Connect a read-only AWS account"}</small></div></div>
        </div>
      </aside>
      {sidebarOpen && <div className="mobile-overlay" onClick={() => setSidebarOpen(false)}/>} 

      <section className="content-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button>
          <div className="crumb"><span>CloudSense</span><ChevronDown size={13}/><b>{pageLabel(view)}</b></div>
          <div className="top-actions"><button className="icon-button" onClick={load} disabled={loading} title="Refresh"><RefreshCw size={16} className={loading ? "spin" : ""}/></button><button className="danger-button" onClick={clearWorkspace} disabled={loading} title="Clear all stored data and AWS connection status"><Trash2 size={14}/><span>Clear data</span></button></div>
        </header>

        <main className="main-content">
          {error && <div className="alert error"><AlertCircle size={16}/><span>{error}</span><button onClick={load}>Retry</button></div>}
          {loading && !data ? <LoadingState/> : (
            <>
              {view === "overview" && <Overview data={data} aws={aws} signals={signals} resources={resources} resourceIntel={resourceIntel} anomalies={anomalies} forecast={forecast} serviceAnalysis={serviceAnalysis} history={history} rootCause={rootCause} capabilities={capabilities} onNavigate={navigate} />}
              {view === "collect" && <CollectCenter aws={aws} form={awsForm} setForm={setAwsForm} busy={awsBusy} message={awsMessage} connect={connectAws} collect={collectAws} upload={upload} fileName={fileName} uploading={uploading} hasData={Boolean(data?.summary?.record_count)} onAnalyze={() => navigate("analyze",1)} />}
              {view === "analyze" && <Analyze data={data} aws={aws} resources={resources} signals={signals} back={() => navigate("collect",0)} next={() => navigate("optimize",2)} />}
              {view === "attribution" && <Attribution data={data} aws={aws} attribution={attribution} loading={attributionLoading} refresh={async () => { setAttributionLoading(true); try { setAttribution(await api("/api/attribution/summary", {})); } catch (e) { setError(e.message); } finally { setAttributionLoading(false); } }} /> }
              {view === "optimize" && <Optimize data={data} aws={aws} selected={selected} setSelected={setSelected} back={() => navigate("analyze",1)} next={() => navigate("review",3)} />}
              {view === "review" && <Review data={data} aws={aws} selected={selectedRecommendations} selectedSaving={selectedSaving} current={current} back={() => navigate("optimize",2)} />}
                          </>
          )}
        </main>
      </section>
      <Chat />
    </div>
  );
}

function SideItem({icon: Icon,label,active,onClick}) { return <button className={`side-item ${active ? "active" : ""}`} onClick={onClick}><Icon size={17}/><span>{label}</span>{active && <i/>}</button>; }
function pageLabel(view) { return ({overview:"Overview",collect:"AWS & Data",analyze:"Cost & Usage",attribution:"User Attribution",optimize:"Optimization",review:"Savings Review"}[view] || "Overview"); }
function LoadingState() { return <div className="center-state"><RefreshCw className="spin" size={30}/><h2>Loading CloudSense</h2><p>Connecting analytics, AWS intelligence and GenAI services.</p></div>; }
function PageHead({eyebrow,title,description,actions}) { return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="head-actions">{actions}</div>}</div>; }
function StatCard({icon:Icon,label,value,sub,tone="default"}) { return <div className={`stat-card ${tone}`}><div className="stat-icon"><Icon size={18}/></div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>; }
function Panel({title,subtitle,icon:Icon,children,action}) { return <section className="panel"><div className="panel-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{Icon && <Icon size={18}/>} {action}</div>{children}</section>; }
function Empty({text}) { return <div className="empty">{text}</div>; }

function openPrintableReport({title,subtitle,summaryCards=[],sections=[]}) {
  const win=window.open("", "_blank", "width=1100,height=800");
  if(!win){ alert("Please allow pop-ups for CloudSense AI to export the PDF."); return; }
  const cards=summaryCards.map(c=>`<div class="kpi"><span>${escapeHtml(c.label)}</span><strong>${escapeHtml(c.value)}</strong><small>${escapeHtml(c.sub||"")}</small></div>`).join("");
  const body=sections.map(s=>`<section><h2>${escapeHtml(s.title)}</h2>${s.html}</section>`).join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff;font-size:10.5px;line-height:1.45}header{border-bottom:2px solid #1d4ed8;padding-bottom:14px;margin-bottom:18px}h1{font-size:25px;margin:0 0 4px;color:#0f172a}h2{font-size:14px;margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid #dbe2ea;color:#0f172a}p{margin:5px 0}.meta{color:#667085;font-size:9.5px}.source{background:#f6f8fb;border:1px solid #e3e8ef;padding:9px 11px;border-radius:7px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.kpi{border:1px solid #dfe5ec;border-radius:7px;padding:10px;background:#fff}.kpi span,.kpi small{display:block;color:#667085;font-size:9px}.kpi strong{display:block;font-size:16px;margin:4px 0}.callout{border-left:3px solid #1d4ed8;background:#f7faff;padding:10px 12px;margin:8px 0}.warning{border-left-color:#d97706;background:#fffbeb}.success{border-left-color:#16a34a;background:#f0fdf4}table{width:100%;border-collapse:collapse;margin:7px 0 12px;font-size:9px;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#f3f6fa;text-align:left;font-weight:700;color:#344054}th,td{border:1px solid #dfe5ec;padding:6px 7px;vertical-align:top}ul{margin:6px 0 8px;padding-left:18px}li{margin:4px 0}.step{display:grid;grid-template-columns:24px 1fr;gap:8px;margin:7px 0}.num{width:22px;height:22px;border-radius:50%;background:#1d4ed8;color:#fff;text-align:center;padding-top:3px;font-weight:700}.muted{color:#667085}.footer{border-top:1px solid #dfe5ec;margin-top:22px;padding-top:8px;color:#667085;font-size:8.5px}button{position:fixed;right:18px;top:18px;border:0;background:#1d4ed8;color:#fff;padding:9px 13px;border-radius:6px;font-weight:700;cursor:pointer}@media print{button{display:none}.kpis{grid-template-columns:repeat(4,1fr)}}
  </style></head><body><button onclick="window.print()">Save / Print PDF</button><header><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(subtitle)}</div></header><div class="kpis">${cards}</div>${body}<div class="footer">CloudSense AI • Executive decision-support report • Recommendations require human validation and approval • No AWS infrastructure changes are executed by this report.</div></body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),350);
}
function tableHtml(headers,rows){
  const head=headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("");
  const body=rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c==null||c===""?"—":c)}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${headers.length}" class="muted">No verified data available for this section.</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function exportExecutiveReport({data,aws,resources,resourceIntel,anomalies,rootCause}) {
  const summary=data?.summary||{};
  const live=Boolean(aws?.connected || resources?.length || resourceIntel?.resource_count);
  const currency=live?"$":"₹";
  const locale=live?"en-US":"en-IN";
  const fmt=(v)=>`${currency}${number(v).toLocaleString(locale,{maximumFractionDigits:2})}`;
  const recs=(live&&resourceIntel?.recommendations?.length?resourceIntel.recommendations:(data?.plan?.recommendations||[])).filter(r=>r?.resource_id);
  const savings=recs.reduce((a,r)=>a+number(r?.estimated_monthly_saving),0);
  const resourceCount=live?(resources?.length||resourceIntel?.resource_count||0):(data?.overview?.resource_count||0);
  const anomalyItems=(anomalies?.anomalies||[]).filter(a=>a?.resource_id||a?.service);
  const source=live?`AWS Live — Account ${aws?.account_id||"—"} · ${aws?.region||"multiple regions"}`:"Imported billing data";
  const services=Object.entries(summary.service_breakdown||{}).sort((a,b)=>number(b[1])-number(a[1])).slice(0,12);
  const recRows=recs.slice(0,25).map(r=>[r.resource_id,r.service||r.resource_type||"—",r.title||recommendationTitle(r),r.estimated_monthly_saving==null?"Estimate unavailable":`${fmt(r.estimated_monthly_saving)}/mo`,(r.evidence||r.reasons||[]).join("; ")]);
  const resourceRows=(resources||[]).slice(0,30).map(r=>[r.resource_id,r.service,r.resource_type,r.region,r.state,r.cpu_utilization==null?"—":`${number(r.cpu_utilization).toFixed(1)}%`,r.monthly_cost==null?"—":fmt(r.monthly_cost)]);
  const anomalyRows=anomalyItems.slice(0,20).map(a=>[a.resource_id||"—",a.service||"—",a.severity||"Review",a.reason||a.explanation||"Cost anomaly detected"]);
  const insights=data?.insights?.insights||[];
  const root=(rootCause?.reasons||[]).filter(Boolean);
  const steps=[
    ["Validate the data","Confirm the AWS account, collection date, regions and cost period before acting on any recommendation."],
    ["Prioritize opportunities","Start with resources where the evidence and estimated savings are clear. Treat estimates as CloudSense analysis, not AWS invoices."],
    ["Review dependencies","Check application ownership, production impact, backups, schedules, traffic patterns and business requirements."],
    ["Approve changes","Route selected actions to the resource owner / cloud operations team. CloudSense does not execute changes automatically."],
    ["Implement safely","Use change control, maintenance windows and rollback plans. Apply one change at a time for material production resources."],
    ["Measure after implementation","Re-collect AWS billing and usage metrics and compare actual cost/utilization against the pre-change baseline."]
  ];
  openPrintableReport({
    title:"CloudSense AI — Executive Cloud Cost Report",
    subtitle:`Generated ${new Date().toLocaleString()} · Data source: ${source}`,
    summaryCards:[
      {label:"Current reported spend",value:fmt(summary.total_monthly_cost),sub:live?"AWS-collected dataset":"Imported billing dataset"},
      {label:"Potential savings",value:`${fmt(savings)}/mo`,sub:recs.length?`${recs.length} verified recommendations with resource IDs`:"No resource-level estimate"},
      {label:"Resources",value:String(resourceCount),sub:"Resources represented in current dataset"},
      {label:"Anomalies",value:String(anomalyItems.length),sub:"Explainable anomaly flags"}
    ],
    sections:[
      {title:"1. Data & scope",html:`<div class="source"><b>${escapeHtml(source)}</b><br/><span class="muted">This report reflects only data successfully loaded into CloudSense at generation time. A zero/low spend value is reported as-is; it is not replaced with an estimate.</span></div>`},
      {title:"2. Cost by service",html:tableHtml(["Service","Reported cost","Share of reported spend"],services.map(([name,val])=>[name,fmt(val),number(summary.total_monthly_cost)?`${(number(val)/number(summary.total_monthly_cost)*100).toFixed(1)}%`:"—"]))},
      {title:"3. Optimization opportunities",html:recRows.length?tableHtml(["Resource","Service","Recommendation","Estimated saving","Evidence"],recRows):`<div class="callout">No resource-level optimization recommendation with a verified resource ID is available from the current dataset. Do not invent a resource or savings figure.</div>`},
      {title:"4. Resource inventory & utilization evidence",html:resourceRows.length?tableHtml(["Resource","Service","Type","Region","State","CPU","Reported cost"],resourceRows):`<div class="callout">No AWS resource inventory was returned for this collection.</div>`},
      {title:"5. Anomaly signals",html:anomalyRows.length?tableHtml(["Resource","Service","Severity","Explanation"],anomalyRows):`<div class="callout success">No explainable cost anomaly records were available in the current dataset.</div>`},
      {title:"6. AI / ML observations",html:insights.length?`<ul>${insights.slice(0,10).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`:`<p class="muted">No additional ML observations were returned.</p>`},
      {title:"7. Root-cause signals",html:root.length?`<ul>${root.slice(0,10).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`:`<p class="muted">No root-cause signals were returned.</p>`},
      {title:"8. Recommended next steps",html:steps.map((s,i)=>`<div class="step"><div class="num">${i+1}</div><div><b>${escapeHtml(s[0])}</b><br/>${escapeHtml(s[1])}</div></div>`).join("")},
      {title:"9. Management decision checklist",html:`<div class="callout"><b>Before approval:</b> verify owner, environment, business criticality, dependency impact, current utilization, actual billing period and rollback path.</div><div class="callout warning"><b>Important:</b> Potential savings are analytical estimates. They should be validated against AWS pricing, actual resource configuration and workload requirements before implementation.</div>`}
    ]
  });
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function Overview({data,aws,signals,resources,resourceIntel,anomalies,forecast,serviceAnalysis,history,rootCause,capabilities,onNavigate}) {
  const summary=data?.summary||{}; const overview=data?.overview||{}; const recs=data?.plan?.recommendations||[];
  const topServices=Object.entries(summary.service_breakdown||{}).sort((a,b)=>number(b[1])-number(a[1])).slice(0,6);
  const max=Math.max(...topServices.map(x=>number(x[1])),1);
  return <>
    <PageHead eyebrow="CONTROL CENTER" title="Cloud cost intelligence at a glance" description="A single workspace for AWS spend, resource efficiency, optimization opportunities and grounded AI guidance." actions={<div className="head-actions-inline"><button className="secondary" onClick={()=>exportExecutiveReport({data,aws,resources,resourceIntel,anomalies,rootCause})}><Download size={14}/> Executive report</button><button className="primary" onClick={()=>onNavigate("collect",0)}><Cloud size={15}/> {aws.connected?"Manage AWS":"Connect AWS"}</button></div>}/>
    <div className="hero-status"><div className="hero-status-main"><div className={`hero-icon ${aws.connected?"aws": ""}`}><Cloud size={24}/></div><div><b>{aws.connected?"AWS intelligence is connected":"AWS connection required"}</b><span>{aws.connected?`Account ${aws.account_id||"—"} · ${aws.region||"—"}`:"Connect an AWS account to collect billing, resource and utilization data."}</span></div></div><button className="secondary small" onClick={()=>onNavigate("collect",0)}>{aws.connected?"View connection":"Connect AWS"}<ArrowRight size={13}/></button></div>
    <div className="data-health-strip"><div><span className="eyebrow">DATA HEALTH</span><b>{aws.connected ? "Live AWS intelligence" : "Imported billing dataset"}</b><small>{aws.connected ? `Last collection ${aws.last_collected_at ? new Date(aws.last_collected_at).toLocaleString() : "not recorded"}` : "Upload billing data to populate the workspace"}</small></div><div className="health-chips"><span className="health-chip ok">Billing ✓</span><span className={`health-chip ${aws.connected ? "ok" : "neutral"}`}>{aws.connected ? "AWS ✓" : "AWS —"}</span><span className={`health-chip ${capabilities?.ml ? "ok" : "neutral"}`}>{capabilities?.ml ? "ML ✓" : "ML —"}</span><span className={`health-chip ${capabilities?.rag ? "ok" : "neutral"}`}>{capabilities?.rag ? "RAG ✓" : "RAG —"}</span><span className={`health-chip ${capabilities?.genai ? "ok" : "neutral"}`}>{capabilities?.genai ? "AI ✓" : "AI —"}</span></div></div>
    <div className="stats-grid">
      <StatCard icon={CircleDollarSign} label="Monthly spend" value={lakhs(summary.total_monthly_cost)} sub={`${summary.record_count||0} billing records`}/>
      <StatCard icon={Zap} label="Potential savings" value={lakhs(recs.reduce((s,r)=>s+number(r.estimated_monthly_saving),0))} sub={`${recs.length} opportunities`} tone="positive"/>
      <StatCard icon={Server} label="Resources analyzed" value={aws.connected?resources.length:(overview.resource_count||0)} sub={`${overview.optimization_candidates||0} optimization candidates`}/>
      <StatCard icon={BrainCircuit} label="AI readiness" value={capabilities?.genai&&capabilities?.rag&&capabilities?.ml?"Grounded":"Unavailable"} sub={capabilities?.genai&&capabilities?.rag&&capabilities?.ml?"ML + RAG + GenAI":"Required AI components not ready"} tone="ai"/>
    </div>
    <div className="grid-2-1">
      <Panel title="Spend by service" subtitle="Current dataset" icon={BarChart3} action={<button className="text-button" onClick={()=>onNavigate("analyze",1)}>View analysis <ArrowRight size={13}/></button>}>
        {topServices.length?topServices.map(([name,value])=><div className="metric-row" key={name}><div><b>{name}</b><span>{lakhs(value)}</span></div><div className="progress"><i style={{width:`${Math.max(4,number(value)/max*100)}%`}}/></div></div>):<Empty text="No billing data loaded."/>}
      </Panel>
      <Panel title="Optimization signals" subtitle="Evidence-based opportunities" icon={Zap}>
        <SignalRow label="Underutilized resources" value={signals.underutilized} tone="warning"/>
        <SignalRow label="High-cost services" value={signals.highCostServices} tone="neutral"/>
        <SignalRow label="Policy documents" value={signals.policyDocs} tone="neutral"/>
        <SignalRow label="AWS resources" value={resources.length} tone="neutral"/>
      </Panel>
    </div>

    <div className="grid-2">
      <Panel title="Cost health" subtitle="Automated signals from the current dataset" icon={AlertCircle}>
        <SignalRow label="Detected anomalies" value={number(anomalies?.anomaly_count)} tone={number(anomalies?.anomaly_count)?"warning":"positive"}/>
        <SignalRow label="Optimization opportunities" value={recs.length} tone="neutral"/>
        <SignalRow label="Policy documents" value={signals.policyDocs} tone="neutral"/>
        <SignalRow label="Data source" value={aws.connected?"AWS Live":"Not connected"} tone="neutral"/>
      </Panel>
    </div>
    <div className="grid-2">
      <Panel title="Why cost is high" subtitle="Contributing signals — not causal proof" icon={BrainCircuit}>
        {(rootCause?.reasons||[]).slice(0,4).map((x,i)=><div className="insight-row" key={i}><span>{i+1}</span><p>{x}</p></div>)}
        {!(rootCause?.reasons||[]).length&&<Empty text="Load billing data to generate root-cause signals."/>}
      </Panel>
    </div>
    <div className="grid-2">
      <Panel title="Service cost concentration" subtitle="Where the current run-rate is concentrated" icon={BarChart3}>
        {(serviceAnalysis?.services||[]).slice(0,5).map((x,i)=><div className="simple-list" key={x.service||i}><span>{x.service||"Unknown"}<small>{x.resource_count||0} resources</small></span><b>{money(x.total_monthly_cost)}/mo</b></div>)}
        {!(serviceAnalysis?.services||[]).length&&<Empty text="No service analysis available."/>}
      </Panel>
      <Panel title="AI assistant" subtitle="Ask questions using your current cloud data" icon={Sparkles}><div className="ai-card"><div className="ai-card-icon"><Sparkles size={20}/></div><div><b>CloudSense AI</b><p>Ask why costs changed, which resources need review, or which policies apply.</p></div><button className="primary small" onClick={()=>document.querySelector(".chat-fab")?.click()}>Ask AI</button></div></Panel>
    </div>
    <div className="grid-2">
      <Panel title="Platform readiness" subtitle="Enterprise capabilities enabled" icon={ShieldCheck}>
        <SignalRow label="AWS connection" value={capabilities?.live_aws ? "Ready" : "—"} tone="positive"/>
        <SignalRow label="RAG grounding" value={capabilities?.rag ? "Ready" : "—"} tone="positive"/>
        <SignalRow label="AI evaluation" value={capabilities?.evaluation ? "Ready" : "—"} tone="positive"/>
        <SignalRow label="AWS changes" value="Read-only" tone="neutral"/>
      </Panel>
      <Panel title="Top optimization opportunities" subtitle="Review before making changes" icon={ShieldCheck} action={<button className="text-button" onClick={()=>onNavigate("optimize",2)}>Open all <ArrowRight size={13}/></button>}>
        {recs.slice(0,4).map((r,i)=><div className="opportunity" key={i}><div className="opp-icon"><Zap size={14}/></div><div><b>{recommendationTitle(r)}</b><span>{(r.reasons||[]).join("; ")||"Review resource utilization."}</span></div><strong>{money(r.estimated_monthly_saving)}/mo</strong></div>)}
        {!recs.length&&<Empty text="No recommendations available."/>}
      </Panel>
    </div>
  </>;
}
function SignalRow({label,value,tone}) { return <div className="signal-row"><span>{label}</span><b className={tone}>{value}</b></div>; }

function CollectCenter({aws,form,setForm,busy,message,connect,collect,upload,fileName,uploading,hasData,onAnalyze}) {
  const inputRef=useRef(null); const [drag,setDrag]=useState(false);
  return <>
    <PageHead eyebrow="AWS DATA CONNECTION" title="Connect AWS and collect cloud data" description="Use a read-only AWS connection to collect billing, resources, tags, utilization and activity signals for cost attribution and optimization."/>
    <div className="mode-banner"><div><span className="eyebrow">CONNECTION STATUS</span><b>{aws.connected?"Connected":"Ready to connect"}</b></div><span>{aws.connected?"AWS billing, resources and utilization signals are available to CloudSense.":"Use the IAM User → STS AssumeRole flow to establish the read-only connection."}</span></div>
    <div className="grid-2">
      <Panel title="AWS connection" subtitle="STS AssumeRole · read-only architecture" icon={Cloud}>
        <div className="security-note"><LockKeyhole size={15}/><span>The IAM user <code>CloudSenseConnector</code> is used only as the local STS bootstrap identity. AWS service calls use temporary credentials for <code>CloudSenseReadOnlyRole</code>.</span></div>
        <div className="form-grid"><Field label="AWS Account ID"><input value={form.account_id} onChange={e=>setForm({...form,account_id:e.target.value})} placeholder="12-digit account ID"/></Field><Field label="Region"><select value={form.region} onChange={e=>setForm({...form,region:e.target.value})}><option>ap-south-1</option><option>us-east-1</option><option>us-west-2</option><option>eu-west-1</option></select></Field><Field label="Read-only Role ARN"><input value={form.role_arn} onChange={e=>setForm({...form,role_arn:e.target.value})} placeholder="arn:aws:iam::123456789012:role/CloudSenseReadOnly"/></Field></div>
        <div className="aws-help">Configure the <code>CloudSenseConnector</code> credentials on the local backend. The browser receives only the connection result; AWS credentials are never sent to the frontend.</div>
        <div className="aws-actions"><button className="secondary" onClick={connect} disabled={busy||!form.account_id||!form.role_arn}><KeyRound size={14}/>{busy?"Checking…":"Test STS Connection"}</button><button className="primary" onClick={collect} disabled={busy||!form.role_arn||!aws.connected}><Cloud size={14}/>{busy?"Collecting…":"Collect AWS Data"}</button></div>
        <div className={`connection-result ${aws.connected?"success":""}`}><span className="status-dot"/><div><b>{aws.connected?"AWS connected":"Not connected"}</b><small>{aws.connected?`Account ${aws.account_id||form.account_id} · ${aws.region||form.region}`:"Connect to enable billing and resource collection."}</small></div></div>
        {message&&<div className="inline-message">{message}</div>}
      </Panel>
      <Panel title="Optional billing import" subtitle="Use when a billing export is available outside the AWS connection" icon={Upload}>
        <div className={`dropzone ${drag?"drag":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);upload(e.dataTransfer.files?.[0])}}><div className="drop-icon"><Upload size={23}/></div><b>{uploading?"Uploading…":fileName||"Drop a billing file here"}</b><span>CSV, XLSX, XLS, PDF or image · Max 15 MB</span><button className="primary" onClick={()=>inputRef.current?.click()} disabled={uploading}><Upload size={14}/>{uploading?"Uploading":"Choose file"}</button><input ref={inputRef} hidden type="file" accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg" onChange={e=>upload(e.target.files?.[0])}/>{fileName&&!uploading&&<div className="file-ok"><CheckCircle2 size={14}/> {fileName}</div>}</div>
        <div className="source-list"><InfoLine icon={FileText} title="Normalized data" text="Services, regions, costs and resource fields are mapped to the CloudSense schema."/><InfoLine icon={BrainCircuit} title="ML + AI" text="ML analytics, RAG and GenAI use the normalized evidence without replacing deterministic cost calculations."/><InfoLine icon={ShieldCheck} title="Read-only operation" text="CloudSense does not modify AWS infrastructure."/></div>
        <button className="secondary full" onClick={onAnalyze} disabled={!hasData}>Open current analysis <ArrowRight size={14}/></button>
      </Panel>
    </div>
    <Panel title="Data collected for the intelligence layer" subtitle="The same evidence supports attribution, ML and GenAI" icon={Activity}><div className="source-list"><InfoLine icon={CircleDollarSign} title="Billing" text="AWS Cost Explorer cost and usage data."/><InfoLine icon={Server} title="Resources and tags" text="Resource inventory and ownership metadata."/><InfoLine icon={Activity} title="Utilization" text="CloudWatch metrics where available."/><InfoLine icon={Eye} title="Activity" text="CloudTrail activity is used as supporting attribution evidence."/></div></Panel>
  </>;
}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function InfoLine({icon:Icon,title,text}){return <div className="info-line"><Icon size={16}/><div><b>{title}</b><span>{text}</span></div></div>}


function Attribution({data,aws,attribution,loading,refresh}){
  const rows=attribution?.users||[];
  const total=number(attribution?.total_resource_cost);
  const fmt=v=>`${aws?.connected?"$":"₹"}${number(v).toLocaleString(aws?.connected?"en-US":"en-IN",{maximumFractionDigits:2})}`;
  const coverage=number(attribution?.attribution_coverage);
  return <>
    <PageHead eyebrow="USER-SPECIFIC COST" title="Who is using the AWS spend?" description="Deterministic attribution connects AWS resource cost to users using ownership, mappings and workload evidence. Shared cost remains unattributed when evidence is incomplete." actions={<button className="secondary" onClick={refresh} disabled={loading}><RefreshCw size={14} className={loading?"spin":""}/> Refresh attribution</button>}/>
    <div className="data-health-strip"><div><span className="eyebrow">ATTRIBUTION ENGINE</span><b>{attribution?.resource_count||0} resources processed</b><small>Calculation is independent of the LLM.</small></div><div className="health-chips"><span className="health-chip ok">Deterministic ✓</span><span className={`health-chip ${coverage>=90?"ok":"neutral"}`}>Coverage {coverage.toFixed(1)}%</span><span className="health-chip neutral">Unattributed {fmt(attribution?.total_unattributed_cost)}</span></div></div>
    <div className="stats-grid"><StatCard icon={CircleDollarSign} label="AWS resource cost" value={fmt(total)} sub="Resource-level cost represented"/><StatCard icon={UserRound} label="User-attributed" value={fmt(attribution?.total_attributed_cost)} sub={`${coverage.toFixed(1)}% of resource cost`} tone="positive"/><StatCard icon={Link2} label="Unattributed" value={fmt(attribution?.total_unattributed_cost)} sub="Preserved when evidence is missing" tone="warning"/><StatCard icon={CheckCheck} label="Reconciliation" value={Math.abs(number(attribution?.reconciliation_difference))<0.01?"Matched":"Review"} sub={`Difference ${fmt(attribution?.reconciliation_difference)}`}/></div>
    <div className="grid-2-1"><Panel title="User cost" subtitle="Attributed cost by user" icon={Users}>{rows.length?<div className="table-scroll"><table><thead><tr><th>User</th><th>Attributed cost</th><th>Resources</th><th>Confidence</th><th>Methods</th></tr></thead><tbody>{rows.map(r=><tr key={r.user_id}><td><b>{r.user_id}</b></td><td>{fmt(r.attributed_cost)}</td><td>{r.resource_count}</td><td>{(r.confidence||[]).join(", ")||"—"}</td><td>{(r.methods||[]).join(", ")||"—"}</td></tr>)}</tbody></table></div>:<Empty text="No user-attributed cost is available yet. Collect AWS resources with ownership tags or configure mappings."/>}</Panel><Panel title="Attribution hierarchy" subtitle="Evidence priority" icon={GitBranch}><div className="source-list"><InfoLine icon={CheckCircle2} title="1 · Explicit owner tag" text="Owner=User → 100% of the resource cost."/><InfoLine icon={Link2} title="2 · Manual / project mapping" text="Explicit administrator mapping allocates a defensible percentage."/><InfoLine icon={Activity} title="3 · Workload usage" text="Usage telemetry can allocate shared resources."/><InfoLine icon={Eye} title="4 · CloudTrail activity" text="Supporting identity signal only; it does not fabricate ongoing ownership."/><InfoLine icon={AlertCircle} title="5 · Unattributed" text="No reliable signal → preserve the remainder as unattributed."/></div></Panel></div>
    <Panel title="Attribution methods in this calculation" subtitle="Counts of resource-level decisions" icon={SlidersHorizontal}><div className="method-grid">{Object.entries(attribution?.method_counts||{}).map(([method,count])=><div className="method-card" key={method}><span>{method.replaceAll("_"," ")}</span><b>{count}</b></div>)}</div></Panel>
    <div className="callout" style={{marginTop:14}}><b>Important:</b> CloudSense does not infer a human cost from CPU percentage alone. Cost, ownership and usage signals are correlated, then the deterministic engine calculates and reconciles the result.</div>
  </>;
}

function Analyze({data,aws,resources,signals,back,next}){
  const summary=data?.summary||{}; const overview=data?.overview||{}; const insights=data?.insights?.insights||[]; const records=data?.records||[]; const services=Object.entries(summary.service_breakdown||{}).sort((a,b)=>number(b[1])-number(a[1])); const max=Math.max(...services.map(x=>number(x[1])),1); const currency=aws?.connected?"$":"₹"; const fmtMoney=v=>`${currency}${number(v).toLocaleString(aws?.connected?"en-US":"en-IN",{maximumFractionDigits:0})}`;
  const [sort,setSort]=useState({key:null,dir:"asc"});
  const [query,setQuery]=useState("");
  const [serviceFilter,setServiceFilter]=useState("all");
  const [regionFilter,setRegionFilter]=useState("all");
  const [envFilter,setEnvFilter]=useState("all");
  const [stateFilter,setStateFilter]=useState("all");
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [detail,setDetail]=useState(null);
  const rows=resources.length?resources:records;
  const servicesFilter=[...new Set(rows.map(r=>r.service).filter(Boolean))].sort();
  const regionsFilter=[...new Set(rows.map(r=>r.region).filter(Boolean))].sort();
  const envsFilter=[...new Set(rows.map(r=>r.environment).filter(Boolean))].sort();
  const statesFilter=[...new Set(rows.map(r=>r.state).filter(Boolean))].sort();
  const filteredRows=rows.filter(r=>{
    const hay=`${r.resource_id||""} ${r.resource_name||""} ${r.resource_type||""}`.toLowerCase();
    return (!query || hay.includes(query.toLowerCase())) && (serviceFilter==="all"||r.service===serviceFilter) && (regionFilter==="all"||r.region===regionFilter) && (envFilter==="all"||r.environment===envFilter) && (stateFilter==="all"||r.state===stateFilter);
  });
  useEffect(()=>setPage(1),[query,serviceFilter,regionFilter,envFilter,stateFilter,pageSize]);
  const sortDefs={
    resource:{label:"Resource",value:r=>String(r.resource_id||r.resource_name||r.resource_type||"")},
    service:{label:"Service",value:r=>String(r.service||"")},
    region:{label:"Region",value:r=>String(r.region||"")},
    environment:{label:"Environment",value:r=>String(r.environment||"")},
    cost:{label:"Cost",value:r=>r.monthly_cost==null?null:Number(r.monthly_cost)},
    cpu:{label:"CPU",value:r=>r.cpu_utilization==null?null:Number(r.cpu_utilization)},
    memory:{label:"Memory",value:r=>r.memory_utilization==null?null:Number(r.memory_utilization)},
    state:{label:"State",value:r=>String(r.state||"")}
  };
  const sortedRows=useMemo(()=>{
    if(!sort.key) return filteredRows;
    const getter=sortDefs[sort.key].value;
    return filteredRows.map((row,index)=>({row,index,value:getter(row)})).sort((a,b)=>{
      const av=a.value,bv=b.value;
      if(av==null&&bv==null) return a.index-b.index;
      if(av==null) return 1; if(bv==null) return -1;
      const an=typeof av==="number" && typeof bv==="number";
      const cmp=an ? av-bv : String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});
      return cmp===0 ? a.index-b.index : (sort.dir==="asc"?cmp:-cmp);
    }).map(x=>x.row);
  },[filteredRows,sort]);
  const totalPages=Math.max(1,Math.ceil(sortedRows.length/pageSize));
  const pageRows=sortedRows.slice((page-1)*pageSize,page*pageSize);
  const sortBy=(key)=>setSort(current=>current.key===key?{key,dir:current.dir==="asc"?"desc":"asc"}:{key,dir:"asc"});
  const SortHeader=({column})=>{const active=sort.key===column; const arrow=active?(sort.dir==="asc"?"↑":"↓"):"↕"; return <th><button type="button" className={`table-sort ${active?"active":""}`} onClick={()=>sortBy(column)} title={`Sort by ${sortDefs[column].label}`}>{sortDefs[column].label}<span>{arrow}</span></button></th>};
  return <><PageHead eyebrow="COST & USAGE" title="Understand what is driving spend" description="Combine billing, resource inventory and utilization evidence before deciding what to optimize." actions={<button className="secondary" onClick={()=>window.print()}><Download size={14}/> Print view</button>}/>
    <div className="stats-grid"><StatCard icon={CircleDollarSign} label="Monthly spend" value={fmtMoney(summary.total_monthly_cost)} sub={`${summary.record_count||0} records`}/><StatCard icon={Server} label="Resources" value={resources.length||overview.resource_count||0} sub="AWS or billing resources"/><StatCard icon={Cpu} label="Average CPU" value={overview.average_cpu_utilization==null?"—":percent(overview.average_cpu_utilization)} sub={`${overview.underutilized_resources||signals.underutilized} underutilized`}/><StatCard icon={Network} label="Avg runtime" value={overview.average_hours_running?`${number(overview.average_hours_running).toFixed(1)}h`:"—"} sub="per day"/></div>
    <div className="grid-2-1"><Panel title="Spend by service" subtitle="Current cost distribution" icon={BarChart3}>{services.slice(0,8).map(([s,v])=><div className="metric-row" key={s}><div><b>{s}</b><span>{fmtMoney(v)}</span></div><div className="progress"><i style={{width:`${Math.max(4,number(v)/max*100)}%`}}/></div></div>)}</Panel><Panel title="ML observations" subtitle="Pattern-based signals" icon={BrainCircuit}>{insights.length?insights.slice(0,6).map((x,i)=><div className="insight-row" key={i}><span>{i+1}</span><p>{x}</p></div>):<Empty text="No additional ML observations."/>}</Panel></div>
    <Panel title="Resource inventory" subtitle={`${filteredRows.length} of ${rows.length} resources · click any column header to sort`} icon={Server}>
      <div className="inventory-toolbar">
        <div className="search-box"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search resource ID, name or type…"/></div>
        <select value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)}><option value="all">All services</option>{servicesFilter.map(x=><option key={x}>{x}</option>)}</select>
        <select value={regionFilter} onChange={e=>setRegionFilter(e.target.value)}><option value="all">All regions</option>{regionsFilter.map(x=><option key={x}>{x}</option>)}</select>
        <select value={envFilter} onChange={e=>setEnvFilter(e.target.value)}><option value="all">All environments</option>{envsFilter.map(x=><option key={x}>{x}</option>)}</select>
        <select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}><option value="all">All states</option>{statesFilter.map(x=><option key={x}>{x}</option>)}</select>
      </div>
      <div className="table-scroll"><table><thead><tr><SortHeader column="resource"/><SortHeader column="service"/><SortHeader column="region"/><SortHeader column="environment"/><SortHeader column="cost"/><SortHeader column="cpu"/><SortHeader column="memory"/><SortHeader column="state"/></tr></thead><tbody>{pageRows.map((r,i)=><tr key={r.id||r.resource_id||i} onClick={()=>setDetail(r)} className="clickable-row"><td><b>{r.resource_id||"—"}</b><small>{r.resource_name||r.resource_type||""}</small></td><td>{r.service||"—"}</td><td>{r.region||"—"}</td><td><span className="tag">{r.environment||"—"}</span></td><td>{fmtMoney(r.monthly_cost)}</td><td>{r.cpu_utilization==null?"—":percent(r.cpu_utilization)}</td><td>{r.memory_utilization==null?"—":percent(r.memory_utilization)}</td><td>{r.state||"—"}</td></tr>)}</tbody></table></div>
      <div className="inventory-pagination"><span>Showing {sortedRows.length?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,sortedRows.length)} of {sortedRows.length}</span><div><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="10">10 / page</option><option value="25">25 / page</option><option value="50">50 / page</option></select><button className="secondary small" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><b>Page {page} / {totalPages}</b><button className="secondary small" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>
    </Panel>
    {detail&&<ResourceDetail resource={detail} onClose={()=>setDetail(null)}/>}
    <div className="workflow-actions"><button className="secondary" onClick={back}><ArrowLeft size={14}/> Back</button><button className="primary" onClick={next}>Review optimization opportunities <ArrowRight size={14}/></button></div>
  </>;
}

function Optimize({data,aws,selected,setSelected,back,next}){
  const recs=data?.plan?.recommendations||[];
  const currency=aws?.connected?"$":"₹";
  const fmt=v=>`${currency}${number(v).toLocaleString(aws?.connected?"en-US":"en-IN",{maximumFractionDigits:2})}`;
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);
  useEffect(()=>setPage(1),[query,filter,pageSize]);
  const filtered=recs.filter((r)=>{
    const hay=`${r.resource_id||""} ${r.resource_name||""} ${r.service||""} ${r.recommendation_type||""} ${r.environment||""}`.toLowerCase();
    return (!query||hay.includes(query.toLowerCase())) && (filter==="all"||String(r.priority||"").toLowerCase()===filter);
  });
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const pageRows=filtered.slice((page-1)*pageSize,page*pageSize);
  const selectedItems=selected.map(i=>recs[i]).filter(Boolean);
  const saving=selectedItems.reduce((s,r)=>s+number(r.estimated_monthly_saving),0);
  const totalSaving=recs.reduce((s,r)=>s+number(r.estimated_monthly_saving),0);
  const toggle=i=>setSelected(c=>c.includes(i)?c.filter(x=>x!==i):[...c,i]);
  const selectVisible=()=>setSelected(c=>Array.from(new Set([...c,...pageRows.map(r=>recs.indexOf(r))])));
  return <>
    <PageHead eyebrow="OPTIMIZATION" title="Prioritize savings opportunities" description="Review every detected opportunity. Use search, filters and pagination to work through large inventories. CloudSense only recommends and simulates; it does not modify AWS." actions={<div className="selection-pill"><b>{selected.length}</b> selected · {fmt(saving)}/mo potential</div>}/>
    <div className="optimization-summary"><div><span>Potential monthly savings</span><strong>{fmt(totalSaving)}</strong><small>Across all {recs.length.toLocaleString()} opportunities</small></div><div><span>Selected</span><strong>{fmt(saving)}</strong><small>{selected.length} opportunities</small></div><div><span>Annualized selected</span><strong>{fmt(saving*12)}</strong><small>Simulation only</small></div></div>
    <div className="selection-toolbar"><b>{filtered.length.toLocaleString()} shown of {recs.length.toLocaleString()} opportunities</b><div className="optimization-filters"><div className="search-box"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search resource, service or recommendation…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><button className="secondary small" onClick={selectVisible}>Select visible</button><button className="secondary small" onClick={()=>setSelected(recs.map((_,i)=>i))}>Select all</button><button className="secondary small" onClick={()=>setSelected([])}>Clear</button></div></div>
    <div className="recommendation-list">{pageRows.map((item)=>{const i=recs.indexOf(item);return <Recommendation key={item.resource_id||`${item.service}-${i}`} item={item} checked={selected.includes(i)} onToggle={()=>toggle(i)}/>})}{!pageRows.length&&<Empty text="No matching optimization opportunities."/>}</div>
    <div className="inventory-pagination optimization-pagination"><span>Showing {filtered.length?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,filtered.length)} of {filtered.length.toLocaleString()}</span><div><select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value="25">25 / page</option><option value="50">50 / page</option><option value="100">100 / page</option></select><button className="secondary small" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><b>Page {page} / {totalPages}</b><button className="secondary small" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>
    <div className="approval-banner"><ShieldCheck size={18}/><div><b>Human approval is always required</b><span>Potential savings are estimates based on available evidence. No infrastructure change is executed by CloudSense.</span></div></div>
    <div className="workflow-actions"><button className="secondary" onClick={back}><ArrowLeft size={14}/> Back</button><button className="primary" onClick={next}>Open savings review <ArrowRight size={14}/></button></div>
  </>
}
function Recommendation({item,checked,onToggle}){const [open,setOpen]=useState(false);const cur=item.cost_currency||"₹";const fmt=v=>v==null?"Estimate unavailable":`${cur}${number(v).toLocaleString(cur==="USD"?"en-US":"en-IN",{maximumFractionDigits:2})}`;return <article className={`recommendation-card ${checked?"selected":""}`}><div className="check-box" onClick={onToggle}>{checked&&<Check size={13}/>}</div><div className="rec-type"><Zap size={16}/></div><div className="rec-main"><div className="rec-title"><h3>{recommendationTitle(item)}</h3><span className="tag">{item.recommendation_type||"optimization"}</span></div><p>{(item.reasons||[]).join("; ")||"Optimization opportunity identified from available evidence."}</p><div className="rec-meta"><span>{item.service||"Resource"}</span><span>{item.environment||"—"}</span><span>Evidence: {item.evidence_quality||"Needs validation"}</span></div><button className="text-button" onClick={()=>setOpen(v=>!v)}>{open?"Hide details":"Why? Show evidence & next step"}</button>{open&&<div className="rec-detail"><b>Evidence</b><ul>{(item.evidence||item.reasons||[]).map((x,i)=><li key={i}>{x}</li>)}</ul><b>Next step</b><p>{item.next_action||item.action||"Validate the recommendation against the current workload and change policy."}</p><b>Guardrail</b><p>Human approval required. CloudSense does not execute infrastructure changes.</p></div>}</div><div className="rec-saving"><span>Potential</span><b>{fmt(item.estimated_monthly_saving)}</b><small>{item.estimated_monthly_saving==null?"":"/ month"}</small></div></article>}
function ResourceDetail({resource,onClose}){return <div className="drawer-backdrop" onClick={onClose}><aside className="resource-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">RESOURCE DETAIL</span><h2>{resource.resource_id||"Resource"}</h2></div><button className="icon-button" onClick={onClose}><X size={16}/></button></div><div className="detail-grid">{[["Service",resource.service],["Type",resource.resource_type],["Region",resource.region],["Environment",resource.environment],["State",resource.state],["Monthly cost",resource.monthly_cost==null?"—":money(resource.monthly_cost)],["CPU",resource.cpu_utilization==null?"—":percent(resource.cpu_utilization)],["Memory",resource.memory_utilization==null?"—":percent(resource.memory_utilization)]].map(([k,v])=><div key={k}><span>{k}</span><b>{v||"—"}</b></div>)}</div><div className="callout"><b>Decision support</b><p>Validate workload, dependencies, owner and rollback plan before any production change.</p></div></aside></div>}
function recommendationTitle(item){const t=item.recommendation_type;if(t==="right_sizing")return `Right-size ${item.resource_id}`;if(t==="rds_right_sizing")return `Right-size RDS ${item.resource_id}`;if(t==="scheduling")return `Schedule ${item.resource_id}`;if(t==="storage_cleanup")return `Clean up EBS ${item.resource_id}`;if(t==="nat_optimization")return `Optimize NAT Gateway ${item.resource_id}`;if(t==="s3_lifecycle")return `Optimize S3 lifecycle ${item.resource_id}`;if(t==="lambda_optimization")return `Optimize Lambda ${item.resource_id}`;if(t==="cloudfront_optimization")return `Optimize CloudFront ${item.resource_id}`;return `Optimize ${item.service||"resource"} ${item.resource_id}`;}

function Review({data,aws,selected,selectedSaving,current,back}){
  const projected=Math.max(0,current-selectedSaving); const reduction=current?selectedSaving/current*100:0; const cur=aws?.connected?"$":"₹"; const fmt=(v)=>`${cur}${number(v).toLocaleString(aws?.connected?"en-US":"en-IN",{maximumFractionDigits:2})}`;
  const exportReview=()=>{
    const rows=selected.map((x,i)=>[i+1,x.resource_id||"—",x.service||x.resource_type||"—",recommendationTitle(x),(x.reasons||[]).join("; ")||x.action||"Validate recommendation",x.estimated_monthly_saving==null?"Estimate unavailable":`${fmt(x.estimated_monthly_saving)}/mo`]);
    const nextSteps=["Validate each recommendation against the AWS console, current workload and peak traffic.","For EC2/RDS right-sizing, compare compatible instance classes and test before production change.","For NAT Gateway, review traffic, cross-AZ routing and VPC endpoints; do not use CPU/memory as the decision signal.","For EBS cleanup, confirm attachment/dependencies, retention and backup requirements before deletion.","For S3/Lambda/CloudFront, validate lifecycle, duration/memory, cache-hit and origin-transfer evidence respectively.","Confirm owner, maintenance window, dependencies and rollback plan.","Obtain human approval through the normal change-management process.","Implement only approved changes using AWS operational controls.","Re-collect billing and utilization data and compare actual savings with this scenario."];
    openPrintableReport({title:"CloudSense AI — Savings Review",subtitle:`Generated ${new Date().toLocaleString()} · Human approval required before implementation`,summaryCards:[{label:"Current monthly",value:fmt(current),sub:"Current run-rate"},{label:"Selected savings",value:`${fmt(selectedSaving)}/mo`,sub:`${percent(reduction)} potential reduction`},{label:"Projected run-rate",value:fmt(projected),sub:"Analytical scenario"},{label:"Selected actions",value:String(selected.length),sub:"Pending human review"}],sections:[{title:"Selected optimization actions",html:tableHtml(["#","Resource","Service","Recommendation","Evidence / rationale","Estimated saving"],rows)},{title:"Next steps",html:nextSteps.map((x,i)=>`<div class="step"><div class="num">${i+1}</div><div>${escapeHtml(x)}</div></div>`).join("")},{title:"Approval guardrail",html:`<div class="callout warning"><b>Simulation only.</b> The projected run-rate is a scenario based on selected recommendations. CloudSense does not execute AWS infrastructure changes and does not represent estimated savings as realized savings.</div>`}]});
  };
  return <><PageHead eyebrow="SAVINGS REVIEW" title="Turn recommendations into a reviewable plan" description="Compare the current run-rate with the selected optimization scenario. Export a management-ready PDF with evidence and next steps." actions={<button className="primary" onClick={exportReview}><Download size={14}/> Export PDF</button>}/><div className="stats-grid"><StatCard icon={CircleDollarSign} label="Current monthly" value={aws?.connected?fmt(current):lakhs(current)} sub="Current run-rate"/><StatCard icon={Zap} label="Selected savings" value={aws?.connected?fmt(selectedSaving):lakhs(selectedSaving)} sub={`${percent(reduction)} potential reduction`} tone="positive"/><StatCard icon={BarChart3} label="Projected monthly" value={aws?.connected?fmt(projected):lakhs(projected)} sub="Analytical scenario"/><StatCard icon={FileCheck2} label="Selected items" value={selected.length} sub={`of ${data?.plan?.recommendations?.length||0}`}/></div><Panel title="Before vs projected" subtitle="No AWS changes are executed" icon={SlidersHorizontal}><div className="compare-grid"><div><span>Current</span><strong>{aws?.connected?fmt(current):money(current)}</strong><div className="compare-track"><i style={{width:"100%"}}/></div></div><ArrowRight size={18}/><div><span>Projected</span><strong>{aws?.connected?fmt(projected):money(projected)}</strong><div className="compare-track"><i style={{width:`${current?Math.max(4,projected/current*100):4}%`}}/></div></div></div></Panel><Panel title="Selected recommendations" subtitle="Ready for human review" icon={ShieldCheck}>{selected.length?selected.map((item,i)=><div className="review-row" key={i}><span>{i+1}</span><div><b>{recommendationTitle(item)}</b><small>{item.service||"Resource"} · {item.environment||"—"}</small></div><strong>{aws?.connected?fmt(item.estimated_monthly_saving):money(item.estimated_monthly_saving)}/mo</strong></div>):<Empty text="No recommendations selected."/>}</Panel><div className="approval-banner"><ShieldCheck size={18}/><div><b>Simulation only</b><span>CloudSense never claims that an AWS change has been executed. Final infrastructure changes remain under human approval.</span></div></div><div className="workflow-actions"><button className="secondary" onClick={back}><ArrowLeft size={14}/> Back to optimization</button><button className="primary" onClick={exportReview}><Download size={14}/> Export PDF</button></div></>}

function Simulator({data}){const recs=data?.plan?.recommendations||[]; const [base,setBase]=useState(number(data?.summary?.total_monthly_cost)); const [saving,setSaving]=useState(recs.slice(0,3).reduce((s,r)=>s+number(r.estimated_monthly_saving),0)); useEffect(()=>setBase(number(data?.summary?.total_monthly_cost)),[data]); const projected=Math.max(0,base-saving); return <><PageHead eyebrow="SCENARIO PLANNING" title="What-if savings simulator" description="Change the scenario assumptions without changing AWS. Use this view to discuss business impact before approval."/><div className="simulator-layout"><Panel title="Scenario assumptions" subtitle="Adjust the simulated monthly values" icon={SlidersHorizontal}><Field label="Current monthly cost"><input type="number" value={base} onChange={e=>setBase(number(e.target.value))}/></Field><Field label="Potential savings"><input type="number" value={saving} onChange={e=>setSaving(Math.max(0,number(e.target.value)))}/></Field><div className="slider-block"><div><span>Optimization intensity</span><b>{base?Math.min(100,saving/base*100).toFixed(1):0}%</b></div><input type="range" min="0" max={Math.max(base,1)} value={Math.min(saving,Math.max(base,1))} onChange={e=>setSaving(number(e.target.value))}/></div></Panel><div className="scenario-result"><div><span>Current run-rate</span><strong>{money(base)}</strong></div><div className="scenario-arrow"><ArrowRight/></div><div><span>Projected run-rate</span><strong>{aws?.connected?fmt(projected):money(projected)}</strong></div><div className="scenario-saving"><span>Potential reduction</span><b>{money(saving)}</b><small>{base?percent(saving/base*100):"0%"}</small></div></div></div><Panel title="Included opportunities" subtitle="Based on current optimization recommendations" icon={Zap}>{recs.slice(0,12).map((r,i)=><div className="simple-list" key={i}><span>{recommendationTitle(r)}</span><b>{money(r.estimated_monthly_saving)}/mo</b></div>)}</Panel><div className="simulation-note"><ShieldCheck size={16}/><span>This is a planning model. It does not call AWS APIs to change, resize, stop, delete or purchase anything.</span></div></>}

function PolicyCenter({policies}){const [query,setQuery]=useState(""); const filtered=policies.filter(p=>!query||`${p.name} ${p.text}`.toLowerCase().includes(query.toLowerCase())); return <><PageHead eyebrow="GOVERNANCE" title="Policy Center" description="Reference the documents that ground CloudSense recommendations and production-change guidance."/><div className="policy-toolbar"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search policies…"/></div><span>{filtered.length} documents</span></div><div className="policy-grid">{filtered.map((p,i)=><article className="policy-card" key={i}><div className="policy-icon"><FileText size={18}/></div><div><h3>{p.name||`Policy ${i+1}`}</h3><p>{(p.text||"").slice(0,260)}{(p.text||"").length>260?"…":""}</p><span>Available to RAG retrieval</span></div></article>)}{!filtered.length&&<Empty text="No matching policy documents."/>}</div></>}

function EvaluationPage({evaluation,setEvaluation}){const [busy,setBusy]=useState(false); const run=async()=>{setBusy(true);try{setEvaluation(await api("/api/evaluation/run",{method:"POST"}))}catch(e){setEvaluation({error:e.message})}finally{setBusy(false)}}; return <><PageHead eyebrow="AI GOVERNANCE" title="GenAI evaluation & guardrails" description="Measure grounding, tool selection and response quality without exposing internal agent reasoning." actions={<button className="primary" onClick={run} disabled={busy}>{busy?<RefreshCw className="spin" size={14}/>:<Activity size={14}/>} {busy?"Running…":"Run evaluation"}</button>}/>{evaluation?<EvaluationPanel data={evaluation}/>:<div className="evaluation-empty"><BrainCircuit size={32}/><h2>Evaluate CloudSense AI</h2><p>Run the evaluation suite to measure grounding, tool selection, completeness and safety across representative questions.</p><button className="primary" onClick={run}>Run AI evaluation</button></div>}</>}
function EvaluationPanel({data}){if(data?.error)return <div className="alert error"><AlertCircle size={15}/>{data.error}</div>; const score=number(data?.average_score); return <div className="eval-page"><div className="eval-score"><div><span>Overall quality</span><strong>{score.toFixed(0)}<small>/100</small></strong></div><div className="score-ring"><span>{number(data?.passed_count)}/{number(data?.case_count)}</span><small>passed</small></div></div><div className="grid-2"><Panel title="Quality dimensions" subtitle="Evaluation signals" icon={Gauge}><EvalBar label="Grounding" value={data?.grounding_average}/><EvalBar label="Tool selection" value={data?.tool_selection_average}/><EvalBar label="Safety" value={data?.safety_average||score}/><EvalBar label="Completeness" value={data?.completeness_average||score}/></Panel><Panel title="Test cases" subtitle="Representative questions" icon={FileCheck2}><div className="eval-cases">{(data?.results||[]).map(x=><div className="eval-case" key={x.id}><span className={`eval-dot ${x.passed?"pass":"fail"}`}>{x.passed?"✓":"!"}</span><div><b>{x.id}</b><small>{x.question}</small></div><strong>{number(x.score).toFixed(0)}</strong></div>)}</div></Panel></div></div>}
function EvalBar({label,value}){return <div className="eval-bar"><div><span>{label}</span><b>{number(value).toFixed(0)}%</b></div><div className="progress"><i style={{width:`${Math.max(0,Math.min(100,number(value)))}%`}}/></div></div>}

function MarkdownMessage({text}){
  const escape=(v)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline=(v)=>{
    let x=escape(v);
    x=x.replace(/`([^`]+)`/g,'<code>$1</code>');
    x=x.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    x=x.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    x=x.replace(/\*([^*]+)\*/g,'<em>$1</em>');
    return {__html:x};
  };
  const lines=String(text||"").replace(/\r/g,"").split("\n");
  const blocks=[]; let list=null;
  const flush=()=>{if(list){blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>);list=null;}};
  lines.forEach((line,idx)=>{
    const t=line.trim();
    if(!t){flush();return;}
    if(/^#{1,3}\s+/.test(t)){flush();const title=t.replace(/^#{1,3}\s+/,"");blocks.push(<h4 key={idx} dangerouslySetInnerHTML={inline(title)}/>);return;}
    if(/^[-*]\s+/.test(t)){if(!list)list=[];list.push(<li key={idx} dangerouslySetInnerHTML={inline(t.replace(/^[-*]\s+/,""))}/>);return;}
    if(/^\d+[.)]\s+/.test(t)){if(!list)list=[];list.push(<li key={idx} dangerouslySetInnerHTML={inline(t.replace(/^\d+[.)]\s+/,""))}/>);return;}
    if(/^>\s?/.test(t)){flush();blocks.push(<div className="chat-callout" key={idx} dangerouslySetInnerHTML={inline(t.replace(/^>\s?/,""))}/>);return;}
    flush();blocks.push(<p key={idx} dangerouslySetInnerHTML={inline(t)}/>);
  });
  flush();
  return <div className="markdown-message">{blocks}</div>;
}

function Chat(){
  const [open,setOpen]=useState(false),[question,setQuestion]=useState(""),[messages,setMessages]=useState([]),[busy,setBusy]=useState(false);
  const quick=["What is driving my AWS cost?","Which resources need attention?","Show my biggest savings opportunities?","How is my cost attributed to users?"];
  const send=async(v=question)=>{const text=v.trim();if(!text||busy)return;setMessages(m=>[...m,{role:"user",text}]);setQuestion("");setBusy(true);try{const r=await api("/api/genai/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:text})});setMessages(m=>[...m,{role:"ai",text:r.answer}] )}catch(e){setMessages(m=>[...m,{role:"ai",error:true,text:`AI pipeline unavailable. ${e.message||"The required GenAI/RAG/ML components did not complete."}`}])}finally{setBusy(false)}};
  if(!open)return <button className="chat-fab" onClick={()=>setOpen(true)}><Sparkles size={16}/> Ask CloudSense AI</button>;
  return <aside className="chat"><div className="chat-head"><div className="chat-avatar"><Sparkles size={14}/></div><div><b>CloudSense AI</b><small>Grounded in current CloudSense data</small></div><button onClick={()=>setOpen(false)}><X size={15}/></button></div><div className="chat-body">{!messages.length&&<div className="chat-welcome"><Sparkles size={20}/><h3>Ask about your cloud costs</h3><p>CloudSense explains findings using billing, resource, utilization and AWS knowledge evidence.</p></div>}{messages.map((m,i)=><div className={`message ${m.role}${m.error?" error-message":""}`} key={i}><span>{m.role==="ai"?<><Sparkles size={11}/> CloudSense AI</>:"You"}</span>{m.role==="ai"?<MarkdownMessage text={m.text}/>:<p>{m.text}</p>}</div>)}{busy&&<div className="ai-working"><RefreshCw className="spin" size={12}/> Analyzing your CloudSense data…</div>}<div className="quick">{quick.map(q=><button key={q} onClick={()=>send(q)} disabled={busy}>{q}</button>)}</div></div><div className="chat-input"><input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask CloudSense…"/><button onClick={()=>send()} disabled={busy||!question.trim()}><Send size={14}/></button></div></aside>
}
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("CloudSense root element not found");
createRoot(rootElement).render(<App />);
