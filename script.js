// ============== STATE ==============
const state = { operations: [], employes: [], zones: [], produits: [], fournisseurs: [], panier: [] };
let userRole = '';
let currentUser = '';
let chartTopHome = null;
const employesInitiaux = ['HICHAM', 'RIDA', 'ABD ELRAZAK', 'HAMZA KOWAY', 'YOUSSEF BEN JOUHRA', 'YOUSSEF LKHIYAT', 'ABD ELHAQ', 'OUSSAMA', 'TRIPORTEUR', 'TALAL', 'YOUSSEF LMGHARTI', 'ABD ELKODOUSS'];
const zonesInitiales = ['EL GANTEUR', 'LMNABHA', 'PARCK 44', 'CHOUITER', 'RASS EL AIN'];
const produitsInitiaux = [ { nom: 'RAMSES', unite: 'L', prix: 200, stockInitial: 50, fournisseur: 'SOTRACOM' }, { nom: 'KARATE', unite: 'L', prix: 280, stockInitial: 30, fournisseur: '' } ];
const fournisseursInitiaux = [ { nom: 'SOTRACOM', tel: '0500000000' } ];

// ============== FIREBASE SYNC ==============
let firebaseReady = false;
let db = null;

function waitForFirebase() {
    return new Promise((resolve) => {
        const check = setInterval(() => {
            if (window.firebaseReady && window.firebaseDB) {
                clearInterval(check);
                db = window.firebaseDB;
                firebaseReady = true;
                resolve();
            }
        }, 100);
    });
}
function autoBackup() {
    try {
        const backup = {
            date: new Date().toISOString(),
            state: state
        };
        localStorage.setItem('menarat_auto_backup', JSON.stringify(backup));
        console.log('✅ تم إنشاء نسخة احتياطية تلقائية');
    } catch (e) {
        console.error('❌ فشل النسخ الاحتياطي التلقائي:', e);
    }
}
async function saveState() {
    if (!firebaseReady || !db) {
        localStorage.setItem('menarat_state_v27', JSON.stringify(state));
        autoBackup(); // نسخة احتياطية محلية
        return;
    }
    try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js");
        await setDoc(doc(db, "menarat", "state"), state);
        console.log('✅ تم الحفظ في Firebase');
        autoBackup(); // نسخة احتياطية محلية
    } catch (e) {
        console.error('❌ خطأ في الحفظ:', e);
        localStorage.setItem('menarat_state_v27', JSON.stringify(state));
        autoBackup(); // نسخة احتياطية محلية
    }
}


async function loadState() {
    await waitForFirebase();
    if (!firebaseReady || !db) {
        const saved = localStorage.getItem('menarat_state_v27');
        if (saved) { try { Object.assign(state, JSON.parse(saved)); } catch (e) { initDefaultData(); } }
        else { initDefaultData(); }
        return;
    }
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js");
        const snap = await getDoc(doc(db, "menarat", "state"));
        if (snap.exists()) {
            Object.assign(state, snap.data());
        } else {
            initDefaultData();
            await saveState();
        }
    } catch (e) {
        initDefaultData();
    }
}
function initDefaultData() { state.employes = [...employesInitiaux]; state.zones = [...zonesInitiales]; state.produits = [...produitsInitiaux]; state.fournisseurs = [...fournisseursInitiaux]; saveState(); }

function showToast(msg, color = '#10b981') {
    const t = document.createElement('div');
    
    // كنعطيوه الستايل ديالو مباشرة (ماشي محتاجين .toast فـ style.css)
    t.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: ${color};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: bold;
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        direction: rtl;
        z-index: 99999;
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        font-size: 14px;
        text-align: center;
        min-width: 250px;
    `;
    
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
// ============== LOGIN ==============
let loginType = 'admin'; 
function switchLoginType(type) {
    loginType = type;
    document.getElementById('btnAdmin').style.background = type === 'admin' ? '#3b82f6' : '#e2e8f0';
    document.getElementById('btnAdmin').style.color = type === 'admin' ? 'white' : '#333';
    document.getElementById('btnEmploye').style.background = type === 'employe' ? '#3b82f6' : '#e2e8f0';
    document.getElementById('btnEmploye').style.color = type === 'employe' ? 'white' : '#333';
    document.getElementById('formAdmin').style.display = type === 'admin' ? 'block' : 'none';
    document.getElementById('formEmploye').style.display = type === 'employe' ? 'block' : 'none';
    document.getElementById('loginError').style.display = 'none';
}

async function checkAdminLogin() {
    const email = "admin@menarat.ma";
    const password = document.getElementById('loginAdminPass').value;

    if (!password) {
        document.getElementById('loginError').style.display = 'block';
        return;
    }

    try {
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
        await signInWithEmailAndPassword(window.firebaseAuth, email, password);
        
        userRole = 'admin'; 
        currentUser = 'ADMIN';
        localStorage.setItem('role', 'admin'); 
        localStorage.setItem('user', 'ADMIN');
        
        showApp(); 
    } catch (error) {
        console.error("خطأ فالدخول:", error.code, error.message);
        document.getElementById('loginError').style.display = 'block';
        showToast('❌ الإيميل أو كلمة السر خاطئة', '#ef4444');
    }
}

async function checkEmployeLogin() {
    const email = document.getElementById('loginEmpNom').value.trim();
    const password = document.getElementById('loginEmpPass').value;

    if (!email || !password) {
        document.getElementById('loginError').style.display = 'block';
        return;
    }

    try {
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
        const userCredential = await signInWithEmailAndPassword(window.firebaseAuth, email, password);
        
        const userEmail = userCredential.user.email;
        let nomEmploye = userEmail.split('@')[0].toUpperCase();
        
        if (!state.employes.includes(nomEmploye)) {
            state.employes.push(nomEmploye);
            saveState();
        }

        userRole = 'employe';
        currentUser = nomEmploye;
        localStorage.setItem('role', 'employe');
        localStorage.setItem('user', nomEmploye);
        
        showApp(); 
    } catch (error) {
        console.error(error);
        document.getElementById('loginError').style.display = 'block';
        showToast('❌ الإيميل أو كلمة السر خاطئة', '#ef4444');
    }
}

function showApp() { 
    document.getElementById('loginScreen').style.display = 'none'; 
    document.getElementById('mainApp').style.display = 'flex'; 
    
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.style.display = 'flex';
    
    if (userRole === 'employe') { 
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none'); 
    }
    
    loadState().then(() => {
        console.log('📦 البيانات بعد إعادة التحميل:', state);
        renderAll(); 
        showPage('accueil'); 
        
        if (loader) loader.style.display = 'none';
    }).catch(err => {
        console.error(err);
        if (loader) loader.style.display = 'none';
        showToast('❌ مشكل فتحميل البيانات', '#ef4444');
    });
}

function logout() { localStorage.clear(); location.reload(); }

// قائمة الإيميلات ديال الموظفين (خاصك تعمرها بالإيميلات اللي فـ Firebase)
const employesEmails = {
    'HICHAM': 'hichamelmoudali@menarat.ma',
    'RIDA': 'ridaelbourahi@menarat.ma', // حط الإيميل الكامل
    'HAMZA KOWAY': 'hamzakoway@menarat.ma', // حط الإيميل الكامل
    'YOUSSEF lkhiyat': 'youssefelkhyat@menarat.ma',
    // ... زيد الباقي
};
function logout() { localStorage.clear(); location.reload(); }

function openChangePasswordModal() {
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    document.getElementById('modalChangePassword').style.display = 'flex';
}

async function changePassword() {
    const oldPass = document.getElementById('oldPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmNewPassword').value;

    // 1. نتأكدو واش كلمة السر الجديدة مطابقة للتأكيد
    if (newPass !== confirmPass) {
        showToast('❌ كلمة السر الجديدة ماشي متطابقة', '#ef4444');
        return;
    }
    
    if (newPass.length < 6) {
        showToast('⚠️ كلمة السر خاصها تكون 6 حروف على الأقل', '#f59e0b');
        return;
    }

    // 2. نتأكدو واش المستخدم مسجل الدخول
    const user = window.firebaseAuth.currentUser;
    if (!user) {
        showToast('❌ ما كاينش مستخدم مسجل', '#ef4444');
        return;
    }

    try {
        // 3. نعيدو المصادقة (Re-authenticate) باش نضمنو بلي هو صاحب الحساب
        const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
        
        const credential = EmailAuthProvider.credential(user.email, oldPass);
        await reauthenticateWithCredential(user, credential);
        
        // 4. نبدلو كلمة السر
        await updatePassword(user, newPass);
        
        showToast('✅ تبدلت كلمة السر بنجاح!');
        document.getElementById('modalChangePassword').style.display = 'none';
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showToast('❌ كلمة السر الحالية خاطئة', '#ef4444');
        } else {
            showToast('❌ مشكل: ' + error.message, '#ef4444');
        }
    }
}

// ============== BACKUP ==============
function exportFullBackup() {
    if (state.operations.length === 0 && state.produits.length === 0) { showToast('⚠️ لا توجد بيانات', '#f59e0b'); return; }
    const backup = { version: '1.0', date: new Date().toISOString(), state: state };
    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Backup-Menarat-${new Date().toISOString().split('T')[0]}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('✅ تم تصدير النسخة الاحتياطية!');
}
function importFullBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('⚠️ سيتم استبدال كل البيانات. متأكد؟')) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const backup = JSON.parse(event.target.result);
            if (!backup.state || !backup.state.operations) { showToast('❌ الملف غير صالح', '#ef4444'); e.target.value = ''; return; }
            state.operations = backup.state.operations || []; state.employes = backup.state.employes || [];
            state.zones = backup.state.zones || []; state.produits = backup.state.produits || [];
            state.fournisseurs = backup.state.fournisseurs || []; state.panier = [];
            saveState(); renderAll(); showPage('accueil');
            showToast('✅ تم الاستيراد!');
        } catch (err) { showToast('❌ خطأ: ' + err.message, '#ef4444'); }
        e.target.value = '';
    };
    reader.readAsText(file);
}

// ============== EXPORT OPERATIONS CSV ==============
function exportFullBackup() {
    if (state.operations.length === 0 && state.produits.length === 0) { showToast('⚠️ لا توجد بيانات', '#f59e0b'); return; }
    const backup = { version: '1.0', date: new Date().toISOString(), state: state };
    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Backup-Menarat-${new Date().toISOString().split('T')[0]}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('✅ تم تصدير النسخة الاحتياطية!');
}
function importFullBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    customConfirm('⚠️ سيتم استبدال كل البيانات. متأكد؟').then(confirmed => {
        if (!confirmed) { e.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const backup = JSON.parse(event.target.result);
                if (!backup.state || !backup.state.operations) { showToast('❌ الملف غير صالح', '#ef4444'); e.target.value = ''; return; }
                state.operations = backup.state.operations || []; state.employes = backup.state.employes || [];
                state.zones = backup.state.zones || []; state.produits = backup.state.produits || [];
                state.fournisseurs = backup.state.fournisseurs || []; state.panier = [];
                saveState(); renderAll(); showPage('accueil');
                showToast('✅ تم الاستيراد!');
            } catch (err) { showToast('❌ خطأ: ' + err.message, '#ef4444'); }
            e.target.value = '';
        };
        reader.readAsText(file);
    });
}
function exportOperationsCSV() {
    if (state.operations.length === 0) { showToast('⚠️ لا توجد عمليات للتصدير', '#f59e0b'); return; }
    const headers = ['Date', 'Type', 'Employé', 'Fournisseur', 'Zone', 'Produit', 'Unité', 'Quantité', 'Prix', 'Total', 'Paiement'];
    const rows = state.operations.map(op => [ op.date || '', op.type === 'achat' ? 'Achat' : 'Vente', op.employe || '', op.fournisseur || '', op.zone || '', op.produit || '', op.unite || '', op.quantite || 0, op.prix || 0, op.total || 0, op.paiement || '' ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Operations-Menarat-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`✅ تم تصدير ${state.operations.length} عملية!`);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('themeBtn');
    const isDark = document.body.classList.contains('dark-mode');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}
function editYear() {
    const currentYear = document.getElementById('sidebarYear').textContent.replace('Gestion ', '');
    const newYear = prompt('أدخل السنة الدراسية (مثلاً: 2026-2027):', currentYear);
    if (newYear && newYear.trim() !== '') { 
        document.getElementById('sidebarYear').textContent = 'Gestion ' + newYear.trim(); 
        localStorage.setItem('menarat_year', newYear.trim()); 
        generateMonths(); setTimeout(renderCharts, 100); 
    }
}
function checkNotifs() {
    const outOfStock = state.produits.filter(p => { 
        const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        return ((p.stockInitial || 0) + e - s) < 5; 
    });
    const badge = document.getElementById('notifBadge');
    if (badge) { if (outOfStock.length > 0) { badge.style.display = 'inline'; badge.textContent = outOfStock.length; } else { badge.style.display = 'none'; } }
}
function showNotifs() {
    const outOfStock = state.produits.filter(p => { 
        const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        return ((p.stockInitial || 0) + e - s) < 5; 
    });
    if (outOfStock.length > 0) alert('🔔 تنبيهات المخزون:\n\n' + outOfStock.map(p => `- ${p.nom}`).join('\n'));
    else showToast('✅ كلشي مزيان!');
}

function generateMonths() {
    const select = document.getElementById('opMois');
    if (!select) return;
    const yearStr = document.getElementById('sidebarYear').textContent.replace('Gestion ', '').trim();
    let startYear = 2026;
    if (yearStr.includes('-')) startYear = parseInt(yearStr.split('-')[0]);
    else if (!isNaN(parseInt(yearStr))) startYear = parseInt(yearStr);
    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    let options = '<option value="">-- اختر الشهر --</option>';
    for (let i = 0; i < 12; i++) {
        const monthIndex = (9 + i) % 12; 
        const currentYear = startYear + Math.floor((9 + i) / 12);
        const val = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        options += `<option value="${val}">${moisNoms[monthIndex]} ${currentYear}</option>`;
    }
    select.innerHTML = options;
}

function updateSelect(id, items) { 
    const s = document.getElementById(id); 
    if (!s) return; 
    const v = s.value; 
    s.innerHTML = '<option value="">-- اختر --</option>'; 
    items.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; s.appendChild(o); }); 
    if (items.includes(v)) s.value = v; 
}

// ============== IMPORT EXCEL STOCK ==============
function importExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            let headerRowIndex = -1;
            for (let i = 0; i < 20; i++) {
                const rowStr = json[i].join(' ').toUpperCase();
                if (rowStr.includes('ARTICLES') || rowStr.includes('UTILISATEUR')) { headerRowIndex = i; break; }
            }
            if (headerRowIndex === -1) { showToast('⚠️ مالقيتش العناوين', '#f59e0b'); e.target.value = ''; return; }
            const headers = json[headerRowIndex].map(h => String(h).trim().toUpperCase());
            const colProduit = headers.findIndex(h => h.includes('ARTICLE') || h.includes('PRODUIT') || h.includes('DÉSIGNATION'));
            const colUnite = headers.findIndex(h => h.includes('UNITÉ') || h.includes('UNITE'));
            if (colProduit === -1) { showToast('⚠️ مالقيتش عمود المنتجات', '#f59e0b'); e.target.value = ''; return; }
            const colonnesCibles = {};
            headers.forEach((colName, colIndex) => {
                const cleanName = colName.trim().toUpperCase();
                const matchedEmploye = state.employes.find(emp => emp.includes(cleanName) || cleanName.includes(emp) || (emp.split(' ')[0] === cleanName.split(' ')[0] && emp.length > 3));
                const matchedZone = state.zones.find(z => z.includes(cleanName) || cleanName.includes(z));
                if (matchedEmploye) colonnesCibles[colIndex] = { type: 'employe', name: matchedEmploye };
                else if (matchedZone) colonnesCibles[colIndex] = { type: 'zone', name: matchedZone };
            });
            if (Object.keys(colonnesCibles).length === 0) { showToast('⚠️ مالقيتش حتى موظف ولا منطقة', '#f59e0b'); e.target.value = ''; return; }
            let count = 0; const dateAuj = new Date().toISOString().split('T')[0];
            const moisActuel = dateAuj.substring(0, 7); 
            for (let i = headerRowIndex + 1; i < json.length; i++) {
                const row = json[i]; if (!row || row.length === 0) continue;
                const produitNom = String(row[colProduit] || '').trim();
                const unite = colUnite !== -1 ? String(row[colUnite] || 'U').trim() : 'U';
                if (produitNom && !produitNom.toUpperCase().includes('TOTAL') && !produitNom.toUpperCase().includes('ARTICLES')) {
                    let produit = state.produits.find(p => p.nom.toUpperCase() === produitNom.toUpperCase());
                    if (!produit) { produit = { nom: produitNom, unite: unite, prix: 0, stockInitial: 0, fournisseur: 'N/A' }; state.produits.push(produit); }
                    Object.keys(colonnesCibles).forEach(colIndex => {
                        const val = parseFloat(String(row[colIndex]).replace(',', '.'));
                        if (!isNaN(val) && val > 0) {
                            const cible = colonnesCibles[colIndex];
                            state.operations.push({
                                id: 'op_xlsx_' + Date.now() + Math.random(), factureId: 'IMP-' + Date.now(), type: 'vente',
                                date: dateAuj, mois: moisActuel, employe: cible.name, fournisseur: 'Import Stock', zone: cible.type === 'zone' ? cible.name : 'IMPORT',
                                produit: produitNom, unite: unite, quantite: val, prix: 0, total: 0, paiement: 'Payé'
                            });
                            count++;
                        }
                    });
                }
            }
            saveState(); renderAll();
            showToast(`✅ تم استيراد ${count} عملية بنجاح!`);
        } catch (err) { showToast('❌ خطأ: ' + err.message, '#ef4444'); }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ============== IMPORT FACTURES EXCEL ==============
function importExcelFactures(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let count = 0;
            const dateAuj = new Date().toISOString().split('T')[0];
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                const fournisseurNom = sheetName.trim().toUpperCase();
                let currentDate = dateAuj;
                let fournisseurObj = state.fournisseurs.find(f => f.nom.toUpperCase() === fournisseurNom);
                if (!fournisseurObj) { fournisseurObj = { nom: fournisseurNom, tel: '' }; state.fournisseurs.push(fournisseurObj); }
                for (let i = 0; i < json.length; i++) {
                    const row = json[i]; if (!row || row.length === 0) continue;
                    const rowStr = row.join(' ');
                    const dateMatch = rowStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
                    if (dateMatch) currentDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
                    const produitNom = String(row[1] || '').trim();
                    const qte = parseFloat(String(row[2]).replace(',', '.')) || 0;
                    const prix = parseFloat(String(row[3]).replace(',', '.')) || 0;
                    if (produitNom && qte > 0 && !produitNom.toUpperCase().includes('TOTAL') && !produitNom.toUpperCase().includes('DESIGNATION')) {
                        let produit = state.produits.find(p => p.nom.toUpperCase() === produitNom.toUpperCase());
                        if (!produit) { produit = { nom: produitNom, unite: 'U', prix: prix, stockInitial: 0, fournisseur: fournisseurNom }; state.produits.push(produit); }
                        const moisOp = currentDate.substring(0, 7);
                        state.operations.push({
                            id: 'op_fac_' + Date.now() + Math.random(), factureId: 'FAC-' + sheetName + '-' + Date.now(), type: 'achat', 
                            date: currentDate, mois: moisOp, employe: fournisseurNom, fournisseur: fournisseurNom, zone: 'MAGASIN',
                            produit: produitNom, unite: produit.unite, quantite: qte, prix: prix, total: qte * prix, paiement: 'Payé'
                        });
                        count++;
                    }
                }
            });
            saveState(); renderAll();
            showToast(`✅ تم استيراد ${count} عملية شراء بنجاح!`);
        } catch (err) { showToast('❌ خطأ: ' + err.message, '#ef4444'); }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ============== IMPORT EXCEL SMART ==============
function importExcelSmart(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            if (json.length < 2) { showToast('⚠️ الملف خاوي', '#f59e0b'); e.target.value = ''; return; }
            let headerRowIndex = -1;
            let headers = [];
            for (let i = 0; i < Math.min(json.length, 20); i++) {
                const rowStr = json[i].join(' ').toUpperCase();
                if (rowStr.includes('DÉSIGNATION') || rowStr.includes('DESIGNATION') || rowStr.includes('PRODUIT') || rowStr.includes('ARTICLE')) {
                    headerRowIndex = i;
                    headers = json[i].map(h => String(h).trim().toUpperCase());
                    break;
                }
            }
            if (headerRowIndex === -1) { showToast('❌ مالقيتش سطر العناوين', '#ef4444'); e.target.value = ''; return; }
            const colProduit = headers.findIndex(h => h.includes('DÉSIGNATION') || h.includes('DESIGNATION') || h.includes('PRODUIT') || h.includes('ARTICLE'));
            const colQte = headers.findIndex(h => h.includes('QUANTITÉ') || h.includes('QUANTITE') || h.includes('QTÉ') || h.includes('QTE'));
            const colPrix = headers.findIndex(h => h.includes('PRIX UNITAIRE') || h.includes('P.U') || h.includes('PU') || h.includes('PRIX'));
            const colUnite = headers.findIndex(h => h.includes('UNITÉ') || h.includes('UNITE'));
            if (colProduit === -1) { showToast('❌ مالقيتش عمود المنتج', '#ef4444'); e.target.value = ''; return; }
            const typeOp = confirm("واش بغيتي هاد العمليات يتسجلو كـ 'Achat' (شراء)؟\n\n(كليك OK لـ Achat، ولا Cancel لـ Vente)") ? 'achat' : 'vente';
            let count = 0;
            let currentDate = new Date().toISOString().split('T')[0];
            for (let i = headerRowIndex + 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0) continue;
                const rowStr = row.join(' ');
                let dateMatch = rowStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
                if (dateMatch) {
                    let day = parseInt(dateMatch[1]);
                    let month = parseInt(dateMatch[2]);
                    let year = parseInt(dateMatch[3]);
                    if (month > 12 && day <= 12) { const temp = day; day = month; month = temp; }
                    if (month >= 1 && month <= 12) { currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
                } else {
                    dateMatch = rowStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
                    if (dateMatch) {
                        let year = parseInt(dateMatch[1]);
                        let month = parseInt(dateMatch[2]);
                        let day = parseInt(dateMatch[3]);
                        if (month >= 1 && month <= 12) { currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
                    }
                }
                const produitNom = String(row[colProduit] || '').trim();
                if (!produitNom || produitNom.toUpperCase().includes('TOTAL') || produitNom === '' || produitNom.includes('/')) continue;
                const qte = colQte !== -1 ? parseFloat(String(row[colQte]).replace(',', '.')) || 0 : 0;
                const prix = colPrix !== -1 ? parseFloat(String(row[colPrix]).replace(',', '.')) || 0 : 0;
                const unite = colUnite !== -1 ? String(row[colUnite] || 'U').trim() : 'U';
                if (qte > 0) {
                    let produit = state.produits.find(p => p.nom.toUpperCase() === produitNom.toUpperCase());
                    if (!produit) {
                        produit = { nom: produitNom, unite: unite, prix: prix || 0, stockInitial: 0, fournisseur: 'IMPORT' };
                        state.produits.push(produit);
                    }
                    state.operations.push({
                        id: 'op_smart_' + Date.now() + Math.random(),
                        factureId: 'SMART-' + Date.now(),
                        type: typeOp,
                        date: currentDate,
                        mois: currentDate.substring(0, 7),
                        employe: 'IMPORT',
                        fournisseur: typeOp === 'achat' ? 'IMPORT' : '-',
                        zone: typeOp === 'achat' ? 'MAGASIN' : 'IMPORT',
                        produit: produitNom,
                        unite: unite,
                        quantite: qte,
                        prix: prix || 0,
                        total: (prix || 0) * qte,
                        paiement: 'Payé'
                    });
                    count++;
                }
            }
            if (count === 0) { showToast('⚠️ مالقيتش عمليات صالحة', '#f59e0b'); }
            else { saveState(); renderAll(); showToast(`✅ تم استيراد ${count} عملية بنجاح!`); }
        } catch (err) { console.error(err); showToast('❌ خطأ: ' + err.message, '#ef4444'); }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ============== THEME & YEAR ==============
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const btn = document.getElementById('themeBtn');
    const isDark = document.body.classList.contains('dark-mode');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}
function editYear() {
    const currentYear = document.getElementById('sidebarYear').textContent.replace('Gestion ', '');
    const newYear = prompt('أدخل السنة الدراسية (مثلاً: 2026-2027):', currentYear);
    if (newYear && newYear.trim() !== '') { 
        document.getElementById('sidebarYear').textContent = 'Gestion ' + newYear.trim(); 
        localStorage.setItem('menarat_year', newYear.trim()); 
        generateMonths(); setTimeout(renderCharts, 100); 
    }
}
function checkNotifs() {
    const outOfStock = state.produits.filter(p => { 
        const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        return ((p.stockInitial || 0) + e - s) < 5; 
    });
    const badge = document.getElementById('notifBadge');
    if (badge) { if (outOfStock.length > 0) { badge.style.display = 'inline'; badge.textContent = outOfStock.length; } else { badge.style.display = 'none'; } }
}
function showNotifs() {
    const outOfStock = state.produits.filter(p => { 
        const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); 
        return ((p.stockInitial || 0) + e - s) < 5; 
    });
    if (outOfStock.length > 0) alert('🔔 تنبيهات المخزون:\n\n' + outOfStock.map(p => `- ${p.nom}`).join('\n'));
    else showToast('✅ كلشي مزيان!');
}

// ============== MOIS ==============
function generateMonths() {
    const select = document.getElementById('opMois');
    if (!select) return;
    const yearStr = document.getElementById('sidebarYear').textContent.replace('Gestion ', '').trim();
    let startYear = 2026;
    if (yearStr.includes('-')) startYear = parseInt(yearStr.split('-')[0]);
    else if (!isNaN(parseInt(yearStr))) startYear = parseInt(yearStr);
    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    let options = '<option value="">-- اختر الشهر --</option>';
    for (let i = 0; i < 12; i++) {
        const monthIndex = (9 + i) % 12; 
        const currentYear = startYear + Math.floor((9 + i) / 12);
        const val = `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        options += `<option value="${val}">${moisNoms[monthIndex]} ${currentYear}</option>`;
    }
    select.innerHTML = options;
}


// ============== NAV ==============
function showPage(pageId) {
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar')?.classList.remove('active');
    }
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); 
    document.querySelectorAll('.sidebar-link').forEach(b => b.classList.remove('active'));
    const page = document.getElementById('page-' + pageId); 
    const btn = document.querySelector(`.sidebar-link[data-tab="${pageId}"]`);
    if (page) page.classList.add('active'); if (btn) btn.classList.add('active');
    const titles = { accueil: "Tableau de bord", ajouter: "Nouvelle Facture", operations: "Opérations", bilan: "Bilan", credits: "Crédits", produits: "Produits", employes: "Employés", zones: "Zones", fournisseurs: "Fournisseurs" };
    if (document.getElementById('pageTitle')) document.getElementById('pageTitle').textContent = titles[pageId] || "Tableau de bord";
    
    if (pageId === 'accueil') renderAccueil(); 
    if (pageId === 'operations') renderOperations(); 
    if (pageId === 'credits') renderCredits();
    if (pageId === 'bilan') { 
        renderBilan(); 
        setTimeout(() => {
            renderCharts();
            if (charts.mois) charts.mois.resize();
            if (charts.employe) charts.employe.resize();
            if (charts.zone) charts.zone.resize();
            if (charts.produit) charts.produit.resize();
        }, 200); 
    }
    if (pageId === 'produits') renderProduits(); 
    if (pageId === 'employes') renderEmployes(); 
    if (pageId === 'zones') renderZones(); 
    if (pageId === 'fournisseurs') renderFournisseurs();
    if (pageId === 'ajouter') { 
        state.panier = []; 
        renderPanier(); 
        toggleTypeOperation(); 
        updateSelect('factProduit', state.produits.map(p => p.nom)); 
        updateSelect('opEmploye', state.employes); 
        updateSelect('opZone', state.zones); 
        updateSelect('opFournisseur', state.fournisseurs.map(f => f.nom));
    }
}

// ============== TOGGLE SIDEBAR ==============
function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('active');
}

// ============== GLOBAL SEARCH ==============
function globalSearchFunc() {
    const query = document.getElementById('globalSearch')?.value.toLowerCase().trim() || '';
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    const pageId = activePage.id.replace('page-', '');
    if (pageId === 'accueil') {
        if (query.length > 0) { showPage('operations'); renderOperations(); }
    } else if (pageId === 'operations') { renderOperations(); }
    else if (pageId === 'employes') { renderEmployes(); }
    else if (pageId === 'produits') { renderProduits(); }
    else if (pageId === 'zones') { renderZones(); }
    else if (pageId === 'fournisseurs') { renderFournisseurs(); }
    else if (pageId === 'credits') { renderCredits(); }
}

// ============== ACCUEIL ==============
function renderAccueil() {
    let ops = [...state.operations];
    if (userRole === 'employe') ops = ops.filter(o => o.employe === currentUser);
    const ventes = ops.filter(o => o.type === 'vente');
    const totalVentes = ventes.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    document.getElementById('statTotal').textContent = totalVentes.toFixed(2) + ' DH';
    document.getElementById('statQuantite').textContent = ventes.reduce((s, o) => s + parseFloat(o.quantite || 0), 0);
    document.getElementById('statOperations').textContent = ops.length;
    document.getElementById('statProduits').textContent = state.produits.length;
    if (userRole === 'admin') {
        const outOfStock = state.produits.filter(p => { const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0); return ((p.stockInitial || 0) + e - s) < 5; });
        document.getElementById('alertStock').style.display = outOfStock.length > 0 ? 'block' : 'none';
    } else { document.getElementById('alertStock').style.display = 'none'; }
    const tbody = document.getElementById('recentOperations');
    const recent = ops.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    tbody.innerHTML = recent.length ? recent.map(op => `<tr><td>${op.date}</td><td>${op.type === 'achat' ? '📥 Achat' : '📤 Vente'}</td><td>${op.employe}</td><td>${op.produit}</td><td>${op.quantite}</td><td><strong>${parseFloat(op.total).toFixed(2)} DH</strong></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px;">لا توجد عمليات</td></tr>';
    if (userRole === 'admin') checkNotifs();
    renderTopProduitsHome();
    renderStatsAvancees();
}
function renderStatsAvancees() {
    const today = new Date().toISOString().split('T')[0];
    const moisActuel = today.substring(0, 7); 

    const ventesAujourdhui = state.operations.filter(o => o.type === 'vente' && o.date === today).reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const ventesMois = state.operations.filter(o => o.type === 'vente' && o.date && o.date.startsWith(moisActuel)).reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const opsAujourdhui = state.operations.filter(o => o.date === today).length;

    if (document.getElementById('statVentesJour')) document.getElementById('statVentesJour').textContent = ventesAujourdhui.toFixed(2) + ' DH';
    if (document.getElementById('statVentesMois')) document.getElementById('statVentesMois').textContent = ventesMois.toFixed(2) + ' DH';
    if (document.getElementById('statOpsJour')) document.getElementById('statOpsJour').textContent = opsAujourdhui;
}

// ============== CHART TOP PRODUITS ==============

function renderTopProduitsHome() {
    const ctx = document.getElementById('chartTopProduitsHome');
    if (!ctx || typeof Chart === 'undefined') return;
    const ventesParProduit = {};
    state.operations.filter(o => o.type === 'vente').forEach(op => {
        if (!ventesParProduit[op.produit]) ventesParProduit[op.produit] = 0;
        ventesParProduit[op.produit] += parseFloat(op.total || 0);
    });
    const top5 = Object.entries(ventesParProduit).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (chartTopHome) chartTopHome.destroy();
    chartTopHome = new Chart(ctx, {
        type: 'bar',
        data: { labels: top5.map(p => p[0]), datasets: [{ label: 'Ventes (DH)', data: top5.map(p => p[1]), backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'], borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } }
    });
}

// ============== AJOUTER ==============
function ajouterLigneFacture() {
    const produit = document.getElementById('factProduit').value; 
    const qte = parseFloat(document.getElementById('factQte').value); 
    const prix = parseFloat(document.getElementById('factPrix').value);
    if (!produit || !qte || qte <= 0 || !prix || prix <= 0) { showToast('⚠️ بيانات غير صحيحة', '#f59e0b'); return; }
    state.panier.push({ produit, qte, prix, total: qte * prix }); 
    renderPanier();
    document.getElementById('factProduit').value = ''; document.getElementById('factQte').value = ''; document.getElementById('factPrix').value = '';
}
function renderPanier() {
    const tbody = document.getElementById('tablePanier'); 
    if (!tbody) return;
    let total = 0;
    tbody.innerHTML = state.panier.map((l, i) => { total += l.total; return `<tr><td>${l.produit}</td><td>${l.qte}</td><td>${l.prix} DH</td><td>${l.total} DH</td><td><button type="button" class="btn-action btn-delete" onclick="removeFromPanier(${i})">🗑️</button></td></tr>`; }).join('');
    document.getElementById('totalFacture').textContent = total.toFixed(2) + ' DH';
}
function removeFromPanier(index) { state.panier.splice(index, 1); renderPanier(); }
function toggleTypeOperation() {
    const type = document.getElementById('opType').value; 
    const gv = document.querySelectorAll('.group-vente'); 
    const ga = document.querySelectorAll('.group-achat');
    if (type === 'achat') { 
        gv.forEach(el => el.style.display = 'none'); 
        ga.forEach(el => el.style.display = 'flex'); 
    } else { 
        gv.forEach(el => el.style.display = 'flex'); 
        ga.forEach(el => el.style.display = 'none'); 
    }
}
function validerFacture(e) {
    e.preventDefault();
    if (state.panier.length === 0) { showToast('⚠️ السلة خاوية!', '#f59e0b'); return; }
    const type = document.getElementById('opType').value; const date = document.getElementById('opDate').value; const mois = document.getElementById('opMois').value;
    let employe = '', zone = '', paiement = '-';
    if (type === 'vente') { 
        employe = (userRole === 'employe') ? currentUser : document.getElementById('opEmploye').value; 
        zone = document.getElementById('opZone').value; paiement = document.getElementById('opPaiement').value; 
        if (!employe || !zone) { showToast('⚠️ اختار الموظف والمنطقة', '#f59e0b'); return; } 
    } else { 
        employe = document.getElementById('opFournisseur').value; zone = 'MAGASIN'; if (!employe) { showToast('⚠️ اختار المورد', '#f59e0b'); return; } 
    }
    const factureId = 'FAC-' + Date.now();
    const produitsAlerte = []; // هنا غادي نجمعو المنتجات اللي قلو فالمخزون

    state.panier.forEach(l => {
        const prod = state.produits.find(p => p.nom === l.produit);
        
        // --- التحقق من المخزون (غير إلا كانت العملية بيع) ---
        if (type === 'vente' && prod) {
            // كنحسبو المخزون الحالي قبل البيع
            const e = state.operations.filter(o => o.type === 'achat' && o.produit === prod.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
            const s = state.operations.filter(o => o.type === 'vente' && o.produit === prod.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
            const stockActuel = (prod.stockInitial || 0) + e - s;

            // إلا كان المخزون الحالي ناقص من الكمية المطلوبة
            if (stockActuel < l.qte) {
                showToast(`❌ المخزون ديال ${l.produit} ما كافيش! (المتوفر: ${stockActuel})`, '#ef4444');
                return; // كنوقفو العملية كاملة
            }
        }

        state.operations.push({ id: 'op_' + Date.now() + Math.random(), factureId, type, date, mois, employe, fournisseur: (type === 'achat' ? employe : '-'), zone, produit: l.produit, unite: prod ? prod.unite : '', quantite: l.qte, prix: l.prix, total: l.total, paiement });

        // --- إشعار المخزون المنخفض ---
        if (type === 'vente' && prod) {
            const e = state.operations.filter(o => o.type === 'achat' && o.produit === prod.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
            const s = state.operations.filter(o => o.type === 'vente' && o.produit === prod.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
            const stockApres = (prod.stockInitial || 0) + e - s;

            if (stockApres < 5) {
                produitsAlerte.push(`${prod.nom} (باقي ${stockApres})`);
            }
        }
    });

    // إلا كانو منتجات قلو، كنعطي إشعار بيهم
    if (produitsAlerte.length > 0) {
        showToast(`⚠️ تنبيه المخزون: ${produitsAlerte.join(', ')}`, '#f59e0b');
    }

    saveState(); showToast('✅ تم حفظ الفاتورة!'); state.panier = []; renderPanier(); renderAll();
    document.getElementById('formOperation').reset(); document.getElementById('opDate').valueAsDate = new Date(); toggleTypeOperation();
        autoBackup(); // نسخة احتياطية أوتوماتيكية بعد كل عملية
}

// ============== OPERATIONS ==============
function renderOperations() {
    const tbody = document.getElementById('tbodyOperations'); 
    if (!tbody) return; 
    let f = [...state.operations];
    if (userRole === 'employe') f = f.filter(op => op.employe === currentUser); 
    const search = document.getElementById('globalSearch')?.value.toLowerCase().trim() || '';
    if (search) f = f.filter(op => op.employe.toLowerCase().includes(search) || op.produit.toLowerCase().includes(search) || op.date.includes(search));
    const dateFrom = document.getElementById('filterDateFrom')?.value;
    const dateTo = document.getElementById('filterDateTo')?.value;
    if (dateFrom) f = f.filter(op => op.date >= dateFrom);
    if (dateTo) f = f.filter(op => op.date <= dateTo);
    f.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
        return dateB - dateA;
    });
    tbody.innerHTML = f.length ? f.map((op) => `<tr>
        <td>${op.date}</td><td>${op.type === 'achat' ? '📥 Achat' : '📤 Vente'}</td><td>${op.employe}</td><td>${op.produit}</td><td>${op.unite || '-'}</td><td>${op.quantite}</td>
        <td>${parseFloat(op.prix || 0).toFixed(2)} DH</td>
        <td><strong>${parseFloat(op.total).toFixed(2)} DH</strong></td><td>${op.type === 'vente' ? (op.paiement === 'Crédit' ? '⏳ Crédit' : '✅ Payé') : '-'}</td>
        <td>
            <button class="btn-action btn-primary" onclick="printFacture('${op.factureId || op.id}')" title="Imprimer">🖨️</button>
            <button class="btn-action" style="background:#ef4444; color:white; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;" onclick="exportFacturePDF('${op.factureId || op.id}')" title="PDF">📄</button>
            <button class="btn-action" style="background:#f59e0b;color:white;padding:4px 8px;border-radius:4px;border:none;cursor:pointer;" onclick="editOperation('${op.id}')">✏️</button>
            <button class="btn-action btn-delete" onclick="deleteOperation('${op.id}')">🗑️</button>
        </td>
    </tr>`).join('') : '<tr><td colspan="10" style="text-align:center; padding:20px;">لا توجد عمليات</td></tr>';
}
function deleteOperation(id) { customConfirm('⚠️ حذف هذه العملية؟').then(confirmed => { if (!confirmed) return; state.operations = state.operations.filter(op => op.id !== id); saveState(); renderAll(); }); }
function editOperation(id) {
    const op = state.operations.find(o => o.id === id);
    if (!op) return;
    const nouvelleQte = prompt(`تعديل الكمية ديال: ${op.produit}\n\nالكمية الحالية: ${op.quantite}\n\nأدخل الكمية الجديدة:`, op.quantite);
    if (nouvelleQte === null) return; 
    const qte = parseFloat(nouvelleQte);
    if (isNaN(qte) || qte <= 0) { showToast('⚠️ الكمية غير صالحة', '#f59e0b'); return; }
    const nouveauPrix = prompt(`تعديل الثمن ديال: ${op.produit}\n\nالثمن الحالي: ${op.prix} DH\n\nأدخل الثمن الجديد:`, op.prix);
    if (nouveauPrix === null) return;
    const prix = parseFloat(nouveauPrix);
    if (isNaN(prix) || prix < 0) { showToast('⚠️ الثمن غير صالح', '#f59e0b'); return; }
    const index = state.operations.findIndex(o => o.id === id);
    state.operations[index].quantite = qte;
    state.operations[index].prix = prix;
    state.operations[index].total = qte * prix;
    saveState(); renderAll(); showToast('✅ تم تعديل العملية!');
}
function printFacture(factureId) {
    const ops = state.operations.filter(o => o.factureId === factureId || o.id === factureId);
    if (ops.length === 0) { showToast('خطأ', '#ef4444'); return; }
    const op = ops[0]; let total = ops.reduce((s, o) => s + parseFloat(o.total), 0);
    let rows = ops.map(o => `<tr><td style="border:1px solid #ddd; padding:8px;">${o.produit}</td><td style="border:1px solid #ddd; padding:8px;">${o.quantite} ${o.unite || ''}</td><td style="border:1px solid #ddd; padding:8px;">${parseFloat(o.prix).toFixed(2)} DH</td><td style="border:1px solid #ddd; padding:8px;">${parseFloat(o.total).toFixed(2)} DH</td></tr>`).join('');
    document.getElementById('factureContent').innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <img src="logo.png" alt="Logo" style="max-width: 120px; margin-bottom: 10px;">
            <h2 style="font-size:18px; margin: 5px 0;">MENARAT AL HAOUZ TRAVAUX</h2>
            <p style="font-size:12px; color:#666; margin: 0;">Facture / وصل</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
        </div>
        <p style="font-size:13px;"><strong>Date:</strong> ${op.date}</p>
        <p style="font-size:13px;"><strong>Client/Employé:</strong> ${op.employe}</p>
        <p style="font-size:13px;"><strong>Fournisseur:</strong> ${op.fournisseur || '-'}</p>
        <p style="font-size:13px;"><strong>Zone:</strong> ${op.zone}</p>
        <table style="width:100%; border-collapse:collapse; margin-top:15px; text-align:center; font-size:13px;">
            <thead><tr style="background:#f8fafc;"><th style="border:1px solid #ddd; padding:8px;">Produit</th><th style="border:1px solid #ddd; padding:8px;">Qté</th><th style="border:1px solid #ddd; padding:8px;">Prix</th><th style="border:1px solid #ddd; padding:8px;">Total</th></tr></thead><tbody>${rows}</tbody>
        </table>
        <h3 style="text-align:left; margin-top:20px;">TOTAL: ${total.toFixed(2)} DH</h3>
        <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;"><button class="btn-primary" onclick="window.print()">🖨️ Imprimer</button><button class="btn-secondary" onclick="document.getElementById('modalFacture').style.display='none'">❌ Fermer</button></div>`;
    document.getElementById('modalFacture').style.display = 'flex';
}
function exportFacturePDF(factureId) {
    if (typeof window.jspdf === 'undefined') {
        showToast('❌ مكتبة PDF ماشي محملة', '#ef4444');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const ops = state.operations.filter(o => o.factureId === factureId || o.id === factureId);
    if (ops.length === 0) { showToast('❌ مالقيتش الفاتورة', '#ef4444'); return; }
    
    const op = ops[0];
    let total = ops.reduce((s, o) => s + parseFloat(o.total), 0);

    // 1. إضافة اللوغو (خاصك تكون حاطط logo.png فـ الدوسي)
    const img = new Image();
    img.src = 'logo.png';
    // كنحاولو نضيفو اللوغو، إلا ما لقاهش كيكمل بلا مشاكل
    try {
        doc.addImage(img, 'PNG', 15, 10, 30, 30); 
    } catch(e) {
        console.log("اللوغو مالقاهش، غادي نكملو بلا لوغو");
    }

    // 2. معلومات الشركة (Header)
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MENARAT AL HAOUZ TRAVAUX', 105, 20, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Travaux Divers', 105, 25, { align: 'center' });
    doc.text('Tél: 06 XX XX XX XX  |  Email: contact@menarat.ma', 105, 30, { align: 'center' });
    
    // خط فاصل
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(1);
    doc.line(15, 37, 195, 37); // بدلنا الرقم باش يبعد شوية على اللوغو والكتابة

    // 3. معلومات الفاتورة (مقسمة على جوج جهات)
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    // الجهة اليسرى (معلومات الفاتورة)
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURE', 15, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(`N°: ${op.factureId || op.id}`, 15, 50);
    doc.text(`Date: ${op.date}`, 15, 55);
    
    // الجهة اليمنى (معلومات الزبون/الموظف)
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENT / EMPLOYÉ', 195, 45, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Nom: ${op.employe}`, 195, 50, { align: 'right' });
    doc.text(`Zone: ${op.zone}`, 195, 55, { align: 'right' });
    if (op.fournisseur && op.fournisseur !== '-') {
        doc.text(`Fournisseur: ${op.fournisseur}`, 195, 60, { align: 'right' });
    }

    // 4. جدول المنتجات
    const tableData = ops.map(o => [o.produit, o.quantite, parseFloat(o.prix).toFixed(2), parseFloat(o.total).toFixed(2)]);
    
    doc.autoTable({
        startY: 70,
        head: [['Produit', 'Qté', 'Prix Unitaire', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 },
        columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 30, halign: 'center' }, 3: { cellWidth: 30, halign: 'center' } }
    });

    // 5. المجموع
    let finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFillColor(59, 130, 246);
    doc.rect(140, finalY, 55, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${total.toFixed(2)} DH`, 195, finalY + 7, { align: 'right' });

    // 6. التوقيع والختم
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Signature & Cachet', 15, finalY + 30);

    doc.save(`Facture-${op.date}-${op.factureId || op.id}.pdf`);
    showToast('✅ تم تصدير الفاتورة PDF!');
}
// ============== FILTRES ==============
function filterToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filterDateFrom').value = today;
    document.getElementById('filterDateTo').value = today;
    renderOperations();
}
function clearFilters() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('globalSearch').value = '';
    renderOperations();
}

// ============== PRODUITS ==============
function renderProduits() {
    const tbody = document.getElementById('tbodyProduits'); 
    if (!tbody) return;
    const query = document.getElementById('globalSearch')?.value.toLowerCase().trim() || '';
    let produitsFiltres = state.produits;
    if (query) {
        produitsFiltres = state.produits.filter(p => p.nom.toLowerCase().includes(query) || (p.fournisseur && p.fournisseur.toLowerCase().includes(query)));
    }
    tbody.innerHTML = produitsFiltres.length ? produitsFiltres.map((p) => {
        const realIndex = state.produits.indexOf(p);
        const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
        const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
        const stock = (p.stockInitial || 0) + e - s;
        return `<tr>
            <td>${realIndex + 1}</td><td>${p.nom}</td><td>${p.unite || '-'}</td>
            <td>${parseFloat(p.prix || 0).toFixed(2)} DH</td>
            <td><strong style="color:${stock > 5 ? '#10b981' : '#ef4444'}">${stock} ${p.unite||''}</strong></td>
            <td>${p.fournisseur || '-'}</td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteProduit(${realIndex})">🗑️</button>
                <button class="btn-action" style="background:#8b5cf6;color:white;padding:4px 8px;border-radius:4px;border:none;cursor:pointer;" onclick="openEditProduit(${realIndex})">✏️</button>
            </td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center; padding:20px;">لا توجد نتائج</td></tr>';
    updateSelect('factProduit', state.produits.map(p => p.nom)); 
    updateSelect('newProduitFournisseur', state.fournisseurs.map(f => f.nom));
}
function ajouterProduit(e) { 
    e.preventDefault(); 
    const nom = document.getElementById('newProduitNom').value.trim(); 
    const unite = document.getElementById('newProduitUnite').value.trim(); 
    const prix = parseFloat(document.getElementById('newProduitPrix').value) || 0; 
    const stockInitial = parseFloat(document.getElementById('newProduitStock').value) || 0; 
    const fournisseur = document.getElementById('newProduitFournisseur').value; 
    if (!nom) return; 
    state.produits.push({ nom, unite, prix, stockInitial, fournisseur }); 
    saveState(); renderAll(); e.target.reset(); 
    showToast('✅ تم إضافة المنتج!');
}
function deleteProduit(index) { if (!confirm('حذف؟')) return; state.produits.splice(index, 1); saveState(); renderAll(); }
function openEditProduit(index) { 
    const p = state.produits[index]; 
    document.getElementById('editProduitIndex').value = index; 
    document.getElementById('editProduitNom').value = p.nom; 
    document.getElementById('editProduitUnite').value = p.unite; 
    document.getElementById('editProduitPrix').value = p.prix; 
    document.getElementById('editProduitStock').value = p.stockInitial || 0; 
    updateSelect('editProduitFournisseur', state.fournisseurs.map(f => f.nom)); 
    document.getElementById('editProduitFournisseur').value = p.fournisseur || ''; 
    document.getElementById('modalProduit').style.display = 'flex'; 
}
document.getElementById('formEditProduit')?.addEventListener('submit', function(e) { 
    e.preventDefault(); 
    const index = document.getElementById('editProduitIndex').value; 
    state.produits[index] = { 
        nom: document.getElementById('editProduitNom').value.trim(), 
        unite: document.getElementById('editProduitUnite').value.trim(), 
        prix: parseFloat(document.getElementById('editProduitPrix').value) || 0, 
        stockInitial: parseFloat(document.getElementById('editProduitStock').value) || 0, 
        fournisseur: document.getElementById('editProduitFournisseur').value 
    }; 
    saveState(); renderAll(); 
    document.getElementById('modalProduit').style.display = 'none'; 
    showToast('✅ تم تعديل المنتج!');
});

// ============== CHARTS BILAN ==============
let charts = { mois: null, employe: null, zone: null, produit: null };
function renderCharts() {
    if (typeof Chart === 'undefined') return;
    const getDataMois = () => {
        const obj = {};
        state.operations.filter(o => o.type === 'vente').forEach(op => {
            const mois = op.mois || (op.date ? op.date.substring(0, 7) : 'N/A');
            if (!obj[mois]) obj[mois] = 0;
            obj[mois] += parseFloat(op.total || 0);
        });
        return obj;
    };
    const dMois = getDataMois();
    const sortedMois = Object.keys(dMois).sort();
    const labelsMois = sortedMois.map(m => {
        const [year, month] = m.split('-');
        const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        return month && year ? `${moisNoms[parseInt(month) - 1]} ${year}` : m;
    });
    const dataMois = sortedMois.map(m => dMois[m]);
    const ctxMois = document.getElementById('chartMois');
    if (ctxMois) {
        if (charts.mois) charts.mois.destroy();
        charts.mois = new Chart(ctxMois, {
            type: 'bar',
            data: { labels: labelsMois, datasets: [{ label: 'Ventes (DH)', data: dataMois, backgroundColor: '#3b82f6', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } }
        });
    }
    const getDataEmp = () => {
        const obj = {};
        state.operations.filter(o => o.type === 'vente').forEach(op => {
            if (!obj[op.employe]) obj[op.employe] = 0;
            obj[op.employe] += parseFloat(op.total || 0);
        });
        return obj;
    };
    const dEmp = getDataEmp();
    const ctxEmp = document.getElementById('chartEmploye');
    if (ctxEmp) {
        if (charts.employe) charts.employe.destroy();
        charts.employe = new Chart(ctxEmp, {
            type: 'pie',
            data: { labels: Object.keys(dEmp), datasets: [{ data: Object.keys(dEmp).map(k => dEmp[k]), backgroundColor: ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 11 }, color: '#94a3b8' } } } }
        });
    }
    const getDataZone = () => {
        const obj = {};
        state.operations.filter(o => o.type === 'vente').forEach(op => {
            if (!obj[op.zone]) obj[op.zone] = 0;
            obj[op.zone] += parseFloat(op.total || 0);
        });
        return obj;
    };
    const dZone = getDataZone();
    const ctxZone = document.getElementById('chartZone');
    if (ctxZone) {
        if (charts.zone) charts.zone.destroy();
        charts.zone = new Chart(ctxZone, {
            type: 'doughnut',
            data: { labels: Object.keys(dZone), datasets: [{ data: Object.keys(dZone).map(k => dZone[k]), backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'] }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { labels: { font: { size: 11 }, color: '#94a3b8' } } } }
        });
    }
    const getDataProd = () => {
        const obj = {};
        state.operations.filter(o => o.type === 'vente').forEach(op => {
            if (!obj[op.produit]) obj[op.produit] = 0;
            obj[op.produit] += parseFloat(op.total || 0);
        });
        return obj;
    };
    const dProd = getDataProd();
    const topProd = Object.entries(dProd).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ctxProd = document.getElementById('chartProduit');
    if (ctxProd) {
        if (charts.produit) charts.produit.destroy();
        charts.produit = new Chart(ctxProd, {
            type: 'bar',
            data: { labels: topProd.map(p => p[0]), datasets: [{ label: 'Ventes (DH)', data: topProd.map(p => p[1]), backgroundColor: '#3b82f6', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } }
        });
    }
}

// ============== BILAN ==============
function renderBilan() { 
    const type = document.getElementById('bilanType')?.value || 'global'; 
    const thead = document.getElementById('bilanHead'); 
    const tbody = document.getElementById('bilanBody'); 
    if (!thead || !tbody) return; 
    
    const v = state.operations.filter(o => o.type === 'vente'); 
    const a = state.operations.filter(o => o.type === 'achat'); 
    const totV = v.reduce((s, o) => s + parseFloat(o.total || 0), 0); 
    const totA = a.reduce((s, o) => s + parseFloat(o.total || 0), 0); 
    const benefice = totV - totA;
    
    let valeurStock = 0;
    state.produits.forEach(p => {
        const e = state.operations.filter(o => o.type === 'achat' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
        const s = state.operations.filter(o => o.type === 'vente' && o.produit === p.nom).reduce((s, o) => s + parseFloat(o.quantite), 0);
        const stock = (p.stockInitial || 0) + e - s;
        valeurStock += stock * (p.prix || 0);
    });

    if (document.getElementById('bilanTotalVentes')) document.getElementById('bilanTotalVentes').textContent = totV.toFixed(2) + ' DH';
    if (document.getElementById('bilanTotalAchats')) document.getElementById('bilanTotalAchats').textContent = totA.toFixed(2) + ' DH';
    if (document.getElementById('bilanBenefice')) document.getElementById('bilanBenefice').textContent = benefice.toFixed(2) + ' DH';
    if (document.getElementById('bilanValeurStock')) document.getElementById('bilanValeurStock').textContent = valeurStock.toFixed(2) + ' DH';

    if (type === 'global') { 
        thead.innerHTML = '<tr><th>Description</th><th>Valeur</th></tr>'; 
        tbody.innerHTML = `
            <tr><td>Total Ventes</td><td>${totV.toFixed(2)} DH</td></tr>
            <tr><td>Total Achats</td><td>${totA.toFixed(2)} DH</td></tr>
            <tr><td>Bénéfice</td><td><strong style="color:${benefice>=0?'#10b981':'#ef4444'}">${benefice.toFixed(2)} DH</strong></td></tr>
            <tr><td>Valeur du Stock</td><td>${valeurStock.toFixed(2)} DH</td></tr>
        `; 
    } else { 
        let key = type;
        // هنا التعديل: كنحددو label المناسب لكل خيار
        let label = type === 'mois' ? 'Mois' : type === 'employe' ? 'Employé' : type === 'zone' ? 'Zone' : type === 'produit' ? 'Produit' : type === 'fournisseur' ? 'Fournisseur' : 'N/A';
        
        thead.innerHTML = `<tr><th>${label}</th><th>Nb Opérations</th><th>Quantité</th><th>Total</th></tr>`; 
        const grouped = {}; 
        state.operations.forEach(op => { 
            // هنا التعديل: إلا كان type = fournisseur، كنستعملو op.fournisseur
            let k;
            if (type === 'fournisseur') {
                k = op.fournisseur || 'N/A'; // إلا كان fournisseur خاوي، كنكتبو N/A
            } else {
                k = op[key] || 'N/A';
            }
            
            if (!grouped[k]) grouped[k] = { nb: 0, qte: 0, total: 0 }; 
            grouped[k].nb++; 
            grouped[k].qte += parseFloat(op.quantite || 0); 
            grouped[k].total += parseFloat(op.total || 0); 
        }); 
        tbody.innerHTML = Object.entries(grouped).sort((a,b) => b[1].total - a[1].total).map(([m, d]) => 
            `<tr><td><strong>${m}</strong></td><td>${d.nb}</td><td>${d.qte}</td><td><strong>${d.total.toFixed(2)} DH</strong></td></tr>`
        ).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px;">لا توجد بيانات</td></tr>'; 
    } 
}

// ============== EXPORT PDF GLOBAL ==============
function exportPDFGlobal() {
    if (typeof window.jspdf === 'undefined') {
        showToast('❌ مكتبة PDF ماشي محملة', '#ef4444');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('MENARAT AL HAOUZ - RAPPORT GLOBAL', 105, 22, { align: 'center' });
    const v = state.operations.filter(o => o.type === 'vente');
    const a = state.operations.filter(o => o.type === 'achat');
    const totV = v.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const totA = a.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const benefice = totV - totA;
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(15, 45, 55, 20, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Ventes', 42.5, 52, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${totV.toFixed(2)} DH`, 42.5, 60, { align: 'center' });
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(77.5, 45, 55, 20, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Achats', 105, 52, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${totA.toFixed(2)} DH`, 105, 60, { align: 'center' });
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(140, 45, 55, 20, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Bénéfice', 167.5, 52, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${benefice.toFixed(2)} DH`, 167.5, 60, { align: 'center' });
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Détail des Opérations:', 15, 80);
    const moisNoms = { '01':'Jan', '02':'Fév', '03':'Mar', '04':'Avr', '05':'Mai', '06':'Juin', '07':'Juil', '08':'Août', '09':'Sep', '10':'Oct', '11':'Nov', '12':'Déc' };
    const tableData = state.operations
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((op, i) => {
            let moisValue = op.mois;
            if (!moisValue && op.date) { moisValue = op.date.substring(0, 7); }
            const parts = (moisValue || '').split('-');
            const moisAffichage = parts.length === 2 && moisNoms[parts[1]] ? `${moisNoms[parts[1]]} ${parts[0]}` : (moisValue || '-');
            return [ i + 1, op.date || '-', moisAffichage, op.type === 'achat' ? 'Achat' : 'Vente', op.employe || '-', op.fournisseur || '-', op.zone || '-', op.produit || '-', op.quantite || 0, parseFloat(op.total || 0).toFixed(2) ];
        });
    if (typeof doc.autoTable !== 'function') {
        showToast('❌ مكتبة AutoTable ماشي محملة', '#ef4444');
        return;
    }
    doc.autoTable({
        startY: 85,
        head: [['#', 'Date', 'Mois', 'Type', 'Bénéf./Four.', 'Fournisseur', 'Zone', 'Produit', 'Qté', 'Total']],
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 3, textColor: [50, 50, 50], valign: 'middle' },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 25 }, 5: { cellWidth: 25 }, 6: { cellWidth: 20 }, 7: { cellWidth: 22 }, 8: { cellWidth: 10, halign: 'center' }, 9: { cellWidth: 20, halign: 'center' } }
    });
    doc.save(`Rapport-${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('✅ تم تصدير التقرير PDF!');
}

// ============== AUTRES ==============
function renderCredits() { const tbody = document.getElementById('tbodyCredits'); if (!tbody) return; const credits = state.operations.filter(o => o.type === 'vente' && o.paiement === 'Crédit').sort((a,b)=>new Date(b.date)-new Date(a.date)); tbody.innerHTML = credits.length ? credits.map((op) => `<tr><td>${op.date}</td><td>${op.employe}</td><td>${op.produit}</td><td>${op.quantite}</td><td><strong style="color:#ef4444">${parseFloat(op.total).toFixed(2)} DH</strong></td><td><button class="btn-action btn-primary" onclick="payerCredit('${op.id}')" style="padding:4px 8px; font-size:12px;">💸 Payer</button></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center; padding:20px;">لا توجد ديون</td></tr>'; }
function payerCredit(id) { if (!confirm('هل تم استلام المبلغ؟')) return; const op = state.operations.find(o => o.id === id); if (op) { op.paiement = 'Payé'; saveState(); renderAll(); } }

function renderEmployes() { 
    const t = document.getElementById('tbodyEmployes'); 
    if (!t) return; 
    const query = document.getElementById('globalSearch')?.value.toLowerCase().trim() || '';
    let employesFiltres = state.employes;
    if (query) { employesFiltres = state.employes.filter(e => e.toLowerCase().includes(query)); }
    t.innerHTML = employesFiltres.map((e) => { 
        const realIndex = state.employes.indexOf(e);
        const v = state.operations.filter(o => o.employe === e && o.type === 'vente').reduce((s, o) => s + parseFloat(o.total || 0), 0); 
        const q = state.operations.filter(o => o.employe === e && o.type === 'vente').reduce((s, o) => s + parseFloat(o.quantite || 0), 0); 
        return `<tr><td>${realIndex + 1}</td><td>${e}</td><td>${v.toFixed(2)} DH</td><td>${q}</td><td><button class="btn-action btn-delete" onclick="deleteEmploye(${realIndex})">🗑️</button></td></tr>`; 
    }).join('') || '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد نتائج</td></tr>'; 
    updateSelect('opEmploye', state.employes); 
}
function ajouterEmploye(e) { 
    if (e) e.preventDefault(); 
    const input = document.getElementById('newEmployeNom');
    if (!input) { showToast('❌ الحقل ماشي موجود', '#ef4444'); return; }
    const n = input.value.trim().toUpperCase(); 
    if (!n) { showToast('⚠️ كتب سمية الموظف', '#f59e0b'); return; } 
    if (state.employes.includes(n)) { showToast('⚠️ هاد الموظف مسجل من قبل!', '#f59e0b'); return; }
    state.employes.push(n); 
    saveState(); renderEmployes(); renderAll(); input.value = ''; 
    showToast('✅ تم إضافة الموظف: ' + n);
}
// --- إدارة حسابات Firebase ---

function openAddUserFirebase() {
    const email = prompt("أدخل الإيميل ديال الموظف الجديد (مثلاً: hicham@menarat.ma):");
    if (!email) return;
    
    const password = prompt("أدخل كلمة السر المؤقتة (6 حروف على الأقل):");
    if (!password || password.length < 6) {
        showToast('⚠️ كلمة السر خاصها تكون 6 حروف على الأقل', '#f59e0b');
        return;
    }

    addUserToFirebase(email, password);
}

async function addUserToFirebase(email, password) {
    // كنحفظو معلومات الأدمن الحالي باش نرجعوه من بعد
    const currentAdminEmail = window.firebaseAuth.currentUser?.email;
    const currentAdminPass = prompt("عافاك أدخل كلمة السر ديالك (ديال الأدمن) باش نتأكدو أنك نتا:"); 
    // ⚠️ هادشي ماشي آمن 100%، ولكن هو الحل الوحيد بلا سيرفر.

    if (!currentAdminPass) {
        showToast('⚠️ خاصك تدخل كلمة السر ديالك باش تكمل', '#ef4444');
        return;
    }

    try {
        const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
        
        // 1. نزيدو المستخدم الجديد (هنا غادي يخرجنا من حساب الأدمن)
        await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
        showToast('✅ تزاد المستخدم فـ Firebase!', '#10b981');
        
        // 2. نرجعو ندخلو الأدمن (باش التطبيق يبقى خدام)
        if (currentAdminEmail) {
            await signInWithEmailAndPassword(window.firebaseAuth, currentAdminEmail, currentAdminPass);
        }

        // 3. نزيدو السمية فـ اللائحة ديال الموظفين (باش يبان فـ التطبيق)
        const nom = email.split('@')[0].toUpperCase();
        if (!state.employes.includes(nom)) {
            state.employes.push(nom);
            saveState();
            renderEmployes();
        }
        
        showToast(`✅ تزاد الحساب ديال ${nom} بنجاح!`, '#10b981');
        
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/email-already-in-use') {
            showToast('❌ هاد الإيميل مسجل من قبل', '#ef4444');
        } else if (error.code === 'auth/weak-password') {
            showToast('❌ كلمة السر ضعيفة بزاف', '#ef4444');
        } else {
            showToast('❌ خطأ: ' + error.message, '#ef4444');
        }
    }
}
function deleteEmploye(i) { customConfirm('حذف؟').then(confirmed => { if (!confirmed) return; state.employes.splice(i, 1); saveState(); renderAll(); }); }

function renderZones() { 
    const t = document.getElementById('tbodyZones'); 
    if (!t) return; 
    const query = document.getElementById('globalSearch')?.value.toLowerCase().trim() || '';
    let zonesFiltrees = state.zones;
    if (query) { zonesFiltrees = state.zones.filter(z => z.toLowerCase().includes(query)); }
    t.innerHTML = zonesFiltrees.map((z) => { 
        const realIndex = state.zones.indexOf(z);
        const v = state.operations.filter(o => o.zone === z && o.type === 'vente').reduce((s, o) => s + parseFloat(o.total || 0), 0); 
        const q = state.operations.filter(o => o.zone === z && o.type === 'vente').reduce((s, o) => s + parseFloat(o.quantite || 0), 0); 
        return `<tr><td>${realIndex + 1}</td><td>${z}</td><td>${v.toFixed(2)} DH</td><td>${q}</td><td><button class="btn-action btn-delete" onclick="deleteZone(${realIndex})">🗑️</button></td></tr>`; 
    }).join('') || '<tr><td colspan="5" style="text-align:center; padding:20px;">لا توجد نتائج</td></tr>'; 
    updateSelect('opZone', state.zones); 
}
function ajouterZone(e) { 
    e.preventDefault(); 
    const n = document.getElementById('newZoneNom').value.trim(); 
    if (!n) return; 
    state.zones.push(n.toUpperCase()); 
    saveState(); renderAll(); e.target.reset(); 
    showToast('✅ تم إضافة المنطقة!');
}
function deleteZone(i) { customConfirm('حذف؟').then(confirmed => { if (!confirmed) return; state.zones.splice(i, 1); saveState(); renderAll(); }); }

function renderFournisseurs() { 
    const t = document.getElementById('tbodyFournisseurs'); 
    if (!t) return; 
    const query = document.getElementById('globalSearch')?.value.toLowerCase().trim() || '';
    let fournisseursFiltres = state.fournisseurs;
    if (query) {
        fournisseursFiltres = state.fournisseurs.filter(f => f.nom.toLowerCase().includes(query) || (f.tel && f.tel.includes(query)));
    }
    t.innerHTML = fournisseursFiltres.map((f) => {
        const realIndex = state.fournisseurs.indexOf(f);
        return `<tr><td>${realIndex + 1}</td><td>${f.nom}</td><td>${f.tel || '-'}</td><td><button class="btn-action btn-delete" onclick="deleteFournisseur(${realIndex})">🗑️</button></td></tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px;">لا توجد نتائج</td></tr>'; 
    updateSelect('opFournisseur', state.fournisseurs.map(f => f.nom)); 
    updateSelect('newProduitFournisseur', state.fournisseurs.map(f => f.nom)); 
}
function ajouterFournisseur(e) { 
    e.preventDefault(); 
    const n = document.getElementById('newFournisseurNom').value.trim(); 
    const t = document.getElementById('newFournisseurTel').value.trim(); 
    if (!n) return; 
    state.fournisseurs.push({ nom: n, tel: t }); 
    saveState(); renderAll(); e.target.reset(); 
    showToast('✅ تم إضافة المورد!');
}
function deleteFournisseur(i) { customConfirm('حذف؟').then(confirmed => { if (!confirmed) return; state.fournisseurs.splice(i, 1); saveState(); renderAll(); }); }

function updateSelect(id, items) { 
    const s = document.getElementById(id); 
    if (!s) return; 
    const v = s.value; 
    s.innerHTML = '<option value="">-- اختر --</option>'; 
    items.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; s.appendChild(o); }); 
    if (items.includes(v)) s.value = v; 
}
function renderAll() { renderAccueil(); renderOperations(); renderProduits(); renderEmployes(); renderZones(); renderFournisseurs(); renderCredits(); checkNotifs(); }
function renderStatsAvancees() {
    const today = new Date().toISOString().split('T')[0];
    const moisActuel = today.substring(0, 7); 

    const ventesAujourdhui = state.operations.filter(o => o.type === 'vente' && o.date === today).reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const ventesMois = state.operations.filter(o => o.type === 'vente' && o.date && o.date.startsWith(moisActuel)).reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const opsAujourdhui = state.operations.filter(o => o.date === today).length;

    if (document.getElementById('statVentesJour')) document.getElementById('statVentesJour').textContent = ventesAujourdhui.toFixed(2) + ' DH';
    if (document.getElementById('statVentesMois')) document.getElementById('statVentesMois').textContent = ventesMois.toFixed(2) + ' DH';
    if (document.getElementById('statOpsJour')) document.getElementById('statOpsJour').textContent = opsAujourdhui;
}
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 بدا التطبيق...');
    
    await waitForFirebase();
    console.log('✅ Firebase واجد:', firebaseReady);
    
    await loadState();
    console.log('📦 البيانات بعد التحميل:', state);
    
    // تحميل الثيم
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = '☀️';
    }
    
    // تحميل السنة
    const savedYear = localStorage.getItem('menarat_year'); 
    if (savedYear && document.getElementById('sidebarYear')) document.getElementById('sidebarYear').textContent = 'Gestion ' + savedYear;
    
    generateMonths(); 
    if (document.getElementById('opDate')) document.getElementById('opDate').valueAsDate = new Date();
    
    // ربط الفورمولير
    ['formOperation', 'formProduit', 'formZone', 'formFournisseur'].forEach(id => { 
        const f = document.getElementById(id); 
        if (f) f.addEventListener('submit', id === 'formOperation' ? validerFacture : id === 'formProduit' ? ajouterProduit : id === 'formZone' ? ajouterZone : id === 'formFournisseur' ? ajouterFournisseur : null); 
    });
    
    toggleTypeOperation(); 
    setTimeout(renderCharts, 500);
});
function autoFillPrix() {
    const selectProduit = document.getElementById('factProduit');
    const inputPrix = document.getElementById('factPrix');
    
    if (!selectProduit || !inputPrix) return;
    
    const nomProduit = selectProduit.value;
    
    if (nomProduit) {
        // كنقلبو على المنتج فـ اللائحة
        const produit = state.produits.find(p => p.nom === nomProduit);
        
        if (produit && produit.prix) {
            inputPrix.value = produit.prix; // كنعمر خنة الثمن بالثمن ديال المنتج
        } else {
            inputPrix.value = ''; // إلا كان الثمن خاوي، كنخليو الخانة خاوية
        }
    } else {
        inputPrix.value = ''; // إلا ما اختارش منتج، كنمسحو الثمن
    }
}
async function checkEmployeLogin() {
    const email = document.getElementById('loginEmpNom').value.trim();
    const password = document.getElementById('loginEmpPass').value;

    if (!email || !password) {
        document.getElementById('loginError').style.display = 'block';
        return;
    }

    try {
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
        const userCredential = await signInWithEmailAndPassword(window.firebaseAuth, email, password);
        
        const userEmail = userCredential.user.email;
        let nomEmploye = userEmail.split('@')[0].toUpperCase();
        
        // هاد الجزء باش نربطو الإيميل بالسمية الحقيقية
        const employesEmails = {
            'HICHAMELMOUDALI': 'HICHAM',
            'RIDABOUR': 'RIDA',       // حط هنا الجزء الأول من الإيميل ديال رضا
            'HAMZAKOWAY': 'HAMZA KOWAY',
            'YOUSSEF': 'YOUSSEF LKHIYAT'
            // زيد الباقي على حساب الإيميلات اللي فـ Firebase
        };
        
        if (employesEmails[nomEmploye]) {
            nomEmploye = employesEmails[nomEmploye];
        }

        if (!state.employes.includes(nomEmploye)) {
            state.employes.push(nomEmploye);
            saveState();
        }

        userRole = 'employe';
        currentUser = nomEmploye;
        localStorage.setItem('role', 'employe');
        localStorage.setItem('user', nomEmploye);
        
        showApp(); 
    } catch (error) {
        console.error(error);
        document.getElementById('loginError').style.display = 'block';
        showToast('❌ الإيميل أو كلمة السر خاطئة', '#ef4444');
    }
}function exportRapportMensuelPDF() {
    if (typeof window.jspdf === 'undefined') {
        showToast('❌ مكتبة PDF ماشي محملة', '#ef4444');
        return;
    }

    // كنطلبو من المستخدم يدخل الشهر (مثلاً 2026-10)
    const moisInput = prompt("أدخل الشهر اللي بغيتي (مثلاً: 2026-10)");
    if (!moisInput) return; // إلا كنسل

    // كنتحققو من العمليات ديال داك الشهر
    const opsMois = state.operations.filter(o => o.mois === moisInput || (o.date && o.date.startsWith(moisInput)));
    
    if (opsMois.length === 0) {
        showToast('⚠️ ماكاينش عمليات فهاد الشهر', '#f59e0b');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. اللوغو والمعلومات
    const img = new Image();
    img.src = 'logo.png';
    try { doc.addImage(img, 'PNG', 15, 10, 30, 30); } catch(e) {}
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MENARAT AL HAOUZ TRAVAUX', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`RAPPORT MENSUEL - ${moisInput}`, 105, 27, { align: 'center' });
    
    doc.setDrawColor(59, 130, 246);
    doc.line(15, 37, 195, 37);

    // 2. حساب المجاميع
    const totalVentes = opsMois.filter(o => o.type === 'vente').reduce((s, o) => s + parseFloat(o.total), 0);
    const totalAchats = opsMois.filter(o => o.type === 'achat').reduce((s, o) => s + parseFloat(o.total), 0);
    const benefice = totalVentes - totalAchats;

    // 3. جدول العمليات
    const tableData = opsMois.sort((a,b) => new Date(a.date) - new Date(b.date)).map(o => [
        o.date, 
        o.type === 'achat' ? 'Achat' : 'Vente', 
        o.employe, 
        o.produit, 
        o.quantite, 
        parseFloat(o.total).toFixed(2)
    ]);
    
    doc.autoTable({
        startY: 45,
        head: [['Date', 'Type', 'Employé/Four.', 'Produit', 'Qté', 'Total (DH)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 3 }
    });

    // 4. المجاميع فـ الأخير
    let finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129); // لون أخضر
    doc.text(`Total Ventes: ${totalVentes.toFixed(2)} DH`, 15, finalY);
    
    doc.setTextColor(239, 68, 68); // لون أحمر
    doc.text(`Total Achats: ${totalAchats.toFixed(2)} DH`, 15, finalY + 6);
    
    doc.setTextColor(15, 23, 42); // لون أسود
    doc.setFont('helvetica', 'bold');
    doc.text(`Bénéfice Net: ${benefice.toFixed(2)} DH`, 15, finalY + 12);

    doc.save(`Rapport-Mensuel-${moisInput}.pdf`);
    showToast('✅ تم تصدير التقرير الشهري!');
}