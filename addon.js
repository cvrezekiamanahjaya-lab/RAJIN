// KONFIGURASI SUPABASE
const SUPABASE_URL = 'https://woqifznkmbsjxelzhmjk.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_3iBnO0BYibh8Y8WJwXI0hg_X3iho_pj'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// VARIABEL GLOBAL (Dipakai juga oleh pengurus.js)
let currentUser = null;
let currentProfile = null;
let jenisSampahList = [];
let hargaOfftakerMap = {}; 

// --- FUNGSI MANAJEMEN STATE HALAMAN (AUTO REFRESH) ---
function saveCurrentSection(sectionId) {
    if (sectionId && sectionId !== 'login-page' && sectionId !== 'pending-page') {
        sessionStorage.setItem('last_active_section', sectionId);
        if (sectionId === 'admin-dashboard') {
            const activeTab = document.querySelector('.admin-tab.active-tab');
            if (activeTab) {
                const tabName = activeTab.getAttribute('onclick').match(/'([^']+)'/)[1];
                sessionStorage.setItem('last_admin_tab', tabName);
            }
        }
    } else {
        sessionStorage.removeItem('last_active_section');
        sessionStorage.removeItem('last_admin_tab');
    }
}

async function restoreLastSection() {
    const lastSection = sessionStorage.getItem('last_active_section');
    if (lastSection && document.getElementById(lastSection)) {
        showSection(lastSection);
        if (lastSection === 'admin-dashboard') {
            const lastTab = sessionStorage.getItem('last_admin_tab');
            if (lastTab) {
                const tabBtn = document.querySelector(`button[onclick="switchAdminTab('${lastTab}')"]`);
                if (tabBtn) tabBtn.click();
            }
        }
        return true; 
    }
    return false; 
}

// --- INITIALIZATION ---
async function initApp() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        await handleLoginSuccess(session.user);
        
        // COBA RESTORE HALAMAN TERAKHIR SETELAH LOGIN SUKSES
        const restored = await restoreLastSection();
        if (!restored) {
            // Jika tidak ada state tersimpan, tampilkan dashboard default berdasarkan role
            if (currentProfile.role === 'admin') showSection('admin-dashboard');
            else if (currentProfile.role === 'pengurus') showSection('pengurus-dashboard');
            else if (currentProfile.role === 'nasabah') showSection('nasabah-dashboard');
        }
    } else {
        showSection('login-page');
    }
}

function switchAuthTab(tab) {
    document.getElementById('login-form').classList.toggle('hidden-section', tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden-section', tab !== 'register');
    document.getElementById('tab-login').className = tab === 'login' ? 'flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600 transition' : 'flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition';
    document.getElementById('tab-register').className = tab === 'register' ? 'flex-1 py-2 text-sm font-bold text-blue-600 border-b-2 border-blue-600 transition' : 'flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition';
}

// --- AUTHENTICATION HANDLERS ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Memproses...';
    btn.disabled = true;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-password').value });
    btn.innerHTML = originalText; btn.disabled = false;
    if (error) alert('Login Gagal: ' + error.message);
    else await handleLoginSuccess(data.user);
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const nama = document.getElementById('reg-nama').value;
    const hp = document.getElementById('reg-hp').value;
    const alamat = document.getElementById('reg-alamat').value;

    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mendaftar...';
    btn.disabled = true;

    try {
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password, options: { data: { nama_lengkap: nama, no_hp: hp, alamat: alamat } } });
        if (authError) {
            if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('duplicate')) {
                sessionStorage.setItem('reg_data', JSON.stringify({ email, password, nama, hp, alamat }));
                document.getElementById('modal-confirm-overwrite').classList.remove('hidden-section');
                document.getElementById('modal-confirm-overwrite').classList.add('active-section');
                document.getElementById('btn-confirm-overwrite').onclick = async () => await handleOverwriteUser(email, password, nama, hp, alamat);
            } else { alert('Gagal mendaftar: ' + authError.message); }
        } else {
            alert('Pendaftaran berhasil! Akun Anda berstatus Pending.');
            switchAuthTab('login'); e.target.reset();
        }
    } catch (err) { alert('Terjadi kesalahan: ' + err.message); }
    finally { btn.innerHTML = originalText; btn.disabled = false; }
});

async function handleOverwriteUser(email, password, nama, hp, alamat) {
    try {
        const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        const { error: profileError } = await supabaseClient.from('profiles').upsert({ id: loginData.user.id, role: 'pending', status: 'active', nama_lengkap: nama, no_hp: hp, alamat: alamat, bank_sampah_id: null }, { onConflict: 'id' });
        if (profileError) throw profileError;
        closeOverwriteModal();
        alert('Data berhasil diperbarui! Akun kembali ke status Pending.');
        switchAuthTab('login'); document.getElementById('register-form').reset();
    } catch (err) { alert('Gagal menimpa data: ' + err.message); }
}

function closeOverwriteModal() {
    document.getElementById('modal-confirm-overwrite').classList.add('hidden-section');
    document.getElementById('modal-confirm-overwrite').classList.remove('active-section');
    sessionStorage.removeItem('reg_data');
}

async function handleLoginSuccess(user) {
    currentUser = user;
    // FIX: Select * saja, jangan select email karena tidak ada di profiles
    const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) { alert('Error mengambil data profil.'); await doLogout(); return; }
    if (profile.role === 'pending') { showSection('pending-page'); return; }
    
    currentProfile = profile;
    document.getElementById('user-name').textContent = profile.nama_lengkap;
    document.getElementById('user-role').textContent = profile.role;
    
    // WAJIB LOAD MASTER DATA DULU SEBELUM BUKA DASHBOARD
    await loadMasterData();
    
    showSection('app-container');
    
    if (profile.role === 'admin') await loadAdminDashboard();
    else if (profile.role === 'pengurus') await loadPengurusDashboard(); // Dipanggil dari pengurus.js
    else if (profile.role === 'nasabah') await loadNasabahDashboard();
}

async function doLogout() { 
    await supabaseClient.auth.signOut(); 
    sessionStorage.removeItem('last_active_section');
    sessionStorage.removeItem('last_admin_tab');
    window.location.reload(); 
}

// MODIFIKASI FUNGSI showSection AGAR OTOMATIS MENYIMPAN STATE
function showSection(id) { 
    ['login-page', 'pending-page', 'app-container'].forEach(s => { 
        const el = document.getElementById(s); 
        if(el) { 
            el.classList.add('hidden-section'); 
            el.classList.remove('active-section'); 
        } 
    }); 
    
    const t = document.getElementById(id); 
    if(t) { 
        t.classList.remove('hidden-section'); 
        t.classList.add('active-section'); 
        saveCurrentSection(id); // SIMPAN STATE SETIAP KALI PINDAH HALAMAN
    } 
}

async function loadMasterData() {
    const { data: js } = await supabaseClient.from('jenis_sampah').select('*').order('nama_sampah'); jenisSampahList = js || [];
    const { data: ho } = await supabaseClient.from('harga_offtaker').select('jenis_sampah_id, harga_per_kg').is('bank_sampah_id', null); hargaOfftakerMap = {}; (ho || []).forEach(h => hargaOfftakerMap[h.jenis_sampah_id] = h.harga_per_kg);
}
function formatRupiah(a) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a); }

// --- ADMIN FUNCTIONS ---
async function loadAdminDashboard() {
    document.getElementById('admin-dashboard').classList.remove('hidden-section');
    const { count } = await supabaseClient.from('bank_sampah').select('*', { count: 'exact', head: true }); document.getElementById('stat-total-bs').textContent = count || 0;
    loadTableBankSampah(); loadTableHargaOfftaker(); loadPendingUsersAdmin(); loadActiveUsersAdmin();
    loadPduData(); 
}

// MODIFIKASI switchAdminTab AGAR MENYIMPAN TAB TERAKHIR
function switchAdminTab(t) { 
    document.querySelectorAll('.admin-tab').forEach(b => { b.className = 'admin-tab border-transparent text-gray-500 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm'; }); 
    event.currentTarget.className = 'admin-tab active-tab border-emerald-500 text-emerald-600 whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm'; 
    document.querySelectorAll('.admin-content').forEach(c => c.classList.add('hidden-section')); 
    document.getElementById(`tab-${t}`).classList.remove('hidden-section'); 
    sessionStorage.setItem('last_admin_tab', t); // SIMPAN TAB ADMIN
} 

async function loadTableBankSampah() { const { data } = await supabaseClient.from('bank_sampah').select('*').order('created_at', { ascending: false }); const tb = document.getElementById('table-bs-body'); tb.innerHTML = ''; (data||[]).forEach(r => tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${r.nama_bank}</td><td class="px-6 py-4 text-gray-600">${r.alamat||'-'}</td><td class="px-6 py-4 text-gray-600">${r.no_hp||'-'}</td></tr>`); }

async function loadTableHargaOfftaker() { 
    const { data } = await supabaseClient.from('harga_offtaker').select('*, jenis_sampah(nama_sampah)').is('bank_sampah_id', null).order('jenis_sampah(nama_sampah)'); 
    const tb = document.getElementById('table-offtaker-body'); 
    tb.innerHTML = ''; 
    
    const thead = tb.parentElement.querySelector('thead tr');
    if(thead && thead.children.length < 3) {
        const th = document.createElement('th');
        th.className = "px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase";
        th.textContent = "Aksi";
        thead.appendChild(th);
    }

    (data||[]).forEach(h => {
        tb.innerHTML += `
        <tr>
            <td class="px-6 py-3 font-medium">${h.jenis_sampah?.nama_sampah}</td>
            <td class="px-6 py-3 text-emerald-700 font-bold">${formatRupiah(h.harga_per_kg)}</td>
            <td class="px-6 py-3">
                <button onclick="editHargaManual('${h.jenis_sampah_id}', '${h.jenis_sampah?.nama_sampah}', ${h.harga_per_kg})" class="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </td>
        </tr>`; 
    }); 
}

async function editHargaManual(jenisId, namaSampah, hargaLama) {
    const newHarga = prompt(`Edit Harga untuk:\n${namaSampah}\n\nHarga Lama: ${formatRupiah(hargaLama)}\n\nMasukkan Harga Baru (angka saja):`, hargaLama);
    if (newHarga === null) return;
    const hargaBaru = parseFloat(newHarga.replace(/[^\d.-]/g, ''));
    if (isNaN(hargaBaru) || hargaBaru < 0) { alert("Harga tidak valid!"); return; }

    const { error } = await supabaseClient.from('harga_offtaker').update({ harga_per_kg: hargaBaru }).eq('jenis_sampah_id', jenisId).is('bank_sampah_id', null);
    if (error) alert("Gagal update: " + error.message);
    else { alert("Harga berhasil diubah!"); loadTableHargaOfftaker(); loadMasterData(); }
}

// FIX UTAMA: LOAD PENDING USERS TANPA SELECT EMAIL (KARENA TIDAK ADA DI PROFILES)
async function loadPendingUsersAdmin() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*') // HANYA SELECT *, JANGAN SELECT EMAIL
        .eq('role', 'pending');

    const tb = document.getElementById('table-pending-admin'); 
    tb.innerHTML = '';

    if (error) {
        console.error("Error loading pending users:", error);
        tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Error: ' + error.message + '</td></tr>';
        return;
    }

    if (!data || data.length === 0) { 
        tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">Tidak ada user pending.</td></tr>'; 
        return; 
    }

    data.forEach(u => { 
        // Email ditampilkan '-' karena tidak ada di tabel profiles
        tb.innerHTML += `
        <tr>
            <td class="px-6 py-4 font-bold">${u.nama_lengkap}</td>
            <td class="px-6 py-4 text-gray-600">-</td> 
            <td class="px-6 py-4 text-gray-600">${u.no_hp||'-'}</td>
            <td class="px-6 py-4">
                <button onclick="openApproveModal('${u.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">Approve</button>
            </td>
        </tr>`; 
    });
}

// FIX UTAMA: LOAD ACTIVE USERS TANPA SELECT EMAIL
async function loadActiveUsersAdmin() {
    const { data } = await supabaseClient.from('profiles').select('*, bank_sampah(nama_bank)').neq('role', 'pending').order('created_at', {ascending: false});
    const tb = document.getElementById('table-active-admin'); if(!tb) return;
    tb.innerHTML = '';
    if (!data || data.length === 0) { tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">Belum ada user aktif.</td></tr>'; return; }
    (data||[]).forEach(u => { 
        tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${u.nama_lengkap}</td><td class="px-6 py-4"><span class="px-2 py-1 rounded text-xs font-bold ${u.role==='admin'?'bg-purple-100 text-purple-700':u.role==='pengurus'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}">${u.role.toUpperCase()}</span></td><td class="px-6 py-4 text-gray-600">${u.bank_sampah?.nama_bank || '-'}</td><td class="px-6 py-4"><button onclick="resetPasswordAdmin('${u.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold mr-2" title="Reset Password"><i class="fas fa-key"></i> Reset Pass</button><button onclick="editUserRole('${u.id}')" class="text-gray-600 hover:text-gray-800 text-xs font-bold" title="Edit Role"><i class="fas fa-edit"></i> Edit</button></td></tr>`; 
    });
}

async function openApproveModal(userId) {
    document.getElementById('approve-user-id').value = userId;
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').order('nama_bank');
    const sel = document.getElementById('approve-bank'); sel.innerHTML = '';
    (bs||[]).forEach(b => sel.innerHTML += `<option value="${b.id}">${b.nama_bank}</option>`);
    toggleModal('modal-approve-user');
}

async function submitApproveUser() {
    const userId = document.getElementById('approve-user-id').value;
    const role = document.getElementById('approve-role').value;
    const bankId = document.getElementById('approve-bank').value;
    
    const result = await approveUserAccount(userId, role, bankId);
    
    if(result.success) {
        alert(result.message); 
        toggleModal('modal-approve-user'); 
        loadPendingUsersAdmin(); 
        loadActiveUsersAdmin();
    } else {
        alert("Gagal Approve: " + result.message);
    }
}

// --- INTEGRASI FORM BUAT AKUN MANUAL KE ACCOUNT-MANAGER.JS ---
document.getElementById('form-create-user').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Membuat...';
    btn.disabled = true;

    try {
        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-pass').value;
        const nama = document.getElementById('new-user-nama').value;
        const role = document.getElementById('new-user-role').value;
        const bankId = document.getElementById('new-user-bs').value || null;

        const result = await createManualAccount(email, password, nama, role, bankId);

        if (result.success) {
            alert(`✅ ${result.message}`);
            toggleModal('modal-create-user');
            e.target.reset();
            loadPendingUsersAdmin(); 
            loadActiveUsersAdmin();
        } else {
            alert('❌ Gagal membuat akun: ' + result.message);
        }
        
    } catch (err) {
        alert('Terjadi kesalahan sistem: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

async function openCreateUserModal() {
    const sel = document.getElementById('new-user-bs');
    sel.innerHTML = '<option value="">-- Tanpa Bank Sampah --</option>';
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').order('nama_bank');
    (bs||[]).forEach(b => sel.innerHTML += `<option value="${b.id}">${b.nama_bank}</option>`);
    toggleModal('modal-create-user');
}

// --- FUNGSI LOAD DATA UNTUK TAB PDU ---
async function loadPduData() {
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').order('nama_bank');
    
    const selBsBeli = document.getElementById('beli-bs-select'); 
    if(selBsBeli) {
        selBsBeli.innerHTML = '<option value="">-- Pilih Bank Sampah --</option>';
        (bs||[]).forEach(b => selBsBeli.innerHTML += `<option value="${b.id}">${b.nama_bank}</option>`);
    }

    const selJenisJual = document.getElementById('jual-jenis-select');
    if(selJenisJual) {
        selJenisJual.innerHTML = '<option value="">-- Pilih Jenis Sampah --</option>';
        jenisSampahList.forEach(js => {
            selJenisJual.innerHTML += `<option value="${js.id}" data-harga="${hargaOfftakerMap[js.id] || 0}">${js.nama_sampah}</option>`;
        });
        selJenisJual.addEventListener('change', function() {
            const opt = this.options[this.selectedIndex];
            document.getElementById('jual-harga').value = opt.dataset.harga || '';
        });
    }

    const selJenisBeli = document.getElementById('beli-jenis-select');
    if(selJenisBeli) {
        selJenisBeli.innerHTML = '<option value="">-- Pilih Jenis Sampah --</option>';
        jenisSampahList.forEach(js => {
            selJenisBeli.innerHTML += `<option value="${js.id}" data-harga="${hargaOfftakerMap[js.id] || 0}">${js.nama_sampah}</option>`;
        });
        selJenisBeli.addEventListener('change', function() {
            const opt = this.options[this.selectedIndex];
            document.getElementById('beli-harga').value = opt.dataset.harga || '';
        });
    }
}

document.getElementById('admin-form-beli')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bsId = document.getElementById('beli-bs-select').value;
    const jsId = document.getElementById('beli-jenis-select').value;
    const berat = parseFloat(document.getElementById('beli-berat').value);
    const harga = parseFloat(document.getElementById('beli-harga').value);

    if (!bsId || !jsId || !berat || !harga) { alert('Lengkapi data pembelian!'); return; }

    const { error } = await supabaseClient.from('transaksi').insert({
        bank_sampah_id: bsId, nasabah_id: null, jenis_sampah_id: jsId,
        berat_kg: berat, harga_saat_transaksi: harga, total_harga: berat * harga,
        kategori_transaksi: 'beli', status_bayar: 'dibayar', tanggal_transaksi: new Date().toISOString()
    });

    if (error) alert('Gagal mencatat pembelian: ' + error.message);
    else { alert('Pembelian berhasil dicatat!'); e.target.reset(); }
});

document.getElementById('admin-form-jual')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jsId = document.getElementById('jual-jenis-select').value;
    const berat = parseFloat(document.getElementById('jual-berat').value);
    const harga = parseFloat(document.getElementById('jual-harga').value);
    const pembeli = document.getElementById('jual-pembeli').value;

    if (!jsId || !berat || !harga) { alert('Lengkapi data penjualan!'); return; }

    const { error } = await supabaseClient.from('penjualan').insert({
        bank_sampah_id: null, jenis_sampah_id: jsId, berat_kg: berat,
        harga_jual_per_kg: harga, total_pendapatan: berat * harga,
        nama_pembeli: pembeli || 'PDU / Offtaker', tanggal_jual: new Date().toISOString()
    });

    if (error) {
        await supabaseClient.from('transaksi').insert({
            bank_sampah_id: null, nasabah_id: null, jenis_sampah_id: jsId,
            berat_kg: berat, harga_saat_transaksi: harga, total_harga: berat * harga,
            kategori_transaksi: 'jual_pdu', status_bayar: 'dibayar', tanggal_transaksi: new Date().toISOString()
        });
    }

    alert('Penjualan ke PDU berhasil dicatat!'); e.target.reset();
});

// --- MANAJEMEN USER: RESET PASSWORD & EDIT ---
async function resetPasswordAdmin(userId) {
    const newPass = prompt("Masukkan password baru untuk user ini:", "Rajin123!");
    if (!newPass) return;
    const sqlScript = getResetPasswordSQL(userId, newPass);
    alert(`⚠️ INSTRUKSI RESET PASSWORD MANUAL\n\nCopy script ini ke SQL Editor Supabase:\n\n${sqlScript}\n\nSetelah dijalankan, user bisa login dengan password baru.`);
}

async function editUserRole(userId) {
    const newRole = prompt("Ubah role user (admin/pengurus/nasabah):");
    if (!newRole || !['admin', 'pengurus', 'nasabah'].includes(newRole.toLowerCase())) { alert("Role tidak valid!"); return; }
    
    const result = await updateUserRole(userId, newRole.toLowerCase());
    if(result.success) { alert("Role berhasil diubah!"); loadActiveUsersAdmin(); }
    else { alert("Gagal ubah role: " + result.message); }
}

// --- NASABAH FUNCTIONS ---
async function loadNasabahDashboard() {
    document.getElementById('nasabah-dashboard').classList.remove('hidden-section');
    const { data: nData } = await supabaseClient.from('nasabah').select('*').eq('profile_id', currentProfile.id).single();
    if(nData){document.getElementById('nasabah-nama').textContent=currentProfile.nama_lengkap;document.getElementById('nasabah-saldo-tabung').textContent=formatRupiah(nData.saldo_tabungan||0);}
    const { data: trx } = await supabaseClient.from('transaksi').select('*, jenis_sampah(nama_sampah, satuan)').eq('nasabah_id', nData?.id).order('tanggal_transaksi',{ascending:false});
    const lc=document.getElementById('nasabah-riwayat-list'); lc.innerHTML=''; let tb=0;
    (trx||[]).forEach(t=>{tb+=t.berat_kg; lc.innerHTML+=`<div class="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-100 shadow-sm"><div><p class="font-bold text-gray-900">${t.jenis_sampah?.nama_sampah}</p><p class="text-xs text-gray-500">${new Date(t.tanggal_transaksi).toLocaleDateString('id-ID')} • ${t.berat_kg} ${t.jenis_sampah?.satuan}</p></div><div class="text-right"><p class="font-bold text-emerald-700">${formatRupiah(t.total_harga)}</p><span class="text-[10px] px-2 py-0.5 rounded-full ${t.status_bayar==='dibayar'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}">${t.status_bayar==='dibayar'?'Dibayar':'Ditabung'}</span></div></div>`;});
    document.getElementById('nasabah-total-setor').textContent=tb.toFixed(1)+' Kg';
    
    const popular = ['PLASTIK PUTIH (PP)', 'KARDUS', 'BESI'];
    let msg = [];
    popular.forEach(nama => {
        const js = jenisSampahList.find(j => j.nama_sampah === nama);
        if (js && hargaOfftakerMap[js.id]) msg.push(`${nama}: ${formatRupiah(hargaOfftakerMap[js.id])}/kg`);
    });
    document.getElementById('nasabah-harga-update').textContent = msg.length > 0 ? msg.join(', ') : "Belum ada update harga terbaru.";
}

// --- CHAT HELPER LOGIC ---
function toggleChat() { document.getElementById('chat-window').classList.toggle('hidden-section'); }
function addChatMessage(text, isUser = false) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`;
    const icon = isUser ? '<i class="fas fa-user text-blue-600 text-xs"></i>' : '<i class="fas fa-robot text-emerald-600 text-xs"></i>';
    const bgIcon = isUser ? 'bg-blue-100' : 'bg-emerald-100';
    const bgBubble = isUser ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-white text-gray-700 rounded-tl-none shadow-sm border border-gray-100';
    div.innerHTML = `<div class="w-8 h-8 ${bgIcon} rounded-full flex items-center justify-center shrink-0">${icon}</div><div class="${bgBubble} p-3 rounded-2xl text-sm max-w-[85%] leading-relaxed">${text}</div>`;
    container.appendChild(div); container.scrollTop = container.scrollHeight;
}

const faqDatabase = {
    'tutorial_setor': 'Untuk setor sampah:<br>1. Login sebagai Pengurus/Nasabah.<br>2. Pilih jenis sampah & input berat.<br>3. Pilih status "Dibayar" atau "Ditabung".<br>4. Klik Simpan.',
    'update_harga': 'Sedang mengecek harga terbaru dari database...',
    'import_csv': 'Fitur Import CSV hanya untuk Admin & Pengurus.<br>Format: <code>Nama Sampah,Harga</code>. Pastikan nama sampah sama persis dengan master data.'
};

async function askFaq(key) {
    const questions = { 'tutorial_setor': 'Bagaimana cara setor sampah?', 'update_harga': 'Berapa harga plastik/kardus hari ini?', 'import_csv': 'Bagaimana cara import CSV?' };
    addChatMessage(questions[key], true);
    setTimeout(async () => {
        if (key === 'update_harga') {
            let msg = 'Harga Offtaker Default saat ini:<br>';
            const popular = ['PLASTIK PUTIH (PP)', 'KARDUS', 'BESI', 'ALUMINIUM PANCI', 'BOTOL BELING'];
            for (let nama of popular) {
                const js = jenisSampahList.find(j => j.nama_sampah === nama);
                if (js && hargaOfftakerMap[js.id]) msg += `• ${nama}: <b>${formatRupiah(hargaOfftakerMap[js.id])}</b><br>`;
            }
            msg += '<br><i class="text-xs text-gray-400">*Harga bisa berbeda per Bank Sampah</i>';
            addChatMessage(msg);
        } else { addChatMessage(faqDatabase[key]); }
    }, 600);
}

// --- EXPORT & IMPORT CSV ---
function exportOfftakerCSV(){
    let csv = '\uFEFFNama Sampah,Harga\n'; 
    jenisSampahList.forEach(j=>{
        const harga = hargaOfftakerMap[j.id] || 0;
        csv += `"${j.nama_sampah}",${harga}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Master_Harga_RAJIN_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function handleImportOfftaker(input){
    const f = input.files[0];
    if(!f) return;
    try {
        const t = await f.text();
        const lines = t.split('\n').filter(line => line.trim() !== ''); 
        let successCount = 0; let errorCount = 0;
        for(let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if(!line) continue;
            const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if(!matches || matches.length < 2) { errorCount++; continue; }
            let namaSampah = matches[0].replace(/"/g, '').trim();
            let hargaStr = matches[1].replace(/"/g, '').replace(/[^\d.-]/g, '').trim();
            let harga = parseFloat(hargaStr);
            if(isNaN(harga)) { errorCount++; continue; }
            const js = jenisSampahList.find(x => x.nama_sampah.toLowerCase() === namaSampah.toLowerCase() || x.nama_sampah.toLowerCase().includes(namaSampah.toLowerCase()) || namaSampah.toLowerCase().includes(x.nama_sampah.toLowerCase()));
            if(js) {
                const { error } = await supabaseClient.from('harga_offtaker').upsert({ jenis_sampah_id: js.id, bank_sampah_id: null, harga_per_kg: harga }, { onConflict: 'jenis_sampah_id, bank_sampah_id' });
                if(!error) successCount++; else errorCount++;
            } else { errorCount++; }
        }
        let msg = `Import selesai!\n✅ Berhasil: ${successCount} data\n❌ Gagal/Skip: ${errorCount} data`;
        if(errorCount > 0) msg += '\n\n(Cek apakah nama sampah di CSV sama dengan Master Data)';
        alert(msg);
        loadTableHargaOfftaker(); loadMasterData(); input.value = ''; 
    } catch(err) { alert('Error saat memproses file: ' + err.message); }
}

function toggleModal(id){document.getElementById(id).classList.toggle('hidden-section');}
window.addEventListener('DOMContentLoaded', initApp);
