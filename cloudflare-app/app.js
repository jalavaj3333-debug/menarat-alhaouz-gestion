/* Independent Cloudflare edition. API is expected on the same host under /api.
   It does not load Firebase SDKs or read Firebase data. */
const API = "/api";
const state = { user:null, data:{ produits:[], employes:[], zones:[], fournisseurs:[], operations:[] } };
const $ = id => document.getElementById(id);
const money = n => (Number(n)||0).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" DH";
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path, options={}) {
  const response = await fetch(API+path,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const payload = await response.json().catch(()=>({error:"Réponse serveur invalide"}));
  if(!response.ok) throw new Error(payload.error || "حدث خطأ في الاتصال");
  return payload;
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
function isAdmin(){return state.user?.role==="admin"}
function setRoleUI(){document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));$("userName").textContent=state.user?.displayName||"";$("userRole").textContent=isAdmin()?"مدير النظام":"موظف";$("saleType").querySelector('option[value="achat"]').hidden=!isAdmin()}
function showLogin(){ $("loginView").classList.remove("hidden");$("appView").classList.add("hidden") }
function showApp(){ $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");setRoleUI();loadState() }
async function loadState(){try{state.data=await api("/state");renderAll();updateSaleType()}catch(e){toast(e.message)}}
function go(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$("page-"+page)?.classList.remove("hidden");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const names={overview:"الرئيسية",products:"المنتجات والمخزون",sales:"تسجيل عملية",history:"الفواتير والعمليات",employees:"الموظفون",zones:"المناطق",suppliers:"الموردون"};$("pageTitle").textContent=names[page]||"الرئيسية"}
function table(headers,rows){if(!rows.length)return '<p class="muted">لا توجد بيانات مسجلة حالياً.</p>';return '<table class="data-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table>'}
function renderAll(){const d=state.data;const sales=d.operations.filter(x=>x.type==="vente"),buys=d.operations.filter(x=>x.type==="achat");const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");const month=today.slice(0,7);const sumFor=list=>list.reduce((sum,x)=>sum+(Number(x.total)||0),0);$("statProducts").textContent=d.produits.length;$("statStock").textContent=d.produits.reduce((s,p)=>s+(Number(p.stock)||0),0).toLocaleString("fr-FR");$("statSales").textContent=new Set(sales.map(x=>x.factureId)).size;$("statPurchases").textContent=new Set(buys.map(x=>x.factureId)).size;$("statSalesToday").textContent=money(sumFor(sales.filter(x=>x.date===today)));$("statSalesMonth").textContent=money(sumFor(sales.filter(x=>String(x.date||"").startsWith(month))));
const recent=[...d.operations].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7);$("recentList").innerHTML=table(["التاريخ","النوع","المنتج","الكمية","المجموع"],recent.map(x=>'<tr><td>'+esc(x.date)+'</td><td><span class="pill '+(x.type==="achat"?"buy":"")+'">'+(x.type==="achat"?"شراء":"بيع")+'</span></td><td>'+esc(x.produit)+'</td><td>'+esc(x.quantite)+'</td><td>'+money(x.total)+'</td></tr>'));
renderProducts();renderHistory();renderNamedLists();refreshSaleOptions()}
function renderProducts(){const q=($("productSearch")?.value||"").toLowerCase();const list=state.data.produits.filter(p=>p.nom.toLowerCase().includes(q));$("productsTable").innerHTML=table(["المنتج","الوحدة","الثمن","المخزون","المورد",...(isAdmin()?["إجراء"]:[])],list.map(p=>'<tr><td>'+esc(p.nom)+'</td><td>'+esc(p.unite)+'</td><td>'+money(p.prix)+'</td><td>'+esc(p.stock)+'</td><td>'+esc(p.fournisseur||"—")+'</td>'+(isAdmin()?'<td><button class="outline" data-edit-product="'+esc(p.id)+'">تعديل</button> <button class="danger" data-delete="products" data-id="'+esc(p.id)+'">حذف</button></td>':"")+'</tr>'))}
function getFilteredOperations(){
  const q=($("historySearch")?.value||"").trim().toLocaleLowerCase();
  const type=$("historyType")?.value||"";
  const from=$("historyFrom")?.value||"";
  const to=$("historyTo")?.value||"";
  return [...state.data.operations].filter(x=>{
    if(type&&x.type!==type)return false;
    const date=String(x.date||"");
    if(from&&date<from)return false;
    if(to&&date>to)return false;
    const haystack=[x.invoiceRef,x.factureId,x.produit,x.employe,x.fournisseur,x.zone].join(" ").toLocaleLowerCase();
    return !q||haystack.includes(q);
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function renderHistory(){
  const ops=getFilteredOperations();
  const total=ops.reduce((sum,x)=>sum+(Number(x.total)||0),0);
  $("historySummary").textContent=ops.length+" سطر من العمليات — المجموع: "+money(total);
  $("historyTable").innerHTML=table(["التاريخ","رقم الفاتورة","النوع","الموظف / المورد","المنطقة","المنتج","الكمية","المجموع"],ops.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.invoiceRef||x.factureId)+'</td><td><span class="pill '+(x.type==="achat"?"buy":"")+'">'+(x.type==="achat"?"شراء":"بيع")+'</span></td><td>'+esc(x.employe||x.fournisseur||"—")+'</td><td>'+esc(x.zone||"—")+'</td><td>'+esc(x.produit)+'</td><td>'+esc(x.quantite)+'</td><td>'+money(x.total)+'</td></tr>'));
}
function renderNamedLists(){const cfg=[["employeesTable",state.data.employes,"employees"],["zonesTable",state.data.zones,"zones"],["suppliersTable",state.data.fournisseurs,"suppliers"]];for(const [id,items,resource] of cfg){const rows=items.map(x=>{const name=x.nom||x.name||x;const id=typeof x==="object"?x.id:"";return '<tr><td>'+esc(name)+'</td><td>'+(resource==="suppliers"?esc(x.tel||x.phone||"—"):"")+'</td>'+(isAdmin()?'<td><button class="danger" data-delete="'+resource+'" data-id="'+esc(id)+'">تعطيل</button></td>':"")+'</tr>'});$(id).innerHTML=table(resource==="suppliers"?(isAdmin()?["الاسم","الهاتف","إجراء"]:["الاسم","الهاتف"]):(isAdmin()?["الاسم","إجراء"]:["الاسم"]),rows)}}
function refreshSaleOptions(){const fill=(id,items,field)=>$(id).innerHTML=items.map(x=>{const v=typeof x==="string"?x:(x[field]||x.name||x.nom);return '<option value="'+esc(v)+'">'+esc(v)+'</option>'}).join("");fill("saleZone",state.data.zones);fill("saleSupplier",state.data.fournisseurs,"nom");fill("saleEmployee",state.data.employes);if(!$("saleLines").children.length)addSaleLine()}
function addSaleLine(){const row=document.createElement("div");row.className="sale-line";row.innerHTML='<select class="line-product" required>'+state.data.produits.map(p=>'<option value="'+esc(p.nom)+'" data-price="'+Number(p.prix||0)+'">'+esc(p.nom)+' — '+esc(p.stock)+' متوفر</option>').join("")+'</select><input class="line-qty" type="number" min="0.01" step="0.01" placeholder="الكمية" required><input class="line-price" type="number" min="0" step="0.01" placeholder="الثمن" '+(isAdmin()?'':'readonly')+'><button type="button" class="danger remove-line">×</button>';row.querySelector(".line-product").addEventListener("change",()=>{row.querySelector(".line-price").value=row.querySelector(".line-product").selectedOptions[0]?.dataset.price||0;calcTotal()});row.querySelector(".line-qty").addEventListener("input",calcTotal);row.querySelector(".line-price").addEventListener("input",calcTotal);row.querySelector(".remove-line").onclick=()=>{row.remove();calcTotal()};$("saleLines").append(row);row.querySelector(".line-product").dispatchEvent(new Event("change"))}
function calcTotal(){let total=0;document.querySelectorAll(".sale-line").forEach(r=>total+=(Number(r.querySelector(".line-qty").value)||0)*(Number(r.querySelector(".line-price").value)||0));$("saleTotal").textContent=money(total)}
function updateSaleType(){const buy=$("saleType").value==="achat";$("zoneField").classList.toggle("hidden",buy);$("supplierField").classList.toggle("hidden",!buy);$("employeeField").classList.toggle("hidden",buy||!isAdmin());$("salePayment").parentElement.classList.toggle("hidden",buy);document.querySelectorAll(".sale-line").forEach(row=>{const price=row.querySelector(".line-price");price.readOnly=!buy;if(!buy)price.value=row.querySelector(".line-product").selectedOptions[0]?.dataset.price||0});calcTotal();$("saleMessage").textContent=buy?"الشراء متاح لحساب المدير فقط.":"ثمن البيع يؤخذ من سعر المنتج المسجل في النظام."}
async function editProduct(id){
  const product=state.data.produits.find(p=>String(p.id)===String(id));
  if(!product)return toast("المنتج غير موجود");
  const name=prompt("اسم المنتج",product.nom||"");
  if(name===null)return;
  const unit=prompt("الوحدة",product.unite||"");
  if(unit===null)return;
  const priceText=prompt("ثمن البيع",String(product.prix??0));
  if(priceText===null)return;
  const supplier=prompt("المورد (اختياري)",product.fournisseur||"");
  if(supplier===null)return;
  const price=Number(priceText);
  if(!name.trim()||!Number.isFinite(price)||price<0)return toast("تأكد من اسم المنتج والثمن");
  try{
    await api("/admin/products/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({name:name.trim(),unit,price,supplier_name:supplier})});
    await loadState();
    toast("تم تعديل المنتج بنجاح");
  }catch(err){toast(err.message)}
}
async function addNamed(resource){const label={employees:"اسم الموظف",zones:"اسم المنطقة",suppliers:"اسم المورد"}[resource];const name=prompt(label);if(!name?.trim())return;const data={name:name.trim()};if(resource==="employees"){data.email=prompt("البريد الإلكتروني الخاص بالموظف")||"";data.password=prompt("كلمة مرور جديدة (12 حرفاً على الأقل)")||"";if(data.password.length<12)return toast("كلمة المرور خاصها تكون 12 حرفاً على الأقل")}if(resource==="suppliers"){data.phone=prompt("رقم الهاتف (اختياري)")||""}try{await api("/admin/"+resource,{method:"POST",body:JSON.stringify(data)});await loadState();toast(resource==="employees"?"تم إنشاء حساب الموظف بنجاح":"تمت الإضافة بنجاح")}catch(e){toast(e.message)}}
async function deleteItem(button){if(!confirm("واش متأكد من تعطيل هاد العنصر؟"))return;try{let url="/admin/"+button.dataset.delete;if(button.dataset.id)url+="/"+encodeURIComponent(button.dataset.id);else{toast("تعطيل هذا العنصر بالاسم غير مدعوم حالياً.");return}await api(url,{method:"DELETE"});await loadState();toast("تم التعطيل")}catch(e){toast(e.message)}}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const result=await api("/login",{method:"POST",body:JSON.stringify({email:$("email").value,password:$("password").value})});state.user=result.user;showApp()}catch(err){$("loginError").textContent=err.message}});
$("logoutBtn").onclick=async()=>{try{await api("/logout",{method:"POST",body:"{}"})}catch{}state.user=null;showLogin()};
$("mainNav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)go(b.dataset.page)});
document.addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(b)go(b.dataset.go);const edit=e.target.closest("[data-edit-product]");if(edit)editProduct(edit.dataset.editProduct);const del=e.target.closest("[data-delete]");if(del)deleteItem(del)});
function exportHistoryCSV(){
  const rows=[["التاريخ","رقم الفاتورة","النوع","الموظف","المورد","المنطقة","المنتج","الوحدة","الكمية","ثمن الوحدة","المجموع","الأداء"]];
  const operations=[...getFilteredOperations()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  for(const x of operations)rows.push([
    x.date,x.invoiceRef||x.factureId,x.type==="achat"?"شراء":"بيع",x.employe||"",x.fournisseur||"",x.zone||"",
    x.produit,x.unite||"",x.quantite,x.prix,x.total,x.paiement||""
  ]);
  const csv="\uFEFF"+rows.map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(";")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  const now=new Date();
  const stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  link.href=url;link.download="menarat-operations-"+stamp+".csv";
  document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
  toast("تم تجهيز ملف العمليات");
}
$("exportHistoryBtn").addEventListener("click",exportHistoryCSV);["historySearch","historyType","historyFrom","historyTo"].forEach(id=>$(id).addEventListener("input",renderHistory));$("clearHistoryFilters").addEventListener("click",()=>{["historySearch","historyType","historyFrom","historyTo"].forEach(id=>$(id).value="");renderHistory()});$("productSearch").addEventListener("input",renderProducts);$("addSaleLine").onclick=addSaleLine;$("saleType").onchange=updateSaleType;
$("addProductBtn").onclick=async()=>{const name=prompt("اسم المنتج");if(!name?.trim())return;const unit=prompt("الوحدة (مثلاً kg, pièce)")||"";const price=Number(prompt("ثمن البيع")||0);const stock=Number(prompt("المخزون الأولي")||0);if(!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0)return toast("المعطيات غير صحيحة");try{await api("/admin/products",{method:"POST",body:JSON.stringify({name,unit,price,stock})});await loadState();toast("تمت إضافة المنتج")}catch(e){toast(e.message)}};
$("addEmployeeBtn").onclick=()=>addNamed("employees");$("addZoneBtn").onclick=()=>addNamed("zones");$("addSupplierBtn").onclick=()=>addNamed("suppliers");
$("saleForm").addEventListener("submit",async e=>{e.preventDefault();const type=$("saleType").value;const rows=[...document.querySelectorAll(".sale-line")];const lines=rows.map(r=>({product:r.querySelector(".line-product").value,quantity:Number(r.querySelector(".line-qty").value),price:Number(r.querySelector(".line-price").value)}));if(!lines.length||lines.some(x=>!x.product||!Number.isFinite(x.quantity)||x.quantity<=0))return toast("تأكد من تفاصيل المنتجات");const payload={type,date:$("saleDate").value,lines,zone:$("saleZone").value,supplier:$("saleSupplier").value,employeeName:$("saleEmployee").value,payment:$("salePayment").value};try{await api("/sales",{method:"POST",body:JSON.stringify(payload)});$("saleLines").innerHTML="";addSaleLine();await loadState();toast("تسجلات العملية بنجاح");go("history")}catch(err){toast(err.message)}});
const today=new Date();$("saleDate").value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
(async()=>{try{const me=await api("/me");state.user=me.user;if(state.user)showApp();else showLogin()}catch{showLogin()}})();
