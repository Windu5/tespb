/*
=========================================================
PB. BATU BETULIS - CORE APPLICATION LOGIC
[MENTOR NOTE]
1. Semua fitur Pagination (Load More) terhubung penuh.
2. Fitur 'Tutup Buku' (Rollover) siap tereksekusi dengan Chunked Delete asinkron.
3. Donasi dari sisa uang deposit bekerja sebagai penambah saldo KAS otomatis.
=========================================================
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, getDoc, updateDoc, collection, query, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, increment, getDocs, startAfter, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Global UI State
let currentUser = null;
let allMembers = [];
let currentCockPrice = 3000;

// Pagination State
let historyData = [];
let bkuData = [];
let lastVisibleHistory = null;
let lastVisibleBKU = null;
const FETCH_LIMIT = 15;

// Profile State
let currentProfileMemberId = null;
let memberHistoryData = [];

// Trackers Visual Notifikasi (Lightweight Observers)
let currentTopHistoryId = null;
let currentTopBkuId = null;

// ==========================================
// 1. HELPER FUNCTIONS & FORMATTERS
// ==========================================

function formatRupiahInput(value) {
    if (!value) return '';
    let numberString = value.toString().replace(/[^,\d]/g, '');
    let split = numberString.split(',');
    let sisa = split[0].length % 3;
    let rupiah = split[0].substr(0, sisa);
    let ribuan = split[0].substr(sisa).match(/\d{3}/gi);
    if (ribuan) {
        let separator = sisa ? '.' : '';
        rupiah += separator + ribuan.join('.');
    }
    return split[1] != undefined ? rupiah + ',' + split[1] : rupiah;
}

function parseRupiahInt(value) {
    if (!value) return 0;
    return parseInt(value.toString().replace(/\./g, '')) || 0;
}

function processRealtimeDate(dateString) {
    if (!dateString) return serverTimestamp(); 
    const d = new Date(dateString);
    const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    return d;
}

function getMonthYearStr(dateString) {
    const d = dateString ? new Date(dateString) : new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${m}-${y}`; 
}

function bindDepositInputs(qtyId, nomId, kembalianId) {
    const elQty = document.getElementById(qtyId);
    const elNom = document.getElementById(nomId);
    const elKembalian = document.getElementById(kembalianId);
    if (!elQty || !elNom) return;

    elQty.addEventListener('input', (e) => {
        const q = parseInt(e.target.value) || 0;
        const totalCost = q * currentCockPrice;
        elNom.value = q > 0 ? formatRupiahInput(totalCost.toString()) : '';
        if (elKembalian) elKembalian.innerText = 'Rp 0';
    });

    elNom.addEventListener('input', (e) => {
        elNom.value = formatRupiahInput(e.target.value);
        const amt = parseRupiahInt(e.target.value);
        const calcQty = Math.floor(amt / currentCockPrice);
        elQty.value = calcQty > 0 ? calcQty : '';

        if (elKembalian) {
            const actualCost = calcQty * currentCockPrice;
            const kembalian = amt > actualCost ? amt - actualCost : 0;
            elKembalian.innerText = "Rp " + formatRupiahInput(kembalian.toString());
        }
    });
}

function setupRupiahFormatter() {
    const inputIds = ['input-income-amount', 'input-expense-amount', 'edit-val-amount', 'input-setting-price'];
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener('input', function() { this.value = formatRupiahInput(this.value); }); }
    });
}

window.appDialog = function(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-dialog');
        const box = document.getElementById('custom-dialog-box');
        const iconContainer = document.getElementById('dialog-icon-container');
        const icon = document.getElementById('dialog-icon');
        const title = document.getElementById('dialog-title');
        const message = document.getElementById('dialog-message');
        const inputContainer = document.getElementById('dialog-input-container');
        const input = document.getElementById('dialog-input');
        const btnCancel = document.getElementById('btn-dialog-cancel');
        const btnConfirm = document.getElementById('btn-dialog-confirm');

        if(!modal) return resolve(options.type === 'confirm' ? confirm(options.message) : (options.type === 'prompt' ? prompt(options.message) : alert(options.message)));

        inputContainer.classList.add('hidden');
        btnCancel.classList.add('hidden');
        input.value = options.inputValue || '';
        title.innerText = options.title || 'Informasi';
        message.innerText = options.message || '';

        let colorClass = 'bg-blue-100 text-blue-600';
        let svgPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />';
        btnConfirm.className = 'flex-1 py-3.5 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 transition bg-blue-600 shadow-blue-200';

        if (options.type === 'error') {
            colorClass = 'bg-rose-100 text-rose-600';
            btnConfirm.classList.replace('bg-blue-600', 'bg-rose-600');
            btnConfirm.classList.replace('shadow-blue-200', 'shadow-rose-200');
            svgPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />';
        } else if (options.type === 'success') {
            colorClass = 'bg-emerald-100 text-emerald-600';
            btnConfirm.classList.replace('bg-blue-600', 'bg-emerald-600');
            btnConfirm.classList.replace('shadow-blue-200', 'shadow-emerald-200');
            svgPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />';
        } else if (options.type === 'warning' || options.type === 'confirm') {
            colorClass = 'bg-amber-100 text-amber-600';
            btnConfirm.classList.replace('bg-blue-600', 'bg-amber-500');
            btnConfirm.classList.replace('shadow-blue-200', 'shadow-amber-200');
            svgPath = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />';
            if (options.type === 'confirm') btnCancel.classList.remove('hidden');
        }

        if (options.type === 'prompt') {
            inputContainer.classList.remove('hidden');
            btnCancel.classList.remove('hidden');
            setTimeout(() => input.focus(), 300);
        }

        iconContainer.className = `mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${colorClass}`;
        icon.innerHTML = svgPath;

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.replace('opacity-0', 'opacity-100');
            box.classList.replace('scale-95', 'scale-100');
        }, 10);

        const close = (result) => {
            modal.classList.replace('opacity-100', 'opacity-0');
            box.classList.replace('scale-100', 'scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                resolve(result);
            }, 300);
        };

        btnConfirm.onclick = () => close(options.type === 'prompt' ? input.value : true);
        btnCancel.onclick = () => close(options.type === 'prompt' ? null : false);
    });
};

// ==========================================
// 2. UI GLOBAL NAVIGATION
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
            appDialog({title: 'Berhasil', message: 'Anda telah masuk ke sistem.', type: 'success'});
        } catch (err) {
            appDialog({title: 'Akses Ditolak', message: 'Sandi atau Email salah!', type: 'error'});
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
    if(menu.classList.contains('hidden')) {
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

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    document.body.classList.toggle('is-admin', !!user);
    const loginBtn = document.getElementById('btn-login-trigger');
    const logoutBtn = document.getElementById('btn-logout');
    if (user) { 
        if(loginBtn) loginBtn.classList.add('hidden'); 
        if(logoutBtn) logoutBtn.classList.remove('hidden'); 
        renderHistoryList(); 
        renderBKUList();
    } else { 
        if(loginBtn) loginBtn.classList.remove('hidden'); 
        if(logoutBtn) logoutBtn.classList.add('hidden'); 
        if(document.getElementById('tab-settings')?.classList.contains('active')) {
            showTab('tab-members', document.querySelector('.nav-btn'));
        }
        renderHistoryList(); 
        renderBKUList();
    }
});

// ==========================================
// 3. FETCH & PAGINATION CORE LOGIC
// ==========================================

// --- FETCH HISTORY ---
window.fetchHistory = async (isLoadMore = false) => {
    const btnLoad = document.getElementById('btn-load-history');
    
    // [MENTOR PATCH] Reset visual indicators saat pengguna merefresh
    document.getElementById('badge-new-history')?.classList.add('hidden');
    document.getElementById('nav-dot-history')?.classList.add('hidden');

    if (!isLoadMore) {
        lastVisibleHistory = null;
        historyData = []; 
    }
    
    try {
        let q;
        const historyCol = collection(db, "shuttlecock_history");
        if (lastVisibleHistory) {
            q = query(historyCol, orderBy("timestamp", "desc"), startAfter(lastVisibleHistory), limit(FETCH_LIMIT));
        } else {
            q = query(historyCol, orderBy("timestamp", "desc"), limit(FETCH_LIMIT));
        }

        const snap = await getDocs(q);
        
        if (!snap.empty) {
            // Update Tracker agar tidak looping animasi
            if (!isLoadMore) currentTopHistoryId = snap.docs[0].id;
            
            lastVisibleHistory = snap.docs[snap.docs.length - 1];
            const newDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            historyData = [...historyData, ...newDocs];
            
            if (snap.docs.length < FETCH_LIMIT) {
                if(btnLoad) btnLoad.classList.add('hidden');
            } else {
                if(btnLoad) btnLoad.classList.remove('hidden');
            }
        } else {
            if(btnLoad) btnLoad.classList.add('hidden');
        }
        
        renderHistoryList();
    } catch (e) { console.error("Gagal load history:", e); }
};
window.loadMoreHistory = () => fetchHistory(true);

function renderHistoryList() {
    const list = document.getElementById('list-history');
    if(!list) return;
    
    if(historyData.length === 0) {
        list.innerHTML = '<p class="text-center text-xs text-slate-400 mt-4 italic">Belum ada aktivitas kok.</p>';
        return;
    }
    
    list.innerHTML = historyData.map(d => {
        const isU = d.type === 'USAGE';
        let ds = '-'; let ts = '-';
        if (d.timestamp) {
            const dateObj = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
            ds = dateObj.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
            ts = dateObj.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
        }
        const nom = Math.abs(d.amount) * currentCockPrice;

        return `<div class="bg-white p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-slate-50 group transition active:bg-slate-50">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[10px] ${isU ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}">${ds}</div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-sm text-slate-800 tracking-tight truncate">${(d.member_name || '').toUpperCase()}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 truncate">${ts} • ${d.note || 'Transaksi'}</p>
            </div>
            <div class="text-right flex flex-col items-end gap-0.5 shrink-0">
                <p class="font-black text-sm ${isU ? 'text-rose-600' : 'text-emerald-600'}">${d.amount > 0 ? '+'+d.amount : d.amount} Kok</p>
                <p class="text-[10px] font-mono font-bold ${isU ? 'text-rose-400' : 'text-emerald-400'}">Rp ${formatRupiahInput(nom.toString())}</p>
            </div>
        </div>`;
    }).join('');
}

// --- FETCH BKU ---
window.fetchBKU = async (isLoadMore = false) => {
    const btnLoad = document.getElementById('btn-load-bku');

    // [MENTOR PATCH] Reset visual indicators saat fetch
    document.getElementById('badge-new-bku')?.classList.add('hidden');
    document.getElementById('nav-dot-bku')?.classList.add('hidden');

    if (!isLoadMore) {
        lastVisibleBKU = null;
        bkuData = []; 
    }
    
    try {
        let q;
        const bkuCol = collection(db, "bku_transactions");
        if (lastVisibleBKU) {
            q = query(bkuCol, orderBy("timestamp", "desc"), startAfter(lastVisibleBKU), limit(FETCH_LIMIT));
        } else {
            q = query(bkuCol, orderBy("timestamp", "desc"), limit(FETCH_LIMIT));
        }

        const snap = await getDocs(q);
        
        if (!snap.empty) {
            // Update Tracker agar tidak looping animasi
            if (!isLoadMore) currentTopBkuId = snap.docs[0].id;

            lastVisibleBKU = snap.docs[snap.docs.length - 1];
            const newDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            bkuData = [...bkuData, ...newDocs];
            
            if (snap.docs.length < FETCH_LIMIT) {
                if(btnLoad) btnLoad.classList.add('hidden');
            } else {
                if(btnLoad) btnLoad.classList.remove('hidden');
            }
        } else {
            if(btnLoad) btnLoad.classList.add('hidden');
        }
        
        renderBKUList();
    } catch (e) { console.error("Gagal load BKU:", e); }
};
window.loadMoreBKU = () => fetchBKU(true);

function renderBKUList() {
    const list = document.getElementById('list-bku');
    if(!list) return;

    if(bkuData.length === 0) {
        list.innerHTML = '<p class="text-center text-xs text-slate-400 mt-4 italic">Belum ada transaksi BKU.</p>';
        return;
    }

    list.innerHTML = bkuData.map(d => {
        const isD = d.type === 'DEBIT';
        let dateStr = '';
        if (d.timestamp) {
            const dateObj = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
            dateStr = dateObj.toLocaleDateString('id-ID');
        }
        
        const adminBtns = currentUser ? `
            <div class="admin-only flex gap-1">
                ${d.linked_history_id ? 
                    `<span class="p-1 text-slate-300" title="Dikunci: Edit transaksi ini melalui Tab LOG KOK"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></span>` 
                    : 
                    `<button onclick="openEditTransaction('${d.id}', 'BKU')" class="p-1 text-slate-300 hover:text-emerald-500 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                    <button onclick="adminDeleteBKU('${d.id}')" class="p-1 text-slate-300 hover:text-rose-400 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>`
                }
            </div>
        ` : '';

        return `<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 flex items-center gap-4">
            <div class="p-2 rounded-xl ${isD ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">${isD ? '+' : '-'}</div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[9px] font-black uppercase text-slate-400 tracking-wider truncate mr-2">${d.category}</span>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-[9px] text-slate-300 font-bold">${dateStr}</span>
                        ${adminBtns}
                    </div>
                </div>
                <div class="flex justify-between items-end gap-3 mt-1">
                    <p class="text-xs font-semibold text-slate-700 italic flex-1 break-words">"${d.note}"</p>
                    <div class="text-right shrink-0">
                        <p class="font-black text-sm ${isD ? 'text-emerald-600' : 'text-rose-600'}">${isD ? '' : '-'}${formatRupiahInput(d.amount.toString())}</p>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}


// --- REALTIME OBSERVERS UNTUK MEMBERS & STATS SAJA ---
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
                    <span class="text-[11px] font-mono font-bold ${isN ? 'text-rose-400' : 'text-slate-400'}">Rp ${formatRupiahInput((m.shuttlecock_balance * currentCockPrice).toString())}</span>
                </div>
            </div>`;
        }).join('');
    }
    const tekorEl = document.getElementById('display-total-tekor-nominal');
    if(tekorEl) tekorEl.innerText = "Rp " + formatRupiahInput((totalT * currentCockPrice).toString());
    renderAdminUI();
});

onSnapshot(doc(db, "metadata", "stats"), (ds) => {
    if(ds.exists()) {
        const data = ds.data();
        currentCockPrice = data.shuttlecock_price || 3000;
        const cockPriceEl = document.getElementById('display-cock-price');
        if(cockPriceEl) cockPriceEl.innerText = "@" + formatRupiahInput(currentCockPrice.toString()) + " / KOK";
        
        const setPriceInput = document.getElementById('input-setting-price');
        if(setPriceInput && setPriceInput.value === "") setPriceInput.value = formatRupiahInput(currentCockPrice.toString());
        
        const bkuTotalEl = document.getElementById('display-bku-total');
        if(bkuTotalEl) bkuTotalEl.innerText = "Rp " + formatRupiahInput((data.total_balance_bku || 0).toString()); 
        
        const bkuIncomeEl = document.getElementById('display-bku-income');
        if(bkuIncomeEl) bkuIncomeEl.innerText = "Rp " + formatRupiahInput((data.total_income_bku || 0).toString());
        
        const bkuExpenseEl = document.getElementById('display-bku-expense');
        if(bkuExpenseEl) bkuExpenseEl.innerText = "Rp " + formatRupiahInput((data.total_expense_bku || 0).toString());
    }
});

// [MENTOR PATCH] LIGHTWEIGHT OBSERVERS - Indicator-Driven Refresh (The Spy)
onSnapshot(query(collection(db, "shuttlecock_history"), orderBy("timestamp", "desc"), limit(1)), (snap) => {
    if (!snap.empty) {
        const latestId = snap.docs[0].id;
        if (currentTopHistoryId !== null && latestId !== currentTopHistoryId) {
            document.getElementById('badge-new-history')?.classList.remove('hidden');
            document.getElementById('nav-dot-history')?.classList.remove('hidden');
        } else if (currentTopHistoryId === null) {
            currentTopHistoryId = latestId; // Setup tracker di tarikan pertama
        }
    }
});

onSnapshot(query(collection(db, "bku_transactions"), orderBy("timestamp", "desc"), limit(1)), (snap) => {
    if (!snap.empty) {
        const latestId = snap.docs[0].id;
        if (currentTopBkuId !== null && latestId !== currentTopBkuId) {
            document.getElementById('badge-new-bku')?.classList.remove('hidden');
            document.getElementById('nav-dot-bku')?.classList.remove('hidden');
        } else if (currentTopBkuId === null) {
            currentTopBkuId = latestId; // Setup tracker di tarikan pertama
        }
    }
});


// ==========================================
// 4. ACTION FUNCTIONS (CRUD ADMIN)
// ==========================================

window.actionSaveSettings = async () => {
    if (!currentUser) return appDialog({title: 'Ditolak', message: 'Hanya Admin.', type: 'error'});
    const newPrice = parseRupiahInt(document.getElementById('input-setting-price').value);
    if(isNaN(newPrice) || newPrice <= 0) return appDialog({title: 'Peringatan', message: 'Harga tidak valid!', type: 'warning'});
    try {
        await updateDoc(doc(db, "metadata", "stats"), { shuttlecock_price: newPrice });
        appDialog({title: 'Sukses', message: 'Harga kok diperbarui!', type: 'success'});
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
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

// [A] Modals Anggota
window.openAddMemberModal = () => document.getElementById('modal-add-member').classList.remove('hidden');
window.closeAddMemberModal = () => {
    document.getElementById('modal-add-member').classList.add('hidden');
    document.getElementById('input-new-member').value = "";
};

window.actionAddMember = async () => {
    if (!currentUser) return;
    const i = document.getElementById('input-new-member'); 
    if(!i.value) return;
    try {
        await setDoc(doc(db, "members", Date.now().toString()), { name: i.value.toUpperCase(), shuttlecock_balance: 0, created_at: serverTimestamp() });
        closeAddMemberModal();
        showTab('tab-members', document.querySelectorAll('.nav-btn')[0]);
        appDialog({title: 'Sukses', message: 'Anggota Ditambahkan!', type: 'success'});
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

window.openMemberProfile = (id) => {
    if (!currentUser) return;
    const m = allMembers.find(x => x.id === id);
    if (!m) return;
    currentProfileMemberId = id;
    document.getElementById('profile-member-id').value = m.id;
    document.getElementById('profile-name').innerText = m.name;
    document.getElementById('profile-balance').innerText = `${m.shuttlecock_balance} Kok`;
    
    // Reset State Toggle Form Deposit agar selalu tertutup saat profil dibuka
    const formDep = document.getElementById('profile-deposit-form');
    const iconPlus = document.getElementById('icon-plus');
    const iconMinus = document.getElementById('icon-minus');
    
    if (formDep) formDep.classList.add('hidden');
    if (iconPlus) iconPlus.classList.remove('hidden');
    if (iconMinus) iconMinus.classList.add('hidden');
    
    document.getElementById('input-deposit-qty').value = "";
    document.getElementById('input-deposit-nominal').value = "";
    document.getElementById('deposit-kembalian').innerText = "Rp 0";
    
    const chk = document.getElementById('check-donate-deposit');
    if(chk) chk.checked = false;
    
    // Panggil riwayat khusus anggota ini
    fetchMemberHistory(id);
    
    document.getElementById('modal-member-profile').classList.remove('hidden');
};
window.closeMemberProfile = () => {
    currentProfileMemberId = null;
    document.getElementById('modal-member-profile').classList.add('hidden');
};

// Fungsi Baru untuk Toggle Form Deposit
window.toggleProfileDepositForm = () => {
    if (!currentUser) return; // Proteksi lapis dua khusus Admin
    const formDep = document.getElementById('profile-deposit-form');
    const iconPlus = document.getElementById('icon-plus');
    const iconMinus = document.getElementById('icon-minus');
    
    if (formDep) {
        const isHidden = formDep.classList.toggle('hidden');
        if (iconPlus) iconPlus.classList.toggle('hidden', !isHidden);
        if (iconMinus) iconMinus.classList.toggle('hidden', isHidden);
    }
};

window.fetchMemberHistory = async (id) => {
    const list = document.getElementById('profile-history-list');
    if(!list) return;
    list.innerHTML = '<p class="text-center text-[10px] text-slate-400 mt-4 animate-pulse">Memuat riwayat...</p>';
    
    try {
        const q = query(
            collection(db, "shuttlecock_history"), 
            where("member_id", "==", id), 
            orderBy("timestamp", "desc"), 
            limit(10)
        );
        const snap = await getDocs(q);
        memberHistoryData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMemberHistoryList();
    } catch (e) {
        console.error("Butuh Index Firestore:", e);
        list.innerHTML = `<p class="text-center text-[10px] text-rose-500 mt-4 font-bold">⚠️ Gagal Memuat Riwayat</p><p class="text-center text-[9px] text-slate-500 mt-1">Cek Inspect > Console Browser. Klik link biru/merah dari Firebase untuk membuat Index.</p>`;
    }
};

function renderMemberHistoryList() {
    const list = document.getElementById('profile-history-list');
    if(memberHistoryData.length === 0) {
        list.innerHTML = '<p class="text-center text-[10px] text-slate-400 mt-4 italic">Belum ada riwayat tercatat.</p>';
        return;
    }
    
    list.innerHTML = memberHistoryData.map(d => {
        const isU = d.type === 'USAGE';
        let ds = '-';
        if (d.timestamp) {
            const dateObj = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
            ds = dateObj.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
        }
        
        // Tombol Edit/Hapus sekarang murni di dalam sini
        const adminBtns = currentUser ? `
            <div class="admin-only flex gap-1 mt-1 justify-end">
                <button onclick="openEditTransaction('${d.id}', 'HISTORY')" class="p-1.5 bg-slate-100 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onclick="adminDeleteShuttlecock('${d.id}', '${d.type}')" class="p-1.5 bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        ` : '';

        return `<div class="bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${isU ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}">${d.type}</span>
                    <span class="text-[9px] font-bold text-slate-400">${ds}</span>
                </div>
                <p class="text-[10px] font-semibold text-slate-700 mt-1 truncate">${d.note || '-'}</p>
            </div>
            <div class="text-right shrink-0">
                <p class="font-black text-xs ${isU ? 'text-rose-600' : 'text-emerald-600'}">${d.amount > 0 ? '+'+d.amount : d.amount} Kok</p>
                ${adminBtns}
            </div>
        </div>`;
    }).join('');
}

window.triggerEditName = () => {
    const id = document.getElementById('profile-member-id').value;
    const oldName = document.getElementById('profile-name').innerText;
    adminEditMemberName(id, oldName);
};

window.adminEditMemberName = async (id, old) => {
    if (!currentUser) return;
    const n = await appDialog({title: 'Ubah Nama', message: 'Masukkan nama anggota baru:', type: 'prompt', inputValue: old});
    if(n && n !== old) {
        try {
            await updateDoc(doc(db, "members", id), { name: n.toUpperCase() });
            document.getElementById('profile-name').innerText = n.toUpperCase();
            appDialog({title: 'Berhasil', message: 'Nama anggota diperbarui.', type: 'success'});
            fetchHistory(false);
        } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
    }
};

// [B] Transaksi Deposit
window.openGlobalDepositModal = () => document.getElementById('modal-global-deposit').classList.remove('hidden');
window.closeGlobalDepositModal = () => {
    document.getElementById('modal-global-deposit').classList.add('hidden');
    document.getElementById('input-global-deposit-qty').value = "";
    document.getElementById('input-global-deposit-nominal').value = "";
    document.getElementById('global-deposit-kembalian').innerText = "Rp 0";
    document.getElementById('select-global-deposit-member').value = "";
    
    const chk = document.getElementById('check-donate-global-deposit');
    if(chk) chk.checked = false;
};

async function performDepositLogic(id, n, qty, nominalFisik, isDonasi, modalCloseFn) {
    const cost = qty * currentCockPrice; 
    const kembalian = nominalFisik - cost;
    const actualDonasi = (isDonasi && kembalian > 0) ? kembalian : 0;
    const MY = getMonthYearStr(null);

    try {
        const b = writeBatch(db);
        const historyRef = doc(collection(db, "shuttlecock_history"));
        const bkuRef = doc(collection(db, "bku_transactions"));
        
        b.update(doc(db, "members", id), { shuttlecock_balance: increment(qty) });
        b.set(historyRef, { member_id: id, member_name: n, type: "DEPOSIT", amount: qty, note: "Deposit " + n, linked_bku_id: bkuRef.id, month_year: MY, timestamp: serverTimestamp() });
        b.set(bkuRef, { type: "DEBIT", category: "DEPOSIT KOK", amount: cost, note: "Deposit " + n, linked_history_id: historyRef.id, month_year: MY, timestamp: serverTimestamp() });
        
        let totalIncomeAccumulated = cost;

        if (actualDonasi > 0) {
            const donasiRef = doc(collection(db, "bku_transactions"));
            b.set(donasiRef, { type: "DEBIT", category: "DONASI / SUMBANGAN", amount: actualDonasi, note: "Sisa kembalian deposit " + n, month_year: MY, timestamp: serverTimestamp() });
            totalIncomeAccumulated += actualDonasi;
        }

        b.update(doc(db, "metadata", "stats"), { 
            total_balance_bku: increment(totalIncomeAccumulated), 
            total_income_bku: increment(totalIncomeAccumulated) 
        });
    
        await b.commit(); 
        modalCloseFn();
        showTab('tab-members', document.querySelectorAll('.nav-btn')[0]);
        
        fetchHistory(false); 
        fetchBKU(false);

        let msg = `Deposit ${qty} Kok tercatat!`;
        if (actualDonasi > 0) msg += `\nSisa Rp ${formatRupiahInput(actualDonasi.toString())} masuk sbg Donasi.`;
        appDialog({title: 'Berhasil', message: msg, type: 'success'}); 
        
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
}

window.actionSubmitGlobalDeposit = async () => {
    if (!currentUser) return;
    const md = document.getElementById('select-global-deposit-member').value;
    const qty = parseInt(document.getElementById('input-global-deposit-qty').value);
    const nominalFisik = parseRupiahInt(document.getElementById('input-global-deposit-nominal').value) || 0;
    const isDonasi = document.getElementById('check-donate-global-deposit').checked;
    
    if(!md || isNaN(qty) || qty <= 0) return appDialog({title: 'Peringatan', message: 'Input jumlah kok tidak valid!', type: 'warning'});
    const [id, n] = md.split('|'); 
    await performDepositLogic(id, n, qty, nominalFisik, isDonasi, closeGlobalDepositModal);
};

window.actionSubmitDeposit = async () => {
    if (!currentUser) return;
    const id = document.getElementById('profile-member-id').value;
    const n = document.getElementById('profile-name').innerText;
    const qty = parseInt(document.getElementById('input-deposit-qty').value);
    const nominalFisik = parseRupiahInt(document.getElementById('input-deposit-nominal').value) || 0;
    const isDonasi = document.getElementById('check-donate-deposit').checked;
    
    if(!id || isNaN(qty) || qty <= 0) return appDialog({title: 'Peringatan', message: 'Input jumlah kok tidak valid!', type: 'warning'});
    await performDepositLogic(id, n, qty, nominalFisik, isDonasi, closeMemberProfile);
};

// [C] Transaksi Pemakaian (Usage)
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
    if (!currentUser) return;
    const sel = Array.from(document.querySelectorAll('input[name="usage-member"]:checked'));
    const amt = parseInt(document.getElementById('input-usage-amount').value);
    const dv = document.getElementById('input-usage-date').value;
    
    if(!sel.length || isNaN(amt) || !dv) return appDialog({title: 'Peringatan', message: 'Pilih pemain & tanggal!', type: 'warning'});
    try {
        const b = writeBatch(db); 
        const td = processRealtimeDate(dv); 
        const MY = getMonthYearStr(dv); 
        
        sel.forEach(el => {
            const [id, n] = el.value.split('|');
            b.update(doc(db, "members", id), { shuttlecock_balance: increment(-amt) });
            b.set(doc(collection(db, "shuttlecock_history")), { 
                member_id: id, member_name: n, type: "USAGE", amount: -amt, note: document.getElementById('input-usage-note').value || "Bermain", month_year: MY, timestamp: td 
            });
        });
        
        await b.commit(); 
        closeUsageModal();
        showTab('tab-history', document.querySelectorAll('.nav-btn')[1]);
        
        fetchHistory(false); 

        appDialog({title: 'Berhasil', message: 'Data Pemakaian Tersimpan!', type: 'success'}); 
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

// [D] Manajemen KAS (BKU)
window.openKasModal = () => {
    document.getElementById('input-income-date').valueAsDate = new Date();
    document.getElementById('input-expense-date').valueAsDate = new Date();
    document.getElementById('modal-kas').classList.remove('hidden');
}
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
    if (!currentUser) return;
    const dStr = document.getElementById('input-income-date').value;
    const c = document.getElementById('input-income-category').value;
    const amt = parseRupiahInt(document.getElementById('input-income-amount').value);
    const n = document.getElementById('input-income-note').value;
    
    if(!dStr) return appDialog({title: 'Peringatan', message: 'Tanggal Wajib Diisi!', type: 'warning'});
    if(isNaN(amt) || amt <= 0) return appDialog({title: 'Peringatan', message: 'Nominal tidak valid!', type: 'warning'});
    if(!n || n.trim() === "") return appDialog({title: 'Peringatan', message: 'Keterangan wajib diisi!', type: 'warning'});
    
    try {
        const b = writeBatch(db);
        const MY = getMonthYearStr(dStr);
        b.set(doc(collection(db, "bku_transactions")), {
            type: "DEBIT", category: c, amount: amt, note: n, month_year: MY, timestamp: processRealtimeDate(dStr)
        });
        b.update(doc(db, "metadata", "stats"), { 
            total_balance_bku: increment(amt), total_income_bku: increment(amt) 
        });
    
        await b.commit();
        closeKasModal();
        showTab('tab-bku', document.querySelectorAll('.nav-btn')[2]);
        fetchBKU(false); 
        appDialog({title: 'Berhasil', message: 'Pemasukan Kas Dicatat!', type: 'success'});
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

window.actionSubmitExpense = async () => {
    if (!currentUser) return;
    const dStr = document.getElementById('input-expense-date').value;
    const c = document.getElementById('input-expense-category').value;
    const amt = parseRupiahInt(document.getElementById('input-expense-amount').value);
    const n = document.getElementById('input-expense-note').value;
    
    if(!dStr) return appDialog({title: 'Peringatan', message: 'Tanggal Wajib Diisi!', type: 'warning'});
    if(isNaN(amt) || amt <= 0) return appDialog({title: 'Peringatan', message: 'Cek nominal uang!', type: 'warning'});
    
    try {
        const b = writeBatch(db);
        const MY = getMonthYearStr(dStr);
        b.set(doc(collection(db, "bku_transactions")), { 
            type: "CREDIT", category: c, amount: amt, note: n || "Operasional", month_year: MY, timestamp: processRealtimeDate(dStr) 
        });
        b.update(doc(db, "metadata", "stats"), { 
            total_balance_bku: increment(-amt), total_expense_bku: increment(amt) 
        });
    
        await b.commit(); 
        closeKasModal();
        showTab('tab-bku', document.querySelectorAll('.nav-btn')[2]);
        fetchBKU(false); 
        appDialog({title: 'Berhasil', message: 'Pengeluaran Berhasil!', type: 'success'}); 
    } catch(e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

// [E] UPDATE & DELETE TRANSAKSI
window.closeEditModal = () => document.getElementById('modal-edit').classList.add('hidden');
window.openEditTransaction = async (id, type) => {
    const col = type === 'HISTORY' ? 'shuttlecock_history' : 'bku_transactions';
    try {
        const s = await getDoc(doc(db, col, id)); 
        if(!s.exists()) return;
        const d = s.data();
        if (type === 'BKU' && d.linked_history_id) {
            appDialog({title: '⚠️ Proteksi Sistem', message: 'Ini transaksi Deposit Kok. Edit melalui Tab LOG KOK.', type: 'error'});
            return;
        }
        document.getElementById('edit-target-id').value = id;
        document.getElementById('edit-target-type').value = type;
        document.getElementById('edit-val-note').value = d.note || (d.type === 'DEPOSIT' ? "Deposit " + d.member_name : "");
        
        const label = document.getElementById('edit-label-amount');
        const calcArea = document.getElementById('edit-calc-display');
        const contextBox = document.getElementById('edit-context-box');
        const contextText = document.getElementById('edit-context-text');
        
        if(type === 'HISTORY') {
            document.getElementById('edit-val-amount').value = Math.abs(d.amount); 
            label.innerText = "Jumlah Kok Baru";
            calcArea.classList.remove('hidden');
            contextBox.classList.remove('hidden');
            contextText.innerText = `👤 Member: ${d.member_name}`;
            document.getElementById('edit-live-nominal').innerText = "Rp " + formatRupiahInput((Math.abs(d.amount) * currentCockPrice).toString());
        } else {
            document.getElementById('edit-val-amount').value = formatRupiahInput(Math.abs(d.amount).toString());
            label.innerText = "Nominal Rupiah Baru";
            calcArea.classList.add('hidden');
            contextBox.classList.remove('hidden');
            contextText.innerText = `📂 Transaksi Kas: ${d.category}`;
        }
        document.getElementById('modal-edit').classList.remove('hidden');
    } catch (e) { alert(e.message); }
};

const elEditValAmount = document.getElementById('edit-val-amount');
if(elEditValAmount) {
    elEditValAmount.oninput = (e) => {
        const type = document.getElementById('edit-target-type').value;
        if(type === 'HISTORY') {
            const qty = parseRupiahInt(e.target.value);
            document.getElementById('edit-live-nominal').innerText = "Rp " + formatRupiahInput((qty * currentCockPrice).toString());
        } else {
            e.target.value = formatRupiahInput(e.target.value);
        }
    };
}

window.processUpdateTransaction = async () => {
    if (!currentUser) return;
    const id = document.getElementById('edit-target-id').value;
    const type = document.getElementById('edit-target-type').value;
    const nA = parseRupiahInt(document.getElementById('edit-val-amount').value);
    const nN = document.getElementById('edit-val-note').value;
    
    if(isNaN(nA)) return;
    try {
        const col = type === 'HISTORY' ? 'shuttlecock_history' : 'bku_transactions';
        const s = await getDoc(doc(db, col, id)); 
        if(!s.exists()) return;
        const d = s.data();
        const b = writeBatch(db);
        
        if(type === 'HISTORY') {
            const actN = d.type === 'USAGE' ? -nA : nA;
            const delta = actN - d.amount;
            b.update(doc(db, "members", d.member_id), { shuttlecock_balance: increment(delta) });
            
            if(d.type === 'DEPOSIT') {
                if (d.linked_bku_id) {
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
        
        if(type === 'HISTORY') {
            fetchHistory(false);
            if(currentProfileMemberId) fetchMemberHistory(currentProfileMemberId);
        }
        else fetchBKU(false);

        appDialog({title: 'Berhasil', message: 'Koreksi berhasil!', type: 'success'});
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

window.adminDeleteShuttlecock = async (id, type) => {
    if (!currentUser) return;
    const confirmed = await appDialog({title: 'Konfirmasi Hapus', message: 'Hapus data log ini?', type: 'confirm'});
    if(!confirmed) return;
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
        fetchHistory(false); 
        if(currentProfileMemberId) fetchMemberHistory(currentProfileMemberId);
        appDialog({title: 'Terhapus', message: 'Log berhasil dihapus!', type: 'success'});
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

window.adminDeleteBKU = async (id) => {
    if (!currentUser) return;
    try {
        const s = await getDoc(doc(db, "bku_transactions", id)); 
        if(!s.exists()) return;
        const d = s.data();
        if (d.linked_history_id) {
            appDialog({title: '⚠️ Proteksi', message: 'Hapus deposit ini melalui Tab LOG KOK.', type: 'error'});
            return;
        }
        const confirmed = await appDialog({title: 'Konfirmasi Hapus', message: 'Hapus data kas ini?', type: 'confirm'});
        if(!confirmed) return;
        const b = writeBatch(db);
        if (d.type === 'DEBIT') {
            b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(-d.amount), total_income_bku: increment(-d.amount) });
        } else {
            b.update(doc(db, "metadata", "stats"), { total_balance_bku: increment(d.amount), total_expense_bku: increment(-d.amount) });
        }
        b.delete(doc(db, "bku_transactions", id)); 
        await b.commit();
        fetchBKU(false); 
        appDialog({title: 'Terhapus', message: 'Data kas berhasil dihapus!', type: 'success'});
    } catch (e) { appDialog({title: 'Error', message: e.message, type: 'error'}); }
};

// [MAINTENANCE] FITUR SINKRONISASI KAS (AUTO-RECALCULATE)
window.actionSinkronKas = async () => {
    if (!currentUser) return;
    
    const keyword = "SINKRON BKU";
    const konfirmasi = await appDialog({
        title: 'SINKRONISASI ULANG', 
        message: `Sistem akan membaca SELURUH riwayat kas dan mencetak ulang saldo total di Dashboard agar sesuai dengan realita data.\n\nKetik persis: "${keyword}"`, 
        type: 'prompt'
    });

    if (konfirmasi !== keyword) {
        if (konfirmasi !== null) appDialog({title: 'Dibatalkan', message: 'Kata kunci salah.', type: 'error'});
        return;
    }

    const loadingUI = document.getElementById('loading-overlay');
    const loadingTitle = document.getElementById('loading-title');
    if(loadingTitle) loadingTitle.innerText = "MENGHITUNG ULANG KAS...";
    if(loadingUI) loadingUI.classList.remove('hidden');

    try {
        // [MENTOR NOTE] Baca paksa seluruh data (Get Docs One-Time) tanpa limit.
        const bkuSnap = await getDocs(collection(db, "bku_transactions"));
        
        let totalIncome = 0;
        let totalExpense = 0;

        bkuSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.type === 'DEBIT') totalIncome += data.amount;
            else if (data.type === 'CREDIT') totalExpense += data.amount;
        });

        const totalBalance = totalIncome - totalExpense;

        // Tembakkan pembaruan absolut secara atomik
        await updateDoc(doc(db, "metadata", "stats"), {
            total_income_bku: totalIncome,
            total_expense_bku: totalExpense,
            total_balance_bku: totalBalance
        });

        if(loadingUI) loadingUI.classList.add('hidden');
        appDialog({title: 'Sinkronisasi Berhasil', message: `Data tersinkron:\nPemasukan: Rp ${formatRupiahInput(totalIncome.toString())}\nPengeluaran: Rp ${formatRupiahInput(totalExpense.toString())}\nSaldo Akhir: Rp ${formatRupiahInput(totalBalance.toString())}`, type: 'success'});
        
    } catch (e) {
        if(loadingUI) loadingUI.classList.add('hidden');
        console.error(e);
        appDialog({title: 'FATAL ERROR', message: 'Gagal sinkronisasi data: ' + e.message, type: 'error'});
    }
};

// [F] FITUR TUTUP BUKU (ROLLOVER SYSTEM) - HIGH RISK
window.actionTutupBuku = async () => {
    if (!currentUser) return;
    
    const year = new Date().getFullYear();
    const keyword = `TUTUP BUKU ${year}`;
    
    const konfirmasi = await appDialog({
        title: 'PERINGATAN FATAL!', 
        message: `Tindakan ini tidak bisa dibatalkan! Semua log transaksi akan musnah dan diringkas jadi Saldo Awal.\n\nKetik persis: "${keyword}"`, 
        type: 'prompt'
    });

    if (konfirmasi !== keyword) {
        if (konfirmasi !== null) appDialog({title: 'Dibatalkan', message: 'Kata kunci salah. Keamanan sistem mencegah proses.', type: 'error'});
        return;
    }

    const loadingUI = document.getElementById('loading-overlay');
    const loadingTitle = document.getElementById('loading-title');
    if(loadingTitle) loadingTitle.innerText = "SEDANG TUTUP BUKU...";
    if(loadingUI) loadingUI.classList.remove('hidden');

    try {
        const statsSnap = await getDoc(doc(db, "metadata", "stats"));
        let totalBalanceBku = 0;
        if(statsSnap.exists()) totalBalanceBku = statsSnap.data().total_balance_bku || 0;

        const membersSnap = await getDocs(collection(db, "members"));
        const memberData = membersSnap.docs.map(d => ({id: d.id, ...d.data()}));

        const deleteInBatches = async (colName) => {
            let q = query(collection(db, colName), limit(400)); 
            let snap = await getDocs(q);
            while (!snap.empty) {
                const b = writeBatch(db);
                snap.docs.forEach(d => b.delete(d.ref));
                await b.commit();
                snap = await getDocs(q); 
            }
        };

        await deleteInBatches("shuttlecock_history");
        await deleteInBatches("bku_transactions");

        const finalBatch = writeBatch(db);
        const MY = getMonthYearStr(null);
        const ts = serverTimestamp();

        finalBatch.update(doc(db, "metadata", "stats"), {
            total_income_bku: 0,
            total_expense_bku: 0
        });

        if (totalBalanceBku !== 0) {
            finalBatch.set(doc(collection(db, "bku_transactions")), {
                type: totalBalanceBku > 0 ? "DEBIT" : "CREDIT",
                category: "SALDO AWAL",
                amount: Math.abs(totalBalanceBku),
                note: `Sisa Kas Bawaan setelah Tutup Bukudari Periode Sebelumnya`,
                month_year: MY,
                timestamp: ts
            });
        }

        memberData.forEach(m => {
            if (m.shuttlecock_balance !== 0) {
                finalBatch.set(doc(collection(db, "shuttlecock_history")), {
                    member_id: m.id,
                    member_name: m.name,
                    type: m.shuttlecock_balance > 0 ? "DEPOSIT" : "USAGE", 
                    amount: m.shuttlecock_balance,
                    note: "Sisa Saldo Bawaan Periode Sebelumnya",
                    month_year: MY,
                    timestamp: ts
                });
            }
        });

        await finalBatch.commit();

        if(loadingUI) loadingUI.classList.add('hidden');
        
        fetchHistory(false);
        fetchBKU(false);

        appDialog({title: 'Tutup Buku Sukses!', message: 'Sistem berhasil direset. Selamat datang di periode pembukuan baru.', type: 'success'});
        
    } catch (e) {
        if(loadingUI) loadingUI.classList.add('hidden');
        console.error(e);
        appDialog({title: 'FATAL ERROR', message: 'Sistem gagal menyelesaikan tutup buku: ' + e.message, type: 'error'});
    }
};

// ==========================================
// 5. INISIALISASI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupRupiahFormatter();
    bindDepositInputs('input-deposit-qty', 'input-deposit-nominal', 'deposit-kembalian');
    bindDepositInputs('input-global-deposit-qty', 'input-global-deposit-nominal', 'global-deposit-kembalian');
    
    fetchHistory(false);
    fetchBKU(false);
});