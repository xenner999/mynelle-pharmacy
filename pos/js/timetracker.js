// Employees are the real accounts created in Manage accounts; every check in /
// check out is saved in TimeStore, which the pay report reads.
function localAccounts(){
  try{ return JSON.parse(localStorage.getItem(MynelleAuth.ACCOUNTS_KEY)) || []; }catch(e){ return []; }
}
function findEmployee(id){
  const a = localAccounts().find(x=>String(x.id).toUpperCase()===String(id).toUpperCase());
  if(!a) return null;
  const status = String(a.status||"active").toLowerCase();
  return { id:a.id, name:a.fullName, position:(a.role||"staff").charAt(0).toUpperCase()+(a.role||"staff").slice(1),
           email:a.email||"\u2014", phone:a.phone||"\u2014", active: status==="active" };
}
function sessionEmployeeId(){
  const a = window.PosSession && window.PosSession.account;
  return a && a.id && findEmployee(a.id) ? a.id : null;
}
// An admin/pharmacist signed in to the main app can jump back to it from here.
function staffAdmin(){
  const m = window.PosSession && window.PosSession.mainAccount;
  return m && m.role !== "cashier" ? m : null;
}

const state = { matchedId:sessionEmployeeId(), idError:"", idMessage:"", busy:false, profile:false, pwMsg:"", pwErr:"" };

function nowParts(){
  const d = new Date();
  return {
    time: d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}),
    date: d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",weekday:"long"}),
    raw: d
  };
}
function fmtTime(iso){ return new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}); }
function formatDuration(ms){
  const totalMin = Math.max(0, Math.round(ms/60000));
  return `${Math.floor(totalMin/60)}h ${totalMin%60}m`;
}
function esc(s){ const d=document.createElement("div"); d.innerText = s==null?"":s; return d.innerHTML; }

function render(){
  document.getElementById("app").innerHTML = state.matchedId ? renderDashboard() : renderIdEntry();
  bindEvents();
}

function renderIdEntry(){
  const none = !MynelleAuth.hasCashiers();
  if(none){
    return `
  <div class="id-entry-wrap">
    <div class="card" style="text-align:center;">
      <div class="id-icon">&#128100;</div>
      <h2 style="margin:0 0 4px;">No cashier accounts yet</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">A cashier account has to be created before anyone can check in or use the POS.</p>
      <button class="btn btn-indigo" id="gateAccountsBtn">Admin sign-in &rarr; create a cashier</button>
      <p style="font-size:12px;color:#9ca3af;margin-top:14px;">An admin adds the cashier in Manage accounts &rarr; Add account.</p>
    </div>
  </div>`;
  }
  return `
  <div class="id-entry-wrap">
    <div class="card" style="text-align:center;">
      <div class="id-icon">&#128100;</div>
      <h2 style="margin:0 0 4px;">Employee Time Tracker</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">Sign in with your Employee ID and PIN to check in or check out.</p>
      ${state.idMessage ? `<div class="id-msg-ok">&#10003; ${esc(state.idMessage)}</div>` : ""}
      <input id="idInput" placeholder="Employee ID (e.g. CSH-0001)" autocomplete="username" style="text-align:center;" />
      <input id="pwInput" type="password" inputmode="numeric" placeholder="PIN" autocomplete="current-password" style="text-align:center;margin-top:10px;letter-spacing:4px;" />
      ${state.idError ? `<div class="id-msg-err">&#9888; ${esc(state.idError)}</div>` : ""}
      <button class="btn btn-indigo" style="margin-top:16px;" id="idSubmitBtn" ${state.busy?'disabled':''}>${state.busy?'Checking...':'Sign in'}</button>
      <button class="link-btn" id="gateDashBtn" style="display:inline-block;margin-top:12px;">&larr; Back to dashboard (admin)</button>
      <p style="font-size:12px;color:#9ca3af;margin-top:14px;">Your Employee ID and PIN come from the account an admin created for you.</p>
    </div>
  </div>`;
}

function renderDashboard(){
  const emp = findEmployee(state.matchedId);
  const open = TimeStore.openShift(emp.id);
  const mine = TimeStore.logsFor(emp.id);
  const lastDone = mine.find(l=>l.out && new Date(l.in).toDateString()===new Date().toDateString());
  emp.checkedIn = !!open;
  emp.checkInLabel = open ? fmtTime(open.in) : (lastDone ? fmtTime(lastDone.in) : null);
  const outLabel = lastDone && !open ? fmtTime(lastDone.out) : null;
  emp.logs = mine.slice(0,8).map(l=>({
    date: new Date(l.in).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",weekday:"short"}).replace(/, (\w+)$/, " ($1)"),
    checkIn: new Date(l.in).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:true}),
    checkOut: l.out ? new Date(l.out).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:true}) : "\u2014",
    hours: TimeStore.formatHours(TimeStore.hoursOf(l)),
    status: l.out ? "Completed" : "In progress",
  }));
  const today = nowParts().date;
  return `
  <div class="dash-grid">
    <div class="dash-left">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="margin:0;">Time Record Today</h2>
          <span><button class="link-btn muted" id="switchIdBtn">Not you? Sign out</button></span>
        </div>
        <div class="info-grid">
          <p><span class="info-label">Employee ID</span><span class="info-val">${esc(emp.id)}</span></p>
          <p><span class="info-label">Employee Name</span><span class="info-val">${esc(emp.name)}</span></p>
          <p><span class="info-label">Position</span><span class="info-val">${esc(emp.position)}</span></p>
          <p><span class="info-label">Date</span><span class="info-val">${esc(today)}</span></p>
        </div>
        <div class="record-box">
          <span class="status-pill ${emp.checkedIn?'in':''}">${emp.checkedIn?'CHECKED IN':'NOT CHECKED IN'}</span>
          <p class="record-time">${emp.checkedIn ? esc(emp.checkInLabel) : (outLabel ? esc(outLabel) : '--:--:--')}</p>
          <p class="record-date">${esc(today)}</p>
          <div class="record-sub">
            <p><span class="lbl">Check-in Time</span><br><span style="color:${emp.checkInLabel?'#16a34a':'#9ca3af'};font-weight:600;">${emp.checkInLabel?esc(emp.checkInLabel):'-- : -- : --'}</span></p>
            <p><span class="lbl">Check-out Time</span><br><span style="color:${outLabel?'#e11d48':'#9ca3af'};font-weight:${outLabel?600:400};">${outLabel?esc(outLabel):'-- : -- : --'}</span>${!emp.checkedIn && !emp.checkInLabel?'<br><span style="font-size:11px;color:#9ca3af;">Not yet checked in</span>':''}</p>
          </div>
        </div>
        <button class="btn ${emp.checkedIn?'btn-rose':'btn-green'}" style="margin-top:20px;" id="toggleCheckBtn">
          ${emp.checkedIn ? 'Check Out' : 'Check In'}
        </button>
        ${emp.checkedIn
          ? `<a class="btn btn-indigo" style="margin-top:10px;text-decoration:none;" href="pos.html">&#128722; Open POS</a>`
          : `<p style="font-size:12px;color:#9ca3af;margin:10px 0 0;text-align:center;">Check in first to open the POS.</p>`}
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="margin:0;">Recent Time Logs</h2>
          <button class="link-btn">View All</button>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Total Hours</th><th>Status</th></tr></thead>
          <tbody>
            ${emp.logs.length===0 ? `<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:24px 0;">No time logs yet.</td></tr>` :
              emp.logs.map(l => `<tr><td>${esc(l.date)}</td><td>${esc(l.checkIn)}</td><td>${esc(l.checkOut)}</td><td>${esc(l.hours)}</td><td><span class="badge-green" style="${l.status!=='Completed'?'background:#fef3c7;color:#b45309;':''}">${esc(l.status)}</span></td></tr>`).join("")}
          </tbody>
        </table>
        <div style="margin-top:16px;font-size:12px;color:#6b7280;">
          <p style="font-weight:600;color:#4b5563;margin:0 0 4px;">Note:</p>
          <p style="margin:0;">• Please check in at the start of your shift and check out at the end.</p>
          <p style="margin:0;">• Accurate time logs help keep records organized.</p>
        </div>
      </div>
    </div>

    <div class="card profile-card">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">&#128100;</div>
        <span class="dot ${emp.checkedIn?'on':''}"></span>
      </div>
      <p class="profile-name">${esc(emp.name)}</p>
      <p class="profile-role">${esc(emp.position)}</p>
      <div class="profile-rows">
        <div class="row"><span>Employee ID</span><span>${esc(emp.id)}</span></div>
        <div class="row"><span>Email</span><span>${esc(emp.email)}</span></div>
        <div class="row"><span>Phone</span><span>${esc(emp.phone)}</span></div>
      </div>
      <button class="btn btn-indigo-o" style="margin-top:20px;" id="viewProfileBtn">View Profile</button>
    </div>
  </div>${state.profile ? renderProfile(emp) : ""}`;
}

function peso(n){ return "\u20B1" + Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function renderProfile(emp){
  const a = localAccounts().find(x=>x.id===emp.id) || {};
  const now = new Date();
  const monthLogs = TimeStore.logsFor(emp.id, new Date(now.getFullYear(), now.getMonth(), 1), now);
  const pay = TimeStore.computePay(monthLogs, a.hourlyRate);
  const since = a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "\u2014";
  return `
  <div class="modal-overlay open" id="profileOverlay">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="My profile">
      <div class="modal-head"><h3>My profile</h3><button class="link-btn" id="profileClose" aria-label="Close" style="font-size:20px;color:#9ca3af;">&times;</button></div>
      <div class="prof-grid">
        <div><span>Name</span>${esc(a.fullName||emp.name)}</div>
        <div><span>Employee ID</span>${esc(emp.id)}</div>
        <div><span>Username</span>${esc(a.username||"\u2014")}</div>
        <div><span>Position</span>${esc(emp.position)}</div>
        <div><span>Email</span>${esc(a.email||"\u2014")}</div>
        <div><span>Status</span>${esc(String(a.status||"active").replace(/^./,c=>c.toUpperCase()))}</div>
        <div><span>Hourly rate</span>${a.hourlyRate?peso(a.hourlyRate)+" / hr":"Not set"}</div>
        <div><span>With the pharmacy since</span>${esc(since)}</div>
        <div><span>Hours this month</span>${TimeStore.formatHours(pay.hours)} (${pay.days} day${pay.days===1?"":"s"})</div>
        <div><span>Estimated gross pay</span>${peso(pay.gross)}</div>
      </div>
      <h4 style="margin:20px 0 8px;font-size:14px;">Change PIN</h4>
      <input id="pwCurrent" type="password" inputmode="numeric" placeholder="Current PIN" autocomplete="current-password" />
      <input id="pwNew" type="password" inputmode="numeric" maxlength="6" placeholder="New PIN (4-6 digits)" autocomplete="new-password" style="margin-top:8px;" />
      <input id="pwConfirm" type="password" inputmode="numeric" maxlength="6" placeholder="Confirm new PIN" autocomplete="new-password" style="margin-top:8px;" />
      ${state.pwErr ? `<div class="id-msg-err">&#9888; ${esc(state.pwErr)}</div>` : ""}
      ${state.pwMsg ? `<div class="id-msg-ok">&#10003; ${esc(state.pwMsg)}</div>` : ""}
      <button class="btn btn-indigo" style="margin-top:14px;" id="pwSaveBtn">Update PIN</button>
      <p style="font-size:11px;color:#9ca3af;margin:10px 0 0;">Estimated pay is gross, before deductions. Your admin can see the full pay report.</p>
    </div>
  </div>`;
}

function bindEvents(){
  const idInput = document.getElementById("idInput");
  const pwInput = document.getElementById("pwInput");
  if(idInput){
    idInput.focus();
    idInput.addEventListener("keydown", e=>{ if(e.key==="Enter") (pwInput && !pwInput.value ? pwInput.focus() : submitId()); });
    if(pwInput) pwInput.addEventListener("keydown", e=>{ if(e.key==="Enter") submitId(); });
  }

  const gd = document.getElementById("gateDashBtn");
  if(gd) gd.onclick = ()=> window.PosNav.openAdminGate();
  const ga = document.getElementById("gateAccountsBtn");
  if(ga) ga.onclick = ()=> window.PosNav.openAdminGate("../../main/html/accounts.html");
  const vp = document.getElementById("viewProfileBtn");
  if(vp) vp.onclick = ()=>{ state.profile=true; state.pwErr=""; state.pwMsg=""; render(); };
  const pc = document.getElementById("profileClose");
  if(pc) pc.onclick = ()=>{ state.profile=false; render(); };
  const po = document.getElementById("profileOverlay");
  if(po) po.onclick = (e)=>{ if(e.target===po){ state.profile=false; render(); } };
  const pwSave = document.getElementById("pwSaveBtn");
  if(pwSave) pwSave.onclick = savePassword;
  const idSubmitBtn = document.getElementById("idSubmitBtn");
  if(idSubmitBtn) idSubmitBtn.onclick = submitId;

  const switchBtn = document.getElementById("switchIdBtn");
  if(switchBtn) switchBtn.onclick = ()=>{ window.PosSession.clear(); state.matchedId=null; state.idError=""; state.idMessage=""; render(); };

  const toggleBtn = document.getElementById("toggleCheckBtn");
  if(toggleBtn) toggleBtn.onclick = handleToggleCheck;
}

async function submitId(){
  if(state.busy) return;
  const id = (document.getElementById("idInput").value||"").trim();
  const pw = document.getElementById("pwInput").value||"";
  if(!id || !pw){ state.idError = "Enter your Employee ID and PIN."; render(); return; }
  state.busy = true; state.idError = ""; render();
  try{
    const account = await MynelleAuth.verifyCashier(id, pw);
    window.PosSession.set(account);
    state.matchedId = account.id; state.idMessage = "";
  }catch(err){
    state.idError = (err && err.message) || "Could not sign in. Please try again.";
  }
  state.busy = false;
  render();
}

async function savePassword(){
  const cur = document.getElementById("pwCurrent").value;
  const nw = document.getElementById("pwNew").value;
  const cf = document.getElementById("pwConfirm").value;
  state.pwErr = ""; state.pwMsg = "";
  if(!cur || !nw) state.pwErr = "Fill in your current and new PIN.";
  else if(nw !== cf) state.pwErr = "New PINs do not match.";
  else{
    try{ await MynelleAuth.changeOwnPassword(state.matchedId, cur, nw); state.pwMsg = "PIN updated. Use it next time you sign in."; }
    catch(err){ state.pwErr = err.message || "Could not update the PIN."; }
  }
  render();
}

function handleToggleCheck(){
  const emp = findEmployee(state.matchedId);
  const closing = !!TimeStore.openShift(emp.id);
  MynelleConfirm.ask({
    title: closing ? `Check out ${emp.name}?` : `Check in ${emp.name}?`,
    message: closing ? "This ends the shift and logs the hours worked." : "This starts a new shift now.",
    confirmText: closing ? "Check out" : "Check in",
    tone: closing ? "danger" : "success",
  }).then(yes=>{ if(yes) doToggleCheck(emp); });
}
function doToggleCheck(emp){
  if(!TimeStore.openShift(emp.id)){
    TimeStore.checkIn(emp);
    render();
  } else {
    const log = TimeStore.checkOut(emp.id);
    const hoursLabel = TimeStore.formatHours(TimeStore.hoursOf(log));
    state.idMessage = `${emp.name} checked out \u2022 ${hoursLabel} logged`;
    window.PosSession.clear();
    state.matchedId = null;
    render();
    setTimeout(()=>{ state.idMessage=""; if(!state.matchedId) render(); }, 4000);
  }
}

render();
