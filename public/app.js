let token = localStorage.getItem("pharmacyToken") || "";
let currentUser = JSON.parse(localStorage.getItem("pharmacyUser") || "null");
let cart = [];

const headers = () => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const message = (text) => document.getElementById("message").textContent = text;
const money = (n) => `₹${Number(n).toFixed(2)}`;

function updateSession() {
  document.getElementById("session").textContent = currentUser ? `Logged in as ${currentUser.name} (${currentUser.role})` : "You are browsing as a guest.";
  document.getElementById("adminPanel").hidden = !currentUser || currentUser.role !== "admin";
}
async function register() {
  const body = { name: regName.value.trim(), email: regEmail.value.trim(), phone: regPhone.value.trim(), password: regPassword.value };
  const r = await fetch("/api/register", { method:"POST", headers:headers(), body:JSON.stringify(body) });
  const d = await r.json(); message(d.message);
}
async function login() {
  const r = await fetch("/api/login", { method:"POST", headers:headers(), body:JSON.stringify({email:email.value.trim(),password:password.value}) });
  const d = await r.json();
  if (!r.ok) return message(d.message);
  token=d.token; currentUser=d.user;
  localStorage.setItem("pharmacyToken",token); localStorage.setItem("pharmacyUser",JSON.stringify(currentUser));
  updateSession(); message("Login successful."); loadOrders();
  if (currentUser.role==="admin") loadAlerts();
}
function logout() {
  token=""; currentUser=null; cart=[];
  localStorage.removeItem("pharmacyToken"); localStorage.removeItem("pharmacyUser");
  updateSession(); renderCart(); message("Logged out.");
}
async function loadMedicines() {
  const q = document.getElementById("search").value;
  const r = await fetch(`/api/medicines?search=${encodeURIComponent(q)}`);
  const rows = await r.json();
  const box = document.getElementById("medicines");
  box.replaceChildren();
  rows.forEach(m => {
    const card=document.createElement("article"); card.className="medicine";
    const title=document.createElement("h3"); title.textContent=m.medicine_name;
    const category=document.createElement("p"); category.textContent=`Category: ${m.category}`;
    const maker=document.createElement("p"); maker.textContent=`Manufacturer: ${m.manufacturer || "Not listed"}`;
    const price=document.createElement("p"); price.className="price"; price.textContent=money(m.price);
    const stock=document.createElement("p"); stock.textContent=`Stock: ${m.stock}`;
    const expiry=document.createElement("p"); expiry.textContent=`Expiry: ${String(m.expiry_date).slice(0,10)}`;
    const btn=document.createElement("button"); btn.textContent="Add to cart"; btn.disabled=m.stock<1; btn.onclick=()=>addToCart(m);
    [title,category,maker,price,stock,expiry,btn].forEach(el=>card.appendChild(el)); box.appendChild(card);
  });
  if (!rows.length) box.textContent="No medicines found.";
}
function addToCart(m) {
  const existing=cart.find(x=>x.medicine_id===m.medicine_id);
  if(existing) existing.quantity++; else cart.push({medicine_id:m.medicine_id,name:m.medicine_name,price:Number(m.price),quantity:1});
  renderCart();
}
function renderCart() {
  const box=document.getElementById("cart"); box.replaceChildren();
  if(!cart.length){box.textContent="Your cart is empty.";return;}
  let total=0;
  cart.forEach(item=>{
    total+=item.price*item.quantity;
    const p=document.createElement("p");
    p.textContent=`${item.name} — ${item.quantity} × ${money(item.price)} `;
    const remove=document.createElement("button"); remove.className="secondary"; remove.textContent="Remove";
    remove.onclick=()=>{cart=cart.filter(x=>x.medicine_id!==item.medicine_id);renderCart();};
    p.appendChild(remove);box.appendChild(p);
  });
  const sum=document.createElement("strong");sum.textContent=`Total: ${money(total)}`;box.appendChild(sum);
}
async function placeOrder() {
  if(!token)return message("Please log in before placing an order.");
  if(!cart.length)return message("Your cart is empty.");
  const r=await fetch("/api/orders",{method:"POST",headers:headers(),body:JSON.stringify({items:cart})});
  const d=await r.json();message(d.message+(d.orderId?` Order #${d.orderId}; total ${money(d.totalAmount)}.`:""));
  if(r.ok){cart=[];renderCart();loadMedicines();loadOrders();}
}
async function addMedicine() {
  const body={medicine_name:mName.value.trim(),category:mCategory.value.trim(),manufacturer:mManufacturer.value.trim(),price:Number(mPrice.value),stock:Number(mStock.value),expiry_date:mExpiry.value};
  const r=await fetch("/api/medicines",{method:"POST",headers:headers(),body:JSON.stringify(body)});
  const d=await r.json();message(d.message);if(r.ok){loadMedicines();loadAlerts();}
}
async function loadOrders() {
  if(!token)return;
  const r=await fetch("/api/orders",{headers:headers()});
  if(!r.ok)return;
  const rows=await r.json();const box=document.getElementById("orders");box.replaceChildren();
  if(!rows.length){box.textContent="No orders yet.";return;}
  const table=document.createElement("table");
  table.innerHTML="<thead><tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>";
  const body=document.createElement("tbody");
  rows.forEach(o=>{const tr=document.createElement("tr");[o.order_id,o.name,o.order_date,money(o.total_amount),o.status].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);});
  table.appendChild(body);box.appendChild(table);
}
async function loadAlerts() {
  const r=await fetch("/api/admin/stock-alerts",{headers:headers()});if(!r.ok)return;
  const rows=await r.json();const box=document.getElementById("alerts");box.replaceChildren();
  if(!rows.length){box.textContent="No low-stock or near-expiry alerts.";return;}
  rows.forEach(m=>{const p=document.createElement("p");p.className="alert";p.textContent=`${m.medicine_name}: stock ${m.stock}, expiry ${String(m.expiry_date).slice(0,10)}`;box.appendChild(p);});
}
updateSession();loadMedicines();renderCart();if(token)loadOrders();if(currentUser?.role==="admin")loadAlerts();