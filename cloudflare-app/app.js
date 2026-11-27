/* Independent Cloudflare edition. API is expected on the same host under /api.
   It does not load Firebase SDKs or read Firebase data. */
const API = "/api";
const state = { user:null, data:{ produits:[], employes:[], zones:[], fournisseurs:[], operations:[], expenses:[], debts:[] } };
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
function go(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$("page-"+page)?.classList.remove("hidden");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const names={overview:"الرئيسية",bilan:"الحصيلة Bilan",expenses:"المصاريف",debts:"الديون",products:"المنتجات والمخزون","stock-alerts":"تنبيهات المخزون",sales:"تسجيل عملية",history:"الفواتير والعمليات",employees:"الموظفون",zones:"المناطق",suppliers:"الموردون"};$("pageTitle").textContent=names[page]||"الرئيسية"}
function table(headers,rows){if(!rows.length)return '<p class="muted">لا توجد بيانات مسجلة حالياً.</p>';return '<table class="data-table"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table>'}
function renderAll(){const d=state.data;const sales=d.operations.filter(x=>x.type==="vente"),buys=d.operations.filter(x=>x.type==="achat");const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");const month=today.slice(0,7);const sumFor=list=>list.reduce((sum,x)=>sum+(Number(x.total)||0),0);$("statProducts").textContent=d.produits.length;$("statStock").textContent=d.produits.reduce((s,p)=>s+(Number(p.stock)||0),0).toLocaleString("fr-FR");$("statSales").textContent=new Set(sales.map(x=>x.factureId)).size;$("statPurchases").textContent=new Set(buys.map(x=>x.factureId)).size;$("statSalesToday").textContent=money(sumFor(sales.filter(x=>x.date===today)));$("statSalesMonth").textContent=money(sumFor(sales.filter(x=>String(x.date||"").startsWith(month))));
const recent=[...d.operations].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7);$("recentList").innerHTML=table(["التاريخ","النوع","المنتج","الكمية","المجموع"],recent.map(x=>'<tr><td>'+esc(x.date)+'</td><td><span class="pill '+(x.type==="achat"?"buy":"")+'">'+(x.type==="achat"?"شراء":"بيع")+'</span></td><td>'+esc(x.produit)+'</td><td>'+esc(x.quantite)+'</td><td>'+money(x.total)+'</td></tr>'));
renderProducts();renderHistory();renderNamedLists();renderBilan();renderStockAlerts();renderExpenses();renderDebts();refreshSaleOptions()}

function getBilanOperations(){
 const from=$("bilanFrom")?.value||"",to=$("bilanTo")?.value||"";
 return (state.data.operations||[]).filter(op=>{
  const date=String(op.date||"");
  return (!from||date>=from)&&(!to||date<=to);
 });
}
function renderBilanCharts(ops){
  const monthly={},products={},zones={},employees={};
  const from=$("bilanFrom")?.value||"",to=$("bilanTo")?.value||"";
  const expenses=(state.data.expenses||[]).filter(x=>{const date=String(x.date||"");return (!from||date>=from)&&(!to||date<=to)});
  const ensureMonth=m=>{if(/^\d{4}-\d{2}$/.test(m)){if(!monthly[m])monthly[m]={sales:0,purchases:0,expenses:0};return monthly[m]}return null};
  for(const op of ops){
   const amount=Number(op.total)||0,month=String(op.date||"").slice(0,7),bucket=ensureMonth(month);
   if(bucket){if(op.type==="vente")bucket.sales+=amount;if(op.type==="achat")bucket.purchases+=amount}
   if(op.type==="vente"){
    const product=String(op.produit||"غير محدد");products[product]=(products[product]||0)+amount;
    const zone=String(op.zone||"غير محددة");zones[zone]=(zones[zone]||0)+amount;
    const employee=String(op.employe||"غير محدد");employees[employee]=(employees[employee]||0)+amount;
   }
  }
  for(const expense of expenses){const bucket=ensureMonth(String(expense.date||"").slice(0,7));if(bucket)bucket.expenses+=Number(expense.amount)||0}
  const months=Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0])).slice(-8);
  const maxMonth=Math.max(1,...months.flatMap(([,v])=>[v.sales,v.purchases]));
  const monthChart=$("bilanMonthlyChart");
  if(monthChart)monthChart.innerHTML=months.length?'<div class="chart-legend"><span><i class="chart-dot" style="background:#239b75"></i>المبيعات</span><span><i class="chart-dot" style="background:#d69b35"></i>المشتريات</span></div>'+months.map(([m,v])=>'<div class="chart-row"><span class="chart-label">'+esc(m)+'</span><div class="chart-bars"><div class="chart-bar-track"><div class="chart-bar sales" style="width:'+v.sales/maxMonth*100+'%"></div></div><div class="chart-value">بيع: '+money(v.sales)+'</div><div class="chart-bar-track"><div class="chart-bar purchases" style="width:'+v.purchases/maxMonth*100+'%"></div></div><div class="chart-value">شراء: '+money(v.purchases)+'</div></div></div>').join(""):'<div class="chart-empty">لا توجد بيانات شهرية ضمن الفترة المحددة</div>';
  const vertical=(id,items,series,color)=>{const target=$(id);if(!target)return;if(!items.length){target.innerHTML='<div class="chart-empty">لا توجد بيانات ضمن الفترة المحددة</div>';return}
   const max=Math.max(1,...items.flatMap(x=>series.map(s=>Math.abs(Number(x[s.key])||0))));
   target.innerHTML='<div class="pro-chart-legend">'+series.map(s=>'<span><i style="background:'+s.color+'"></i>'+s.label+'</span>').join("")+'</div><div class="pro-column-chart">'+items.map(item=>'<div class="pro-column-group"><div class="pro-columns">'+series.map(s=>{const value=Number(item[s.key])||0,height=Math.abs(value)/max*100;return '<div class="pro-column-wrap" title="'+esc(s.label)+': '+esc(money(value))+'"><div class="pro-column-value">'+(value?esc(money(value)):"")+'</div><div class="pro-column '+s.className+(value<0?' negative':'')+'" style="height:'+Math.max(value?3:0,height)+'%"></div></div>'}).join("")+'</div><span class="pro-column-label">'+esc(item.label)+'</span></div>').join("")+'</div>'};
  vertical("bilanExpensesChart",months.map(([label,v])=>({label,expenses:v.expenses})),[{key:"expenses",label:"المصاريف",color:"#e18a58",className:"expense"}]);
  vertical("bilanProfitChart",months.map(([label,v])=>({label,profit:v.sales-v.purchases-v.expenses})),[{key:"profit",label:"الصافي التقديري",color:"#3989c9",className:"profit"}]);
  const stockItems=(state.data.produits||[]).map(p=>({label:p.nom||"منتج",value:Math.max(0,Number(p.stock)||0)*Math.max(0,Number(p.prix)||0),quantity:Math.max(0,Number(p.stock)||0)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,8);
  vertical("bilanStockChart",stockItems.map(x=>({label:x.label,value:x.value})),[{key:"value",label:"قيمة المخزون",color:"#8b72c8",className:"stock"}]);
  const draw=(id,values)=>{const target=$(id),items=Object.entries(values).sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...items.map(x=>x[1]));if(target)target.innerHTML=items.length?items.map(([name,value])=>'<div class="chart-row"><span class="chart-label" title="'+esc(name)+'">'+esc(name)+'</span><div class="chart-bars"><div class="chart-bar-track"><div class="chart-bar sales" style="width:'+value/max*100+'%"></div></div><div class="chart-value">'+money(value)+'</div></div></div>').join(""):'<div class="chart-empty">لا توجد مبيعات ضمن الفترة المحددة</div>'};
  draw("bilanProductsChart",products);draw("bilanZonesChart",zones);draw("bilanEmployeesChart",employees);
  const ranked=Object.entries(monthly).sort((a,b)=>a[1].sales-b[1].sales),best=ranked.length?ranked[ranked.length-1]:null,worst=ranked.length?ranked[0]:null,summary=$("bilanMonthHighlights");
  if(summary)summary.innerHTML=ranked.length?'<div class="highlight-item"><span>أحسن شهر من حيث المبيعات</span><strong>'+esc(best[0])+' — '+money(best[1].sales)+'</strong></div><div class="highlight-item"><span>أضعف شهر من حيث المبيعات</span><strong>'+esc(worst[0])+' — '+money(worst[1].sales)+'</strong></div>':'<p class="muted">لا توجد بيانات شهرية كافية للمقارنة.</p>';
}
function renderBilan(){
 const d=state.data,ops=getBilanOperations();
 renderBilanCharts(ops);
 const ventes=ops.filter(x=>x.type==="vente"),achats=ops.filter(x=>x.type==="achat");
 const total=list=>list.reduce((s,x)=>s+(Number(x.total)||0),0);
 const totalV=total(ventes),totalA=total(achats);
 const expenses=(d.expenses||[]).filter(x=>{const date=String(x.date||"");const from=$("bilanFrom")?.value||"",to=$("bilanTo")?.value||"";return (!from||date>=from)&&(!to||date<=to)});
 const totalE=expenses.reduce((s,x)=>s+(Number(x.amount)||0),0);
 const stockValue=(d.produits||[]).reduce((s,p)=>s+Math.max(0,Number(p.stock)||0)*(Number(p.prix)||0),0);
 $("bilanTotalVentes").textContent=money(totalV);$("bilanTotalAchats").textContent=money(totalA);
 $("bilanBenefice").textContent=money(totalV-totalA-totalE);$("bilanValeurStock").textContent=money(stockValue);
 const type=$("bilanType")?.value||"global";
 if(type==="global"){
  $("bilanTable").innerHTML=table(["البيان","القيمة"],[
   "<tr><td>مجموع المبيعات خلال الفترة</td><td><strong>"+money(totalV)+"</strong></td></tr>",
   "<tr><td>مجموع المشتريات خلال الفترة</td><td><strong>"+money(totalA)+"</strong></td></tr>",
   "<tr><td>الفرق بين المبيعات والمشتريات (قبل المصاريف)</td><td><strong>"+money(totalV-totalA)+"</strong></td></tr>",
   "<tr><td>المصاريف خلال الفترة</td><td><strong>"+money(totalE)+"</strong></td></tr>",
   "<tr><td>الصافي التقديري بعد المصاريف</td><td><strong>"+money(totalV-totalA-totalE)+"</strong></td></tr>",
   "<tr><td>القيمة التقديرية الحالية للمخزون</td><td><strong>"+money(stockValue)+"</strong></td></tr>",
   "<tr><td>عدد عمليات البيع</td><td>"+ventes.length+"</td></tr>",
   "<tr><td>عدد عمليات الشراء</td><td>"+achats.length+"</td></tr>"
  ]);
  return;
 }
 const labels={mois:"الشهر",employe:"الموظف",zone:"المنطقة",produit:"المنتج",fournisseur:"المورد"};
 const groups={};
 for(const op of ops){
  const key=type==="mois"?(String(op.date||"").slice(0,7)||"غير محدد"):(op[type]||"غير محدد");
  if(!groups[key])groups[key]={count:0,qty:0,total:0,sales:0,purchases:0};
  groups[key].count++;groups[key].qty+=Number(op.quantite)||0;groups[key].total+=Number(op.total)||0;
  if(op.type==="vente")groups[key].sales+=Number(op.total)||0;else if(op.type==="achat")groups[key].purchases+=Number(op.total)||0;
 }
 const rows=Object.entries(groups).sort((a,b)=>b[1].sales-a[1].sales).map(([key,v])=>"<tr><td>"+esc(key)+"</td><td>"+v.count+"</td><td>"+v.qty.toLocaleString("fr-FR")+"</td><td>"+money(v.sales)+"</td><td>"+money(v.purchases)+"</td><td><strong>"+money(v.total)+"</strong></td></tr>");
 $("bilanTable").innerHTML=rows.length?table([labels[type],"عدد العمليات","الكمية","المبيعات","المشتريات","المجموع"],rows):'<p class="muted">لا توجد بيانات ضمن الفترة المحددة.</p>';
}
function exportBilanCSV(){
 const ops=getBilanOperations(),rows=[["التاريخ","النوع","الموظف","المورد","المنطقة","المنتج","الكمية","المجموع"]];
 for(const x of ops)rows.push([x.date,x.type==="achat"?"شراء":"بيع",x.employe||"",x.fournisseur||"",x.zone||"",x.produit,x.quantite,x.total]);
 const csv="\uFEFF"+rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="menarat-bilan-"+new Date().toISOString().slice(0,10)+".csv";document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
 toast("تم تجهيز ملف الحصيلة بصيغة CSV المتوافقة مع Excel");
}
function printBilan(){document.body.classList.add("printing-bilan");window.print();setTimeout(()=>document.body.classList.remove("printing-bilan"),800)}

function renderExpenses(){
 const list=state.data.expenses||[];
 const total=list.reduce((s,x)=>s+(Number(x.amount)||0),0);
 $("expensesTotal").textContent=money(total);$("expensesCount").textContent=list.length;
 $("expensesTable").innerHTML=table(["التاريخ","التصنيف","التفاصيل","المبلغ","سجل بواسطة","إجراء"],list.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.category)+'</td><td>'+esc(x.description||"—")+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.created_by)+'</td><td><button class="danger" data-delete-expense="'+esc(x.id)+'">حذف</button></td></tr>'));
}
function renderDebts(){
 const list=state.data.debts||[];
 const receivable=list.filter(x=>x.type==="receivable").reduce((sum,x)=>sum+Math.max(0,Number(x.total_amount)-Number(x.paid_amount)),0);
 const payable=list.filter(x=>x.type==="payable").reduce((sum,x)=>sum+Math.max(0,Number(x.total_amount)-Number(x.paid_amount)),0);
 const open=list.filter(x=>Number(x.total_amount)>Number(x.paid_amount));
 $("debtsReceivable").textContent=money(receivable);$("debtsPayable").textContent=money(payable);$("debtsOpenCount").textContent=open.length;
 $("debtsTable").innerHTML=table(["النوع","الاسم","الإجمالي","المؤدى","المتبقي","الاستحقاق","ملاحظات","الإجراء"],list.map(x=>{
  const remaining=Math.max(0,Number(x.total_amount)-Number(x.paid_amount));
  const type=x.type==="receivable"?"لنا عنده":"علينا له";
  const actions=(remaining>0?'<button class="outline" data-debt-pay="'+esc(x.id)+'">تسجيل أداء</button> ':'<span class="pill">مكتمل</span> ')+'<button class="danger" data-debt-delete="'+esc(x.id)+'">حذف</button>';
  return '<tr><td>'+type+'</td><td>'+esc(x.person)+'</td><td>'+money(x.total_amount)+'</td><td>'+money(x.paid_amount)+'</td><td><strong>'+money(remaining)+'</strong></td><td>'+esc(x.due_date||"—")+'</td><td>'+esc(x.notes||"—")+'</td><td>'+actions+'</td></tr>';
 }));
}
async function addDebtPayment(id){
 const amountText=prompt("مبلغ الأداء (DH)");if(amountText===null)return;
 const amount=Number(amountText);if(!Number.isFinite(amount)||amount<=0)return toast("أدخل مبلغاً صحيحاً");
 const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
 const note=prompt("ملاحظة حول الأداء (اختياري)")||"";
 try{await api("/debts/"+encodeURIComponent(id)+"/payment",{method:"POST",body:JSON.stringify({amount,date,note})});await loadState();toast("تم تسجيل الأداء")}catch(e){toast(e.message)}
}
async function deleteDebt(id){
 if(!confirm("واش متأكد من حذف سجل الدين؟"))return;
 try{await api("/debts/"+encodeURIComponent(id),{method:"DELETE"});await loadState();toast("تم حذف الدين")}catch(e){toast(e.message)}
}
function renderStockAlerts(){
 const limit=Math.max(0,Number($("stockAlertLimit")?.value??5)||0);
 const products=(state.data.produits||[]).map(p=>({...p,stockNumber:Number(p.stock)||0})).filter(p=>p.stockNumber<=limit).sort((a,b)=>a.stockNumber-b.stockNumber||String(a.nom).localeCompare(String(b.nom)));
 const out=products.filter(p=>p.stockNumber<=0).length;
 const low=products.length-out;
 $("stockOutCount").textContent=out;
 $("stockLowCount").textContent=low;
 $("stockAlertCount").textContent=products.length;
 $("stockAlertsTable").innerHTML=table(["المنتج","الوحدة","المخزون الحالي","الحالة","المورد"],products.map(p=>'<tr><td>'+esc(p.nom)+'</td><td>'+esc(p.unite||"—")+'</td><td><strong>'+esc(p.stockNumber)+'</strong></td><td><span class="pill '+(p.stockNumber<=0?'buy':'')+'">'+(p.stockNumber<=0?'نفد المخزون':'مخزون منخفض')+'</span></td><td>'+esc(p.fournisseur||"—")+'</td></tr>'));
}
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
$("debtForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const payload={type:$("debtType").value,person:$("debtPerson").value.trim(),total:Number($("debtTotal").value),paid:Number($("debtPaid").value||0),dueDate:$("debtDueDate").value,notes:$("debtNotes").value.trim()};
 if(!payload.person||!Number.isFinite(payload.total)||payload.total<=0||!Number.isFinite(payload.paid)||payload.paid<0||payload.paid>payload.total)return toast("تأكد من الاسم والمبالغ");
 try{await api("/debts",{method:"POST",body:JSON.stringify(payload)});$("debtForm").reset();$("debtPaid").value="0";await loadState();toast("تم تسجيل الدين")}catch(err){toast(err.message)}
});
$("expenseForm").addEventListener("submit",async e=>{e.preventDefault();const payload={date:$("expenseDate").value,category:$("expenseCategory").value,description:$("expenseDescription").value,amount:Number($("expenseAmount").value)};if(!payload.date||!Number.isFinite(payload.amount)||payload.amount<=0)return toast("تأكد من التاريخ والمبلغ");try{await api("/expenses",{method:"POST",body:JSON.stringify(payload)});$("expenseAmount").value="";$("expenseDescription").value="";await loadState();toast("تسجل المصروف بنجاح")}catch(err){toast(err.message)}});
async function deleteExpense(id){if(!confirm("واش متأكد من حذف هاد المصروف؟"))return;try{await api("/expenses/"+encodeURIComponent(id),{method:"DELETE"});await loadState();toast("تحذف المصروف")}catch(err){toast(err.message)}}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const result=await api("/login",{method:"POST",body:JSON.stringify({email:$("email").value,password:$("password").value})});state.user=result.user;showApp()}catch(err){$("loginError").textContent=err.message}});
$("logoutBtn").onclick=async()=>{try{await api("/logout",{method:"POST",body:"{}"})}catch{}state.user=null;showLogin()};
$("mainNav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)go(b.dataset.page)});
document.addEventListener("click",e=>{const pay=e.target.closest("[data-debt-pay]");if(pay)addDebtPayment(pay.dataset.debtPay);const debt=e.target.closest("[data-debt-delete]");if(debt)deleteDebt(debt.dataset.debtDelete);const expense=e.target.closest("[data-delete-expense]");if(expense)deleteExpense(expense.dataset.deleteExpense);const b=e.target.closest("[data-go]");if(b)go(b.dataset.go);const edit=e.target.closest("[data-edit-product]");if(edit)editProduct(edit.dataset.editProduct);const del=e.target.closest("[data-delete]");if(del)deleteItem(del)});
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
$("bilanType").addEventListener("change",renderBilan);["bilanFrom","bilanTo"].forEach(id=>$(id).addEventListener("change",renderBilan));$("exportBilanBtn").addEventListener("click",exportBilanCSV);$("printBilanBtn").addEventListener("click",printBilan);$("exportHistoryBtn").addEventListener("click",exportHistoryCSV);["historySearch","historyType","historyFrom","historyTo"].forEach(id=>$(id).addEventListener("input",renderHistory));$("clearHistoryFilters").addEventListener("click",()=>{["historySearch","historyType","historyFrom","historyTo"].forEach(id=>$(id).value="");renderHistory()});$("stockAlertLimit").addEventListener("input",renderStockAlerts);$("productSearch").addEventListener("input",renderProducts);$("addSaleLine").onclick=addSaleLine;$("saleType").onchange=updateSaleType;
$("addProductBtn").onclick=async()=>{const name=prompt("اسم المنتج");if(!name?.trim())return;const unit=prompt("الوحدة (مثلاً kg, pièce)")||"";const price=Number(prompt("ثمن البيع")||0);const stock=Number(prompt("المخزون الأولي")||0);if(!Number.isFinite(price)||price<0||!Number.isFinite(stock)||stock<0)return toast("المعطيات غير صحيحة");try{await api("/admin/products",{method:"POST",body:JSON.stringify({name,unit,price,stock})});await loadState();toast("تمت إضافة المنتج")}catch(e){toast(e.message)}};
$("addEmployeeBtn").onclick=()=>addNamed("employees");$("addZoneBtn").onclick=()=>addNamed("zones");$("addSupplierBtn").onclick=()=>addNamed("suppliers");
$("saleForm").addEventListener("submit",async e=>{e.preventDefault();const type=$("saleType").value;const rows=[...document.querySelectorAll(".sale-line")];const lines=rows.map(r=>({product:r.querySelector(".line-product").value,quantity:Number(r.querySelector(".line-qty").value),price:Number(r.querySelector(".line-price").value)}));if(!lines.length||lines.some(x=>!x.product||!Number.isFinite(x.quantity)||x.quantity<=0))return toast("تأكد من تفاصيل المنتجات");const payload={type,date:$("saleDate").value,lines,zone:$("saleZone").value,supplier:$("saleSupplier").value,employeeName:$("saleEmployee").value,payment:$("salePayment").value};try{await api("/sales",{method:"POST",body:JSON.stringify(payload)});$("saleLines").innerHTML="";addSaleLine();await loadState();toast("تسجلات العملية بنجاح");go("history")}catch(err){toast(err.message)}});
const today=new Date();$("expenseDate").value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");$("saleDate").value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
(async()=>{try{const me=await api("/me");state.user=me.user;if(state.user)showApp();else showLogin()}catch{showLogin()}})();
