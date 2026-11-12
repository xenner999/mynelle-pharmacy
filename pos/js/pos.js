// ---------------- Data (shared with the main app via MynelleStore) ----------------
const HELD_KEY = "mynelle_pos_held";

function emojiFor(p){
  if(["tablet","capsule","softgel"].includes(p.unit)) return "\u{1F48A}";
  if(["ampoule","vial","syringe"].includes(p.unit)) return "\u{1F489}";
  if(p.unit==="sachet") return "\u{1F964}";
  if(p.unit==="patch" || /First Aid/.test(p.category)) return "\u{1FA79}";
  if(/Baby/.test(p.category)) return "\u{1F37C}";
  return "\u{1F9F4}";
}
// Live view of inventory: what the POS can actually sell right now.
// Earliest in-date batch (with stock) that falls inside the expiry warning window; null if none.
function soonestExpiryDays(p){
  const win = MynelleStore.expiryWindowFor(p);
  let best = null;
  (p.batches||[]).forEach(b=>{
    const d = MynelleStore.daysUntil(b.expiry);
    if(d===null || d<0 || !(Number(b.qty)>0) || d>win) return;
    if(best===null || d<best) best = d;
  });
  return best;
}
// RiteMed (Unilab's unibranded line). Accepts the common spellings, e.g. Rightmed.
function isRiteMed(brand){ return /\b(rite|right)[\s-]*meds?\b/i.test(String(brand||"")); }
function getCatalog(){
  const images = MynelleStore.getProductImages ? MynelleStore.getProductImages() : {};
  return MynelleStore.getProducts().map(p=>({
    image: images[p.id] || "",
    id: p.id, name: p.name,
    desc: (p.brand ? p.brand + " \u00B7 " : "") + "per " + p.unit,
    category: p.category || "Others",
    price: Number(p.price) || 0,
    stock: MynelleStore.sellableStock(p),   // in-date stock only
    unit: p.unit,
    low: MynelleStore.isLowStock(p),
    expDays: soonestExpiryDays(p),   // days until the earliest in-date batch with stock, if it is expiring soon
    search: [p.name,p.brand,p.category,p.id,p.genericName].join(" ").toLowerCase(),
    img: emojiFor(p),
    ritemed: isRiteMed(p.brand),
  }));
}
function getCategories(){
  const used = new Set(getCatalog().map(p=>p.category));
  return ["All","RiteMed"].concat(MynelleStore.CATEGORIES.filter(c=>used.has(c)), [...used].filter(c=>!MynelleStore.CATEGORIES.includes(c)));
}
// Picture if the product has one (Main app > Inventory > Product images), else its icon.
function thumbInner(image, emoji, alt){
  return image ? `<img src="${image}" alt="${esc(alt||"")}" loading="lazy" />` : emoji;
}
function vatRate(){ return Number(MynelleStore.getSettings().pricing.vat) || 0; }

// ---------------- State ----------------
const state = {
  cart: [],
  category: "All",
  search: "",
  discount: 0,            // peso amount (used by the Custom amount option)
  discountType: "none",   // none | senior | pwd | custom
  discountId: "",         // Senior Citizen / PWD ID number
  showDiscountInput: false,
  showPayment: false,
  payMethod: "Cash",
  payTendered: "",
  payNotes: "",
  receipt: null,
  notice: "",
  held: (()=>{ try{ return JSON.parse(localStorage.getItem(HELD_KEY))||[]; }catch(e){ return []; } })(),
};
function saveHeld(){ try{ localStorage.setItem(HELD_KEY, JSON.stringify(state.held)); }catch(e){} }

// ---------------- Helpers ----------------
function peso(n){ return "\u20B1" + Number(n).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function nowParts(){
  const d = new Date();
  const time = d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true});
  const date = d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",weekday:"long"});
  return { time, date, raw:d };
}
function esc(s){ const d=document.createElement("div"); d.innerText = s==null?"":s; return d.innerHTML; }

function getFiltered(){
  const q = state.search.trim().toLowerCase();
  const rank = p => (p.stock<=0 ? 2 : (p.expDays!==null ? 0 : 1));
  return getCatalog().filter(p=>{
    const matchCat = state.category==="All" || (state.category==="RiteMed" ? p.ritemed : p.category===state.category);
    return matchCat && (!q || p.search.includes(q));
  }).sort((a,b)=>{
    // 1) expiring soon (soonest first) so they get sold first, 2) everything else in its normal order, 3) out of stock last
    const ra = rank(a), rb = rank(b);
    if(ra!==rb) return ra-rb;
    if(ra===0) return a.expDays-b.expDays;
    return 0;
  });
}
// Mandatory discounts. Senior Citizen (RA 9994) and PWD (RA 10754): the VAT is
// taken off the price first, then 20% off the VAT-free amount. Change the rates here.
const DISCOUNT_TYPES = {
  senior: { label:"Senior Citizen", rate:20, vatExempt:true },
  pwd:    { label:"PWD",            rate:20, vatExempt:true },
};
function resetDiscount(){ state.discount=0; state.discountType="none"; state.discountId=""; state.showDiscountInput=false; }
function discountLabel(type){
  const t = DISCOUNT_TYPES[type||state.discountType];
  return t ? t.label+" "+t.rate+"%" : "Discount";
}
function cartTotals(){
  const subtotal = state.cart.reduce((s,i)=>s+i.price*i.qty,0);
  const rate = vatRate();
  const t = DISCOUNT_TYPES[state.discountType];
  let discountAmt, vat;
  if(t){
    // Shelf prices include VAT: remove it, then apply the discount to what is left.
    const base = (t.vatExempt && rate) ? subtotal/(1+rate/100) : subtotal;
    discountAmt = subtotal - base*(1 - t.rate/100);
    vat = t.vatExempt ? 0 : (rate ? (subtotal-discountAmt)*rate/(100+rate) : 0);
  }else{
    discountAmt = state.discountType==="custom" ? Math.min(state.discount||0, subtotal) : 0;
    // This is the VAT portion inside the total.
    vat = rate ? (subtotal-discountAmt)*rate/(100+rate) : 0;
  }
  const total = subtotal-discountAmt;
  return { subtotal, discountAmt, vat, total };
}

// Read by the confirmation pop-ups (confirm-hooks.js).
window.PosSaleSummary = function(){
  const { total } = cartTotals();
  const tenderedNum = state.payMethod==="Cash" ? (parseFloat(state.payTendered) || total) : total;
  const count = state.cart.reduce((s,i)=>s+i.qty,0);
  return {
    count,
    items: count + (count===1 ? " item" : " items"),
    method: state.payMethod,
    total: peso(total),
    change: peso(Math.max(0, tenderedNum-total)),
  };
};

function productCard(p){
  const oos = p.stock<=0;
  return `
  <div class="prod-card ${oos?'oos':''}">
    <div class="prod-thumb ${p.image?'has-img':''}">${thumbInner(p.image,p.img,p.name)}</div>
    <p class="prod-name">${esc(p.name)}${p.ritemed?' <span class="rm-tag" title="RiteMed">RiteMed</span>':""}</p>
    <p class="prod-desc">${esc(p.desc)}</p>
    <div class="prod-meta"><span>Stock: <b class="${p.stock<=0?'out':(p.low?'low':'')}">${p.stock}</b></span><span class="prod-price">${peso(p.price)}</span></div>
    <button class="btn btn-indigo-o prod-add" data-add="${esc(p.id)}" ${oos?'disabled':''}>${oos?'Out of stock':'Add'}</button>
  </div>`;
}
function bindAddButtons(){
  document.querySelectorAll("[data-add]").forEach(btn=>{
    btn.onclick = ()=> addToCart(btn.getAttribute("data-add"));
  });
}
function addToCart(id){
  const product = getCatalog().find(p=>p.id===id);
  if(!product) return;
  const existing = state.cart.find(i=>i.id===id);
  const have = existing ? existing.qty : 0;
  if(have+1 > product.stock){ state.notice = `Only ${product.stock} ${product.unit}(s) of ${product.name} in stock.`; render(); return; }
  state.notice = "";
  if(existing){ existing.qty += 1; } else { state.cart.push({ id:product.id, name:product.name, price:product.price, img:product.img, unit:product.unit, qty:1 }); }
  render();
}
// Bring the cart back in line with live stock (price changes, stock sold elsewhere, deleted items).
function syncCartWithStock(){
  const cat = getCatalog();
  let changed = false;
  state.cart = state.cart.map(i=>{
    const p = cat.find(x=>x.id===i.id);
    if(!p){ changed = true; return null; }
    const qty = Math.min(i.qty, p.stock);
    if(qty!==i.qty || p.price!==i.price) changed = true;
    return qty>0 ? { ...i, qty, price:p.price, name:p.name } : (changed=true, null);
  }).filter(Boolean);
  return changed;
}

// ---------------- Render ----------------
function render(){
  // render() rebuilds the whole screen, so remember where each scroll area was
  // and put it back (otherwise adding an item jumps the product list to the top).
  const keep = {};
  [".prod-grid", ".col-cart", ".cart-items"].forEach(sel=>{
    const el = document.querySelector(sel);
    if(el) keep[sel] = el.scrollTop;
  });
  document.getElementById("app").innerHTML = state.receipt ? renderReceipt() : renderPOS();
  Object.keys(keep).forEach(sel=>{
    const el = document.querySelector(sel);
    if(el) el.scrollTop = keep[sel];
  });
  bindEvents();
}

function renderPOS(){
  const { subtotal, discountAmt, vat, total } = cartTotals();
  const filtered = getFiltered();
  const cartImages = MynelleStore.getProductImages ? MynelleStore.getProductImages() : {};

  return `
  <div class="pos-grid">
    <div class="col-cart">
      <div class="card">
        <div class="cart-head">
          <h2>CURRENT CART</h2>
          <button class="link-btn rose" id="clearCartBtn">Clear Cart</button>
        </div>
        ${state.notice ? `<div class="pos-notice">${esc(state.notice)}</div>` : ""}
        <div class="cart-items">
          ${state.cart.length===0 ? `<p class="cart-empty">Cart is empty. Add products to get started.</p>` :
            state.cart.map(item => `
            <div class="cart-item">
              <div class="thumb">${thumbInner(cartImages[item.id],item.img,item.name)}</div>
              <div class="info">
                <div class="n">${esc(item.name)}</div>
                <div class="p">${peso(item.price)} / ${esc(item.unit||"pc")}</div>
              </div>
              <div class="qtybtns">
                <button data-qty="-1" data-id="${esc(item.id)}">&minus;</button>
                <input type="number" min="1" value="${item.qty}" data-qtyinput="${esc(item.id)}" aria-label="Quantity" />
                <button data-qty="1" data-id="${esc(item.id)}">+</button>
              </div>
              <div class="tot">${peso(item.price*item.qty)}</div>
              <button class="rm" data-remove="${esc(item.id)}">&#128465;</button>
            </div>`).join("")}
        </div>

        <div class="discount-box">
          <label for="discountType">Discount</label>
          <select id="discountType" class="discount-select">
            <option value="none" ${state.discountType==="none"?"selected":""}>No discount</option>
            ${Object.keys(DISCOUNT_TYPES).map(k=>`<option value="${k}" ${state.discountType===k?"selected":""}>${esc(DISCOUNT_TYPES[k].label)} (${DISCOUNT_TYPES[k].rate}% off)</option>`).join("")}
            <option value="custom" ${state.discountType==="custom"?"selected":""}>Custom amount</option>
          </select>
          ${DISCOUNT_TYPES[state.discountType] ? `
            <input id="discountId" class="discount-id" type="text" maxlength="30" placeholder="${esc(DISCOUNT_TYPES[state.discountType].label)} ID number" value="${esc(state.discountId)}" />
            <p class="discount-hint">${DISCOUNT_TYPES[state.discountType].rate}% off every item${DISCOUNT_TYPES[state.discountType].vatExempt?", VAT-exempt":""}.</p>` : ""}
          ${state.discountType==="custom" ? `<input id="discountInput" class="discount-id" type="number" min="0" placeholder="Amount in pesos (0.00)" value="${state.discount||''}" />` : ""}
        </div>

        <div class="totals">
          <div class="r"><span>Subtotal</span><span>${peso(subtotal)}</span></div>
          <div class="r"><span>${esc(discountLabel())}</span><span>${peso(discountAmt)}</span></div>
          <div class="r"><span>${DISCOUNT_TYPES[state.discountType]?"VAT (exempt)":"VAT ("+vatRate()+"%) incl."}</span><span>${peso(vat)}</span></div>
          <div class="grand"><span>TOTAL AMOUNT</span><span>${peso(total)}</span></div>
        </div>

        ${state.held.length ? `<div class="held-box"><b>On hold (${state.held.length})</b>${state.held.map((h,i)=>`<div class="h"><span>${h.cart.reduce((n,x)=>n+x.qty,0)} item(s) \u00B7 ${esc(h.at)}</span><button class="link-btn" data-resume="${i}">Resume</button></div>`).join("")}</div>` : ""}

        ${!state.showPayment ? `
          <div class="btnstack">
            <button class="btn btn-green" id="completeSaleBtn" ${state.cart.length===0?'disabled':''}>&#128722; Complete Sale (F1)</button>
            <button class="btn btn-amber" id="holdSaleBtn" ${state.cart.length===0?'disabled':''}>&#9208; Hold Transaction (F2)</button>
            <button class="btn btn-outline" id="cancelSaleBtn" ${state.cart.length===0?'disabled':''}>&#10060; Cancel Transaction (F3)</button>
          </div>` : renderPaymentPanel(total) }
      </div>
    </div>

    <div class="col-products">
      <div class="card products-card">
        <h2>PRODUCTS</h2>
        <div class="prod-tabs">
          ${getCategories().map(c=>`<button data-cat="${c}" class="${state.category===c?'active':''}">${c}</button>`).join("")}
        </div>
        <div class="search-row">
          <div class="search-wrap">
            <span>&#128269;</span>
            <input id="searchInput" placeholder="Search product..." value="${esc(state.search)}" />
          </div>
          <button class="filter-btn">&#9776;</button>
        </div>
        <div class="prod-grid">
          ${filtered.length===0 ? `<p class="no-results">${getCatalog().length===0?"No products in inventory yet. Add products in the main app first.":"No products match your search."}</p>` : filtered.map(productCard).join("")}
        </div>
      </div>
    </div>
  </div>`;
}

function renderPaymentPanel(total){
  const tenderedNum = parseFloat(state.payTendered) || 0;
  const change = Math.max(0, tenderedNum-total);
  const isCash = state.payMethod === "Cash";
  // blank amount = exact payment (the field shows the total as its placeholder)
  const canComplete = !isCash || state.payTendered === "" || tenderedNum >= total;
  const methods = [
    {id:"Cash", icon:"&#128181;"}, {id:"GCash", icon:"&#128241;"}
  ];
  return `
  <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100);">
    <p class="pay-title">PAYMENT</p>
    <label class="field-label">Payment Method</label>
    <div class="methods">
      ${methods.map(m=>`<button class="method-btn ${state.payMethod===m.id?'active':''}" data-method="${m.id}">${m.icon} ${m.id}</button>`).join("")}
    </div>
    ${isCash ? `
    <label class="field-label">Amount Tendered</label>
    <div class="amt-wrap">
      <span>₱</span>
      <input id="tenderedInput" type="text" inputmode="none" autocomplete="off" placeholder="${total.toFixed(2)}" value="${esc(state.payTendered)}" />
    </div>
    <div id="keypadSlot">${PosKeypad.html()}</div>
    <div class="change-row"><span>Change</span><span id="changeAmt">${peso(change)}</span></div>
    ` : `<p class="pay-exact">Customer pays the exact total of <b>${peso(total)}</b> via ${esc(state.payMethod)}.</p>`}
    <label class="field-label">Reference / Notes (Optional)</label>
    <textarea id="notesInput" rows="2" placeholder="Enter reference or notes...">${esc(state.payNotes)}</textarea>
    <div class="btnstack">
      <button class="btn btn-green" id="doneBtn" ${canComplete?'':'disabled'}>&#10003; Done &ndash; No Receipt (F5)</button>
      <button class="btn btn-indigo" id="printReceiptBtn" ${canComplete?'':'disabled'}>&#128424; Print Receipt (F4)</button>
      <button class="btn btn-outline" id="payBackBtn2">&larr; Return to Cart (F6)</button>
    </div>
    <div id="payErrSlot">${!canComplete ? `<p class="pay-err">Amount tendered must cover the total.</p>` : ""}</div>
  </div>`;
}

// Update change / buttons / error in place so the amount field (and its
// cursor) is never rebuilt while the cashier is typing.
function updatePaymentLive(){
  const { total } = cartTotals();
  const tn = parseFloat(state.payTendered) || 0;
  const canComplete = state.payMethod !== "Cash" || state.payTendered === "" || tn >= total;
  const ch = document.getElementById("changeAmt"); if(ch) ch.textContent = peso(Math.max(0, tn-total));
  ["doneBtn","printReceiptBtn"].forEach(id=>{ const b = document.getElementById(id); if(b) b.disabled = !canComplete; });
  const slot = document.getElementById("payErrSlot");
  if(slot) slot.innerHTML = canComplete ? "" : `<p class="pay-err">Amount tendered must cover the total.</p>`;
}

function renderReceipt(){
  const r = state.receipt;
  if(r.noPrint){
    return `
    <div class="receipt-wrap">
      <div class="card" style="text-align:center;">
        <div style="font-size:44px;color:#22c55e;">&#10003;</div>
        <p class="title" style="font-weight:700;color:var(--gray-800);margin:8px 0 0;">Transaction Complete</p>
        <p class="date" style="font-size:12px;color:var(--gray-400);margin:2px 0 16px;">${esc(r.id)} • ${esc(r.date.date)} • ${esc(r.date.time)}</p>
        <div class="receipt-line grand" style="justify-content:center;gap:10px;font-size:20px;">
          <span>Total Paid</span><span style="color:var(--green-600);">${peso(r.total)}</span>
        </div>
        <p style="font-size:13px;color:var(--gray-500);margin:10px 0 0;">Paid via ${esc(r.method)} &middot; Change ${peso(r.change)}</p>
        <p style="font-size:12px;color:var(--gray-400);margin:14px 0 0;">No receipt printed for this sale.</p>
        <button class="btn btn-indigo" style="margin-top:20px;" id="newSaleBtn">Start New Sale</button>
      </div>
    </div>`;
  }
  return `
  <div class="receipt-wrap">
    <div class="card">
      <div class="receipt-head">
        <div style="font-size:40px;color:#22c55e;">&#10003;</div>
        <p class="title">Sale Complete</p>
        <p class="date">${esc(r.id)}</p>
        <p class="date">${esc(r.date.date)} • ${esc(r.date.time)}</p>
      </div>
      <div class="dashed">
        ${r.items.map(i=>`<div class="receipt-line"><span>${esc(i.name)} x${i.qty}</span><span>${peso(i.price*i.qty)}</span></div>`).join("")}
      </div>
      <div class="dashed">
        <div class="receipt-line"><span>Subtotal</span><span>${peso(r.subtotal)}</span></div>
        <div class="receipt-line"><span>${esc(r.discountLabel||"Discount")}${r.discountId?" \u00B7 ID "+esc(r.discountId):""}</span><span>${peso(r.discount)}</span></div>
        <div class="receipt-line"><span>${r.vatExempt?"VAT (exempt)":"VAT ("+vatRate()+"%) incl."}</span><span>${peso(r.vat)}</span></div>
        <div class="receipt-line grand"><span>Total</span><span>${peso(r.total)}</span></div>
        <div class="receipt-line" style="padding-top:8px;border-top:1px solid var(--gray-100);"><span>Payment Method</span><span>${esc(r.method)}</span></div>
        <div class="receipt-line"><span>Amount Tendered</span><span>${peso(r.tendered)}</span></div>
        <div class="receipt-line"><span>Change</span><span>${peso(r.change)}</span></div>
        ${r.notes ? `<div class="receipt-note">Note: ${esc(r.notes)}</div>` : ""}
      </div>
      <button class="btn btn-outline noprint" style="margin-top:20px;" id="printNowBtn">&#128424; Print</button>
      <button class="btn btn-indigo" style="margin-top:10px;" id="newSaleBtn">Start New Sale</button>
    </div>
  </div>`;
}

// ---------------- Events ----------------
function bindEvents(){
  if(state.receipt){
    document.getElementById("newSaleBtn").onclick = ()=>{
      state.receipt=null; state.cart=[]; resetDiscount(); state.showPayment=false; state.notice="";
      state.payTendered=""; state.payNotes=""; state.payMethod="Cash";
      render();
    };
    const pr = document.getElementById("printNowBtn"); if(pr) pr.onclick = ()=> window.print();
    return;
  }

  document.getElementById("clearCartBtn").onclick = ()=>{ state.cart=[]; resetDiscount(); state.showPayment=false; state.notice=""; render(); };

  document.querySelectorAll("[data-qty]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-id");
      setQty(id, (state.cart.find(i=>i.id===id)||{qty:0}).qty + parseInt(btn.getAttribute("data-qty")));
    };
  });
  document.querySelectorAll("[data-qtyinput]").forEach(inp=>{
    inp.onchange = ()=> setQty(inp.getAttribute("data-qtyinput"), parseInt(inp.value)||1);
  });
  document.querySelectorAll("[data-resume]").forEach(btn=>{
    btn.onclick = ()=>{
      const h = state.held.splice(parseInt(btn.getAttribute("data-resume")),1)[0];
      if(!h) return;
      saveHeld();
      // merge into the current cart, then re-check against live stock
      h.cart.forEach(it=>{ const ex = state.cart.find(c=>c.id===it.id); if(ex) ex.qty += it.qty; else state.cart.push(it); });
      if(state.discountType==="none" && h.discountType){ state.discountType=h.discountType; state.discount=h.discount||0; state.discountId=h.discountId||""; }
      syncCartWithStock(); state.notice=""; render();
    };
  });
  const holdBtn = document.getElementById("holdSaleBtn");
  if(holdBtn) holdBtn.onclick = ()=>{
    state.held.push({ cart: state.cart, discount: state.discount, discountType: state.discountType, discountId: state.discountId, at: nowParts().time });
    saveHeld();
    state.cart=[]; resetDiscount(); state.showPayment=false; state.notice=""; render();
  };

  document.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.onclick = ()=>{ state.cart = state.cart.filter(i=>i.id!==btn.getAttribute("data-remove")); render(); };
  });

  const discountType = document.getElementById("discountType");
  if(discountType) discountType.onchange = (e)=>{ state.discountType=e.target.value; if(state.discountType!=="custom") state.discount=0; if(!DISCOUNT_TYPES[state.discountType]) state.discountId=""; render(); };
  const discountId = document.getElementById("discountId");
  if(discountId) discountId.oninput = (e)=>{ state.discountId = e.target.value; };
  const discountInput = document.getElementById("discountInput");
  if(discountInput) discountInput.oninput = (e)=>{ state.discount = Math.max(0, parseFloat(e.target.value)||0); renderTotalsOnly(); };

  document.querySelectorAll("[data-cat]").forEach(btn=>{
    btn.onclick = ()=>{ state.category = btn.getAttribute("data-cat"); render(); };
  });

  const searchInput = document.getElementById("searchInput");
  if(searchInput) searchInput.oninput = (e)=>{ state.search = e.target.value; renderProductsOnly(); };

  bindAddButtons();

  const completeSaleBtn = document.getElementById("completeSaleBtn");
  if(completeSaleBtn) completeSaleBtn.onclick = ()=>{ if(syncCartWithStock()) state.notice="Cart updated to match current stock and prices."; else state.notice=""; state.showPayment = state.cart.length>0; render(); };
  const cancelSaleBtn = document.getElementById("cancelSaleBtn");
  if(cancelSaleBtn) cancelSaleBtn.onclick = ()=>{ state.cart=[]; resetDiscount(); state.notice=""; render(); };

  const tenderedInput = document.getElementById("tenderedInput");
  if(tenderedInput){
    const setTendered = (v)=>{ state.payTendered = v; tenderedInput.value = v; updatePaymentLive(); };
    tenderedInput.oninput = (e)=>{
      let v = e.target.value.replace(/[^\d.]/g,"");
      const dot = v.indexOf(".");
      if(dot !== -1) v = v.slice(0,dot+1) + v.slice(dot+1).replace(/\./g,"").slice(0,2);
      state.payTendered = v;
      if(e.target.value !== v) e.target.value = v;
      updatePaymentLive();
    };
    tenderedInput.onkeydown = (e)=>{
      if(e.key==="Enter"){ const d = document.getElementById("doneBtn"); if(d && !d.disabled) d.click(); }
    };
    const slot = document.getElementById("keypadSlot");
    if(slot) PosKeypad.bind(slot, (key)=>{
      const { total } = cartTotals();
      if(key==="exact") setTendered(total.toFixed(2));
      else if(key.startsWith("q:")) setTendered(key.slice(2));
      else setTendered(PosKeypad.apply(state.payTendered, key));
    });
  }

  document.querySelectorAll("[data-method]").forEach(btn=>{
    btn.onclick = ()=>{ state.payMethod = btn.getAttribute("data-method"); render(); };
  });

  const notesInput = document.getElementById("notesInput");
  if(notesInput) notesInput.oninput = (e)=>{ state.payNotes = e.target.value; };

  const payBackBtn2 = document.getElementById("payBackBtn2");
  if(payBackBtn2) payBackBtn2.onclick = ()=>{ state.showPayment=false; render(); };

  const printReceiptBtn = document.getElementById("printReceiptBtn");
  if(printReceiptBtn) printReceiptBtn.onclick = ()=> finishSale(false);

  const doneBtn = document.getElementById("doneBtn");
  if(doneBtn) doneBtn.onclick = ()=> finishSale(true);
}

function setQty(id, qty){
  const p = getCatalog().find(x=>x.id===id);
  const item = state.cart.find(i=>i.id===id);
  if(!item) return;
  if(qty<1){ state.cart = state.cart.filter(i=>i.id!==id); state.notice=""; render(); return; }
  if(p && qty>p.stock){ qty = p.stock; state.notice = `Only ${p.stock} ${p.unit}(s) of ${p.name} in stock.`; } else { state.notice=""; }
  item.qty = qty;
  render();
}

function finishSale(noPrint){
  const { subtotal, discountAmt, vat, total } = cartTotals();
  const tenderedNum = state.payMethod==="Cash" ? (parseFloat(state.payTendered) || total) : total;
  const change = Math.max(0, tenderedNum-total);
  const acct = (window.PosSession && window.PosSession.account) || {};
  let sale;
  try{
    // One call: deducts stock (earliest-expiry batch first), logs the movement,
    // and records the transaction the main app's Sales/Dashboard/Reports read.
    sale = MynelleStore.recordSale(
      state.cart.map(i=>({ productId:i.id, qty:i.qty })),
      state.payMethod,
      { discount:discountAmt, vat, tendered:tenderedNum, change, notes:[state.payNotes, DISCOUNT_TYPES[state.discountType] ? discountLabel()+" discount"+(state.discountId?" (ID "+state.discountId+")":"") : ""].filter(Boolean).join(" \u00B7 "), cashier:acct.fullName||"", cashierId:acct.id||"" }
    );
  }catch(err){
    syncCartWithStock();
    state.showPayment = false;
    state.notice = (err && err.message) || "Could not complete the sale.";
    render();
    return;
  }
  state.receipt = {
    id: sale.id,
    items: state.cart, subtotal, discount: discountAmt, vat, total,
    method: state.payMethod, tendered: tenderedNum, change, notes: state.payNotes,
    discountLabel: discountLabel(), discountId: DISCOUNT_TYPES[state.discountType] ? state.discountId : "", vatExempt: !!DISCOUNT_TYPES[state.discountType],
    date: nowParts(), noPrint: !!noPrint,
  };
  render();
}

function renderTotalsOnly(){
  const { subtotal, discountAmt, vat, total } = cartTotals();
  const totalsEl = document.querySelector(".totals");
  if(totalsEl){
    totalsEl.innerHTML = `
      <div class="r"><span>Subtotal</span><span>${peso(subtotal)}</span></div>
      <div class="r"><span>${esc(discountLabel())}</span><span>${peso(discountAmt)}</span></div>
      <div class="r"><span>${DISCOUNT_TYPES[state.discountType]?"VAT (exempt)":"VAT ("+vatRate()+"%) incl."}</span><span>${peso(vat)}</span></div>
      <div class="grand"><span>TOTAL AMOUNT</span><span>${peso(total)}</span></div>`;
  }
}
function renderProductsOnly(){
  const grid = document.querySelector(".prod-grid");
  if(!grid) return;
  const filtered = getFiltered();
  grid.innerHTML = filtered.length===0 ? `<p class="no-results">No products match your search.</p>` : filtered.map(productCard).join("");
  bindAddButtons();
}

// Keyboard shortcuts matching the on-screen F-key labels
document.addEventListener("keydown", (e)=>{
  const keys = ["F1","F2","F3","F4","F5","F6"];
  if(!keys.includes(e.key)) return;
  const map = { F1:"completeSaleBtn", F2:"holdSaleBtn", F3:"cancelSaleBtn", F4:"printReceiptBtn", F5:"doneBtn", F6:"payBackBtn2" };
  const el = map[e.key] ? document.getElementById(map[e.key]) : null;
  if(el && !el.disabled){ e.preventDefault(); el.click(); }
});

// Inventory changed elsewhere (new product, new batch, adjustment) -> refresh stock live.
window.addEventListener("storage", (e)=>{
  if(e.key!==MynelleStore.PRODUCTS_KEY && e.key!==MynelleStore.IMAGES_KEY) return;
  if(state.receipt) return;
  if(syncCartWithStock() || !state.showPayment){
    const active = document.activeElement;
    if(active && /INPUT|TEXTAREA/.test(active.tagName)) { renderProductsOnly(); return; }
    render();
  }
});

render();
