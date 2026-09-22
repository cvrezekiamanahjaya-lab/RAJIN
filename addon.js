// KONFIGURASI SUPABASE
const SUPABASE_URL = 'https://woqifznkmbsjxelzhmjk.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_3iBnO0BYibh8Y8WJwXI0hg_X3iho_pj'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// VARIABEL GLOBAL
let currentUser = null;
let currentProfile = null;
let jenisSampahList = [];
let hargaOfftakerMap = {}; // Harga Pusat/Default
let settingMarginMap = {}; // Setting Margin Per Bank Sampah

// --- FUNGSI MANAJEMEN STATE HALAMAN ---
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
        const restored = await restoreLastSection();
        if (!restored) {
            if (currentProfile.role === 'admin') showSection('admin-dashboard');
            else if (currentProfile.role === 'pengurus') showSection('pengurus-dashboard');
            else if (currentProfile.role === 'nasabah') showSection('nasabah-dashboard');
        }
    } else {
        showSection('login-page');
    }
}

function switchAuthTab(tab) {
    document.getElementById('login-form')?.classList.toggle('hidden-section', tab !== 'login');
    document.getElementById('register-form')?.classList.toggle('hidden-section', tab !== 'register');
    document.getElementById('tab-login').className = tab === 'login' ? 'flex-1 py-2 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600 transition' : 'flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition';
    document.getElementById('tab-register').className = tab === 'register' ? 'flex-1 py-2 text-sm font-bold text-blue-600 border-b-2 border-blue-600 transition' : 'flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition';
}

// --- AUTHENTICATION HANDLERS ---
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
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

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
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
                document.getElementById('modal-confirm-overwrite')?.classList.remove('hidden-section');
                document.getElementById('modal-confirm-overwrite')?.classList.add('active-section');
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
        switchAuthTab('login'); document.getElementById('register-form')?.reset();
    } catch (err) { alert('Gagal menimpa data: ' + err.message); }
}

function closeOverwriteModal() {
    document.getElementById('modal-confirm-overwrite')?.classList.add('hidden-section');
    document.getElementById('modal-confirm-overwrite')?.classList.remove('active-section');
    sessionStorage.removeItem('reg_data');
}

// --- HANDLE LOGIN SUCCESS & LOAD MASTER DATA ---
async function handleLoginSuccess(user) {
    currentUser = user;
    const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) { alert('Error mengambil data profil.'); await doLogout(); return; }
    if (profile.role === 'pending') { showSection('pending-page'); return; }
    
    currentProfile = profile;
    document.getElementById('user-name').textContent = profile.nama_lengkap;
    document.getElementById('user-role').textContent = profile.role;
    
    // Load master data DULU
    await loadMasterData();
    
    showSection('app-container');
    
    if (profile.role === 'admin') await loadAdminDashboard();
    else if (profile.role === 'pengurus') await loadPengurusDashboard();
    else if (profile.role === 'nasabah') await loadNasabahDashboard();
}

async function doLogout() { 
    await supabaseClient.auth.signOut(); 
    sessionStorage.removeItem('last_active_section');
    sessionStorage.removeItem('last_admin_tab');
    window.location.reload(); 
}

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
        saveCurrentSection(id);
    } 
}

// --- FIX UTAMA: LOAD MASTER DATA + SETTING MARGIN ---
async function loadMasterData() {
    console.log("Memuat master data...");
    
    // 1. Load Jenis Sampah
    const { data: js, error: jsError } = await supabaseClient.from('jenis_sampah').select('*').order('nama_sampah');
    if(jsError) {
        console.error("Error loading jenis_sampah:", jsError);
        jenisSampahList = [];
    } else {
        jenisSampahList = js || [];
        console.log(`Loaded ${jenisSampahList.length} jenis sampah`);
    }
    
    // 2. Load Harga Off-taker Pusat (bank_sampah_id IS NULL)
    const { data: ho, error: hoError } = await supabaseClient.from('harga_offtaker').select('*');
    if(hoError) {
        console.error("Error loading harga_offtaker:", hoError);
        hargaOfftakerMap = {};
    } else {
        hargaOfftakerMap = {};
        (ho || []).forEach(h => {
            if(!h.bank_sampah_id) {
                hargaOfftakerMap[h.jenis_sampah_id] = h.harga_per_kg;
            }
        });
        console.log(`Loaded ${Object.keys(hargaOfftakerMap).length} harga off-taker pusat`);
    }

    // 3. Load Setting Margin Pengurus (BARU!)
    if(currentProfile?.bank_sampah_id) {
        const { data: settings, error: setErr } = await supabaseClient
            .from('setting_harga_pengurus')
            .select('*')
            .eq('bank_sampah_id', currentProfile.bank_sampah_id);
            
        if(setErr) console.error("Error loading settings:", setErr);
        else {
            settingMarginMap = {};
            (settings || []).forEach(s => {
                settingMarginMap[s.jenis_sampah_id] = s.margin_persen || 30;
            });
            console.log(`Loaded ${Object.keys(settingMarginMap).length} setting margin`);
        }
    }
}

function formatRupiah(a) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a); }

// ==========================================
// ADMIN FUNCTIONS
// ==========================================

async function loadAdminDashboard() {
    document.getElementById('admin-dashboard')?.classList.remove('hidden-section');
    const { count } = await supabaseClient.from('bank_sampah').select('*', { count: 'exact', head: true }); 
    document.getElementById('stat-total-bs').textContent = count || 0;
    loadTableBankSampah(); 
    loadTableHargaOfftaker(); 
    loadPendingUsersAdmin(); 
    loadActiveUsersAdmin();
    loadPduData(); 
}

function switchAdminTab(t) { 
    document.querySelectorAll('.admin-tab').forEach(b => { b.className = 'admin-tab border-transparent text-gray-500 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm'; }); 
    event.currentTarget.className = 'admin-tab active-tab border-emerald-500 text-emerald-600 whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm'; 
    document.querySelectorAll('.admin-content').forEach(c => c.classList.add('hidden-section')); 
    document.getElementById(`tab-${t}`)?.classList.remove('hidden-section'); 
    sessionStorage.setItem('last_admin_tab', t);
} 

async function loadTableBankSampah() { 
    const { data } = await supabaseClient.from('bank_sampah').select('*').order('created_at', { ascending: false }); 
    const tb = document.getElementById('table-bs-body'); if(!tb) return; 
    tb.innerHTML = ''; 
    (data||[]).forEach(r => tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${r.nama_bank}</td><td class="px-6 py-4 text-gray-600">${r.alamat||'-'}</td><td class="px-6 py-4 text-gray-600">${r.no_hp||'-'}</td></tr>`); 
}

async function loadTableHargaOfftaker() { 
    const { data } = await supabaseClient.from('harga_offtaker').select('*, jenis_sampah(nama_sampah)').is('bank_sampah_id', null).order('jenis_sampah(nama_sampah)'); 
    const tb = document.getElementById('table-offtaker-body'); if(!tb) return;
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

async function loadPendingUsersAdmin() {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('role', 'pending');
    const tb = document.getElementById('table-pending-admin'); if(!tb) return;
    tb.innerHTML = '';
    if (error) {
        tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Error: ' + error.message + '</td></tr>';
        return;
    }
    if (!data || data.length === 0) { 
        tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">Tidak ada user pending.</td></tr>'; 
        return; 
    }
    data.forEach(u => { 
        tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${u.nama_lengkap}</td><td class="px-6 py-4 text-gray-600">-</td><td class="px-6 py-4 text-gray-600">${u.no_hp||'-'}</td><td class="px-6 py-4"><button onclick="openApproveModal('${u.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">Approve</button></td></tr>`; 
    });
}

async function loadActiveUsersAdmin() {
    const { data } = await supabaseClient.from('profiles').select('*, bank_sampah(nama_bank)').neq('role', 'pending').order('created_at', {ascending: false});
    const tb = document.getElementById('table-active-admin'); if(!tb) return;
    tb.innerHTML = '';
    if (!data || data.length === 0) { tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">Belum ada user aktif.</td></tr>'; return; }
    (data||[]).forEach(u => { 
        tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${u.nama_lengkap}</td><td class="px-6 py-4"><span class="px-2 py-1 rounded text-xs font-bold ${u.role==='admin'?'bg-purple-100 text-purple-700':u.role==='pengurus'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}">${u.role.toUpperCase()}</span></td><td class="px-6 py-4 text-gray-600">${u.bank_sampah?.nama_bank || '-'}</td><td class="px-6 py-4"><button onclick="resetPasswordAdmin('${u.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold mr-2"><i class="fas fa-key"></i> Reset Pass</button><button onclick="editUserRole('${u.id}')" class="text-gray-600 hover:text-gray-800 text-xs font-bold"><i class="fas fa-edit"></i> Edit</button></td></tr>`; 
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

document.getElementById('form-create-user')?.addEventListener('submit', async (e) => {
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

async function resetPasswordAdmin(userId) {
    const newPass = prompt("Masukkan password baru:", "Rajin123!");
    if (!newPass) return;
    const sqlScript = getResetPasswordSQL(userId, newPass);
    alert(`⚠️ INSTRUKSI RESET PASSWORD MANUAL\n\nCopy script ini ke SQL Editor Supabase:\n\n${sqlScript}`);
}

async function editUserRole(userId) {
    const newRole = prompt("Ubah role user (admin/pengurus/nasabah):");
    if (!newRole || !['admin', 'pengurus', 'nasabah'].includes(newRole.toLowerCase())) { alert("Role tidak valid!"); return; }
    const result = await updateUserRole(userId, newRole.toLowerCase());
    if(result.success) { alert("Role berhasil diubah!"); loadActiveUsersAdmin(); }
    else { alert("Gagal ubah role: " + result.message); }
}

// ==========================================
// PENGURUS FUNCTIONS (DIGABUNG DI SINI)
// ==========================================

async function loadPengurusDashboard() {
    console.log("Memuat Dashboard Pengurus...");
    document.getElementById('pengurus-dashboard')?.classList.remove('hidden-section');
    
    // 1. Load Info Bank Sampah
    const { data: bs, error: bsError } = await supabaseClient.from('bank_sampah').select('*').eq('id', currentProfile.bank_sampah_id).single();
    if(bsError) {
        console.error("Error loading bank sampah:", bsError);
        alert(`Gagal memuat data Bank Sampah: ${bsError.message}`);
        return;
    }
    if(document.getElementById('pengurus-nama-bs')) 
        document.getElementById('pengurus-nama-bs').textContent = bs?.nama_bank || 'Bank Sampah Saya';
    
    // 2. Load Total Tabungan
    const { data: allNasabah } = await supabaseClient.from('nasabah').select('saldo_tabungan').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const totalTabungan = (allNasabah || []).reduce((sum, n) => sum + (n.saldo_tabungan || 0), 0);
    if(document.getElementById('pengurus-total-tabungan'))
        document.getElementById('pengurus-total-tabungan').textContent = formatRupiah(totalTabungan);
    
    // 3. Load & Tampilkan Harga Dengan Margin
    await loadAndDisplayHargaPengurus();

    // 4. Load List Nasabah
    await loadNasabahListPengurus();

    // 5. Load Dropdowns
    await loadDropdownsPengurus();
    loadRecentTransactions();
}

// --- FUNGSI BARU: LOAD & DISPLAY HARGA DENGAN MARGIN ---
async function loadAndDisplayHargaPengurus() {
    const hargaListEl = document.getElementById('pengurus-harga-list');
    if(!hargaListEl || !currentProfile?.bank_sampah_id) return;
    
    hargaListEl.innerHTML = '<span class="text-emerald-100 animate-pulse">Memuat data harga...</span>';
    
    // Load setting margin untuk bank sampah ini
    const { data: settings } = await supabaseClient
        .from('setting_harga_pengurus')
        .select('*, jenis_sampah(nama_sampah)')
        .eq('bank_sampah_id', currentProfile.bank_sampah_id);
    
    if(!settings || settings.length === 0) {
        hargaListEl.innerHTML = '<span class="text-emerald-100 text-xs">Belum ada setting harga.</span>';
        return;
    }
    
    hargaListEl.innerHTML = '';
    
    // Urutkan berdasarkan nama sampah
    settings.sort((a, b) => (a.jenis_sampah?.nama_sampah || '').localeCompare(b.jenis_sampah?.nama_sampah || ''));
    
    settings.forEach(s => {
        const hargaOfftaker = hargaOfftakerMap[s.jenis_sampah_id] || 0;
        const margin = s.margin_persen || 30;
        const hargaNasabah = Math.round(hargaOfftaker * (1 - margin/100));
        
        hargaListEl.innerHTML += `
        <div class="flex justify-between items-center bg-white/5 rounded p-2 border border-white/5">
            <div class="flex-1">
                <p class="text-[10px] text-emerald-200 truncate">${s.jenis_sampah?.nama_sampah || 'Unknown'}</p>
                <p class="text-[9px] text-emerald-300/70">Offtaker: ${formatRupiah(hargaOfftaker)}</p>
            </div>
            <div class="text-right">
                <p class="font-bold text-white text-sm">${formatRupiah(hargaNasabah)}</p>
                <p class="text-[9px] text-emerald-300/70">Margin: ${margin}%</p>
            </div>
        </div>
        `;
    });
}

// --- MODAL EDIT MARGIN ---
function openEditMarginModal() {
    toggleModal('modal-edit-margin');
    loadEditMarginList();
}

async function loadEditMarginList() {
    const container = document.getElementById('edit-margin-list');
    if(!container) return;
    
    container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Memuat...</div>';
    
    const { data: settings } = await supabaseClient
        .from('setting_harga_pengurus')
        .select('*, jenis_sampah(nama_sampah)')
        .eq('bank_sampah_id', currentProfile.bank_sampah_id)
        .order('jenis_sampah(nama_sampah)');
    
    if(!settings || settings.length === 0) {
        container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Tidak ada data.</div>';
        return;
    }
    
    container.innerHTML = '';
    
    settings.forEach(s => {
        const hargaOfftaker = hargaOfftakerMap[s.jenis_sampah_id] || 0;
        const margin = s.margin_persen || 30;
        const hargaNasabah = Math.round(hargaOfftaker * (1 - margin/100));
        
        container.innerHTML += `
        <div class="border rounded-lg p-3 bg-gray-50">
            <div class="flex justify-between items-center mb-2">
                <p class="font-bold text-sm text-gray-800">${s.jenis_sampah?.nama_sampah || 'Unknown'}</p>
                <p class="text-xs text-gray-500">Offtaker: ${formatRupiah(hargaOfftaker)}</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex-1">
                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Margin (%)</label>
                    <input type="number" 
                           id="margin-${s.jenis_sampah_id}" 
                           value="${margin}" 
                           min="0" 
                           max="100" 
                           step="1"
                           class="w-full border rounded p-2 text-sm"
                           onchange="previewHargaNasabah('${s.jenis_sampah_id}', ${hargaOfftaker})">
                </div>
                <div class="text-right min-w-[100px]">
                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Harga Nasabah</label>
                    <p class="font-bold text-emerald-700" id="preview-${s.jenis_sampah_id}">${formatRupiah(hargaNasabah)}</p>
                </div>
            </div>
        </div>
        `;
    });
}

function previewHargaNasabah(jenisId, hargaOfftaker) {
    const marginInput = document.getElementById(`margin-${jenisId}`);
    const previewEl = document.getElementById(`preview-${jenisId}`);
    if(!marginInput || !previewEl) return;
    
    const margin = parseFloat(marginInput.value) || 0;
    const hargaNasabah = Math.round(hargaOfftaker * (1 - margin/100));
    previewEl.textContent = formatRupiah(hargaNasabah);
}

async function saveMarginSettings() {
    const inputs = document.querySelectorAll('[id^="margin-"]');
    if(inputs.length === 0) { alert('Tidak ada data untuk disimpan.'); return; }
    
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Menyimpan...';
    btn.disabled = true;
    
    try {
        let successCount = 0;
        let errorCount = 0;
        
        for(const input of inputs) {
            const jenisId = input.id.replace('margin-', '');
            const margin = parseFloat(input.value) || 0;
            
            if(margin < 0 || margin > 100) {
                errorCount++;
                continue;
            }
            
            const { error } = await supabaseClient
                .from('setting_harga_pengurus')
                .update({ margin_persen: margin, updated_at: new Date().toISOString() })
                .eq('bank_sampah_id', currentProfile.bank_sampah_id)
                .eq('jenis_sampah_id', jenisId);
            
            if(error) errorCount++;
            else successCount++;
        }
        
        alert(`✅ Berhasil disimpan!\n\n✅ Update: ${successCount} data\n Gagal: ${errorCount} data`);
        
        toggleModal('modal-edit-margin');
        loadAndDisplayHargaPengurus(); // Refresh tampilan harga
        loadDropdownsPengurus(); // Refresh dropdown transaksi
        
    } catch(err) {
        alert('Gagal menyimpan: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function loadNasabahListPengurus() {
    const container = document.getElementById('list-nasabah-pengurus');
    if(!container) return;
    container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Memuat data nasabah...</div>';
    
    const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('bank_sampah_id', currentProfile.bank_sampah_id)
        .in('role', ['nasabah', 'pending'])
        .order('created_at', { ascending: false });
    
    const { data: nasababs } = await supabaseClient
        .from('nasabah')
        .select('profile_id, saldo_tabungan')
        .eq('bank_sampah_id', currentProfile.bank_sampah_id);
    
    const saldoMap = {};
    (nasababs || []).forEach(n => saldoMap[n.profile_id] = n.saldo_tabungan || 0);
    
    container.innerHTML = '';
    if (!profiles || profiles.length === 0) {
        container.innerHTML = '<div class="text-center text-xs text-gray-400 py-8">Belum ada nasabah terdaftar.</div>';
        return;
    }
    
    profiles.forEach(p => {
        const isPending = p.role === 'pending';
        const saldo = saldoMap[p.id] || 0;
        container.innerHTML += `
        <div class="flex justify-between items-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm mb-3">
            <div>
                <p class="font-bold text-gray-900">${p.nama_lengkap} ${isPending ? '<span class="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full ml-2">PENDING</span>' : ''}</p>
                <p class="text-xs text-gray-500">${p.no_hp || '-'} • Saldo: ${formatRupiah(saldo)}</p>
            </div>
            <div class="flex gap-2">
                ${isPending ? `<button onclick="approveUserByPengurus('${p.id}')" class="bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700">Approve</button>` : ''}
                <button onclick="resetPasswordNasabah('${p.id}', '${p.nama_lengkap}')" class="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700"><i class="fas fa-key"></i> Reset Pass</button>
            </div>
        </div>`;
    });
}

function openRegisterNasabahModal() {
    toggleModal('modal-register-nasabah');
}

document.getElementById('form-register-nasabah')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('reg-nasabah-nama').value.trim();
    const hp = document.getElementById('reg-nasabah-hp').value.trim();
    const alamat = document.getElementById('reg-nasabah-alamat').value.trim();
    let email = document.getElementById('reg-nasabah-email').value.trim();
    const password = document.getElementById('reg-nasabah-pass').value;

    if(!nama || !hp || !alamat) { alert('Nama, No HP, dan Alamat wajib diisi!'); return; }
    if(password.length < 6) { alert('Password minimal 6 karakter!'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mendaftar...';
    btn.disabled = true;

    try {
        if (!email) email = `nasabah_${Date.now()}@rajin.temp`;
        else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if(!emailRegex.test(email)) throw new Error('Format email tidak valid!');
        }

        let userId, isNewUser = true;
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email, password, options: { data: { nama_lengkap: nama, no_hp: hp, alamat: alamat } }
        });

        if (authError) {
            if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('invalid')) {
                const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (loginError) {
                    const useOther = confirm(`Email "${email}" sudah terdaftar tapi password salah.\n\nKlik OK untuk pakai email lain, Cancel untuk batal.`);
                    if(useOther) {
                        btn.innerHTML = originalText; btn.disabled = false;
                        document.getElementById('reg-nasabah-email').value = '';
                        document.getElementById('reg-nasabah-email').focus();
                        return;
                    }
                    throw new Error(`Pendaftaran dibatalkan. Hubungi Admin untuk reset password.`);
                }
                userId = loginData.user.id; isNewUser = false;
                await supabaseClient.auth.signOut();
            } else throw authError;
        } else userId = authData.user.id;

        await supabaseClient.from('profiles').upsert({
            id: userId, role: 'nasabah', status: 'active', nama_lengkap: nama, no_hp: hp, alamat: alamat,
            bank_sampah_id: currentProfile.bank_sampah_id
        }, { onConflict: 'id' });

        await supabaseClient.from('nasabah').upsert({
            profile_id: userId, bank_sampah_id: currentProfile.bank_sampah_id, saldo_tabungan: 0
        }, { onConflict: 'profile_id' });

        let msg = `✅ Nasabah "${nama}" berhasil didaftarkan!\n\nEmail: ${email}\nPassword: ${password}`;
        if (isNewUser) msg += `\n\n⚠️ Jalankan di SQL Editor:\nUPDATE auth.users SET email_confirmed_at = NOW() WHERE id = '${userId}';`;
        alert(msg);
        toggleModal('modal-register-nasabah'); e.target.reset(); loadPengurusDashboard();
        
    } catch (err) { alert('Gagal mendaftarkan nasabah: ' + err.message); }
    finally { btn.innerHTML = originalText; btn.disabled = false; }
});

async function resetPasswordNasabah(userId, nama) {
    const newPass = prompt(`Password baru untuk ${nama}:`, "nasabah123");
    if (!newPass) return;
    alert(`️ Copy script ini ke SQL Editor:\n\n${getResetPasswordSQL(userId, newPass)}`);
}

async function approveUserByPengurus(userId) {
    const result = await approveUserAccount(userId, 'nasabah', currentProfile.bank_sampah_id);
    if(result.success) { alert('Nasabah berhasil di-approve!'); loadPengurusDashboard(); }
    else alert('Gagal: ' + result.message);
}

async function loadDropdownsPengurus() {
    const { data: nasabah } = await supabaseClient.from('nasabah').select('*, profiles(nama_lengkap)').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const selNSetor = document.getElementById('trx-nasabah'); 
    const selNTarik = document.getElementById('tarik-nasabah');
    if(selNSetor) selNSetor.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    if(selNTarik) selNTarik.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    (nasabah||[]).forEach(n => {
        const optHtml = `<option value="${n.id}" data-saldo="${n.saldo_tabungan || 0}">${n.profiles?.nama_lengkap}</option>`;
        if(selNSetor) selNSetor.innerHTML += optHtml;
        if(selNTarik) selNTarik.innerHTML += optHtml;
    });

    const selJ = document.getElementById('trx-jenis'); 
    if(selJ && Array.isArray(jenisSampahList) && jenisSampahList.length > 0) {
        selJ.innerHTML = '<option value="">-- Pilih Jenis Sampah --</option>';
        
        // Ambil setting margin terbaru dari DB atau cache
        const { data: hn } = await supabaseClient.from('setting_harga_pengurus').select('*').eq('bank_sampah_id', currentProfile.bank_sampah_id);
        const localMarginMap = {}; (hn||[]).forEach(h => localMarginMap[h.jenis_sampah_id] = h.margin_persen);

        jenisSampahList.forEach(js => {
            const hd = hargaOfftakerMap[js.id] || 0; 
            const margin = localMarginMap[js.id] || 30; // Default 30% kalau belum diset
            const fp = Math.round(hd * (1 - margin/100));
            
            const opt = document.createElement('option'); opt.value = js.id;
            opt.textContent = `${js.nama_sampah} (${formatRupiah(fp)})`;
            opt.dataset.harga = fp; opt.dataset.satuan = js.satuan || 'Kg';
            selJ.appendChild(opt);
        });
    }
}

function updateTrxPreview() { 
    const s = document.getElementById('trx-jenis'); const b = parseFloat(document.getElementById('trx-berat').value) || 0; 
    const o = s?.options[s.selectedIndex]; 
    if(o && o.value){
        const harga = parseFloat(o.dataset.harga) || 0; const total = harga * b;
        document.getElementById('trx-preview-total').textContent = formatRupiah(total);
        document.getElementById('trx-harga-detail').textContent = `Harga: ${formatRupiah(harga)} x ${b} Kg`;
        document.getElementById('trx-satuan-label').textContent = o.dataset.satuan || 'Kg';
    } else {
        document.getElementById('trx-preview-total').textContent = 'Rp 0';
        document.getElementById('trx-harga-detail').textContent = 'Harga Offtaker - Margin';
    }
}

async function loadDropdownNasabahTarik() {
    const select = document.getElementById('tarik-nasabah'); if(!select) return;
    select.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    const { data } = await supabaseClient.from('nasabah').select('*, profiles(nama_lengkap)').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    (data || []).forEach(n => { select.innerHTML += `<option value="${n.id}" data-saldo="${n.saldo_tabungan || 0}">${n.profiles?.nama_lengkap}</option>`; });
}

function loadSaldoNasabah() {
    const select = document.getElementById('tarik-nasabah'); if(!select) return;
    const selectedOpt = select.options[select.selectedIndex];
    const saldo = selectedOpt ? parseFloat(selectedOpt.dataset.saldo) || 0 : 0;
    document.getElementById('tarik-saldo-display').textContent = formatRupiah(saldo);
}

async function loadRecentTransactions() {
    const container = document.getElementById('list-riwayat-transaksi'); if(!container) return;
    container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Memuat...</div>';
    const { data } = await supabaseClient.from('transaksi').select('*, jenis_sampah(nama_sampah), nasabah(profiles(nama_lengkap))').eq('bank_sampah_id', currentProfile.bank_sampah_id).order('tanggal_transaksi', { ascending: false }).limit(10);
    container.innerHTML = '';
    if (!data || data.length === 0) { container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Belum ada transaksi.</div>'; return; }
    data.forEach(t => {
        container.innerHTML += `<div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm"><div class="flex items-center gap-3"><div class="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0"><i class="fas fa-recycle text-xs"></i></div><div><p class="font-bold text-gray-800">${t.nasabah?.profiles?.nama_lengkap || 'Nasabah'}</p><p class="text-[10px] text-gray-500">${new Date(t.tanggal_transaksi).toLocaleDateString('id-ID')}</p></div></div><div class="text-right"><p class="font-bold text-emerald-600">${formatRupiah(t.total_harga)}</p><p class="text-[10px] text-gray-400">${t.jenis_sampah?.nama_sampah}</p></div></div>`;
    });
}

document.getElementById('form-tarik')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nasabahId = document.getElementById('tarik-nasabah').value;
    const nominal = parseFloat(document.getElementById('tarik-nominal').value);
    if (!nasabahId || !nominal || nominal <= 0) { alert('Mohon lengkapi data penarikan!'); return; }
    const { data: nData } = await supabaseClient.from('nasabah').select('saldo_tabungan').eq('id', nasabahId).single();
    if (!nData || nData.saldo_tabungan < nominal) { alert('Saldo tidak mencukupi!'); return; }
    await supabaseClient.from('nasabah').update({ saldo_tabungan: nData.saldo_tabungan - nominal }).eq('id', nasabahId);
    alert(`Penarikan ${formatRupiah(nominal)} berhasil!`);
    e.target.reset(); document.getElementById('tarik-saldo-display').textContent = 'Rp 0'; loadPengurusDashboard();
});

document.getElementById('form-setor')?.addEventListener('submit', async(e)=>{
    e.preventDefault(); 
    const ni=document.getElementById('trx-nasabah').value; const ji=document.getElementById('trx-jenis').value; const b=parseFloat(document.getElementById('trx-berat').value); 
    if(!ni||!ji||!b){alert('Lengkapi data!');return;} 
    const s=document.getElementById('trx-jenis'); const h=parseFloat(s.options[s.selectedIndex].dataset.harga); const t=h*b; 
    const status = document.getElementById('trx-status').value;
    const {error}=await supabaseClient.from('transaksi').insert({bank_sampah_id:currentProfile.bank_sampah_id,nasabah_id:ni,jenis_sampah_id:ji,berat_kg:b,harga_saat_transaksi:h,total_harga:t,kategori_transaksi:'beli',status_bayar:status}); 
    if(status === 'ditabung' && !error) {
        const { data: nData } = await supabaseClient.from('nasabah').select('saldo_tabungan').eq('id', ni).single();
        await supabaseClient.from('nasabah').update({ saldo_tabungan: (nData?.saldo_tabungan || 0) + t }).eq('id', ni);
    }
    if(error)alert('Gagal: '+error.message); 
    else{alert('Berhasil!');e.target.reset();document.getElementById('trx-preview-total').textContent='Rp 0'; loadPengurusDashboard();}
});

function switchTrxTab(tab) {
    const btnSetor = document.getElementById('tab-setor'); const btnTarik = document.getElementById('tab-tarik');
    const formSetor = document.getElementById('form-setor'); const formTarik = document.getElementById('form-tarik');
    if (tab === 'setor') {
        btnSetor.className = "flex-1 py-3 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50";
        btnTarik.className = "flex-1 py-3 text-sm font-medium text-gray-500 hover:text-gray-700";
        formSetor.classList.remove('hidden-section'); formTarik.classList.add('hidden-section');
    } else {
        btnTarik.className = "flex-1 py-3 text-sm font-bold text-blue-600 border-b-2 border-blue-600 bg-blue-50/50";
        btnSetor.className = "flex-1 py-3 text-sm font-medium text-gray-500 hover:text-gray-700";
        formTarik.classList.remove('hidden-section'); formSetor.classList.add('hidden-section');
        loadDropdownNasabahTarik(); 
    }
}

function switchPengurusTab(tabName) {
    document.querySelectorAll('.pengurus-tab').forEach(t => {
        t.classList.remove('active-tab', 'border-emerald-500', 'text-emerald-600', 'font-bold');
        t.classList.add('border-transparent', 'text-gray-500', 'font-medium');
    });
    document.querySelectorAll('.pengurus-content').forEach(c => c.classList.add('hidden-section'));
    const activeBtn = document.querySelector(`button[onclick="switchPengurusTab('${tabName}')"]`);
    if(activeBtn) {
        activeBtn.classList.add('active-tab', 'border-emerald-500', 'text-emerald-600', 'font-bold');
        activeBtn.classList.remove('border-transparent', 'text-gray-500', 'font-medium');
    }
    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden-section');
    if(tabName === 'stok') loadStokData();
    if(tabName === 'laba-rugi') calculateLabaRugi();
}

async function loadStokData() {
    const periode = document.getElementById('filter-stok-periode')?.value || 'bulan';
    let startDate = new Date();
    if(periode === 'hari') startDate.setHours(0,0,0,0);
    else if(periode === 'bulan') startDate.setDate(1);
    else if(periode === 'tahun') { startDate.setMonth(0,1); startDate.setHours(0,0,0,0); }
    const { data: transaksi } = await supabaseClient.from('transaksi').select('*, jenis_sampah(nama_sampah)').eq('bank_sampah_id', currentProfile.bank_sampah_id).gte('tanggal_transaksi', startDate.toISOString()).order('tanggal_transaksi', {ascending: false});
    const stokMap = {};
    (transaksi || []).forEach(t => {
        const jsId = t.jenis_sampah_id;
        if(!stokMap[jsId]) stokMap[jsId] = { nama: t.jenis_sampah?.nama_sampah, masuk: 0, keluar: 0 };
        if(t.kategori_transaksi === 'beli') stokMap[jsId].masuk += t.berat_kg;
        else if(t.kategori_transaksi === 'jual_pdu') stokMap[jsId].keluar += t.berat_kg;
    });
    const tbody = document.getElementById('table-stok-body');
    if(tbody) {
        tbody.innerHTML = '';
        Object.values(stokMap).forEach(s => {
            tbody.innerHTML += `<tr><td class="px-4 py-3">${s.nama}</td><td class="px-4 py-3 text-right">${s.masuk.toFixed(2)}</td><td class="px-4 py-3 text-right">${s.keluar.toFixed(2)}</td><td class="px-4 py-3 text-right font-bold">${(s.masuk - s.keluar).toFixed(2)}</td></tr>`;
        });
    }
}

async function calculateLabaRugi() {
    const start = document.getElementById('lr-start-date')?.value;
    const end = document.getElementById('lr-end-date')?.value;
    const d = new Date();
    const defaultStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date().toISOString().split('T')[0];
    const startDate = start || defaultStart; const endDate = end || defaultEnd;
    if(document.getElementById('lr-start-date')) document.getElementById('lr-start-date').value = startDate;
    if(document.getElementById('lr-end-date')) document.getElementById('lr-end-date').value = endDate;
    const { data: jual } = await supabaseClient.from('penjualan').select('total_pendapatan').eq('bank_sampah_id', currentProfile.bank_sampah_id).gte('tanggal_jual', startDate).lte('tanggal_jual', endDate);
    const { data: beli } = await supabaseClient.from('transaksi').select('total_harga').eq('bank_sampah_id', currentProfile.bank_sampah_id).eq('kategori_transaksi', 'beli').gte('tanggal_transaksi', startDate).lte('tanggal_transaksi', endDate);
    const pendapatan = (jual || []).reduce((sum, j) => sum + j.total_pendapatan, 0);
    const beban = (beli || []).reduce((sum, b) => sum + b.total_harga, 0);
    const laba = pendapatan - beban;
    document.getElementById('lr-pendapatan').textContent = formatRupiah(pendapatan);
    document.getElementById('lr-beban').textContent = formatRupiah(beban);
    document.getElementById('lr-laba').textContent = formatRupiah(laba);
}

function exportStokToExcel() {
    const table = document.getElementById('table-stok'); if(!table) return;
    const wb = XLSX.utils.table_to_book(table, {sheet: "Stok"});
    XLSX.writeFile(wb, `Stok_Sampah_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportLabaRugiToExcel() {
    const data = [
        ["Laporan Laba Rugi - " + (document.getElementById('pengurus-nama-bs')?.textContent || '')],
        ["Periode", `${document.getElementById('lr-start-date')?.value} s/d ${document.getElementById('lr-end-date')?.value}`], [],
        ["Total Pendapatan", document.getElementById('lr-pendapatan')?.textContent],
        ["Total Beban", document.getElementById('lr-beban')?.textContent],
        ["Laba Bersih", document.getElementById('lr-laba')?.textContent]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laba Rugi");
    XLSX.writeFile(wb, `Laba_Rugi_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function openInvoiceModal(jenis) {
    const modal = document.getElementById('modal-cetak-dokumen');
    const title = document.getElementById('modal-dokumen-title');
    const preview = document.getElementById('dokumen-preview-area');
    if(!modal || !title || !preview) return;
    let judulDokumen = "";
    if(jenis === 'jual') judulDokumen = "Invoice Penjualan ke PDU";
    else if(jenis === 'serah-terima') judulDokumen = "Surat Serah Terima Barang";
    else if(jenis === 'kwitansi') judulDokumen = "Kwitansi Pembayaran";
    title.innerHTML = `<i class="fas fa-print text-blue-600"></i> ${judulDokumen}`;
    preview.innerHTML = `<div class="text-center"><i class="fas fa-file-pdf text-4xl text-gray-300 mb-2"></i><p class="text-gray-500 text-sm">Fitur generate PDF otomatis sedang dikembangkan.</p></div>`;
    modal.classList.remove('hidden-section');
}

function downloadDokumenPDF() {
    alert("Fitur download PDF akan segera hadir!");
}

// ==========================================
// NASABAH FUNCTIONS
// ==========================================

async function loadNasabahDashboard() {
    document.getElementById('nasabah-dashboard')?.classList.remove('hidden-section');
    const { data: nData } = await supabaseClient.from('nasabah').select('*').eq('profile_id', currentProfile.id).single();
    if(nData){
        document.getElementById('nasabah-nama').textContent=currentProfile.nama_lengkap;
        document.getElementById('nasabah-saldo-tabung').textContent=formatRupiah(nData.saldo_tabungan||0);
    }
    const { data: trx } = await supabaseClient.from('transaksi').select('*, jenis_sampah(nama_sampah, satuan)').eq('nasabah_id', nData?.id).order('tanggal_transaksi',{ascending:false});
    const lc=document.getElementById('nasabah-riwayat-list'); if(!lc) return; lc.innerHTML=''; let tb=0;
    (trx||[]).forEach(t=>{tb+=t.berat_kg; lc.innerHTML+=`<div class="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-100 shadow-sm"><div><p class="font-bold text-gray-900">${t.jenis_sampah?.nama_sampah}</p><p class="text-xs text-gray-500">${new Date(t.tanggal_transaksi).toLocaleDateString('id-ID')} • ${t.berat_kg} ${t.jenis_sampah?.satuan}</p></div><div class="text-right"><p class="font-bold text-emerald-700">${formatRupiah(t.total_harga)}</p><span class="text-[10px] px-2 py-0.5 rounded-full ${t.status_bayar==='dibayar'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}">${t.status_bayar==='dibayar'?'Dibayar':'Ditabung'}</span></div></div>`;});
    document.getElementById('nasabah-total-setor').textContent=tb.toFixed(1)+' Kg';
    const popular = ['PLASTIK PUTIH (PP)', 'KARDUS', 'BESI']; let msg = [];
    popular.forEach(nama => {
        const js = jenisSampahList.find(j => j.nama_sampah === nama);
        if (js && hargaOfftakerMap[js.id]) msg.push(`${nama}: ${formatRupiah(hargaOfftakerMap[js.id])}/kg`);
    });
    document.getElementById('nasabah-harga-update').textContent = msg.length > 0 ? msg.join(', ') : "Belum ada update harga terbaru.";
}

// ==========================================
// CHAT & UTILS
// ==========================================

function toggleChat() { document.getElementById('chat-window')?.classList.toggle('hidden-section'); }
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

function exportOfftakerCSV(){
    let csv = '\uFEFFNama Sampah,Harga\n'; 
    jenisSampahList.forEach(j=>{ const harga = hargaOfftakerMap[j.id] || 0; csv += `"${j.nama_sampah}",${harga}\n`; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Master_Harga_RAJIN_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function handleImportOfftaker(input){
    const f = input.files[0]; if(!f) return;
    try {
        const t = await f.text();
        const lines = t.split('\n').filter(line => line.trim() !== ''); 
        let successCount = 0; let errorCount = 0;
        for(let i = 1; i < lines.length; i++) {
            const line = lines[i].trim(); if(!line) continue;
            const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if(!matches || matches.length < 2) { errorCount++; continue; }
            let namaSampah = matches[0].replace(/"/g, '').trim();
            let hargaStr = matches[1].replace(/"/g, '').replace(/[^\d.-]/g, '').trim();
            let harga = parseFloat(hargaStr); if(isNaN(harga)) { errorCount++; continue; }
            const js = jenisSampahList.find(x => x.nama_sampah.toLowerCase() === namaSampah.toLowerCase() || x.nama_sampah.toLowerCase().includes(namaSampah.toLowerCase()) || namaSampah.toLowerCase().includes(x.nama_sampah.toLowerCase()));
            if(js) { const { error } = await supabaseClient.from('harga_offtaker').upsert({ jenis_sampah_id: js.id, bank_sampah_id: null, harga_per_kg: harga }, { onConflict: 'jenis_sampah_id, bank_sampah_id' }); if(!error) successCount++; else errorCount++; }
            else errorCount++;
        }
        let msg = `Import selesai!\n✅ Berhasil: ${successCount} data\n❌ Gagal/Skip: ${errorCount} data`;
        if(errorCount > 0) msg += '\n\n(Cek apakah nama sampah di CSV sama dengan Master Data)';
        alert(msg); loadTableHargaOfftaker(); loadMasterData(); input.value = ''; 
    } catch(err) { alert('Error saat memproses file: ' + err.message); }
}

function toggleModal(id){document.getElementById(id)?.classList.toggle('hidden-section');}
window.addEventListener('DOMContentLoaded', initApp);
