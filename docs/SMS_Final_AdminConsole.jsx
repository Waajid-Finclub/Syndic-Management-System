import { useState } from "react";

const O={bg:"#0B1121",srf:"#111827",card:"#1E293B",card2:"#283548",brd:"#1E293B",brdL:"#334155",cyan:"#38BDF8",cyanD:"#0284C7",cyanP:"rgba(56,189,248,.08)",teal:"#14B8A6",tealP:"rgba(20,184,166,.08)",navy:"#1E40AF",navyL:"#3B82F6",grn:"#34D399",grnP:"rgba(52,211,153,.08)",amb:"#FBBF24",ambP:"rgba(251,191,36,.08)",red:"#F87171",redP:"rgba(248,113,113,.08)",vio:"#A78BFA",vioP:"rgba(167,139,250,.08)",t1:"#F1F5F9",t2:"#94A3B8",t3:"#64748B"};
const ff=`'DM Sans','Avenir Next',-apple-system,sans-serif`;
const fm=`'JetBrains Mono','SF Mono',monospace`;

const Pill=({children,c=O.cyan,bg:b})=><span style={{background:b||`${c}16`,color:c,padding:"3px 10px",borderRadius:100,fontSize:10,fontWeight:700,letterSpacing:.3,fontFamily:ff}}>{children}</span>;
const IC=({e,s=28,bg=O.cyanP})=><div style={{width:s,height:s,borderRadius:s*.28,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:s*.4,flexShrink:0}}>{e}</div>;
const Btn=({children,primary,small,c=O.cyan,outline,full})=><button style={{padding:small?"7px 14px":"11px 20px",borderRadius:10,border:primary?"none":outline?`1.5px solid ${c}`:`1.5px solid ${O.brdL}`,background:primary?c:outline?`${c}08`:O.card,color:primary?"#000":outline?c:O.t2,fontSize:small?11:13,fontWeight:700,fontFamily:ff,cursor:"pointer",boxShadow:primary?`0 4px 14px ${c}25`:"none",width:full?"100%":"auto"}}>{children}</button>;
const Toggle=({on})=><div style={{width:40,height:22,borderRadius:11,background:on?O.teal:O.brdL,padding:2,cursor:"pointer"}}><div style={{width:18,height:18,borderRadius:9,background:"#FFF",transform:on?"translateX(18px)":"translateX(0)",transition:"transform 0.2s"}}/></div>;
const TH=({cols})=><div style={{display:"flex",padding:"10px 14px",background:O.card2,borderBottom:`1px solid ${O.brdL}`}}>{cols.map((c,i)=><div key={i} style={{flex:c.f||1,fontSize:9,fontWeight:700,color:O.t3,letterSpacing:.7,textTransform:"uppercase",fontFamily:ff}}>{c.l}</div>)}</div>;
const TR=({cells,cols})=><div style={{display:"flex",padding:"10px 14px",borderBottom:`1px solid ${O.brd}08`,cursor:"pointer",transition:"background 0.1s"}} onMouseOver={e=>e.currentTarget.style.background=O.card2} onMouseOut={e=>e.currentTarget.style.background="transparent"}>{cells.map((c,i)=><div key={i} style={{flex:cols[i]?.f||1,fontSize:11,color:typeof c==="string"?O.t1:undefined,fontWeight:i===0?600:400,fontFamily:ff,display:"flex",alignItems:"center"}}>{c}</div>)}</div>;
const KPI=({icon,l,v,trend,c=O.cyan,sub})=>(
  <div style={{background:O.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${O.brd}`,flex:1,minWidth:100}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><IC e={icon} s={26} bg={`${c}12`}/>{trend!=null&&<span style={{fontSize:8,fontWeight:700,color:trend>=0?O.grn:O.red,background:trend>=0?O.grnP:O.redP,padding:"2px 6px",borderRadius:6,fontFamily:ff}}>{trend>=0?"+":""}{trend}%</span>}</div>
    <div style={{fontSize:18,fontWeight:900,color:c,letterSpacing:-.5,fontFamily:ff}}>{v}</div>
    <div style={{fontSize:9,color:O.t3,marginTop:2,fontFamily:ff}}>{l}</div>
    {sub&&<div style={{fontSize:8,color:O.t2,marginTop:1,fontFamily:ff}}>{sub}</div>}
  </div>
);
const Card=({children,title,actions})=>(
  <div style={{background:O.card,borderRadius:14,padding:16,border:`1px solid ${O.brd}`,marginBottom:12}}>
    {(title||actions)&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>{title&&<div style={{fontSize:13,fontWeight:800,color:O.t1,fontFamily:ff}}>{title}</div>}{actions}</div>}
    {children}
  </div>
);
const Tabs=({items,active,onChange})=><div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>{items.map((t,i)=><button key={i} onClick={()=>onChange(i)} style={{padding:"5px 10px",borderRadius:100,border:`1.5px solid ${active===i?O.cyan:O.brdL}`,background:active===i?O.cyanP:"transparent",color:active===i?O.cyan:O.t3,fontSize:10,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>{t}</button>)}</div>;

// ── SIDEBAR ──
const Sidebar=({active,nav})=>{
  const g=[
    {g:"PLATFORM",items:[{id:"dash",i:"📊",l:"Overview"},{id:"tenants",i:"🏢",l:"Client Properties"},{id:"onboard",i:"🚀",l:"Onboarding"}]},
    {g:"ADMINISTRATION",items:[{id:"users",i:"👥",l:"Users & Roles"},{id:"subs",i:"💳",l:"Subscriptions"},{id:"flags",i:"🚩",l:"Feature Flags"}]},
    {g:"SYSTEM",items:[{id:"health",i:"🖥",l:"System Monitoring"},{id:"audit",i:"📝",l:"Audit Log"},{id:"whatsapp",i:"💬",l:"WhatsApp Status"},{id:"api",i:"🔗",l:"API & Integrations"}]},
  ];
  return(<div style={{width:222,background:O.srf,borderRight:`1px solid ${O.brd}`,padding:"14px 8px",flexShrink:0,display:"flex",flexDirection:"column"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px",marginBottom:22}}>
      <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${O.cyan},${O.teal})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⚙️</div>
      <div><div style={{fontSize:13,fontWeight:800,color:O.t1,fontFamily:ff}}>SyndicMS</div><div style={{fontSize:8,color:O.cyan,fontWeight:800,fontFamily:ff,letterSpacing:.5}}>ADMIN CONSOLE</div></div>
    </div>
    {g.map((gr,gi)=><div key={gi} style={{marginBottom:12}}>
      <div style={{fontSize:7,fontWeight:700,color:O.t3,letterSpacing:1.5,padding:"4px 12px",fontFamily:ff}}>{gr.g}</div>
      {gr.items.map(it=><button key={it.id} onClick={()=>nav(it.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",marginBottom:1,background:active===it.id?O.cyanP:"transparent",border:"none",borderRadius:8,cursor:"pointer",borderLeft:active===it.id?`3px solid ${O.cyan}`:"3px solid transparent"}}>
        <span style={{fontSize:13,opacity:active===it.id?1:.4}}>{it.i}</span><span style={{fontSize:11,fontWeight:active===it.id?700:500,color:active===it.id?O.cyan:O.t3,fontFamily:ff}}>{it.l}</span>
      </button>)}
    </div>)}
    <div style={{marginTop:"auto",padding:"8px"}}><div style={{background:O.redP,borderRadius:10,padding:8,border:`1px solid rgba(248,113,113,.1)`}}>
      <div style={{fontSize:8,fontWeight:700,color:O.red,fontFamily:ff}}>🔒 RESTRICTED ACCESS</div>
      <div style={{fontSize:7,color:O.t3,fontFamily:ff,marginTop:2,lineHeight:1.4}}>All actions logged • MySQL 8.0+</div>
    </div></div>
  </div>);
};
const TopBar=()=>(
  <div style={{height:50,background:O.srf,borderBottom:`1px solid ${O.brd}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px"}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}><Pill c={O.red} bg={O.redP}>SUPER ADMIN</Pill>
      <div style={{background:O.card,border:`1px solid ${O.brd}`,borderRadius:8,padding:"5px 10px",width:180}}><span style={{fontSize:10,color:O.t3,fontFamily:ff}}>🔍 Search...</span></div></div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:6,height:6,borderRadius:3,background:O.grn}}/><span style={{fontSize:9,color:O.grn,fontWeight:600,fontFamily:ff}}>Operational</span></div>
      <div style={{background:O.grnP,padding:"2px 6px",borderRadius:5,fontSize:8,color:O.grn,fontWeight:700,fontFamily:ff}}>💬 WA OK</div>
      <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${O.cyan},${O.teal})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#000",fontFamily:ff}}>SA</div>
    </div>
  </div>
);

// ════════════════════════════════════════
// ALL 10 SCREENS
// ════════════════════════════════════════

// ── 1. PLATFORM OVERVIEW ──
const DashView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div><div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Platform Overview</div><div style={{fontSize:10,color:O.t3,fontFamily:ff}}>SyndicMS SaaS • March 2026 • MySQL 8.0+</div></div>
      <div style={{display:"flex",gap:5}}><Btn small>📅 This Month</Btn><Btn small primary>⬇️ Report</Btn></div>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <KPI icon="🏢" l="Properties" v="127" trend={8} c={O.navyL}/>
      <KPI icon="🏠" l="Units" v="8,420" trend={12} c={O.teal}/>
      <KPI icon="🅿️" l="Parking" v="3,200" c={O.navyL} sub="640 EV"/>
      <KPI icon="👥" l="Users" v="6,891" trend={15} c={O.navyL}/>
      <KPI icon="💰" l="MRR" v="Rs 2.1M" trend={18} c={O.cyan}/>
      <KPI icon="🟢" l="Uptime" v="99.97%" c={O.grn}/>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      {[{l:"Subscription Rev.",v:"Rs 1.85M",c:O.cyan,sub:"Basic 15 • Silver 72 • Premium 40"},{l:"WhatsApp Msgs",v:"42,300",c:O.grn,sub:"94% delivery rate"},{l:"Setup Fees",v:"Rs 0",c:O.t3,sub:"Free first 2 years"},{l:"EV Commission",v:"Rs 45K",c:O.teal,sub:"5% platform share"}].map((m,i)=>
        <div key={i} style={{flex:1,background:O.card,borderRadius:10,padding:"10px 12px",border:`1px solid ${O.brd}`}}>
          <div style={{fontSize:8,color:O.t3,fontWeight:700,letterSpacing:.5,fontFamily:ff,textTransform:"uppercase"}}>{m.l}</div>
          <div style={{fontSize:16,fontWeight:900,color:m.c,fontFamily:ff,marginTop:3}}>{m.v}</div>
          <div style={{fontSize:7,color:O.t2,fontFamily:ff,marginTop:1}}>{m.sub}</div>
        </div>
      )}
    </div>
    <div style={{display:"flex",gap:10}}>
      <Card title="Revenue Growth (12 mo)">
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:90}}>
          {[1.2,1.3,1.4,1.5,1.5,1.6,1.7,1.8,1.8,1.9,2.0,2.1].map((v,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{width:"70%",height:`${(v/2.3)*90}%`,background:i===11?`linear-gradient(180deg,${O.cyan},${O.cyanD})`:`${O.navyL}35`,borderRadius:"3px 3px 0 0",minHeight:6}}/>
            <span style={{fontSize:6,color:O.t3,fontFamily:fm}}>{"JFMAMJJASOND"[i]}</span>
          </div>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}><span style={{fontSize:8,color:O.t3}}>Rs 1.2M</span><span style={{fontSize:8,fontWeight:800,color:O.cyan}}>Rs 2.1M ↑75%</span></div>
      </Card>
      <Card title="Onboarding Pipeline">
        {[{s:"Prospect",n:5,c:O.t3},{s:"Contracted",n:3,c:O.navyL},{s:"Setup",n:4,c:O.cyan},{s:"Data Import",n:2,c:O.amb},{s:"UAT",n:3,c:O.vio},{s:"Go-Live",n:1,c:O.grn}].map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${O.brd}08`}}>
          <div style={{width:6,height:6,borderRadius:3,background:p.c}}/><span style={{flex:1,fontSize:10,color:O.t2,fontFamily:ff}}>{p.s}</span><span style={{fontSize:13,fontWeight:900,color:p.c,fontFamily:ff}}>{p.n}</span>
        </div>)}
      </Card>
    </div>
    <Card title="Client Properties" actions={<Btn small>View All 127</Btn>}>
      <div style={{borderRadius:10,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
        <TH cols={[{l:"Property"},{l:"Syndic"},{l:"Plan",f:.5},{l:"Units",f:.3},{l:"Parking",f:.3},{l:"Status",f:.5},{l:"MRR",f:.5},{l:"WA",f:.3}]}/>
        {[["Les Palmiers","Mr Soobrayen",<Pill c={O.grn}>PREMIUM</Pill>,"60","48",<Pill c={O.grn}>ACTIVE</Pill>,"Rs 18K","✓"],
          ["Palm Grove","Mr Doobary",<Pill c={O.navyL}>SILVER</Pill>,"120","80",<Pill c={O.grn}>ACTIVE</Pill>,"Rs 21K","✓"],
          ["Harbour View","Mrs Doorgakant",<Pill c={O.navyL}>SILVER</Pill>,"45","30",<Pill c={O.cyan}>TRIAL</Pill>,"Rs 7.9K","✓"],
          ["Sunset Villas","Mr Doobary",<Pill c={O.t3}>BASIC</Pill>,"24","12",<Pill c={O.navyL}>SETUP</Pill>,"Rs 2.4K","—"],
          ["Grand Baie Twrs","Mrs Doorgakant",<Pill c={O.grn}>PREMIUM</Pill>,"180","120",<Pill c={O.vio}>UAT</Pill>,"Rs 45K","—"],
        ].map((r,i)=><TR key={i} cells={r} cols={[{},{},{f:.5},{f:.3},{f:.3},{f:.5},{f:.5},{f:.3}]}/>)}
      </div>
    </Card>
  </div>
);

// ── 2. CLIENT PROPERTIES ──
const TenantsView=()=>{
  const [tab,setTab]=useState(0);
  return(<div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Client Properties</div>
      <div style={{display:"flex",gap:5}}><Btn small>📤 Export</Btn><Btn small primary>+ Add Client</Btn></div>
    </div>
    <Tabs items={["All (127)","Active (98)","Trial (12)","Setup (8)","UAT (6)","Suspended (3)"]} active={tab} onChange={setTab}/>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      {[{l:"Total Properties",v:"127",c:O.cyan},{l:"Total Units",v:"8,420",c:O.teal},{l:"Total Parking",v:"3,200",c:O.navyL},{l:"Total Storage",v:"1,850",c:O.amb},{l:"Avg Units/Dev",v:"66",c:O.t2}].map((s,i)=>
        <div key={i} style={{flex:1,background:O.card,borderRadius:10,padding:"10px",border:`1px solid ${O.brd}`,textAlign:"center"}}>
          <div style={{fontSize:16,fontWeight:900,color:s.c,fontFamily:ff}}>{s.v}</div><div style={{fontSize:7,color:O.t3,fontFamily:ff}}>{s.l}</div>
        </div>
      )}
    </div>
    <div style={{background:O.card,borderRadius:12,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
      <TH cols={[{l:"Property"},{l:"Location"},{l:"Syndic"},{l:"Plan",f:.5},{l:"Units",f:.3},{l:"Parking",f:.3},{l:"Stores",f:.3},{l:"Facilities",f:.3},{l:"Users",f:.3},{l:"Status",f:.5},{l:"MRR",f:.5},{l:"Since",f:.5}]}/>
      {[["Les Palmiers Res.","Moka","Mr Soobrayen",<Pill c={O.grn}>PRE</Pill>,"60","48","30","3","62",<Pill c={O.grn}>ACTIVE</Pill>,"Rs 18K","Jan 25"],
        ["Palm Grove Estate","Curepipe","Mr Doobary",<Pill c={O.navyL}>SIL</Pill>,"120","80","45","2","135",<Pill c={O.grn}>ACTIVE</Pill>,"Rs 21K","Mar 25"],
        ["Harbour View","Port Louis","Mrs Doorgakant",<Pill c={O.navyL}>SIL</Pill>,"45","30","12","1","48",<Pill c={O.cyan}>TRIAL</Pill>,"Rs 7.9K","Feb 26"],
        ["Sunset Villas","Flic-en-Flac","Mr Doobary",<Pill c={O.t3}>BAS</Pill>,"24","12","8","0","0",<Pill c={O.navyL}>SETUP</Pill>,"Rs 2.4K","—"],
        ["Grand Baie Towers","Grand Baie","Mrs Doorgakant",<Pill c={O.grn}>PRE</Pill>,"180","120","60","3","0",<Pill c={O.vio}>UAT</Pill>,"Rs 45K","—"],
        ["Tamarin Bay","Tamarin","Mr Jugnauth",<Pill c={O.navyL}>SIL</Pill>,"90","60","30","2","95",<Pill c={O.grn}>ACTIVE</Pill>,"Rs 15.8K","Jun 25"],
      ].map((r,i)=><TR key={i} cells={r} cols={[{},{},{},{f:.5},{f:.3},{f:.3},{f:.3},{f:.3},{f:.3},{f:.5},{f:.5},{f:.5}]}/>)}
    </div>
  </div>);
};

// ── 3. ONBOARDING ──
const OnboardView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Onboarding Workflow</div>
      <Btn small primary>+ New Client Onboarding</Btn>
    </div>
    <div style={{background:O.grnP,borderRadius:12,padding:"10px 14px",marginBottom:14,border:`1px solid rgba(52,211,153,.12)`}}>
      <div style={{fontSize:12,fontWeight:800,color:O.grn,fontFamily:ff}}>🎉 Setup Fee: FREE until March 2028</div>
      <div style={{fontSize:9,color:O.t2,fontFamily:ff}}>After: MUR 5,000 + VAT one-time onboarding fee</div>
    </div>
    {[{name:"Sunset Villas",stage:"Setup In Progress",pct:45,steps:[{s:"Contract Signed",done:true},{s:"Property Data Entry",done:true},{s:"Unit/Parking/Storage Setup",done:false,current:true},{s:"Co-Owner Import",done:false},{s:"Billing Config",done:false},{s:"WhatsApp Templates",done:false},{s:"UAT Testing",done:false},{s:"Go-Live",done:false}]},
      {name:"Grand Baie Towers",stage:"UAT Testing",pct:85,steps:[{s:"Contract Signed",done:true},{s:"Property Data Entry",done:true},{s:"Unit/Parking/Storage Setup",done:true},{s:"Co-Owner Import",done:true},{s:"Billing Config",done:true},{s:"WhatsApp Templates",done:true},{s:"UAT Testing",done:false,current:true},{s:"Go-Live",done:false}]},
    ].map((client,ci)=><Card key={ci} title={`🏢 ${client.name}`} actions={<Pill c={O.cyan}>{client.stage}</Pill>}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{flex:1,height:6,background:`${O.brdL}`,borderRadius:3}}><div style={{width:`${client.pct}%`,height:"100%",background:`linear-gradient(90deg,${O.cyan},${O.teal})`,borderRadius:3}}/></div>
        <span style={{fontSize:11,fontWeight:800,color:O.cyan,fontFamily:ff}}>{client.pct}%</span>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {client.steps.map((st,si)=><div key={si} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:8,background:st.done?O.grnP:st.current?O.cyanP:`${O.brdL}20`,border:`1px solid ${st.done?`rgba(52,211,153,.15)`:st.current?`rgba(56,189,248,.15)`:`${O.brd}20`}`}}>
          <span style={{fontSize:10,color:st.done?O.grn:st.current?O.cyan:O.t3}}>{st.done?"✓":st.current?"◉":"○"}</span>
          <span style={{fontSize:9,color:st.done?O.grn:st.current?O.cyan:O.t3,fontWeight:st.current?700:500,fontFamily:ff}}>{st.s}</span>
        </div>)}
      </div>
    </Card>)}
    <Card title="Onboarding Checklist Template">
      {["1. Contract signing & plan selection","2. Development metadata (name, address, GPS, type, financial year)","3. Building structure (blocks, floors)","4. Unit registry (number, type, area, shares)","5. Parking bays (owner, rental, EV, visitor pool)","6. Storage units (owner, rental, common pool)","7. Facilities setup (pool, gym, hall — hours, rules, booking)","8. Co-owner import (CSV: name, email, phone, unit, shares)","9. Billing rules (charge per unit/share, billing day, penalties)","10. WhatsApp Business: phone registration + template approval","11. Payment gateway configuration (card, bank, Juice)","12. Document upload (rules, insurance, contracts)","13. UAT testing (billing cycle, payments, notifications)","14. Training session (syndic manager)","15. Go-live + monitoring period (2 weeks)"].map((step,i)=><div key={i} style={{display:"flex",gap:6,padding:"4px 0",borderBottom:`1px solid ${O.brd}08`}}>
        <span style={{fontSize:9,color:O.t3,fontFamily:ff}}>{step}</span>
      </div>)}
    </Card>
  </div>
);

// ── 4. USERS & ROLES ──
const UsersView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Users & Access Rights</div>
      <div style={{display:"flex",gap:5}}><Btn small>📤 Import</Btn><Btn small primary>+ Create User</Btn></div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[{r:"Super Admin",n:2,c:O.red},{r:"Platform Admin",n:3,c:O.cyan},{r:"Syndic Manager",n:98,c:O.navyL},{r:"Finance Officer",n:12,c:O.amb},{r:"Co-Owner",n:6420,c:O.grn},{r:"Tenant",n:280,c:O.teal},{r:"Contractor",n:342,c:O.amb},{r:"Auditor",n:12,c:O.t3}].map((role,i)=>
        <div key={i} style={{flex:1,background:O.card,borderRadius:8,padding:8,border:`1px solid ${O.brd}`,textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:900,color:role.c,fontFamily:ff}}>{role.n}</div><div style={{fontSize:7,color:O.t3,fontFamily:ff,marginTop:1}}>{role.r}</div>
        </div>
      )}
    </div>
    <div style={{background:O.card,borderRadius:12,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
      <TH cols={[{l:"Name"},{l:"Email"},{l:"Role",f:.7},{l:"Property"},{l:"Status",f:.4},{l:"Last Login",f:.5},{l:"MFA",f:.3},{l:"WA",f:.3}]}/>
      {[["Platform Admin","admin@syndicms.mu",<Pill c={O.red}>SUPER ADMIN</Pill>,"All",<Pill c={O.grn}>ACTIVE</Pill>,"Today","✓","N/A"],
        ["Mr Soobrayen","soobrayen@syndic.mu",<Pill c={O.navyL}>SYNDIC MGR</Pill>,"Les Palmiers",<Pill c={O.grn}>ACTIVE</Pill>,"Today","✓","✓"],
        ["Mrs Finance","fin@syndic.mu",<Pill c={O.amb}>FINANCE</Pill>,"Les Palmiers",<Pill c={O.grn}>ACTIVE</Pill>,"Yesterday","✓","✓"],
        ["R. Moonien","rajesh@email.com",<Pill c={O.grn}>CO-OWNER</Pill>,"Palmiers 4B",<Pill c={O.grn}>ACTIVE</Pill>,"2h ago","—","✓"],
        ["Mrs Lee","lee@email.com",<Pill c={O.teal}>TENANT</Pill>,"Palmiers 1B",<Pill c={O.grn}>ACTIVE</Pill>,"3d ago","—","✓"],
        ["QuickFix","info@quickfix.mu",<Pill c={O.amb}>VENDOR</Pill>,"Multiple",<Pill c={O.grn}>ACTIVE</Pill>,"1d ago","—","✓"],
        ["Audit Firm","audit@firm.mu",<Pill c={O.t3}>AUDITOR</Pill>,"Les Palmiers",<Pill c={O.grn}>ACTIVE</Pill>,"5d ago","✓","—"],
        ["Old User","old@email.com",<Pill c={O.grn}>CO-OWNER</Pill>,"Palm Grove",<Pill c={O.t3}>INACTIVE</Pill>,"90d ago","—","—"],
      ].map((r,i)=><TR key={i} cells={r} cols={[{},{},{f:.7},{},{f:.4},{f:.5},{f:.3},{f:.3}]}/>)}
    </div>
    <Card title="Role Permission Matrix">
      <div style={{fontSize:9,color:O.t2,fontFamily:ff,lineHeight:1.6}}>
        {[{r:"Super Admin",p:"Full platform control, all tenants, impersonation"},{r:"Platform Admin",p:"Tenant onboarding, subscriptions, support"},{r:"Syndic Manager",p:"Full development ops: units, parking, stores, billing, maintenance, governance"},{r:"Finance Officer",p:"Invoices, payments, reconciliation, budgets, AP/AR"},{r:"Co-Owner",p:"Own unit: balance, payments, voting, maintenance, amenities"},{r:"Tenant (Renter)",p:"Maintenance, announcements, amenities (no finance/voting)"},{r:"Contractor",p:"Assigned jobs, status updates, invoice submission"},{r:"Auditor",p:"Read-only: all financial records, audit trail"}].map((role,i)=><div key={i} style={{display:"flex",gap:8,padding:"3px 0",borderBottom:`1px solid ${O.brd}08`}}>
          <span style={{color:O.cyan,fontWeight:700,minWidth:100}}>{role.r}:</span><span>{role.p}</span>
        </div>)}
      </div>
    </Card>
  </div>
);

// ── 5. SUBSCRIPTIONS ──
const SubsView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Subscriptions & Pricing</div>
      <Btn small primary>+ New Plan</Btn>
    </div>
    <div style={{background:O.grnP,borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8,border:`1px solid rgba(52,211,153,.12)`}}>
      <span style={{fontSize:18}}>🎉</span>
      <div><div style={{fontSize:12,fontWeight:800,color:O.grn,fontFamily:ff}}>Setup Fee: FREE for First 2 Years</div>
        <div style={{fontSize:9,color:O.t2,fontFamily:ff}}>After March 2028: MUR 5,000 + VAT one-time</div></div>
    </div>
    <div style={{display:"flex",gap:10,marginBottom:16}}>
      {[{n:"BASIC",p:"MUR 100",u:"/unit/mo",vat:"MUR 115 incl. VAT",f:["Co-owner mobile app","Service charge billing","Online payments","Basic document storage","Account monitoring","Push notifications"],cl:15,c:O.t3},
        {n:"SILVER",p:"MUR 175",u:"/unit/mo",vat:"MUR 201.25 incl. VAT",f:["Everything in Basic +","Maintenance & work orders","Vendor management","WhatsApp notifications","Announcements & comms","Parking/storage management","Facility booking"],cl:72,c:O.navyL,pop:true},
        {n:"PREMIUM",p:"MUR 250",u:"/unit/mo",vat:"MUR 287.50 incl. VAT",f:["Everything in Silver +","Full accounting","Budget management","Reserve/sinking funds","Bank reconciliation","AGM/EGM governance","Digital voting","EV charging billing","API access","Analytics & BI","Priority support"],cl:40,c:O.cyan},
      ].map((pl,i)=><div key={i} style={{flex:1,background:O.card,borderRadius:16,padding:18,border:`1.5px solid ${pl.pop?O.navyL:O.brd}`,position:"relative"}}>
        {pl.pop&&<div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",background:O.navyL,color:"#FFF",padding:"2px 10px",borderRadius:10,fontSize:8,fontWeight:800,fontFamily:ff}}>MOST POPULAR</div>}
        <div style={{fontSize:9,fontWeight:800,color:pl.c,letterSpacing:1.5,fontFamily:ff,marginBottom:6}}>{pl.n}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:2,marginBottom:1}}><span style={{fontSize:22,fontWeight:900,color:O.t1,fontFamily:ff}}>{pl.p}</span><span style={{fontSize:9,color:O.t3,fontFamily:ff}}>{pl.u}</span></div>
        <div style={{fontSize:8,color:O.t3,fontFamily:ff,marginBottom:10}}>{pl.vat}</div>
        {pl.f.map((f,fi)=><div key={fi} style={{display:"flex",gap:5,padding:"2px 0"}}><span style={{fontSize:9,color:O.grn}}>✓</span><span style={{fontSize:9,color:O.t2,fontFamily:ff}}>{f}</span></div>)}
        <div style={{marginTop:12,padding:6,background:`${pl.c}10`,borderRadius:6,textAlign:"center"}}><span style={{fontSize:12,fontWeight:800,color:pl.c,fontFamily:ff}}>{pl.cl} clients</span></div>
      </div>)}
    </div>
    <div style={{display:"flex",gap:8}}>
      {[{l:"MRR",v:"Rs 2.14M",c:O.grn},{l:"ARR",v:"Rs 25.7M",c:O.navyL},{l:"Churn",v:"1.8%",c:O.grn},{l:"ARPC",v:"Rs 16.9K",c:O.cyan},{l:"WA Cost",v:"Rs 42K/mo",c:O.amb},{l:"LTV",v:"Rs 812K",c:O.teal}].map((m,i)=>
        <div key={i} style={{flex:1,background:O.card,borderRadius:10,padding:10,border:`1px solid ${O.brd}`}}>
          <div style={{fontSize:8,color:O.t3,fontWeight:700,letterSpacing:.5,fontFamily:ff,textTransform:"uppercase"}}>{m.l}</div>
          <div style={{fontSize:16,fontWeight:900,color:m.c,fontFamily:ff,marginTop:3}}>{m.v}</div>
        </div>
      )}
    </div>
  </div>
);

// ── 6. FEATURE FLAGS ──
const FlagsView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Feature Flags & Configuration</div>
      <Btn small primary>+ New Flag</Btn>
    </div>
    <div style={{background:O.card,borderRadius:12,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
      {[{f:"whatsapp-notifications",d:"WhatsApp Business API for notifications",on:true,scope:"Global",ov:0},
        {f:"whatsapp-inbound",d:"Two-way WhatsApp (inbound parsing)",on:false,scope:"Pilot",ov:2},
        {f:"ev-charging-billing",d:"EV session tracking and per-kWh billing",on:true,scope:"Premium",ov:2},
        {f:"e-voting",d:"Digital share-weighted AGM/EGM voting",on:true,scope:"Premium",ov:3},
        {f:"parking-rental",d:"Syndic-managed parking bay rentals",on:true,scope:"Silver+",ov:0},
        {f:"facility-booking",d:"Pool/gym/hall reservation system",on:true,scope:"Silver+",ov:1},
        {f:"storage-management",d:"Storage unit allocation & rental",on:true,scope:"Silver+",ov:0},
        {f:"bank-reconciliation",d:"Automated bank statement matching",on:true,scope:"Premium",ov:0},
        {f:"ai-invoice-ocr",d:"AI supplier invoice scanning",on:false,scope:"Per Property",ov:1},
        {f:"mobile-biometrics",d:"Biometric auth for mobile app",on:true,scope:"Global",ov:0},
        {f:"free-setup-promo",d:"Waive setup fee (2-year promo)",on:true,scope:"Global",ov:0},
        {f:"visitor-qr-access",d:"QR code visitor parking passes",on:true,scope:"Silver+",ov:3},
      ].map((fl,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderBottom:`1px solid ${O.brd}08`}}>
        <Toggle on={fl.on}/>
        <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:11,fontWeight:700,color:O.t1,fontFamily:fm}}>{fl.f}</span><Pill c={fl.on?O.grn:O.t3}>{fl.on?"ACTIVE":"OFF"}</Pill></div>
          <div style={{fontSize:9,color:O.t3,fontFamily:ff,marginTop:1}}>{fl.d}</div></div>
        <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:9,color:O.t2,fontFamily:ff}}>{fl.scope}</div>{fl.ov>0&&<div style={{fontSize:8,color:O.amb,fontFamily:ff}}>{fl.ov} override(s)</div>}</div>
      </div>)}
    </div>
  </div>
);

// ── 7. SYSTEM MONITORING ──
const HealthView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>System Monitoring</div>
      <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:4,background:O.grn}}/><span style={{fontSize:10,color:O.grn,fontWeight:700,fontFamily:ff}}>All Systems Operational</span></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
      {[{l:"API P95",v:"142ms",tgt:"< 200ms",ok:true,i:"⚡"},{l:"Error Rate",v:"0.03%",tgt:"< 0.1%",ok:true,i:"🐛"},
        {l:"MySQL Conn",v:"78/100",tgt:"< 90%",ok:false,i:"🗄"},{l:"WA Queue",v:"3",tgt:"< 50",ok:true,i:"💬"},
        {l:"RabbitMQ",v:"12",tgt:"< 100",ok:true,i:"📨"},{l:"S3 Storage",v:"2.4/5 TB",tgt:"< 80%",ok:true,i:"💾"},
        {l:"Uptime 30d",v:"99.97%",tgt:"> 99.9%",ok:true,i:"🟢"},{l:"Redis Mem",v:"1.2/4 GB",tgt:"< 75%",ok:true,i:"🚀"},
        {l:"Cache Hit",v:"94.2%",tgt:"> 90%",ok:true,i:"📊"},{l:"Sessions",v:"342",tgt:"< 500",ok:true,i:"👥"},
        {l:"WebSockets",v:"89",tgt:"< 200",ok:true,i:"🔌"},{l:"PDF Queue",v:"0",tgt:"< 10",ok:true,i:"📄"},
      ].map((m,i)=><div key={i} style={{background:O.card,borderRadius:10,padding:12,border:`1px solid ${m.ok?O.brd:`${O.amb}25`}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{fontSize:14}}>{m.i}</span><div style={{width:7,height:7,borderRadius:4,background:m.ok?O.grn:O.amb}}/></div>
        <div style={{fontSize:16,fontWeight:900,color:m.ok?O.t1:O.amb,fontFamily:ff}}>{m.v}</div>
        <div style={{fontSize:9,color:O.t3,fontFamily:ff,marginTop:1}}>{m.l}</div>
        <div style={{fontSize:7,color:O.t3,fontFamily:fm,marginTop:1}}>Target: {m.tgt}</div>
      </div>)}
    </div>
    <Card title="Recent Alerts" actions={<Btn small>View All</Btn>}>
      {[{m:"MySQL connection pool at 78% — monitor",t:"15min",c:O.amb},{m:"WhatsApp: 42,300 sent (94% delivery)",t:"1h",c:O.grn},{m:"Deploy v2.0.1 successful — 0 errors",t:"2h",c:O.navyL},{m:"Daily MySQL backup — 2.4TB",t:"6h",c:O.grn},{m:"EV charger E-02 (Les Palmiers) offline",t:"8h",c:O.amb},{m:"SSL cert renewed — valid Mar 2027",t:"1d",c:O.navyL}].map((a,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${O.brd}08`}}>
        <div style={{width:7,height:7,borderRadius:4,background:a.c,flexShrink:0}}/><span style={{flex:1,fontSize:10,color:O.t2,fontFamily:ff}}>{a.m}</span><span style={{fontSize:8,color:O.t3,fontFamily:ff,flexShrink:0}}>{a.t} ago</span>
      </div>)}
    </Card>
  </div>
);

// ── 8. AUDIT LOG ──
const AuditView=()=>{
  const [tab,setTab]=useState(0);
  return(<div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>Audit Log</div>
      <div style={{display:"flex",gap:5}}><Btn small>🔍 Filter</Btn><Btn small>📅 Date Range</Btn><Btn small primary>⬇️ Export CSV</Btn></div>
    </div>
    <Tabs items={["All","Financial","Roles","Votes","Parking/EV","WhatsApp","System","Config"]} active={tab} onChange={setTab}/>
    <div style={{background:O.card,borderRadius:12,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
      <TH cols={[{l:"Timestamp",f:.7},{l:"User"},{l:"Property"},{l:"Action",f:.5},{l:"Entity",f:.5},{l:"Detail",f:1.8}]}/>
      {[["08/03 14:32","Admin","System","MODIFY","Config",<span style={{color:O.cyan}}>Flag 'ev-charging-billing' enabled globally</span>],
        ["08/03 14:15","Soobrayen","Les Palmiers","CREATE","Invoice",<span style={{color:O.grn}}>SC-2026-180: 60 units × Rs 4,250 + parking/EV</span>],
        ["08/03 13:42","R. Moonien","Les Palmiers","VOTE","Resolution",<span style={{color:O.navyL}}>FOR R1 — 152 shares</span>],
        ["08/03 12:30","System","Les Palmiers","CHARGE","EV",<span style={{color:O.teal}}>Bay E-03: 12.4 kWh → Rs 186 → Unit 4B</span>],
        ["08/03 12:00","System","Les Palmiers","BOOK","Facility",<span style={{color:O.vio}}>Pool private booking 15 Mar 10-12pm → Mr Moonien</span>],
        ["08/03 11:20","System","Platform","SEND","WhatsApp",<span style={{color:O.grn}}>58 invoice notifications — 55 delivered, 3 pending</span>],
        ["08/03 10:45","Soobrayen","Les Palmiers","ASSIGN","Work Order",<span style={{color:O.amb}}>WO-047 → QuickFix Plumbing (water leak 4B)</span>],
        ["08/03 09:30","V. Guest","Les Palmiers","REGISTER","Visitor",<span style={{color:O.navyL}}>J. Smith → Bay V-03 → 4h pass → hosted by 4B</span>],
        ["07/03 18:30","Admin","Harbour View","MODIFY","Role",<span style={{color:O.red}}>Doorgakant: Co-Owner → Syndic Manager</span>],
        ["07/03 16:00","System","Platform","BACKUP","Database",<span style={{color:O.grn}}>Daily MySQL backup — 2.4TB compressed — verified</span>],
      ].map((r,i)=><TR key={i} cells={r} cols={[{f:.7},{},{},{f:.5},{f:.5},{f:1.8}]}/>)}
    </div>
    <div style={{marginTop:8,padding:8,background:O.redP,borderRadius:8,border:`1px solid rgba(248,113,113,.08)`}}>
      <div style={{fontSize:8,color:O.t3,fontFamily:ff}}>🔒 Append-only MySQL InnoDB log. No UPDATE/DELETE permitted. Retention: 7 years (financial), 3 years (operational). Total: 2.4M entries.</div>
    </div>
  </div>);
};

// ── 9. WHATSAPP STATUS ──
const WAView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>WhatsApp Business Integration</div>
      <div style={{display:"flex",gap:5}}><Btn small>📊 Delivery Report</Btn><Btn small primary>🔄 Refresh Status</Btn></div>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      {[{l:"Total Sent (Mar)",v:"42,300",c:O.grn},{l:"Delivered",v:"39,762",c:O.grn,sub:"94%"},{l:"Read",v:"31,725",c:O.teal,sub:"75%"},{l:"Failed",v:"538",c:O.red,sub:"1.3%"},{l:"Queue Depth",v:"3",c:O.cyan},{l:"Monthly Cost",v:"Rs 42K",c:O.amb}].map((s,i)=>
        <KPI key={i} icon={["📨","✓","👁","❌","📋","💰"][i]} l={s.l} v={s.v} c={s.c} sub={s.sub}/>
      )}
    </div>
    <Card title="Message Templates" actions={<Btn small primary>+ New Template</Btn>}>
      <div style={{borderRadius:10,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
        <TH cols={[{l:"Template"},{l:"Category",f:.5},{l:"Status",f:.5},{l:"Sent (30d)",f:.4},{l:"Delivered",f:.4},{l:"Read",f:.4},{l:"Cost/msg",f:.4}]}/>
        {[["invoice_notification","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"12,480","96%","78%","Rs 0.85"],
          ["payment_reminder","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"4,520","94%","71%","Rs 0.85"],
          ["payment_confirmed","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"8,840","97%","82%","Rs 0.85"],
          ["maintenance_update","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"3,200","93%","68%","Rs 0.85"],
          ["meeting_notice","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"5,800","95%","74%","Rs 0.85"],
          ["emergency_alert","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"200","98%","91%","Rs 0.85"],
          ["ev_charge_complete","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"830","96%","80%","Rs 0.85"],
          ["visitor_pass","UTILITY",<Pill c={O.grn}>APPROVED</Pill>,"1,200","95%","77%","Rs 0.85"],
          ["welcome_onboard","MARKETING",<Pill c={O.amb}>REVIEW</Pill>,"—","—","—","Rs 1.50"],
        ].map((r,i)=><TR key={i} cells={r} cols={[{},{f:.5},{f:.5},{f:.4},{f:.4},{f:.4},{f:.4}]}/>)}
      </div>
    </Card>
    <Card title="Connected Numbers">
      {[{num:"+230 5800 1234",name:"Les Palmiers Res.",status:"Connected",msgs:"3,420/mo"},
        {num:"+230 5800 5678",name:"Palm Grove Estate",status:"Connected",msgs:"5,100/mo"},
        {num:"+230 5800 9012",name:"Platform Default",status:"Connected",msgs:"33,780/mo"},
      ].map((n,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${O.brd}08`}}>
        <IC e="💬" s={28} bg={O.grnP}/>
        <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:O.t1,fontFamily:ff}}>{n.name}</div>
          <div style={{fontSize:9,color:O.t3,fontFamily:fm}}>{n.num}</div></div>
        <Pill c={O.grn}>{n.status}</Pill>
        <span style={{fontSize:9,color:O.t2,fontFamily:ff}}>{n.msgs}</span>
      </div>)}
    </Card>
  </div>
);

// ── 10. API & INTEGRATIONS ──
const APIView=()=>(
  <div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:18,fontWeight:900,color:O.t1,fontFamily:ff}}>API & Integrations</div>
      <Btn small primary>+ New API Key</Btn>
    </div>
    <Card title="API Status">
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {[{l:"API Version",v:"v1.0",c:O.cyan},{l:"Requests (24h)",v:"48,200",c:O.grn},{l:"Avg Latency",v:"142ms",c:O.teal},{l:"Error Rate",v:"0.03%",c:O.grn},{l:"Rate Limit",v:"1000/min",c:O.t2}].map((s,i)=>
          <div key={i} style={{flex:1,background:O.card2,borderRadius:8,padding:"8px",textAlign:"center"}}>
            <div style={{fontSize:14,fontWeight:900,color:s.c,fontFamily:ff}}>{s.v}</div><div style={{fontSize:7,color:O.t3,fontFamily:ff}}>{s.l}</div>
          </div>
        )}
      </div>
    </Card>
    <Card title="Active Integrations">
      <div style={{borderRadius:10,border:`1px solid ${O.brd}`,overflow:"hidden"}}>
        <TH cols={[{l:"Integration"},{l:"Protocol",f:.5},{l:"Direction",f:.5},{l:"Status",f:.5},{l:"Last Sync",f:.5},{l:"Requests/day",f:.5}]}/>
        {[["WhatsApp Business","Meta Cloud API","Bi-directional",<Pill c={O.grn}>ACTIVE</Pill>,"Real-time","12,400"],
          ["Payment Gateway","REST + Webhooks","Bi-directional",<Pill c={O.grn}>ACTIVE</Pill>,"Real-time","2,800"],
          ["Email (SendGrid)","SMTP API","Outbound",<Pill c={O.grn}>ACTIVE</Pill>,"Real-time","1,200"],
          ["SMS (Twilio)","REST API","Outbound",<Pill c={O.grn}>ACTIVE</Pill>,"Real-time","120"],
          ["FCM Push","Firebase SDK","Outbound",<Pill c={O.grn}>ACTIVE</Pill>,"Real-time","3,400"],
          ["EV Chargers","OCPP 1.6","Inbound Webhook",<Pill c={O.grn}>ACTIVE</Pill>,"Real-time","640"],
          ["Bank Reconciliation","CSV/MT940","Import",<Pill c={O.amb}>MANUAL</Pill>,"Weekly","12"],
          ["Accounting Export","CSV/JSON","Export",<Pill c={O.amb}>ON DEMAND</Pill>,"Monthly","3"],
        ].map((r,i)=><TR key={i} cells={r} cols={[{},{f:.5},{f:.5},{f:.5},{f:.5},{f:.5}]}/>)}
      </div>
    </Card>
    <Card title="API Endpoints (OpenAPI 3.0)" actions={<Btn small>📄 View Docs</Btn>}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
        {["/auth","/users","/tenants","/developments","/buildings","/units","/parking","/stores","/facilities","/owners","/residents","/billing","/invoices","/payments","/arrears","/expenses","/funds","/budgets","/maintenance","/work-orders","/assets","/vendors","/announcements","/notifications","/whatsapp","/meetings","/votes","/documents","/subscriptions","/config"].map((ep,i)=><div key={i} style={{padding:"4px 6px",background:O.card2,borderRadius:4,fontSize:8,color:O.cyan,fontFamily:fm}}>{ep}</div>)}
      </div>
    </Card>
  </div>
);

// ══ VIEWS MAP ══
const VIEWS={dash:DashView,tenants:TenantsView,onboard:OnboardView,users:UsersView,subs:SubsView,flags:FlagsView,health:HealthView,audit:AuditView,whatsapp:WAView,api:APIView};

export default function AdminConsole(){
  const [view,setView]=useState("dash");
  const V=VIEWS[view]||DashView;
  return(<div style={{minHeight:"100vh",background:O.bg,fontFamily:ff,color:O.t1}}>
    <div style={{display:"flex",height:"100vh"}}>
      <Sidebar active={view} nav={v=>setView(v)}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <TopBar/><div style={{flex:1,overflowY:"auto"}}><V/></div>
      </div>
    </div>
  </div>);
}
