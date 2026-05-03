/*
=========================================================
PB. BATU BETULIS - CORE APPLICATION LOGIC
[MENTOR NOTE]
1. Semua fungsi state & DOM diekspos ke 'window' karena dipanggil dari HTML secara inline (onclick).
2. 'limit(30)' sudah diterapkan pada log & BKU untuk mencegah kuota bocor.
3. Patch 'Desync' Keuangan sudah diterapkan pada Edit & Delete Transaksi.
=========================================================
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, getDoc, updateDoc, collection, query, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Konfigurasi Firebase Anda
const firebaseConfig = {
    apiKey: "AIzaSyCnHKhINwZgnon4O0WPfdiYpb9tK118jTY",
    authDomain: "pb-batu-bertulis-1.firebaseapp.com",
    projectId: "pb-batu-bertulis-1",
    storageBucket: "pb-batu-bertulis-1.firebasestorage.app",
    messagingSenderId: "845117339520",
    appId: "1:845117339520:web:47ccdc6a13622c5626b365"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("KRITIKAL: Firebase gagal diinisialisasi.", error);
    alert("Sistem gagal terhubung ke database. Coba muat ulang halaman.");
}

// Global State
let currentUser = null;
let allMembers = [];
let currentCockPrice = 3000;

// ==========================================
// 1. UI & NAVIGASI GLOBAL
// ==========================================

window.showTab = (id, btn) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('bottom-nav-active', 'text-slate-400'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.add('text-slate-400'));
    document.getElementById(id).classList.add('active');
    if (btn) { btn.classList.remove('text-slate-400'); btn.classList.add('bottom-nav-active'); }
};

window.closeLogin = () => document.getElementById('modal-login').classList.add('hidden');

const btnLoginTrigger = document.getElementById('btn-login-trigger');
if(btnLoginTrigger) btnLoginTrigger.onclick = () => document.getElementById('modal-login').classList.remove('hidden');

const btnDoLogin = document.getElementById('btn-do-login');
if(btnDoLogin) {
    btnDoLogin.onclick = async () => {
        const e = document.getElementById('login-email').value;
        const p = document.getElementById('login-pass').value;
        try {
            await signInWithEmailAndPassword(auth, e, p);
            closeLogin();
        } catch (err) {
            console.error("Login gagal:", err);
            alert("Sandi/Email Salah!");
        }
    };
}

const btnLogout = document.getElementById('btn-logout');
if(btnLogout) btnLogout.onclick = () => signOut(auth);

window.toggleFabMenu = () => {
    const menu = document.getElementById('fab-menu');
    const icon = document.getElementById('icon-fab');
    const overlay = document.getElementById('fab-overlay');
    if(!menu || !icon || !overlay) return;
    const isHidden = menu.classList.contains('hidden');
    if(isHidden) {
        menu.classList.remove('hidden');
        overlay.classList.remove('hidden');
        void menu.offsetWidth;
        icon.style.transform = 'rotate(45deg)';
        menu.classList.replace('scale-95', 'scale-100');
        menu.classList.replace('opacity-0', 'opacity-100');
        menu.classList.replace('translate-y-4', 'translate-y-0');
        overlay.classList.replace('opacity-0', 'opacity-100');
    } else {
        icon.style.transform = 'rotate(0deg)';
        menu.classList.replace('scale-100', 'scale-95');
        menu.classList.replace('opacity-100', 'opacity-0');
        menu.classList.replace('translate-y-0', 'translate-y-4');
        overlay.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            menu.classList.add('hidden');
            overlay.classList.add('hidden');
        }, 300);
    }
};

// ==========================================
// 2. AUTHENTICATION LISTENER
// ==========================================

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    document.body.classList.toggle('is-admin', !!user);
    const loginBtn = document.getElementById('btn-login-trigger');
    const logoutBtn = document.getElementById('btn-logout');
    if (user) { 
        if(loginBtn) loginBtn.classList.add('hidden'); 
        if(logoutBtn) logoutBtn.classList.remove('hidden'); 
    } else { 
        if(loginBtn) loginBtn.classList.remove('hidden'); 
        if(logoutBtn) logoutBtn.classList.add('hidden'); 
        if(document.getElementById('tab-settings')?.classList.contains('active')) {
            showTab('tab-members', document.querySelector('.nav-btn'));
        }
    }
});


// ==========================================
// 3. REALTIME DATABASE LISTENERS
// ==========================================

// Listener Anggota
onSnapshot(collection(db, "members"), (snap) => {
    allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const countEl = document.getElementById('display-member-count');
    if(countEl) countEl.innerText = allMembers.length + " Orang";
    
    let totalT = 0;
    const list = document.getElementById('list-members');
    if(list) {
        list.innerHTML = allMembers.sort((a,b) => a.name.localeCompare(b.name)).map(m => {
            const isN = m.shuttlecock_balance < 0; 
            if(isN) totalT += Math.abs(m.shuttlecock_balance);
            
            return `<div onclick="openMemberProfile('${m.id}')" class="member-card bg-white p-4 rounded-2xl shadow-sm border border-slate-50 flex flex-col gap-1 transition active:bg-slate-50">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-slate-800 text-sm tracking-tight">${m.name.toUpperCase()}</span>
                    <span class="font-black ${isN ? 'text-rose-600 bg-rose-50' : 'text-emerald-700 bg-emerald-50'} px-2 py-0.5 rounded-lg text-[10px] uppercase">${m.shuttlecock_balance} Kok</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Saldo Rupiah</span>
                    <span class="text-[11px] font-mono font-bold ${isN ? 'text-rose-400' : 'text-slate-400'}">Rp ${(m.shuttlecock_balance * currentCockPrice).toLocaleString('id-ID')}</span>
                </div>
            </div>`;
        }).join('');
    }
    const tekorEl = document.getElementById('display-total-tekor-nominal');
    if(tekorEl) tekorEl.innerText = "Rp " + (totalT * currentCockPrice).toLocaleString('id-ID');
    
    renderAdminUI();
}, (error) => { console.error("Error fetching members:", error); });

// Listener Log Kok (Dengan Limit)
onSnapshot(query(collection(db, "shuttlecock_history"), orderBy("timestamp", "desc"), limit(30)), (snap) => {
    const list = document.getElementById('list-history');
    if(list) {
        list.innerHTML = snap.docs.map(doc => {
            const d = doc.data(); const isU = d.type === 'USAGE';
            const ds = d.timestamp?.toDate().toLocaleDateString('id-ID', { day:'numeric', month:'short' });
            const ts = d.timestamp?.toDate().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
            const nom = Math.abs(d.amount) * currentCockPrice;
            return `<div class="bg-white p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-slate-50 group transition active:bg-slate-50">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[10px] ${isU ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}">${ds || '-'}</div>
                <div class="flex-1">
                    <p class="font-bold text-sm text-slate-800 tracking-tight">${(d.member_name || '').toUpperCase()}</p>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${ts || '-'} • ${d.note || 'Transaksi'}</p>
                </div>
                <div class="text-right flex flex-col items-end gap-0.5">
                    <div class="flex items-center gap-2">
                        <p class="font-black text-sm ${isU ? 'text-rose-600' : 'text-emerald-600'}">${d.amount > 0 ? '+'+d.amount : d.amount} Kok</p>
                        <div class="admin-only flex gap-1">
                            <button onclick="openEditTransaction('${doc.id}', 'HISTORY')" class="p-1 text-slate-300 hover:text-emerald-600 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onclick="adminDeleteShuttlecock('${doc.id}', '${d.type}')" class="p-1 text-slate-300 hover:text-rose-500 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                    </div>
                    <p class="text-[10px] font-mono font-bold ${isU ? 'text-rose-400' : 'text-emerald-400'}">Rp ${nom.toLocaleString('id-ID')}</p>
                </div>
            </div>`;
        }).join('');
    }
}, (error) => { console.error("Error fetching history:", error); });

// Listener Kas (Dengan Limit)
onSnapshot(query(collection(db, "bku_transactions"), orderBy("timestamp", "desc"), limit(30)), (snap) => {
    const list = document.getElementById('list-bku');
    if(list) {
        list.innerHTML = snap.docs.map(doc => {
            const d = doc.data(); const isD = d.type === 'DEBIT';
            return `<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 flex items-center gap-4">
                <div class="p-2 rounded-xl ${isD ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">${isD ? '+' : '-'}</div>
                <div class="flex-1">
                    <div class="flex justify-between items-center mb-0.5">
                        <span class="text-[9px] font-black uppercase text-slate-400 tracking-wider">${d.category}</span>
                        <span class="text-[9px] text-slate-300 font-bold">${d.timestamp?.toDate().toLocaleDateString('id-ID') || ''}</span>
                    </div>
                    <div class="flex justify-between items-end">
                        <p class="text-xs font-semibold text-slate-700 italic line-clamp-1 max-w-[50%]">"${d.note}"</p>
                        <div class="text-right flex items-center gap-2">
                            <p class="font-black text-sm ${isD ? 'text-emerald-600' : 'text-rose-600'}">${isD ? '' : '-'}${d.amount.toLocaleString('id-ID')}</p>
                            <div class="admin-only flex gap-1">
                                ${d.linked_history_id ? 
                                    `<span class="p-1 text-slate-300" title="Dikunci: Edit transaksi ini melalui Tab LOG KOK"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></span>` 
                                    : 
                                    `<button onclick="openEditTransaction('${doc.id}', 'BKU')" class="p-1 text-slate-200 hover:text-emerald-500 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                    <button onclick="adminDeleteBKU('${doc.id}')" class="p-1 text-slate-200 hover:text-rose-400 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>`
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}, (error) => { console.error("Error fetching BKU:", error); });

// Listener Metadata & Keuangan Global
onSnapshot(doc(db, "metadata", "stats"), (ds) => {
    if(ds.exists()) {
        const data = ds.data();
        currentCockPrice = data.shuttlecock_price || 3000;
        const cockPriceEl = document.getElementById('display-cock-price');
        if(cockPriceEl) cockPriceEl.innerText = "@" + currentCockPrice.toLocaleString('id-ID') + " / KOK";
        
        const setPriceInput = document.getElementById('input-setting-price');
        if(setPriceInput && setPriceInput.value === "") {
            setPriceInput.value = currentCockPrice;
        }
        
        const bkuTotalEl = document.getElementById('display-bku-total');
        if(bkuTotalEl) bkuTotalEl.innerText = "Rp " + (data.total_balance_bku || 0).toLocaleString('id-ID'); 
        
        const bkuIncomeEl = document.getElementById('display-bku-income');
        if(bkuIncomeEl) bkuIncomeEl.innerText = "Rp " + (data.total_income_bku || 0).toLocaleString('id-ID');
        
        const bkuExpenseEl = document.getElementById('display-bku-expense');
        if(bkuExpenseEl) bkuExpenseEl.innerText = "Rp " + (data.total_expense_bku || 0).toLocaleString('id-ID');
    }
}, (error) => { console.error("Error fetching stats:", error); });

// ==========================================
// 4. FUNGSI ADMIN & MANAJEMEN DATA
// ==========================================

window.actionSaveSettings = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const newPrice = parseInt(document.getElementById('input-setting-price').value);
    if(isNaN(newPrice) || newPrice <= 0) return alert("Harga tidak valid!");
    
    try {
        await updateDoc(doc(db, "metadata", "stats"), { shuttlecock_price: newPrice });
        alert("Harga berhasil diperbarui!");
    } catch (e) {
        console.error("Gagal simpan setting:", e);
        alert(e.message);
    }
};

function renderAdminUI() {
    const ms = document.getElementById('admin-multi-select');
    if(ms) {
        ms.innerHTML = allMembers.map(m => `<label class="flex-shrink-0 cursor-pointer">
            <input type="checkbox" name="usage-member" value="${m.id}|${m.name}" class="hidden peer" onchange="updateUsagePreview()">
            <div class="px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black text-slate-400 peer-checked:bg-rose-500 peer-checked:text-white peer-checked:border-rose-500 transition-all uppercase tracking-widest shadow-sm active:scale-95">${m.name.toUpperCase()}</div>
        </label>`).join('');
    }
    const gds = document.getElementById('select-global-deposit-member');
    if(gds) {
        gds.innerHTML = `<option value="">Pilih Anggota</option>` + allMembers.map(m => `<option value="${m.id}|${m.name}">${m.name.toUpperCase()}</option>`).join('');
    }
}

window.updateUsagePreview = () => {
    const sel = Array.from(document.querySelectorAll('input[name="usage-member"]:checked'));
    const previewArea = document.getElementById('usage-preview-chips');
    if (!previewArea) return;
    if (sel.length === 0) {
        previewArea.innerHTML = '<span class="text-[10px] font-bold text-slate-300 italic">Belum ada pemain terpilih</span>';
        return;
    }
    const names = sel.map(el => el.value.split('|')[1]);
    previewArea.innerHTML = `<span class="text-[11px] font-bold text-rose-600 leading-relaxed">${names.join(', ').toUpperCase()}</span>`;
};

// Modals Anggota
window.openAddMemberModal = () => document.getElementById('modal-add-member').classList.remove('hidden');
window.closeAddMemberModal = () => {
    document.getElementById('modal-add-member').classList.add('hidden');
    document.getElementById('input-new-member').value = "";
};

window.actionAddMember = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const i = document.getElementById('input-new-member'); 
    if(!i.value) return;
    try {
        await setDoc(doc(db, "members", Date.now().toString()), { 
            name: i.value.toUpperCase(), 
            shuttlecock_balance: 0, 
            created_at: serverTimestamp() 
        });
        closeAddMemberModal();
        showTab('tab-members', document.querySelectorAll('.nav-btn')[0]);
        alert("Anggota Berhasil Ditambahkan!");
    } catch (e) {
        console.error("Gagal tambah anggota:", e);
        alert(e.message);
    }
};

window.openMemberProfile = (id) => {
    if (!currentUser) return;
    const m = allMembers.find(x => x.id === id);
    if (!m) return;
    document.getElementById('profile-member-id').value = m.id;
    document.getElementById('profile-name').innerText = m.name;
    document.getElementById('profile-balance').innerText = `${m.shuttlecock_balance} Kok`;
    document.getElementById('input-deposit-amount').value = "";
    document.getElementById('deposit-calc').innerText = "Rp 0";
    document.getElementById('modal-member-profile').classList.remove('hidden');
};
window.closeMemberProfile = () => document.getElementById('modal-member-profile').classList.add('hidden');

window.triggerEditName = () => {
    const id = document.getElementById('profile-member-id').value;
    const oldName = document.getElementById('profile-name').innerText;
    adminEditMemberName(id, oldName);
};

window.adminEditMemberName = async (id, old) => {
    if (!currentUser) return alert("Akses Ditolak!");
    const n = prompt("Ubah nama anggota:", old);
    if(n && n !== old) {
        try {
            await updateDoc(doc(db, "members", id), { name: n.toUpperCase() });
            document.getElementById('profile-name').innerText = n.toUpperCase();
        } catch (e) {
            console.error("Gagal edit nama:", e);
            alert(e.message);
        }
    }
};

// Transaksi Deposit
window.openGlobalDepositModal = () => document.getElementById('modal-global-deposit').classList.remove('hidden');
window.closeGlobalDepositModal = () => {
    document.getElementById('modal-global-deposit').classList.add('hidden');
    document.getElementById('input-global-deposit-amount').value = "";
    document.getElementById('global-deposit-calc').innerText = "Rp 0";
    document.getElementById('select-global-deposit-member').value = "";
};

const elGlobalDepositAmount = document.getElementById('input-global-deposit-amount');
if(elGlobalDepositAmount) {
    elGlobalDepositAmount.oninput = (e) => {
        document.getElementById('global-deposit-calc').innerText = "Rp " + ((parseInt(e.target.value) || 0) * currentCockPrice).toLocaleString('id-ID');
    };
}

const elDepositAmount = document.getElementById('input-deposit-amount');
if(elDepositAmount) {
    elDepositAmount.oninput = (e) => {
        document.getElementById('deposit-calc').innerText = "Rp " + ((parseInt(e.target.value) || 0) * currentCockPrice).toLocaleString('id-ID');
    };
}

async function performDepositLogic(id, n, amt, modalCloseFn) {
    const cost = amt * currentCockPrice; 
    try {
        const b = writeBatch(db);
        const historyRef = doc(collection(db, "shuttlecock_history"));
        const bkuRef = doc(collection(db, "bku_transactions"));
        
        b.update(doc(db, "members", id), { shuttlecock_balance: increment(amt) });
        b.set(historyRef, { member_id: id, member_name: n, type: "DEPOSIT", amount: amt, note: "Deposit " + n, linked_bku_id: bkuRef.id, timestamp: serverTimestamp() });
        b.set(bkuRef, { type: "DEBIT", category: "DEPOSIT KOK", amount: cost, note: "Deposit " + n, linked_history_id: historyRef.id, timestamp: serverTimestamp() });
        b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(cost), total_income_bku: increment(cost) });
    
        await b.commit(); 
        modalCloseFn();
        showTab('tab-members', document.querySelectorAll('.nav-btn')[0]);
        alert("Deposit Berhasil!"); 
    } catch (e) {
        console.error("Gagal deposit:", e);
        alert(e.message);
    }
}

window.actionSubmitGlobalDeposit = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const md = document.getElementById('select-global-deposit-member').value;
    const amt = parseInt(document.getElementById('input-global-deposit-amount').value);
    
    if(!md || isNaN(amt) || amt <= 0) return alert("Input tidak valid!");
    const [id, n] = md.split('|'); 
    await performDepositLogic(id, n, amt, closeGlobalDepositModal);
};

window.actionSubmitDeposit = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const id = document.getElementById('profile-member-id').value;
    const n = document.getElementById('profile-name').innerText;
    const amt = parseInt(document.getElementById('input-deposit-amount').value);
    
    if(!id || isNaN(amt) || amt <= 0) return alert("Input nominal kok tidak valid!");
    await performDepositLogic(id, n, amt, closeMemberProfile);
};

// Transaksi Pemakaian (Usage)
window.openUsageModal = () => {
    const dateInput = document.getElementById('input-usage-date');
    if(dateInput) dateInput.valueAsDate = new Date();
    updateUsagePreview();
    document.getElementById('modal-usage').classList.remove('hidden');
};

window.closeUsageModal = () => {
    document.getElementById('modal-usage').classList.add('hidden');
    const checkboxes = document.querySelectorAll('input[name="usage-member"]');
    checkboxes.forEach(c => c.checked = false);
    updateUsagePreview();
    document.getElementById('input-usage-amount').value = "2";
    document.getElementById('input-usage-note').value = "";
};

window.actionSubmitUsage = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    
    const sel = Array.from(document.querySelectorAll('input[name="usage-member"]:checked'));
    const amt = parseInt(document.getElementById('input-usage-amount').value);
    const dv = document.getElementById('input-usage-date').value;
    
    if(!sel.length || isNaN(amt) || !dv) return alert("Pilih pemain dan lengkapi data!");
    try {
        const b = writeBatch(db); 
        const td = new Date(dv); td.setHours(12,0,0,0);
        
        sel.forEach(el => {
            const [id, n] = el.value.split('|');
            b.update(doc(db, "members", id), { shuttlecock_balance: increment(-amt) });
            b.set(doc(collection(db, "shuttlecock_history")), { 
                member_id: id, 
                member_name: n, 
                type: "USAGE", 
                amount: -amt, 
                note: document.getElementById('input-usage-note').value || "Bermain", 
                timestamp: td 
            });
        });
        
        await b.commit(); 
        sel.forEach(c => c.checked = false);
        closeUsageModal();
        showTab('tab-history', document.querySelectorAll('.nav-btn')[1]);
        alert("Data Pemakaian Tersimpan!"); 
    } catch (e) {
        console.error("Gagal catat pemakaian:", e);
        alert(e.message);
    }
};

// Manajemen KAS (BKU)
window.openKasModal = () => document.getElementById('modal-kas').classList.remove('hidden');
window.closeKasModal = () => {
    document.getElementById('modal-kas').classList.add('hidden');
    switchKasTab('INCOME');
    document.getElementById('input-income-amount').value = "";
    document.getElementById('input-income-note').value = "";
    document.getElementById('input-expense-amount').value = "";
    document.getElementById('input-expense-note').value = "";
};

window.switchKasTab = (type) => {
    const btnInc = document.getElementById('btn-kas-income');
    const btnExp = document.getElementById('btn-kas-expense');
    const formInc = document.getElementById('form-income');
    const formExp = document.getElementById('form-expense');
    if (!btnInc || !btnExp || !formInc || !formExp) return;
    if(type === 'INCOME') {
        btnInc.className = "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl bg-white shadow-sm text-blue-600 transition";
        btnExp.className = "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-slate-400 transition hover:text-slate-600";
        formInc.classList.remove('hidden');
        formExp.classList.add('hidden');
    } else {
        btnExp.className = "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl bg-white shadow-sm text-rose-600 transition";
        btnInc.className = "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-slate-400 transition hover:text-slate-600";
        formExp.classList.remove('hidden');
        formInc.classList.add('hidden');
    }
};

window.actionSubmitIncome = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const c = document.getElementById('input-income-category').value;
    const amt = parseInt(document.getElementById('input-income-amount').value);
    const n = document.getElementById('input-income-note').value;
    
    if (isNaN(amt) || amt <= 0) return alert("Nominal tidak valid!");
    if (!n || n.trim() === "") return alert("Keterangan wajib diisi untuk melacak asal uang!");
    
    try {
        const b = writeBatch(db);
        b.set(doc(collection(db, "bku_transactions")), {
            type: "DEBIT", category: c, amount: amt, note: n, timestamp: serverTimestamp()
        });
        b.update(doc(db, "metadata", "stats"), { 
            total_balance_bku: increment(amt), total_income_bku: increment(amt) 
        });
    
        await b.commit();
        closeKasModal();
        showTab('tab-bku', document.querySelectorAll('.nav-btn')[2]);
        alert("Pemasukan Kas Berhasil Dicatat!");
    } catch (e) { 
        console.error("Gagal mencatat pemasukan", e);
        alert(e.message); 
    }
};

window.actionSubmitExpense = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const c = document.getElementById('input-expense-category').value;
    const amt = parseInt(document.getElementById('input-expense-amount').value);
    const n = document.getElementById('input-expense-note').value;
    
    if(isNaN(amt) || amt <= 0) return alert("Cek nominal!");
    try {
        const b = writeBatch(db);
        b.set(doc(collection(db, "bku_transactions")), { 
            type: "CREDIT", category: c, amount: amt, note: n || "Operasional", timestamp: serverTimestamp() 
        });
        b.update(doc(db, "metadata", "stats"), { 
            total_balance_bku: increment(-amt), total_expense_bku: increment(amt) 
        });
    
        await b.commit(); 
        closeKasModal();
        showTab('tab-bku', document.querySelectorAll('.nav-btn')[2]);
        alert("Pengeluaran Berhasil!"); 
    } catch(e) { 
        console.error("Gagal input pengeluaran", e);
        alert(e.message); 
    }
};

// ==========================================
// 5. UPDATE & DELETE KOREKSI (DENGAN PATCH DESYNC)
// ==========================================

window.closeEditModal = () => document.getElementById('modal-edit').classList.add('hidden');

window.openEditTransaction = async (id, type) => {
    const col = type === 'HISTORY' ? 'shuttlecock_history' : 'bku_transactions';
    try {
        const s = await getDoc(doc(db, col, id)); 
        if(!s.exists()) return;
        
        const d = s.data();
        if (type === 'BKU' && d.linked_history_id) {
            alert("⚠️ PROTEKSI SISTEM: Akses Ditolak!\n\nIni adalah transaksi Deposit Kok. Untuk menghindari desync antara jumlah Kok dan nilai Kas (Rupiah), silakan Edit transaksi ini melalui Tab LOG KOK.");
            return;
        }
        document.getElementById('edit-target-id').value = id;
        document.getElementById('edit-target-type').value = type;
        document.getElementById('edit-val-amount').value = Math.abs(d.amount);
        document.getElementById('edit-val-note').value = d.note || (d.type === 'DEPOSIT' ? "Deposit " + d.member_name : "");
        const label = document.getElementById('edit-label-amount');
        const calcArea = document.getElementById('edit-calc-display');
        const contextBox = document.getElementById('edit-context-box');
        const contextText = document.getElementById('edit-context-text');
        
        if(type === 'HISTORY') {
            label.innerText = "Jumlah Kok Baru";
            calcArea.classList.remove('hidden');
            contextBox.classList.remove('hidden');
            contextText.innerText = `👤 Member: ${d.member_name}`;
            updateEditLiveNominal(Math.abs(d.amount));
        } else {
            label.innerText = "Nominal Rupiah Baru";
            calcArea.classList.add('hidden');
            contextBox.classList.remove('hidden');
            contextText.innerText = `📂 Transaksi Kas: ${d.category}`;
        }
        document.getElementById('edit-modal-title').innerText = "Koreksi " + (type==='HISTORY' ? 'Stok' : 'Kas');
        document.getElementById('modal-edit').classList.remove('hidden');
    } catch (e) {
        console.error("Gagal memuat data edisi:", e);
        alert(e.message);
    }
};

function updateEditLiveNominal(qty) {
    const val = parseInt(qty) || 0;
    document.getElementById('edit-live-nominal').innerText = "Rp " + (val * currentCockPrice).toLocaleString('id-ID');
}

const elEditValAmount = document.getElementById('edit-val-amount');
if(elEditValAmount) {
    elEditValAmount.oninput = (e) => {
        if(document.getElementById('edit-target-type').value === 'HISTORY') {
            updateEditLiveNominal(e.target.value);
        }
    };
}

// [MENTOR NOTE: PATCH DESYNC UPDATED]
window.processUpdateTransaction = async () => {
    if (!currentUser) return alert("Akses Ditolak!");
    const id = document.getElementById('edit-target-id').value;
    const type = document.getElementById('edit-target-type').value;
    const nA = parseInt(document.getElementById('edit-val-amount').value);
    const nN = document.getElementById('edit-val-note').value;
    
    if(isNaN(nA)) return;
    
    try {
        const col = type === 'HISTORY' ? 'shuttlecock_history' : 'bku_transactions';
        const s = await getDoc(doc(db, col, id)); 
        if(!s.exists()) return alert("Data sudah tidak ada!");
        const d = s.data();
        
        const b = writeBatch(db);
        
        if(type === 'HISTORY') {
            const actN = d.type === 'USAGE' ? -nA : nA;
            const delta = actN - d.amount;
            b.update(doc(db, "members", d.member_id), { shuttlecock_balance: increment(delta) });
            
            if(d.type === 'DEPOSIT') {
                if (d.linked_bku_id) {
                    // Ambil cost masa lalu dari BKU, lalu selisihkan dengan cost masa depan
                    const bkuSnap = await getDoc(doc(db, "bku_transactions", d.linked_bku_id));
                    if(bkuSnap.exists()) {
                        const oldCost = bkuSnap.data().amount; 
                        const newCost = nA * currentCockPrice; 
                        const deltaCost = newCost - oldCost; 
                        
                        b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(deltaCost), total_income_bku: increment(deltaCost) });
                        b.update(doc(db, "bku_transactions", d.linked_bku_id), { amount: newCost, note: nN });
                    }
                } else {
                    const mD = delta * currentCockPrice;
                    b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(mD), total_income_bku: increment(mD) });
                }
            }
            b.update(doc(db, col, id), { amount: actN, note: nN });
        } else {
            // Edit BKU Biasa (Non Deposit)
            const delta = nA - d.amount;
            if (d.type === 'DEBIT') {
                b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(delta), total_income_bku: increment(delta) });
            } else {
                b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(-delta), total_expense_bku: increment(delta) });
            }
            b.update(doc(db, col, id), { amount: nA, note: nN });
        }
        await b.commit();
        closeEditModal();
        alert("Update Berhasil secara menyeluruh!");
    } catch (e) { 
        console.error("Gagal update:", e);
        alert(e.message); 
    }
};

// [MENTOR NOTE: PATCH DESYNC DELETE]
window.adminDeleteShuttlecock = async (id, type) => {
    if (!currentUser) return alert("Akses Ditolak!");
    if(!confirm("Hapus? Saldo akan dibalikkan.")) return;
    
    try {
        const s = await getDoc(doc(db, "shuttlecock_history", id)); 
        if(!s.exists()) return;
        const d = s.data();
        const b = writeBatch(db);
        
        b.update(doc(db, "members", d.member_id), { shuttlecock_balance: increment(-d.amount) });
        
        if(type==='DEPOSIT') {
            if (d.linked_bku_id) {
                const bkuSnap = await getDoc(doc(db, "bku_transactions", d.linked_bku_id));
                if(bkuSnap.exists()) {
                    const exactReversalAmount = -bkuSnap.data().amount; 
                    b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(exactReversalAmount), total_income_bku: increment(exactReversalAmount) });
                    b.delete(doc(db, "bku_transactions", d.linked_bku_id));
                }
            } else {
                 const rev = -(d.amount * currentCockPrice);
                 b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(rev), total_income_bku: increment(rev) });
            }
        }
        b.delete(doc(db, "shuttlecock_history", id)); 
        await b.commit();
    } catch (e) { 
        console.error("Gagal delete:", e);
        alert(e.message); 
    }
};

window.adminDeleteBKU = async (id) => {
    if (!currentUser) return alert("Akses Ditolak!");
    
    try {
        const s = await getDoc(doc(db, "bku_transactions", id)); 
        if(!s.exists()) return;
        const d = s.data();
        
        if (d.linked_history_id) {
            alert("⚠️ PROTEKSI SISTEM: Akses Ditolak!\n\nIni adalah transaksi Deposit Kok. Silakan Hapus transaksi ini melalui Tab LOG KOK agar saldo Kok Member juga ikut disesuaikan secara otomatis.");
            return;
        }
        
        if(!confirm("Hapus kas? Saldo akan disesuaikan.")) return;
        
        const b = writeBatch(db);
        if (d.type === 'DEBIT') {
            b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(-d.amount), total_income_bku: increment(-d.amount) });
        } else {
            b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(d.amount), total_expense_bku: increment(-d.amount) });
        }
        b.delete(doc(db, "bku_transactions", id)); 
        await b.commit();
    } catch (e) { 
        console.error("Gagal hapus kas:", e);
        alert(e.message); 
    }
};