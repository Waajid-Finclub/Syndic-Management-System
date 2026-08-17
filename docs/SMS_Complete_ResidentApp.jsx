import { useState, useCallback } from "react";

const O={bg:"#F7F9FC",warm:"#FAFCFF",w:"#FFFFFF",navy:"#1E3A5F",navyL:"#2563EB",navyP:"#EFF6FF",teal:"#0D9488",tealL:"#14B8A6",tealP:"#F0FDFA",sky:"#0EA5E9",skyP:"#F0F9FF",grn:"#059669",grnP:"#ECFDF5",amb:"#D97706",ambP:"#FFFBEB",red:"#DC2626",redP:"#FEF2F2",vio:"#7C3AED",vioP:"#F5F3FF",ink:"#1E293B",inkS:"#475569",inkM:"#94A3B8",inkF:"#CBD5E1",brd:"#E2E8F0",brdL:"#F1F5F9"};
const ff=`'DM Sans','Avenir Next',-apple-system,sans-serif`;
const fm=`'JetBrains Mono','SF Mono',monospace`;

// ─── COMPONENTS ───
const Pill=({children,c=O.navy,bg:b})=><span style={{background:b||`${c}12`,color:c,padding:"3px 10px",borderRadius:100,fontSize:10,fontWeight:700,letterSpacing:.3,fontFamily:ff}}>{children}</span>;
const IC=({e,s=36,bg=O.navyP})=><div style={{width:s,height:s,borderRadius:s*.3,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:s*.4,flexShrink:0}}>{e}</div>;
const Btn=({children,primary,full,small,onClick,c=O.navy,outline})=><button onClick={onClick} style={{padding:small?"8px 16px":"13px 22px",borderRadius:14,border:primary?"none":outline?`1.5px solid ${c}`:`1.5px solid ${O.brd}`,background:primary?c:outline?`${c}08`:O.w,color:primary?"#FFF":outline?c:O.inkS,fontSize:small?12:14,fontWeight:700,fontFamily:ff,cursor:"pointer",width:full?"100%":"auto",boxShadow:primary?`0 5px 16px ${c}25`:"none",letterSpacing:.2,transition:"all 0.15s"}}>{children}</button>;
const Back=({title,onBack,right})=><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}><div onClick={onBack} style={{width:34,height:34,borderRadius:11,background:O.w,border:`1.5px solid ${O.brd}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:15,color:O.inkS}}>←</div><span style={{flex:1,fontSize:17,fontWeight:800,color:O.ink,fontFamily:ff}}>{title}</span>{right}</div>;
const Inp=({label,placeholder,icon,value,readonly,type})=><div style={{marginBottom:12}}>{label&&<label style={{fontSize:10,fontWeight:700,color:O.inkM,display:"block",marginBottom:4,letterSpacing:.5,fontFamily:ff,textTransform:"uppercase"}}>{label}</label>}<div style={{background:readonly?O.bg:O.w,border:`1.5px solid ${O.brd}`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:8}}>{icon&&<span style={{fontSize:13}}>{icon}</span>}<span style={{fontSize:13,color:value?O.ink:O.inkF,fontFamily:ff,flex:1}}>{value||placeholder}</span>{type==="password"&&<span style={{fontSize:11,color:O.inkM,cursor:"pointer"}}>👁</span>}</div></div>;
const Divider=()=><div style={{height:1,background:O.brdL,margin:"12px 0"}}/>;
const SectionTitle=({children})=><div style={{fontSize:14,fontWeight:800,color:O.ink,marginBottom:10,fontFamily:ff}}>{children}</div>;
const Card=({children,onClick,highlight})=><div onClick={onClick} style={{background:O.w,borderRadius:18,padding:16,border:`1.5px solid ${highlight?`${O.navy}25`:O.brdL}`,marginBottom:10,cursor:onClick?"pointer":"default",boxShadow:highlight?`0 2px 12px ${O.navy}06`:"none"}}>{children}</div>;

// ─── PHONE + TAB ───
const Phone=({children,title})=><div style={{width:393,height:852,background:O.bg,borderRadius:48,border:`2.5px solid ${O.brd}`,overflow:"hidden",position:"relative",boxShadow:"0 30px 80px rgba(30,58,95,.08)"}}><div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:126,height:34,background:O.ink,borderRadius:"0 0 20px 20px",zIndex:10}}/><div style={{height:52,background:O.warm,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:6,borderBottom:`1px solid ${O.brdL}`}}><span style={{fontSize:13,fontWeight:700,color:O.ink,fontFamily:ff}}>{title}</span></div><div style={{height:"calc(100% - 52px)",overflowY:"auto",overflowX:"hidden"}}>{children}</div></div>;
const TabBar=({tabs,active,onChange})=><div style={{position:"sticky",bottom:0,background:O.w,borderTop:`1px solid ${O.brdL}`,display:"flex",padding:"6px 0 10px"}}>{tabs.map((t,i)=><button key={i} onClick={()=>onChange(i)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"3px 0"}}><span style={{fontSize:21,transition:"transform 0.2s",transform:active===i?"scale(1.1)":"scale(1)",filter:active===i?"none":"grayscale(1) opacity(0.3)"}}>{t.icon}</span><span style={{fontSize:9,fontWeight:active===i?800:500,color:active===i?O.navy:O.inkF,fontFamily:ff}}>{t.label}</span></button>)}</div>;

// ════════════════ ALL SCREENS ════════════════

// ─── SCR-R-001: LOGIN ───
const LoginScreen=({onLogin})=>(
  <div style={{padding:"42px 24px 24px",background:O.warm,minHeight:"100%"}}>
    <div style={{textAlign:"center",marginBottom:32}}>
      <div style={{width:60,height:60,borderRadius:18,background:`linear-gradient(135deg,${O.navy},${O.sky})`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:14,boxShadow:`0 12px 30px ${O.navy}20`}}>🏠</div>
      <div style={{fontSize:24,fontWeight:900,color:O.ink,fontFamily:ff,letterSpacing:-.5}}>SyndicMS</div>
      <div style={{fontSize:12,color:O.inkM,marginTop:3,fontFamily:ff}}>Co-Owner Portal</div>
    </div>
    <Inp label="Email Address" placeholder="you@email.com" icon="✉️"/>
    <Inp label="Password" placeholder="••••••••" icon="🔒" type="password"/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"2px 0 18px"}}>
      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:O.inkM,fontFamily:ff,cursor:"pointer"}}><div style={{width:16,height:16,borderRadius:4,border:`2px solid ${O.navy}`,background:O.navyP}}/>Remember me</label>
      <span style={{fontSize:11,color:O.navyL,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>Forgot password?</span>
    </div>
    <Btn primary full onClick={onLogin}>Sign In</Btn>
    <div style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0"}}><div style={{flex:1,height:1,background:O.brd}}/><span style={{fontSize:10,color:O.inkF,fontFamily:ff}}>or</span><div style={{flex:1,height:1,background:O.brd}}/></div>
    <Btn full>🔐 Sign in with Biometrics</Btn>
    <div style={{textAlign:"center",marginTop:14}}>
      <div style={{padding:"8px 12px",background:O.grnP,borderRadius:10,border:`1px solid ${O.grn}12`,display:"inline-flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:12}}>💬</span><span style={{fontSize:10,color:O.grn,fontFamily:ff,fontWeight:600}}>WhatsApp notifications enabled</span>
      </div>
    </div>
    <div style={{textAlign:"center",marginTop:14,fontSize:12,color:O.inkM,fontFamily:ff}}>New resident? <span style={{color:O.navyL,fontWeight:700,cursor:"pointer"}}>Register with invitation code</span></div>
  </div>
);

// ─── SCR-R-002: REGISTRATION (4-step) ───
const RegisterScreen=({goBack})=>(
  <div style={{padding:"16px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Create Account" onBack={goBack}/>
    <div style={{display:"flex",gap:4,marginBottom:20}}>
      {[{n:1,l:"Verify",a:true},{n:2,l:"Personal"},{n:3,l:"Security"},{n:4,l:"Confirm"}].map((s,i)=><div key={i} style={{flex:1,display:"flex",alignItems:"center",gap:4}}>
        <div style={{width:22,height:22,borderRadius:11,background:s.a?O.navy:O.brd,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:s.a?"#FFF":O.inkF}}>{s.n}</div>
        <span style={{fontSize:9,color:s.a?O.navy:O.inkF,fontWeight:600,fontFamily:ff}}>{s.l}</span>
        {i<3&&<div style={{flex:1,height:1,background:O.brd}}/>}
      </div>)}
    </div>
    <Card highlight>
      <div style={{fontSize:13,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:10}}>Step 1: Verify Invitation</div>
      <div style={{fontSize:11,color:O.inkM,fontFamily:ff,marginBottom:14}}>Enter the 6-digit invitation code provided by your syndic manager.</div>
      <Inp label="Invitation Code" placeholder="ABC-123" icon="🔑"/>
      <Inp label="Email Address" placeholder="you@email.com" icon="✉️"/>
      <div style={{padding:"10px 14px",background:O.navyP,borderRadius:10,marginBottom:14}}>
        <div style={{fontSize:10,color:O.navy,fontFamily:ff}}>ℹ️ Your email must match the address registered by your syndic manager for your unit.</div>
      </div>
      <Btn primary full>Verify & Continue →</Btn>
    </Card>
  </div>
);

// ─── SCR-R-010: HOME DASHBOARD ───
const HomeScreen=({go})=>(
  <div style={{paddingBottom:72}}>
    <div style={{padding:"14px 20px 0",background:O.warm}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div>
          <div style={{fontSize:12,color:O.inkM,fontFamily:ff}}>Good morning,</div>
          <div style={{fontSize:22,fontWeight:900,color:O.ink,fontFamily:ff,letterSpacing:-.5}}>Rajesh Moonien</div>
          <div style={{fontSize:11,color:O.inkS,fontFamily:ff,marginTop:2}}>🏢 Les Palmiers Residence • Unit 4B</div>
          <div style={{fontSize:9,color:O.inkM,fontFamily:fm,marginTop:1}}>Share: 152 / 10,000 (1.52%)</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <IC emoji="💬" s={36} bg={O.grnP}/>
          <div style={{position:"relative",cursor:"pointer"}} onClick={()=>go("notifs")}><IC emoji="🔔" s={36} bg={O.w}/><div style={{position:"absolute",top:-2,right:-2,width:16,height:16,borderRadius:8,background:O.red,fontSize:8,fontWeight:800,color:"#FFF",display:"flex",alignItems:"center",justifyContent:"center"}}>3</div></div>
        </div>
      </div>
    </div>
    <div style={{padding:"0 20px"}}>
      {/* Outstanding Balance */}
      <Card highlight onClick={()=>go("finance")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:9,color:O.inkM,fontWeight:700,letterSpacing:1,textTransform:"uppercase",fontFamily:ff}}>Service Charges Due</div>
            <div style={{fontSize:34,fontWeight:900,color:O.ink,letterSpacing:-1.5,margin:"4px 0",fontFamily:ff}}>Rs 8,500<span style={{fontSize:15,color:O.inkF}}>.00</span></div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}><Pill c={O.amb} bg={O.ambP}>⏱ Due in 5 days</Pill><span style={{fontSize:9,color:O.grn,fontFamily:ff}}>💬 WhatsApp sent</span></div>
          </div>
          <Btn primary small c={O.teal} onClick={e=>{e.stopPropagation();go("payment");}}>Pay →</Btn>
        </div>
      </Card>

      {/* KPI Grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[{icon:"🏦",label:"Reserve Fund",value:"Rs 1.2M",color:O.teal,bg:O.tealP},
          {icon:"🔧",label:"Open Requests",value:"2",color:O.amb,bg:O.ambP},
          {icon:"📅",label:"Next AGM",value:"15 May",color:O.navy,bg:O.navyP},
          {icon:"🗳",label:"Votes Open",value:"3",color:O.vio,bg:O.vioP},
        ].map((k,i)=><div key={i} onClick={()=>i===3&&go("voting")} style={{background:O.w,borderRadius:14,padding:"12px 14px",border:`1px solid ${O.brdL}`,cursor:i===3?"pointer":"default"}}>
          <IC emoji={k.icon} s={30} bg={k.bg}/><div style={{fontSize:18,fontWeight:900,color:k.color,margin:"6px 0 1px",fontFamily:ff}}>{k.value}</div>
          <div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>{k.label}</div>
        </div>)}
      </div>

      {/* My Property Assets */}
      <SectionTitle>My Property Assets</SectionTitle>
      <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
        {[{icon:"🅿️",label:"Parking B-12",sub:"Owner Allocated • Level B1",c:O.navy,go:"parking"},
          {icon:"⚡",label:"EV Bay E-3",sub:"Last charge: 12.4 kWh",c:O.teal,go:"evcharging"},
          {icon:"📦",label:"Store S-07",sub:"Owner • 10m² • Fob access",c:O.amb,go:"storage"},
          {icon:"🏊",label:"Pool",sub:"Open 6am–8pm daily",c:O.sky,go:"facilities"},
          {icon:"🏋️",label:"Gym",sub:"Book via app",c:O.vio,go:"facilities"},
        ].map((a,i)=><div key={i} onClick={()=>go(a.go)} style={{minWidth:125,background:O.w,borderRadius:14,padding:"11px 12px",border:`1px solid ${O.brdL}`,cursor:"pointer"}}>
          <div style={{fontSize:20,marginBottom:5}}>{a.icon}</div>
          <div style={{fontSize:11,fontWeight:700,color:O.ink,fontFamily:ff}}>{a.label}</div>
          <div style={{fontSize:8,color:a.c,fontFamily:ff,fontWeight:600,marginTop:2}}>{a.sub}</div>
        </div>)}
      </div>

      {/* Recent Activity */}
      <SectionTitle>Recent Activity</SectionTitle>
      <div style={{background:O.w,borderRadius:16,border:`1px solid ${O.brdL}`,overflow:"hidden"}}>
        {[{icon:"💳",t:"Payment Confirmed",s:"Rs 4,250 — February charges",time:"2h",c:O.grn},
          {icon:"💬",t:"WhatsApp: Invoice Sent",s:"March service charges — Rs 4,250",time:"1d",c:O.grn},
          {icon:"📢",t:"AGM Notice Published",s:"15 May 2026 at 6pm — 3 resolutions",time:"2d",c:O.navy},
          {icon:"⚡",t:"EV Charging Complete",s:"Bay E-3 — 12.4 kWh — Rs 186",time:"3d",c:O.teal},
          {icon:"🔧",t:"Maintenance Update",s:"Bathroom leak — Vendor assigned",time:"4d",c:O.amb},
          {icon:"🗳",t:"Voting Now Open",s:"2026/27 Annual Budget",time:"5d",c:O.vio},
          {icon:"🅿️",t:"Visitor Parking",s:"Guest J. Smith — Bay V-03 — 4h pass",time:"6d",c:O.navy},
        ].map((a,i)=><div key={i} style={{display:"flex",gap:10,padding:"11px 14px",borderBottom:i<6?`1px solid ${O.brdL}`:"none",cursor:"pointer"}}
          onMouseOver={e=>e.currentTarget.style.background=O.bg} onMouseOut={e=>e.currentTarget.style.background=O.w}>
          <IC emoji={a.icon} s={32} bg={`${a.c}0D`}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:O.ink,fontFamily:ff}}>{a.t}</div><div style={{fontSize:10,color:O.inkM,fontFamily:ff,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.s}</div></div>
          <span style={{fontSize:9,color:O.inkF,fontFamily:ff,flexShrink:0}}>{a.time}</span>
        </div>)}
      </div>
    </div>
  </div>
);

// ─── SCR-R-020: FINANCE OVERVIEW ───
const FinanceScreen=({go})=>(
  <div style={{paddingBottom:72}}>
    <div style={{padding:"14px 20px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><div style={{fontSize:17,fontWeight:900,color:O.ink,fontFamily:ff}}>My Finances</div><div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>Unit 4B — Share 152 / 10,000</div></div>
        <Btn small outline c={O.navy} onClick={()=>go("statement")}>📊 Statement</Btn>
      </div>
      <Card highlight>
        <div style={{fontSize:9,color:O.inkM,fontWeight:700,letterSpacing:1,textTransform:"uppercase",fontFamily:ff}}>Account Balance</div>
        <div style={{fontSize:36,fontWeight:900,color:O.red,letterSpacing:-1.5,margin:"4px 0",fontFamily:ff}}>Rs 8,500.00</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}><Pill c={O.red} bg={O.redP}>OVERDUE</Pill><span style={{fontSize:9,color:O.inkM,fontFamily:ff}}>since 1 Mar 2026</span></div>
      </Card>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[{v:"Rs 51K",l:"Paid YTD",c:O.grn},{v:"Rs 8.5K",l:"Outstanding",c:O.red},{v:"Rs 186",l:"EV Charges",c:O.teal},{v:"Rs 0",l:"Credit",c:O.inkF}].map((s,i)=><div key={i} style={{flex:1,background:O.w,borderRadius:12,padding:"10px 8px",border:`1px solid ${O.brdL}`,textAlign:"center"}}>
          <div style={{fontSize:15,fontWeight:900,color:s.c,fontFamily:ff}}>{s.v}</div><div style={{fontSize:8,color:O.inkM,fontFamily:ff,marginTop:1}}>{s.l}</div>
        </div>)}
      </div>
      <div style={{display:"flex",gap:5,marginBottom:12,overflowX:"auto"}}>
        {["All","Service Charges","Payments","EV Charging","Parking","Credits"].map((f,i)=><button key={i} style={{padding:"5px 11px",borderRadius:100,border:`1.5px solid ${i===0?O.navy:O.brd}`,background:i===0?O.navyP:O.w,color:i===0?O.navy:O.inkM,fontSize:10,fontWeight:600,fontFamily:ff,cursor:"pointer",whiteSpace:"nowrap"}}>{f}</button>)}
      </div>
      <div style={{background:O.w,borderRadius:16,border:`1px solid ${O.brdL}`,overflow:"hidden"}}>
        {[{t:"inv",ref:"SC-2026-003",d:"Service Charges — March 2026",a:"-Rs 4,250",dt:"01 Mar",st:"Overdue",sc:O.red},
          {t:"inv",ref:"SC-2026-S01",d:"Special Levy — Lift Upgrade",a:"-Rs 4,250",dt:"15 Feb",st:"Overdue",sc:O.red},
          {t:"ev",ref:"EV-2026-018",d:"EV Charging — Bay E-3 (12.4 kWh)",a:"-Rs 186",dt:"05 Mar",st:"Billed",sc:O.teal},
          {t:"pay",ref:"PAY-012",d:"Payment — February Charges",a:"+Rs 4,250",dt:"28 Feb",st:"Confirmed",sc:O.grn},
          {t:"inv",ref:"SC-2026-002",d:"Service Charges — February",a:"-Rs 4,250",dt:"01 Feb",st:"Paid",sc:O.grn},
          {t:"prk",ref:"PRK-03",d:"Visitor Parking — Bay V-03",a:"-Rs 0",dt:"28 Feb",st:"Free",sc:O.inkM},
          {t:"pay",ref:"PAY-008",d:"Payment — January Charges",a:"+Rs 4,250",dt:"25 Jan",st:"Confirmed",sc:O.grn},
        ].map((tx,i)=><div key={i} onClick={()=>tx.t==="inv"&&go("invoiceDetail")} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderBottom:i<6?`1px solid ${O.brdL}`:"none",cursor:"pointer"}}>
          <IC emoji={tx.t==="inv"?"📄":tx.t==="pay"?"💳":tx.t==="ev"?"⚡":"🅿️"} s={32} bg={tx.t==="pay"?O.grnP:tx.t==="ev"?O.tealP:O.ambP}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:O.ink,fontFamily:ff}}>{tx.d}</div><div style={{fontSize:9,color:O.inkM,fontFamily:fm}}>{tx.ref} • {tx.dt}</div></div>
          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:12,fontWeight:800,color:tx.a.includes("+")?O.grn:O.ink,fontFamily:ff}}>{tx.a}</div><Pill c={tx.sc}>{tx.st}</Pill></div>
        </div>)}
      </div>
      <div style={{display:"flex",gap:6,marginTop:12}}>
        <Btn full small onClick={()=>go("statement")}>📊 Full Statement PDF</Btn>
        <Btn full small primary c={O.teal} onClick={()=>go("payment")}>💳 Pay Now</Btn>
      </div>
    </div>
  </div>
);

// ─── SCR-R-021: INVOICE DETAIL ───
const InvoiceDetail=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Invoice Detail" onBack={goBack} right={<Pill c={O.red} bg={O.redP}>OVERDUE</Pill>}/>
    <Card highlight>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
        <div><div style={{fontSize:9,color:O.inkM,fontFamily:fm}}>SC-2026-003</div><div style={{fontSize:15,fontWeight:800,color:O.ink,fontFamily:ff}}>Service Charges — March 2026</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>Due Date</div><div style={{fontSize:13,fontWeight:700,color:O.red,fontFamily:ff}}>01 Mar 2026</div></div>
      </div>
      <Divider/>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,fontFamily:ff,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Line Items</div>
      {[{d:"General maintenance contribution",q:1,r:"2,800",a:"2,800"},
        {d:"Cleaning — common areas",q:1,r:"450",a:"450"},
        {d:"Security services",q:1,r:"350",a:"350"},
        {d:"Insurance contribution",q:1,r:"200",a:"200"},
        {d:"Reserve fund contribution",q:1,r:"300",a:"300"},
        {d:"Management fee (syndic)",q:1,r:"150",a:"150"},
      ].map((li,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${O.brdL}`}}>
        <span style={{fontSize:11,color:O.inkS,fontFamily:ff,flex:1}}>{li.d}</span>
        <span style={{fontSize:11,color:O.ink,fontWeight:600,fontFamily:fm,width:70,textAlign:"right"}}>Rs {li.a}</span>
      </div>)}
      <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",marginTop:4}}>
        <span style={{fontSize:13,fontWeight:800,color:O.ink,fontFamily:ff}}>Total</span>
        <span style={{fontSize:15,fontWeight:900,color:O.navy,fontFamily:ff}}>Rs 4,250.00</span>
      </div>
    </Card>
    <Card>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,fontFamily:ff,marginBottom:8,textTransform:"uppercase"}}>Payment History</div>
      <div style={{padding:"8px 0",color:O.inkM,fontSize:11,fontFamily:ff,textAlign:"center"}}>No payments allocated to this invoice</div>
    </Card>
    <div style={{display:"flex",gap:6}}>
      <Btn full small primary c={O.teal}>💳 Pay This Invoice</Btn>
      <Btn full small>⬇ Download PDF</Btn>
    </div>
    <div style={{textAlign:"center",marginTop:8}}><Btn small outline c={O.red}>⚠ Dispute This Invoice</Btn></div>
  </div>
);

// ─── SCR-R-022: MAKE PAYMENT ───
const PaymentScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Pay Service Charges" onBack={goBack}/>
    <Card highlight>
      <div style={{textAlign:"center"}}><div style={{fontSize:9,color:O.inkM,fontWeight:700,letterSpacing:1,fontFamily:ff}}>AMOUNT TO PAY</div>
      <div style={{fontSize:40,fontWeight:900,color:O.ink,letterSpacing:-2,margin:"4px 0",fontFamily:ff}}>Rs 8,500<span style={{fontSize:16,color:O.inkF}}>.00</span></div>
      <div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>2 outstanding invoices</div></div>
    </Card>
    <div style={{fontSize:10,fontWeight:700,color:O.inkM,letterSpacing:.5,fontFamily:ff,marginBottom:6,textTransform:"uppercase"}}>Payment Method</div>
    {[{icon:"💳",n:"Visa •••• 4521",s:"Expires 08/27",sel:true},{icon:"🏦",n:"MCB Bank Transfer",s:"Direct bank payment"},{icon:"📱",n:"Juice Mobile Money",s:"Mobile wallet"}].map((m,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:12,background:m.sel?O.navyP:O.w,border:`1.5px solid ${m.sel?O.navy:O.brd}`,borderRadius:14,marginBottom:6,cursor:"pointer"}}>
      <span style={{fontSize:22}}>{m.icon}</span>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:O.ink,fontFamily:ff}}>{m.n}</div><div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>{m.s}</div></div>
      <div style={{width:18,height:18,borderRadius:9,border:`2px solid ${m.sel?O.navy:O.brd}`,display:"flex",alignItems:"center",justifyContent:"center"}}>{m.sel&&<div style={{width:9,height:9,borderRadius:5,background:O.navy}}/>}</div>
    </div>)}
    <Card>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,fontFamily:ff,marginBottom:8}}>Breakdown</div>
      {[["Service Charges — March 2026","Rs 4,250.00"],["Special Levy — Lift Upgrade","Rs 4,250.00"]].map((l,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${O.brdL}`}}>
        <span style={{fontSize:11,color:O.inkM,fontFamily:ff}}>{l[0]}</span><span style={{fontSize:11,color:O.ink,fontWeight:700,fontFamily:ff}}>{l[1]}</span>
      </div>)}
      <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,marginTop:4}}>
        <span style={{fontSize:13,fontWeight:800,color:O.ink,fontFamily:ff}}>Total</span><span style={{fontSize:15,fontWeight:900,color:O.navy,fontFamily:ff}}>Rs 8,500.00</span>
      </div>
    </Card>
    <Btn primary full c={O.teal}>🔒 Confirm Payment — Rs 8,500.00</Btn>
    <div style={{textAlign:"center",marginTop:8,fontSize:9,color:O.inkM,fontFamily:ff}}>💬 Receipt sent via WhatsApp • 🔐 256-bit SSL</div>
  </div>
);

// ─── SCR-R-023: STATEMENT OF ACCOUNT ───
const StatementScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Statement of Account" onBack={goBack}/>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {["Last 3 Months","Last 6 Months","Last 12 Months","Custom Range"].map((p,i)=><button key={i} style={{padding:"6px 10px",borderRadius:100,border:`1.5px solid ${i===0?O.navy:O.brd}`,background:i===0?O.navyP:O.w,color:i===0?O.navy:O.inkM,fontSize:9,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>{p}</button>)}
    </div>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <div><div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>Opening Balance</div><div style={{fontSize:14,fontWeight:800,color:O.ink,fontFamily:ff}}>Rs 0.00</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>Closing Balance</div><div style={{fontSize:14,fontWeight:800,color:O.red,fontFamily:ff}}>Rs 8,500.00</div></div>
      </div>
    </Card>
    <div style={{background:O.w,borderRadius:14,border:`1px solid ${O.brdL}`,overflow:"hidden"}}>
      <div style={{display:"flex",padding:"8px 12px",background:O.bg,borderBottom:`1px solid ${O.brdL}`}}>
        {["Date","Reference","Description","Debit","Credit","Balance"].map((h,i)=><div key={i} style={{flex:i>2?.6:1,fontSize:8,fontWeight:700,color:O.inkF,fontFamily:ff,textTransform:"uppercase",letterSpacing:.5}}>{h}</div>)}
      </div>
      {[{dt:"01 Jan",ref:"SC-001",d:"Service Charges — Jan",db:"4,250",cr:"",bal:"4,250"},
        {dt:"25 Jan",ref:"PAY-008",d:"Payment received",db:"",cr:"4,250",bal:"0"},
        {dt:"01 Feb",ref:"SC-002",d:"Service Charges — Feb",db:"4,250",cr:"",bal:"4,250"},
        {dt:"15 Feb",ref:"SC-S01",d:"Special Levy — Lift",db:"4,250",cr:"",bal:"8,500"},
        {dt:"28 Feb",ref:"PAY-012",d:"Payment received",db:"",cr:"4,250",bal:"4,250"},
        {dt:"01 Mar",ref:"SC-003",d:"Service Charges — Mar",db:"4,250",cr:"",bal:"8,500"},
        {dt:"05 Mar",ref:"EV-018",d:"EV Charging (12.4 kWh)",db:"186",cr:"",bal:"8,686"},
      ].map((r,i)=><div key={i} style={{display:"flex",padding:"7px 12px",borderBottom:`1px solid ${O.brdL}`,fontSize:10,fontFamily:ff}}>
        <div style={{flex:1,color:O.inkM}}>{r.dt}</div>
        <div style={{flex:1,color:O.inkM,fontFamily:fm,fontSize:8}}>{r.ref}</div>
        <div style={{flex:1,color:O.ink,fontWeight:500}}>{r.d}</div>
        <div style={{flex:.6,color:r.db?O.red:O.inkF,fontWeight:r.db?600:400,fontFamily:fm}}>{r.db?`Rs ${r.db}`:""}</div>
        <div style={{flex:.6,color:r.cr?O.grn:O.inkF,fontWeight:r.cr?600:400,fontFamily:fm}}>{r.cr?`Rs ${r.cr}`:""}</div>
        <div style={{flex:.6,color:O.ink,fontWeight:700,fontFamily:fm}}>Rs {r.bal}</div>
      </div>)}
    </div>
    <div style={{display:"flex",gap:6,marginTop:12}}>
      <Btn full small>⬇ Download PDF</Btn>
      <Btn full small>📤 Share via WhatsApp</Btn>
    </div>
  </div>
);

// ─── SCR-R-030: MAINTENANCE REQUESTS ───
const MaintScreen=({go})=>(
  <div style={{paddingBottom:72}}>
    <div style={{padding:"14px 20px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><div style={{fontSize:17,fontWeight:900,color:O.ink,fontFamily:ff}}>Maintenance Requests</div><div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>Units, common areas, parking & facilities</div></div>
        <Btn primary small onClick={()=>go("newreq")}>+ Report</Btn>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {[{l:"Open",c:2,a:true},{l:"Assigned",c:2},{l:"In Progress",c:1},{l:"Resolved",c:5},{l:"Closed",c:12}].map((f,i)=><button key={i} style={{padding:"4px 9px",borderRadius:100,border:`1.5px solid ${f.a?O.navy:O.brd}`,background:f.a?O.navyP:O.w,color:f.a?O.navy:O.inkM,fontSize:9,fontWeight:600,fontFamily:ff,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
          {f.l}<span style={{background:f.a?O.navy:O.brd,color:f.a?"#FFF":O.inkM,padding:"1px 5px",borderRadius:6,fontSize:8,fontWeight:700}}>{f.c}</span>
        </button>)}
      </div>
      {[{cat:"🔧",title:"Water leak — Bathroom Unit 4B",priority:"Urgent",status:"Vendor Assigned",vendor:"QuickFix Plumbing",date:"3 Mar",pc:O.red,sc:O.navy,loc:"Unit 4B"},
        {cat:"🅿️",title:"Parking gate barrier stuck",priority:"Urgent",status:"In Progress",vendor:"GateTech Ltd",date:"1 Mar",pc:O.red,sc:O.teal,loc:"Parking B1"},
        {cat:"🏊",title:"Pool pump pressure low",priority:"Normal",status:"Vendor Assigned",vendor:"AquaCare",date:"28 Feb",pc:O.amb,sc:O.navy,loc:"Swimming Pool"},
        {cat:"💡",title:"Corridor lighting flickering — 4F",priority:"Normal",status:"Open",vendor:null,date:"5 Mar",pc:O.amb,sc:O.amb,loc:"Common Area"},
        {cat:"🏋️",title:"Gym treadmill #2 jammed",priority:"Low",status:"Open",vendor:null,date:"6 Mar",pc:O.inkM,sc:O.amb,loc:"Gymnasium"},
      ].map((r,i)=><Card key={i} onClick={()=>go("maintDetail")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{display:"flex",gap:8,alignItems:"flex-start",flex:1}}>
            <IC emoji={r.cat} s={34} bg={`${r.pc}0D`}/>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:O.ink,fontFamily:ff}}>{r.title}</div>
              <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}><span style={{fontSize:9,color:O.inkM,fontFamily:ff}}>📍 {r.loc}</span><span style={{fontSize:9,color:O.inkM,fontFamily:ff}}>• {r.date}</span></div>
            </div>
          </div>
          <Pill c={r.pc}>{r.priority}</Pill>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:r.sc}}/><span style={{fontSize:10,color:O.inkS,fontFamily:ff}}>{r.status}</span></div>
          {r.vendor&&<span style={{fontSize:9,color:O.inkM,fontFamily:ff}}>🏢 {r.vendor}</span>}
        </div>
        {r.vendor&&<div style={{marginTop:8,padding:"8px 10px",background:O.navyP,borderRadius:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11}}>💬</span><span style={{fontSize:10,color:O.navy,fontWeight:700,fontFamily:ff}}>Track via WhatsApp</span>
          <span style={{marginLeft:"auto",fontSize:9,color:O.inkM,fontFamily:ff}}>ETA: Tomorrow</span>
        </div>}
      </Card>)}
    </div>
  </div>
);

// ─── SCR-R-032: MAINTENANCE DETAIL ───
const MaintDetailScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Request Detail" onBack={goBack} right={<Pill c={O.red}>URGENT</Pill>}/>
    {/* Status Timeline */}
    <Card highlight>
      <div style={{fontSize:11,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:12}}>Progress Timeline</div>
      {[{step:"Submitted",time:"3 Mar, 9:15 AM",done:true,icon:"📝"},
        {step:"Acknowledged by Syndic",time:"3 Mar, 10:02 AM",done:true,icon:"✅"},
        {step:"Vendor Assigned: QuickFix Plumbing",time:"3 Mar, 11:30 AM",done:true,icon:"🏢"},
        {step:"Vendor Accepted Job",time:"3 Mar, 2:15 PM",done:true,icon:"👍"},
        {step:"Repair In Progress",time:"Scheduled: 8 Mar, 9:00 AM",done:false,icon:"🔧"},
        {step:"Completed",time:"",done:false,icon:"✔️"},
        {step:"Closed & Rated",time:"",done:false,icon:"⭐"},
      ].map((s,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:2}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:24}}>
          <div style={{width:20,height:20,borderRadius:10,background:s.done?O.teal:`${O.brd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:s.done?"#FFF":O.inkF}}>{s.done?"✓":i+1}</div>
          {i<6&&<div style={{width:2,height:20,background:s.done?O.teal:O.brd}}/>}
        </div>
        <div style={{flex:1,paddingBottom:6}}>
          <div style={{fontSize:11,fontWeight:s.done?700:500,color:s.done?O.ink:O.inkM,fontFamily:ff}}>{s.step}</div>
          {s.time&&<div style={{fontSize:9,color:O.inkM,fontFamily:fm}}>{s.time}</div>}
        </div>
      </div>)}
    </Card>
    {/* Request Details */}
    <Card>
      <div style={{fontSize:11,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:8}}>Request Details</div>
      {[["Category","🔧 Plumbing"],["Title","Water leak — Bathroom Unit 4B"],["Location","Unit 4B — Master bathroom"],["Priority","Urgent"],["Description","Water leaking from pipe under bathroom sink. Causing water damage to floor tiles. Leak is continuous, approximately 1 drip per second."],["Photos","2 images attached"]].map((f,i)=><div key={i} style={{display:"flex",padding:"5px 0",borderBottom:`1px solid ${O.brdL}`}}>
        <span style={{fontSize:10,color:O.inkM,fontFamily:ff,width:80}}>{f[0]}</span>
        <span style={{fontSize:10,color:O.ink,fontFamily:ff,flex:1}}>{f[1]}</span>
      </div>)}
    </Card>
    {/* Vendor Info */}
    <Card>
      <div style={{fontSize:11,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:8}}>Assigned Vendor</div>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <IC emoji="🔧" s={40} bg={O.navyP}/>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:O.ink,fontFamily:ff}}>QuickFix Plumbing</div>
          <div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>Contact: Mr Dookhee • +230 5712 3456</div>
          <div style={{fontSize:10,color:O.teal,fontFamily:ff,fontWeight:600}}>⭐ 4.8 rating • 23 completed jobs</div>
        </div>
      </div>
    </Card>
    <div style={{display:"flex",gap:6}}>
      <Btn full small primary c={O.navy}>💬 Chat with Vendor</Btn>
      <Btn full small>📞 Call Vendor</Btn>
    </div>
  </div>
);

// ─── SCR-R-031: NEW REQUEST ───
const NewReqScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Report an Issue" onBack={goBack}/>
    <div style={{display:"flex",gap:4,marginBottom:16}}>
      {[{n:1,l:"Category",a:true},{n:2,l:"Location"},{n:3,l:"Details"},{n:4,l:"Photos"}].map((s,i)=><div key={i} style={{flex:1,display:"flex",alignItems:"center",gap:3}}>
        <div style={{width:20,height:20,borderRadius:10,background:s.a?O.navy:O.brd,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:s.a?"#FFF":O.inkF}}>{s.n}</div>
        <span style={{fontSize:9,color:s.a?O.navy:O.inkF,fontWeight:600,fontFamily:ff}}>{s.l}</span>
        {i<3&&<div style={{flex:1,height:1,background:O.brd}}/>}
      </div>)}
    </div>
    <div style={{fontSize:10,fontWeight:700,color:O.inkM,letterSpacing:.5,fontFamily:ff,marginBottom:6,textTransform:"uppercase"}}>Select Category *</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
      {["🔧 Plumbing","💡 Electrical","🧱 Structural","🧹 Cleaning","🛡 Security","🛗 Lift","🅿️ Parking/Gate","🏊 Pool","🏋️ Gym","❄ HVAC","📦 Storage","📦 Other"].map((c,i)=><div key={i} style={{background:i===0?O.navyP:O.w,border:`1.5px solid ${i===0?O.navy:O.brd}`,borderRadius:10,padding:"8px 4px",textAlign:"center",fontSize:10,fontWeight:700,color:i===0?O.navy:O.inkS,fontFamily:ff,cursor:"pointer"}}>{c}</div>)}
    </div>
    <div style={{fontSize:10,fontWeight:700,color:O.inkM,letterSpacing:.5,fontFamily:ff,marginBottom:6,textTransform:"uppercase"}}>Location *</div>
    <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
      {["My Unit (4B)","Common Area","Parking B1","Parking B2","Pool Area","Gymnasium","Garden","Roof","Lobby","Store Room"].map((l,i)=><button key={i} style={{padding:"6px 10px",borderRadius:100,border:`1.5px solid ${i===0?O.teal:O.brd}`,background:i===0?O.tealP:O.w,color:i===0?O.teal:O.inkM,fontSize:9,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>{l}</button>)}
    </div>
    <Inp label="Title *" placeholder="Brief description of the issue"/>
    <Inp label="Detailed Description *" placeholder="Describe the problem, exact location, what you observed..."/>
    <div style={{fontSize:10,fontWeight:700,color:O.inkM,letterSpacing:.5,fontFamily:ff,marginBottom:6,textTransform:"uppercase"}}>Priority *</div>
    <div style={{display:"flex",gap:5,marginBottom:14}}>
      {[{l:"Low",c:O.inkF},{l:"Normal",c:O.amb,a:true},{l:"Urgent",c:O.red},{l:"Emergency",c:"#991B1B"}].map((p,i)=><button key={i} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1.5px solid ${p.a?p.c:O.brd}`,background:p.a?`${p.c}0D`:O.w,color:p.a?p.c:O.inkM,fontSize:10,fontWeight:700,fontFamily:ff,cursor:"pointer"}}>{p.l}</button>)}
    </div>
    <div style={{background:O.w,borderRadius:12,padding:14,border:`1.5px dashed ${O.brd}`,textAlign:"center",marginBottom:14}}>
      <div style={{fontSize:24,marginBottom:4}}>📷</div>
      <div style={{fontSize:11,color:O.inkS,fontFamily:ff,fontWeight:600}}>Add Photos (up to 5)</div>
      <div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>Tap to take photo or select from gallery</div>
    </div>
    <Btn primary full>Submit Request</Btn>
    <div style={{textAlign:"center",marginTop:6,fontSize:9,color:O.inkM,fontFamily:ff}}>💬 Updates will be sent via WhatsApp</div>
  </div>
);

// ─── SCR-R-040: CO-OWNERSHIP ───
const CoproScreen=({go})=>(
  <div style={{paddingBottom:72}}>
    <div style={{padding:"14px 20px 0"}}>
      <div style={{fontSize:17,fontWeight:900,color:O.ink,fontFamily:ff,marginBottom:14}}>My Co-Ownership</div>
      {/* AGM Card */}
      <Card highlight onClick={()=>go("voting")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{fontSize:14,fontWeight:800,color:O.ink,fontFamily:ff}}>🗳 Annual General Meeting</div>
          <Pill c={O.amb} bg={O.ambP}>VOTING OPEN</Pill>
        </div>
        <div style={{fontSize:11,color:O.inkS,fontFamily:ff}}>15 May 2026 • 6:00 PM • Community Hall</div>
        <div style={{fontSize:10,color:O.inkM,fontFamily:ff,marginTop:3,marginBottom:10}}>3 resolutions • Documents available • 💬 WhatsApp notice sent</div>
        <div style={{display:"flex",gap:6}}><Btn primary small>🗳 Vote Now</Btn><Btn small>📋 AGM Docs</Btn></div>
      </Card>

      {/* Facilities */}
      <SectionTitle>Facilities & Amenities</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[{icon:"🏊",label:"Swimming Pool",hours:"6am–8pm daily",status:"Open Now",sc:O.grn,detail:"25m heated pool • Towels not provided"},
          {icon:"🏋️",label:"Gymnasium",hours:"5am–10pm daily",status:"2 slots today",sc:O.amb,detail:"15 machines • Booking required"},
          {icon:"🏛",label:"Community Hall",hours:"By reservation",status:"Available 20 Mar",sc:O.navy,detail:"Capacity 80 • Rs 2,000/half day"},
          {icon:"🅿️",label:"Visitor Parking",hours:"24/7 with pass",status:"4 bays free",sc:O.teal,detail:"Pre-register via app or WhatsApp"},
        ].map((f,i)=><div key={i} onClick={()=>go("facilities")} style={{background:O.w,borderRadius:14,padding:"12px",border:`1px solid ${O.brdL}`,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
            <span style={{fontSize:20}}>{f.icon}</span><div style={{width:6,height:6,borderRadius:3,background:f.sc}}/>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:O.ink,fontFamily:ff}}>{f.label}</div>
          <div style={{fontSize:8,color:O.inkM,fontFamily:ff}}>{f.hours}</div>
          <div style={{fontSize:8,color:f.sc,fontFamily:ff,fontWeight:600,marginTop:2}}>{f.status}</div>
          <div style={{fontSize:7,color:O.inkF,fontFamily:ff,marginTop:2}}>{f.detail}</div>
        </div>)}
      </div>

      {/* Announcements */}
      <SectionTitle>Notices & Announcements</SectionTitle>
      {[{p:"urgent",t:"Water Supply Disruption — Tomorrow",b:"Main supply interrupted 8am-2pm for pipe replacement.",time:"2h",wa:true},
        {p:"info",t:"EV Charging Rates Updated",b:"New rate: Rs 15/kWh from 1 April. Applies to bays E-1 to E-6.",time:"1d"},
        {p:"info",t:"Gym Equipment Upgrade",b:"New treadmills arriving next week. Gym closed 12-13 March for installation.",time:"2d"},
        {p:"info",t:"New Landscaping Contractor",b:"GreenScape Ltd appointed by syndic. Service starts 1 April.",time:"5d"},
      ].map((a,i)=><Card key={i}>
        <div style={{display:"flex",gap:5,marginBottom:3,alignItems:"center"}}>
          <Pill c={a.p==="urgent"?O.red:O.inkM} bg={a.p==="urgent"?O.redP:undefined}>{a.p==="urgent"?"URGENT":"NOTICE"}</Pill>
          <span style={{fontSize:9,color:O.inkF,fontFamily:ff}}>{a.time} ago</span>
          {a.wa&&<span style={{fontSize:8,color:O.grn,fontFamily:ff}}>💬 WhatsApp sent</span>}
        </div>
        <div style={{fontSize:12,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:2}}>{a.t}</div>
        <div style={{fontSize:10,color:O.inkM,fontFamily:ff,lineHeight:1.5}}>{a.b}</div>
      </Card>)}

      {/* Quick Access */}
      <SectionTitle>Documents & Info</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {[{icon:"📋",label:"Rules"},{icon:"📊",label:"Budget"},{icon:"📁",label:"Minutes"},
          {icon:"📑",label:"Contracts"},{icon:"🏦",label:"Funds"},{icon:"📞",label:"Contacts"},
        ].map((q,i)=><div key={i} onClick={()=>go("documents")} style={{background:O.w,borderRadius:12,padding:"10px 8px",border:`1px solid ${O.brdL}`,display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}}>
          <span style={{fontSize:16}}>{q.icon}</span><span style={{fontSize:9,fontWeight:600,color:O.inkS,fontFamily:ff}}>{q.label}</span>
        </div>)}
      </div>
    </div>
  </div>
);

// ─── SCR-R-043: VOTING ───
const VotingScreen=({goBack})=>{
  const [votes,setVotes]=useState({1:"For",2:"For",3:null});
  return(
    <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
      <Back title="AGM Voting" onBack={goBack}/>
      <div style={{fontSize:10,color:O.inkM,fontFamily:ff,marginBottom:10}}>15 May 2026 • Your weight: 152 / 10,000 shares</div>
      <div style={{background:O.tealP,borderRadius:10,padding:"8px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:6,border:`1px solid ${O.teal}15`}}>
        <span style={{fontSize:12}}>⏱</span><span style={{fontSize:11,color:O.teal,fontWeight:700,fontFamily:ff}}>Voting closes in 3 days 14 hours</span>
      </div>
      {[{n:1,t:"Approval of 2025 Accounts",d:"Approve management accounts for FY ending 31 Dec 2025. Includes service charges, parking/storage rental income (Rs 168K), and EV charging revenue (Rs 148K). Simple majority (Art. 24)."},
        {n:2,t:"2026/27 Annual Budget",d:"Approve budget of Rs 2,400,000 including: maintenance Rs 1.2M, security Rs 420K, cleaning Rs 360K, insurance Rs 120K, pool/gym Rs 180K, EV infrastructure Rs 120K. Monthly charge: Rs 4,250/unit unchanged. Simple majority (Art. 24)."},
        {n:3,t:"Lift Modernisation Works",d:"Approve Rs 1,800,000 for modernisation of both lifts (Blocks A & B). Funded from reserve fund (current balance: Rs 1.2M). Special levy of Rs 5,000/unit if reserve insufficient. Absolute majority (Art. 25)."},
      ].map(r=><Card key={r.n} highlight={!!votes[r.n]}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:28,height:28,borderRadius:8,background:O.navyP,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:O.navy,fontFamily:ff}}>R{r.n}</div>
            <div style={{fontSize:13,fontWeight:800,color:O.ink,fontFamily:ff,flex:1}}>{r.t}</div>
          </div>
          {votes[r.n]&&<Pill c={O.teal} bg={O.tealP}>✓ Voted</Pill>}
        </div>
        <div style={{fontSize:10,color:O.inkM,fontFamily:ff,lineHeight:1.6,marginBottom:10}}>{r.d}</div>
        {votes[r.n]?<div style={{padding:"8px 12px",background:O.tealP,borderRadius:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:12,color:O.teal}}>✓</span><span style={{fontSize:11,color:O.teal,fontWeight:700,fontFamily:ff}}>Your vote: {votes[r.n]}</span>
          <span style={{marginLeft:"auto",fontSize:9,color:O.inkM,fontFamily:fm}}>152 shares</span>
        </div>:<div style={{display:"flex",gap:6}}>
          {[{l:"✓ For",c:O.teal},{l:"✗ Against",c:O.red},{l:"— Abstain",c:O.inkM}].map((v,vi)=><button key={vi} onClick={()=>setVotes(p=>({...p,[r.n]:["For","Against","Abstain"][vi]}))} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${v.c}30`,background:O.w,color:v.c,fontSize:11,fontWeight:800,fontFamily:ff,cursor:"pointer"}}
            onMouseOver={e=>e.currentTarget.style.background=`${v.c}08`} onMouseOut={e=>e.currentTarget.style.background=O.w}>{v.l}</button>)}
        </div>}
      </Card>)}
      <Card>
        <div style={{fontSize:11,fontWeight:700,color:O.inkS,fontFamily:ff,marginBottom:6}}>Participation</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <span style={{fontSize:10,color:O.inkM,fontFamily:ff}}>6,420 / 10,000 shares represented</span>
          <span style={{fontSize:14,fontWeight:900,color:O.teal,fontFamily:ff}}>64.2%</span>
        </div>
        <div style={{height:7,background:O.bg,borderRadius:4}}><div style={{width:"64.2%",height:"100%",background:`linear-gradient(90deg,${O.navy},${O.teal})`,borderRadius:4}}/></div>
        <div style={{fontSize:8,color:O.inkF,fontFamily:ff,marginTop:4}}>Quorum: majority of shares (Art. 24/25)</div>
      </Card>
    </div>
  );
};

// ─── SCR-R-044: FACILITY BOOKING ───
const FacilityScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Facility Booking" onBack={goBack}/>
    <div style={{display:"flex",gap:6,marginBottom:14}}>
      {["🏊 Pool","🏋️ Gym","🏛 Hall"].map((f,i)=><button key={i} style={{flex:1,padding:"10px",borderRadius:12,border:`1.5px solid ${i===0?O.navy:O.brd}`,background:i===0?O.navyP:O.w,color:i===0?O.navy:O.inkM,fontSize:12,fontWeight:700,fontFamily:ff,cursor:"pointer"}}>{f}</button>)}
    </div>
    <Card highlight>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:28}}>🏊</span>
        <div><div style={{fontSize:14,fontWeight:800,color:O.ink,fontFamily:ff}}>Swimming Pool</div>
          <div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>25m heated • Open 6am–8pm daily</div>
          <div style={{fontSize:9,color:O.grn,fontFamily:ff,fontWeight:600}}>Currently Open • No booking required</div>
        </div>
      </div>
      <Divider/>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,fontFamily:ff,marginBottom:6}}>POOL RULES</div>
      <div style={{fontSize:9,color:O.inkS,fontFamily:ff,lineHeight:1.6}}>• Shower before entering • No glass containers • Children under 12 must be accompanied • No diving in shallow end • Private bookings available for events (Rs 3,000/2hrs)</div>
    </Card>
    {/* Calendar */}
    <Card>
      <div style={{fontSize:11,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:8}}>Book Private Session</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:12,color:O.inkM,cursor:"pointer"}}>← Feb</span>
        <span style={{fontSize:13,fontWeight:800,color:O.ink,fontFamily:ff}}>March 2026</span>
        <span style={{fontSize:12,color:O.inkM,cursor:"pointer"}}>Apr →</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
        {["M","T","W","T","F","S","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:8,color:O.inkF,fontFamily:ff,fontWeight:700,padding:"4px 0"}}>{d}</div>)}
        {Array.from({length:31},(_, i)=>{
          const d=i+1; const past=d<8; const selected=d===15; const booked=[10,11,22,23].includes(d);
          return <div key={i} style={{textAlign:"center",padding:"6px 0",borderRadius:8,fontSize:10,fontWeight:selected?800:500,fontFamily:ff,
            background:selected?O.navy:booked?O.redP:"transparent",
            color:selected?"#FFF":past?O.inkF:booked?O.red:O.ink,cursor:past?"default":"pointer"}}>{d}</div>;
        })}
      </div>
      <div style={{display:"flex",gap:8,fontSize:8,color:O.inkM,fontFamily:ff,marginBottom:8}}>
        <span>⬜ Available</span><span style={{color:O.navy}}>🟦 Selected</span><span style={{color:O.red}}>🟥 Booked</span>
      </div>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,fontFamily:ff,marginBottom:6}}>AVAILABLE SLOTS — 15 March</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
        {["6-8am","8-10am","10-12pm","12-2pm","2-4pm","4-6pm"].map((s,i)=><div key={i} style={{padding:"8px",borderRadius:8,border:`1.5px solid ${i===2?O.teal:O.brd}`,background:i===2?O.tealP:O.w,textAlign:"center",fontSize:10,fontWeight:i===2?700:500,color:i===2?O.teal:O.inkS,fontFamily:ff,cursor:"pointer"}}>{s}</div>)}
      </div>
    </Card>
    <Btn primary full c={O.teal}>Confirm Booking — 15 Mar, 10am-12pm</Btn>
  </div>
);

// ─── SCR-R-045: VISITOR PRE-REGISTRATION ───
const VisitorScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Visitor Pre-Registration" onBack={goBack}/>
    <Card highlight>
      <div style={{fontSize:12,fontWeight:700,color:O.ink,fontFamily:ff,marginBottom:10}}>Register Expected Visitor</div>
      <Inp label="Visitor Name *" placeholder="Full name of visitor" icon="👤"/>
      <Inp label="Vehicle Registration" placeholder="e.g., MU 1234 AB (optional)" icon="🚗"/>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,letterSpacing:.5,fontFamily:ff,marginBottom:5,textTransform:"uppercase"}}>Purpose of Visit *</div>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {["Personal","Delivery","Service","Other"].map((p,i)=><button key={i} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${i===0?O.navy:O.brd}`,background:i===0?O.navyP:O.w,color:i===0?O.navy:O.inkM,fontSize:10,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>{p}</button>)}
      </div>
      <Inp label="Expected Date & Time *" placeholder="Select date and time" icon="📅"/>
      <div style={{fontSize:10,fontWeight:700,color:O.inkM,letterSpacing:.5,fontFamily:ff,marginBottom:5,textTransform:"uppercase"}}>Parking Required</div>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {[{l:"No parking",a:true},{l:"2 hours"},{l:"4 hours"},{l:"Full day"}].map((d,i)=><button key={i} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${d.a?O.teal:O.brd}`,background:d.a?O.tealP:O.w,color:d.a?O.teal:O.inkM,fontSize:9,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>{d.l}</button>)}
      </div>
      <Btn primary full>Register Visitor</Btn>
      <div style={{textAlign:"center",marginTop:6,fontSize:9,color:O.inkM,fontFamily:ff}}>QR code / access PIN will be generated and sent via WhatsApp</div>
    </Card>
    <SectionTitle>My Upcoming Visitors</SectionTitle>
    {[{name:"J. Smith",date:"10 Mar, 2pm",purpose:"Personal",parking:"Bay V-03 (4h)",status:"Active"},
      {name:"DHL Delivery",date:"12 Mar, 9am",purpose:"Delivery",parking:"None",status:"Pending"},
    ].map((v,i)=><Card key={i}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div style={{fontSize:12,fontWeight:700,color:O.ink,fontFamily:ff}}>{v.name}</div>
          <div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>{v.date} • {v.purpose}</div>
          <div style={{fontSize:9,color:O.teal,fontFamily:ff}}>🅿️ {v.parking}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <Pill c={v.status==="Active"?O.grn:O.amb}>{v.status}</Pill>
          <span style={{fontSize:8,color:O.red,fontFamily:ff,cursor:"pointer"}}>Cancel</span>
        </div>
      </div>
    </Card>)}
  </div>
);

// ─── SCR-R-046: EV CHARGING ───
const EVScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="EV Charging — Bay E-3" onBack={goBack}/>
    <Card highlight>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
        <IC emoji="⚡" s={44} bg={O.tealP}/>
        <div><div style={{fontSize:14,fontWeight:800,color:O.ink,fontFamily:ff}}>Bay E-3 — Level B1</div>
          <div style={{fontSize:10,color:O.teal,fontWeight:600,fontFamily:ff}}>Status: Available • 7.4 kW AC Charger</div>
          <div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>Rate: Rs 15/kWh • Owner allocated to Unit 4B</div>
        </div>
      </div>
    </Card>
    <SectionTitle>Charging History</SectionTitle>
    <div style={{background:O.w,borderRadius:14,border:`1px solid ${O.brdL}`,overflow:"hidden"}}>
      {[{date:"5 Mar",dur:"3h 20m",kwh:"12.4",cost:"Rs 186",vehicle:"Tesla Model 3"},
        {date:"1 Mar",dur:"4h 05m",kwh:"15.2",cost:"Rs 228",vehicle:"Tesla Model 3"},
        {date:"25 Feb",dur:"2h 45m",kwh:"10.1",cost:"Rs 152",vehicle:"Tesla Model 3"},
        {date:"20 Feb",dur:"5h 10m",kwh:"18.7",cost:"Rs 281",vehicle:"Tesla Model 3"},
        {date:"15 Feb",dur:"3h 00m",kwh:"11.2",cost:"Rs 168",vehicle:"Tesla Model 3"},
      ].map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<4?`1px solid ${O.brdL}`:"none"}}>
        <IC emoji="⚡" s={28} bg={O.tealP}/>
        <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:O.ink,fontFamily:ff}}>{s.date} — {s.kwh} kWh ({s.dur})</div>
          <div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>{s.vehicle}</div></div>
        <span style={{fontSize:12,fontWeight:800,color:O.teal,fontFamily:ff}}>{s.cost}</span>
      </div>)}
    </div>
    <Card>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <div><div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>This Month</div><div style={{fontSize:18,fontWeight:900,color:O.teal,fontFamily:ff}}>27.6 kWh</div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:9,color:O.inkM,fontFamily:ff}}>Total Cost</div><div style={{fontSize:18,fontWeight:900,color:O.ink,fontFamily:ff}}>Rs 414</div></div>
      </div>
    </Card>
  </div>
);

// ─── SCR-R-051: DOCUMENTS ───
const DocumentsScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Document Library" onBack={goBack}/>
    <Inp placeholder="Search documents..." icon="🔍"/>
    {[{folder:"📋 Co-Ownership Rules",count:3,items:["Rules & Regulations (2024)","Building Bylaws","House Rules"]},
      {folder:"📊 Financial Statements",count:8,items:["FY 2025 Accounts","Budget 2026/27","Reserve Fund Report"]},
      {folder:"📁 Meeting Minutes",count:12,items:["AGM May 2025","EGM Feb 2026","Committee Meeting Jan 2026"]},
      {folder:"📑 Contracts & Insurance",count:5,items:["Security Contract","Cleaning Contract","Building Insurance"]},
      {folder:"📄 My Documents",count:4,items:["Title Deed","Purchase Agreement","Unit Plan"]},
    ].map((f,i)=><Card key={i}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:13,fontWeight:700,color:O.ink,fontFamily:ff}}>{f.folder}</div>
        <Pill c={O.inkM}>{f.count} files</Pill>
      </div>
      {f.items.map((doc,di)=><div key={di} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:di<f.items.length-1?`1px solid ${O.brdL}`:"none"}}>
        <span style={{fontSize:11}}>📄</span>
        <span style={{fontSize:11,color:O.inkS,fontFamily:ff,flex:1}}>{doc}</span>
        <span style={{fontSize:9,color:O.navy,fontFamily:ff,fontWeight:600,cursor:"pointer"}}>View</span>
      </div>)}
    </Card>)}
  </div>
);

// ─── SCR-R-050: PROFILE ───
const ProfileScreen=({go})=>(
  <div style={{paddingBottom:72}}>
    <div style={{padding:"14px 20px 0"}}>
      <div style={{fontSize:17,fontWeight:900,color:O.ink,fontFamily:ff,marginBottom:14}}>My Account</div>
      <Card highlight>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${O.navy},${O.teal})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#FFF",fontFamily:ff}}>RM</div>
          <div><div style={{fontSize:16,fontWeight:900,color:O.ink,fontFamily:ff}}>Rajesh Moonien</div>
            <div style={{fontSize:10,color:O.inkM,fontFamily:ff}}>Co-Owner • Unit 4B • Block A</div>
            <div style={{fontSize:9,color:O.inkF,fontFamily:fm}}>Shares: 152 / 10,000 (1.52%)</div>
          </div>
        </div>
      </Card>
      {[{s:"My Property",items:[{icon:"🏠",l:"Unit Details",v:"4B • T2 • 85m²"},{icon:"🅿️",l:"Parking Bay",v:"B-12 (Owner)"},{icon:"⚡",l:"EV Charging Bay",v:"E-3 (Active)"},{icon:"📦",l:"Storage Unit",v:"S-07 (10m²)"},{icon:"📊",l:"Share Allocation",v:"152 / 10,000"}]},
        {s:"Account",items:[{icon:"👤",l:"Personal Information"},{icon:"🔐",l:"Change Password"},{icon:"📱",l:"Biometric Login",tog:true,on:true}]},
        {s:"Notifications",items:[{icon:"🔔",l:"Push Notifications",tog:true,on:true},{icon:"💬",l:"WhatsApp Notifications",tog:true,on:true},{icon:"✉️",l:"Email Notifications",tog:true,on:true},{icon:"📱",l:"SMS Notifications",tog:true,on:false}]},
        {s:"Preferences",items:[{icon:"🌐",l:"Language",v:"English"},{icon:"🌙",l:"Dark Mode",tog:true,on:false}]},
        {s:"Support",items:[{icon:"❓",l:"FAQ & Help Centre"},{icon:"📞",l:"Contact Syndic Manager"},{icon:"💬",l:"WhatsApp Support"},{icon:"📝",l:"Terms & Conditions"},{icon:"🔒",l:"Privacy Policy"}]},
      ].map((s,si)=><div key={si} style={{marginBottom:14}}>
        <div style={{fontSize:9,fontWeight:700,color:O.inkF,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5,paddingLeft:2,fontFamily:ff}}>{s.s}</div>
        <div style={{background:O.w,borderRadius:14,border:`1px solid ${O.brdL}`,overflow:"hidden"}}>
          {s.items.map((it,ii)=><div key={ii} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",borderBottom:ii<s.items.length-1?`1px solid ${O.brdL}`:"none",cursor:"pointer"}}>
            <span style={{fontSize:15}}>{it.icon}</span>
            <span style={{flex:1,fontSize:13,color:O.ink,fontFamily:ff,fontWeight:500}}>{it.l}</span>
            {it.tog?<div style={{width:40,height:22,borderRadius:11,background:it.on?O.navy:O.brd,padding:2}}>
              <div style={{width:18,height:18,borderRadius:9,background:"#FFF",transform:it.on?"translateX(18px)":"translateX(0)",transition:"all 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}/>
            </div>:it.v?<span style={{fontSize:10,color:O.inkM,fontFamily:ff}}>{it.v} ›</span>:<span style={{color:O.inkF,fontSize:14}}>›</span>}
          </div>)}
        </div>
      </div>)}
      <button style={{width:"100%",padding:12,background:O.redP,color:O.red,border:`1px solid ${O.red}15`,borderRadius:14,fontSize:13,fontWeight:700,fontFamily:ff,cursor:"pointer"}}>Sign Out</button>
      <div style={{textAlign:"center",marginTop:12,fontSize:9,color:O.inkF,fontFamily:fm}}>SyndicMS v2.0 • Build 2026.03.08 • MySQL Backend</div>
    </div>
  </div>
);

// ─── SCR-R-052: NOTIFICATIONS ───
const NotifsScreen=({goBack})=>(
  <div style={{padding:"14px 20px",background:O.warm,minHeight:"100%"}}>
    <Back title="Notifications" onBack={goBack} right={<span style={{fontSize:11,color:O.navy,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>Mark all read</span>}/>
    <div style={{display:"flex",gap:5,marginBottom:12}}>
      {["All (3)","Finance","Maintenance","Community","WhatsApp"].map((f,i)=><button key={i} style={{padding:"5px 10px",borderRadius:100,border:`1.5px solid ${i===0?O.navy:O.brd}`,background:i===0?O.navyP:O.w,color:i===0?O.navy:O.inkM,fontSize:9,fontWeight:600,fontFamily:ff,cursor:"pointer"}}>{f}</button>)}
    </div>
    {[{icon:"📄",t:"Invoice SC-2026-003 Issued",s:"Service charges March — Rs 4,250 due 1 Apr",time:"1h",read:false,c:O.navy},
      {icon:"💬",t:"WhatsApp: Invoice Delivered",s:"March invoice notification sent to +230 5712 XXXX",time:"1h",read:false,c:O.grn},
      {icon:"🗳",t:"Vote Now: 3 Resolutions Open",s:"AGM 15 May — voting closes in 3 days",time:"2d",read:false,c:O.vio},
      {icon:"🔧",t:"Maintenance: Vendor Assigned",s:"QuickFix Plumbing assigned to water leak — ETA tomorrow",time:"4d",read:true,c:O.amb},
      {icon:"⚡",t:"EV Charging Session Complete",s:"Bay E-3 — 12.4 kWh — Rs 186 billed",time:"5d",read:true,c:O.teal},
      {icon:"📢",t:"Announcement: Water Disruption",s:"Main supply interrupted tomorrow 8am-2pm",time:"6d",read:true,c:O.red},
    ].map((n,i)=><div key={i} style={{display:"flex",gap:10,padding:"11px 0",borderBottom:`1px solid ${O.brdL}`,cursor:"pointer",opacity:n.read?.7:1}}>
      <IC emoji={n.icon} s={32} bg={`${n.c}0D`}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",gap:4,alignItems:"center"}}><div style={{fontSize:12,fontWeight:n.read?500:700,color:O.ink,fontFamily:ff}}>{n.t}</div>{!n.read&&<div style={{width:6,height:6,borderRadius:3,background:O.navy}}/>}</div>
        <div style={{fontSize:10,color:O.inkM,fontFamily:ff,marginTop:1}}>{n.s}</div>
      </div>
      <span style={{fontSize:9,color:O.inkF,fontFamily:ff,flexShrink:0}}>{n.time}</span>
    </div>)}
  </div>
);

// ════════════ MAIN APP ════════════
const TABS=[{icon:"🏠",label:"Home"},{icon:"💰",label:"Finance"},{icon:"🔧",label:"Report"},{icon:"🏢",label:"My Co-Op"},{icon:"👤",label:"Account"}];
const TAB_MAP=["home","finance","maint","copro","profile"];
const LABELS={login:"Sign In",register:"Create Account",home:"Home",finance:"My Finances",invoiceDetail:"Invoice Detail",payment:"Pay Charges",statement:"Statement",maint:"Maintenance",maintDetail:"Request Detail",newreq:"Report Issue",copro:"My Co-Ownership",voting:"AGM Voting",facilities:"Facility Booking",visitors:"Visitor Registration",evcharging:"EV Charging",parking:"My Parking",storage:"My Storage",documents:"Documents",profile:"My Account",notifs:"Notifications"};

export default function App(){
  const [scr,setScr]=useState("home");
  const [tab,setTab]=useState(0);
  const [auth,setAuth]=useState(true);
  const go=useCallback(s=>setScr(s),[]);
  const handleTab=i=>{setTab(i);setScr(TAB_MAP[i]);};
  const goBack=()=>setScr(TAB_MAP[tab]);
  const showTabs=TAB_MAP.includes(scr);

  const render=()=>{
    if(!auth) return <LoginScreen onLogin={()=>setAuth(true)}/>;
    switch(scr){
      case "home": return <HomeScreen go={go}/>;
      case "finance": return <FinanceScreen go={go}/>;
      case "invoiceDetail": return <InvoiceDetail goBack={()=>setScr("finance")}/>;
      case "payment": return <PaymentScreen goBack={goBack}/>;
      case "statement": return <StatementScreen goBack={()=>setScr("finance")}/>;
      case "maint": return <MaintScreen go={go}/>;
      case "maintDetail": return <MaintDetailScreen goBack={()=>setScr("maint")}/>;
      case "newreq": return <NewReqScreen goBack={()=>setScr("maint")}/>;
      case "copro": return <CoproScreen go={go}/>;
      case "voting": return <VotingScreen goBack={()=>setScr("copro")}/>;
      case "facilities": return <FacilityScreen goBack={()=>setScr("copro")}/>;
      case "visitors": return <VisitorScreen goBack={()=>setScr("copro")}/>;
      case "evcharging": return <EVScreen goBack={goBack}/>;
      case "documents": return <DocumentsScreen goBack={()=>setScr("copro")}/>;
      case "profile": return <ProfileScreen go={go}/>;
      case "notifs": return <NotifsScreen goBack={goBack}/>;
      case "register": return <RegisterScreen goBack={()=>setAuth(false)}/>;
      default: return <HomeScreen go={go}/>;
    }
  };

  return(
    <div style={{minHeight:"100vh",background:"#EEF1F5",display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 12px",fontFamily:ff}}>
      <div style={{marginBottom:20,textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:3}}>
          <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${O.navy},${O.sky})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏠</div>
          <h1 style={{fontSize:22,fontWeight:900,color:O.ink,margin:0,letterSpacing:-.5}}>SyndicMS</h1>
        </div>
        <p style={{fontSize:11,color:O.inkM,margin:"2px 0 4px"}}>Resident Mobile App • Co-Owner Portal</p>
        <div style={{display:"flex",gap:4,justifyContent:"center"}}><Pill c={O.navy}>OWNERS ONLY</Pill><Pill c={O.teal} bg={O.tealP}>v2.0 COMPLETE</Pill></div>
      </div>
      <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap",justifyContent:"center"}}>
        <Phone title={LABELS[scr]||"SyndicMS"}>{render()}{auth&&showTabs&&<TabBar tabs={TABS} active={tab} onChange={handleTab}/>}</Phone>
        <div style={{width:200}}>
          <div style={{fontSize:9,fontWeight:700,color:O.inkF,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>All Screens ({Object.keys(LABELS).length})</div>
          {Object.entries(LABELS).map(([id,label])=><button key={id} onClick={()=>{if(id==="login"){setAuth(false);setScr("login");}else{setAuth(true);setScr(id);const ti=TAB_MAP.indexOf(id);if(ti>=0)setTab(ti);}}}
            style={{display:"block",width:"100%",padding:"7px 10px",marginBottom:2,background:scr===id?O.navyP:O.w,border:`1px solid ${scr===id?O.navy:O.brd}`,borderRadius:8,color:scr===id?O.navy:O.inkS,fontSize:10,fontWeight:scr===id?700:500,fontFamily:ff,cursor:"pointer",textAlign:"left",transition:"all 0.1s"}}>{label}</button>)}
          <div style={{marginTop:10,padding:10,background:O.w,borderRadius:10,border:`1px solid ${O.brd}`}}>
            <div style={{fontSize:8,fontWeight:700,color:O.navy,letterSpacing:.8,fontFamily:ff,marginBottom:3}}>COMPLETE SCREEN LIST</div>
            <div style={{fontSize:8,color:O.inkM,lineHeight:1.5,fontFamily:ff}}>✓ Login & Registration ✓ Home Dashboard ✓ Finance Overview ✓ Invoice Detail ✓ Make Payment ✓ Statement of Account ✓ Maintenance List ✓ Request Detail + Timeline ✓ New Request (4-step) ✓ Co-Ownership Hub ✓ AGM Voting ✓ Facility Booking + Calendar ✓ Visitor Pre-Registration ✓ EV Charging History ✓ Document Library ✓ Profile + Settings ✓ Notifications ✓ WhatsApp Integration</div>
          </div>
        </div>
      </div>
    </div>
  );
}
