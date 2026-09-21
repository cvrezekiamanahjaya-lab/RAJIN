// KONFIGURASI SUPABASE
const SUPABASE_URL = 'https://woqifznkmbsjxelzhmjk.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_3iBnO0BYibh8Y8WJwXI0hg_X3iho_pj'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null, currentProfile = null, jenisSampahList = [], hargaOfftakerMap = {}; 

// --- INITIALIZATION ---
async function initApp() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await handleLoginSuccess(session.user);
    else showSection('login-page');
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
    const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) { alert('Error mengambil data profil.'); await doLogout(); return; }
    if (profile.role === 'pending') { showSection('pending-page'); return; }
    
    currentProfile = profile;
    document.getElementById('user-name').textContent = profile.nama_lengkap;
    document.getElementById('user-role').textContent = profile.role;
    await loadMasterData();
    showSection('app-container');
    
    if (profile.role === 'admin') await loadAdminDashboard();
    else if (profile.role === 'pengurus') await loadPengurusDashboard();
    else if (profile.role === 'nasabah') await loadNasabahDashboard();
}

async function doLogout() { await supabaseClient.auth.signOut(); window.location.reload(); }
function showSection(id) { ['login-page', 'pending-page', 'app-container'].forEach(s => { const el = document.getElementById(s); if(el) { el.classList.add('hidden-section'); el.classList.remove('active-section'); } }); const t = document.getElementById(id); if(t) { t.classList.remove('hidden-section'); t.classList.add('active-section'); } }

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

function switchAdminTab(t) { 
    document.querySelectorAll('.admin-tab').forEach(b => { b.className = 'admin-tab border-transparent text-gray-500 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm'; }); 
    event.currentTarget.className = 'admin-tab active-tab border-emerald-500 text-emerald-600 whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm'; 
    document.querySelectorAll('.admin-content').forEach(c => c.classList.add('hidden-section')); 
    document.getElementById(`tab-${t}`).classList.remove('hidden-section'); 
}

async function loadTableBankSampah() { const { data } = await supabaseClient.from('bank_sampah').select('*').order('created_at', { ascending: false }); const tb = document.getElementById('table-bs-body'); tb.innerHTML = ''; (data||[]).forEach(r => tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${r.nama_bank}</td><td class="px-6 py-4 text-gray-600">${r.alamat||'-'}</td><td class="px-6 py-4 text-gray-600">${r.no_hp||'-'}</td></tr>`); }

// FUNGSI LOAD TABEL HARGA DENGAN TOMBOL EDIT MANUAL
async function loadTableHargaOfftaker() { 
    const { data } = await supabaseClient.from('harga_offtaker').select('*, jenis_sampah(nama_sampah)').is('bank_sampah_id', null).order('jenis_sampah(nama_sampah)'); 
    const tb = document.getElementById('table-offtaker-body'); 
    tb.innerHTML = ''; 
    
    // Pastikan header tabel punya kolom Aksi
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

// FUNGSI EDIT HARGA MANUAL
async function editHargaManual(jenisId, namaSampah, hargaLama) {
    const newHarga = prompt(`Edit Harga untuk:\n${namaSampah}\n\nHarga Lama: ${formatRupiah(hargaLama)}\n\nMasukkan Harga Baru (angka saja):`, hargaLama);
    
    if (newHarga === null) return; // User cancel
    
    const hargaBaru = parseFloat(newHarga.replace(/[^\d.-]/g, '')); // Bersihkan karakter non-angka
    
    if (isNaN(hargaBaru) || hargaBaru < 0) {
        alert("Harga tidak valid! Masukkan angka saja.");
        return;
    }

    const { error } = await supabaseClient
        .from('harga_offtaker')
        .update({ harga_per_kg: hargaBaru })
        .eq('jenis_sampah_id', jenisId)
        .is('bank_sampah_id', null);

    if (error) {
        alert("Gagal update harga: " + error.message);
    } else {
        alert("Harga berhasil diubah!");
        loadTableHargaOfftaker(); // Refresh tabel
        loadMasterData(); // Update variabel global
    }
}

async function loadPendingUsersAdmin() {
    const { data } = await supabaseClient.from('profiles').select('*').eq('role', 'pending');
    const tb = document.getElementById('table-pending-admin'); tb.innerHTML = '';
    if (!data || data.length === 0) { tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">Tidak ada user pending.</td></tr>'; return; }
    (data||[]).forEach(u => { tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${u.nama_lengkap}</td><td class="px-6 py-4 text-gray-600">${u.email || '-'}</td><td class="px-6 py-4 text-gray-600">${u.no_hp||'-'}</td><td class="px-6 py-4"><button onclick="openApproveModal('${u.id}')" class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">Approve</button></td></tr>`; });
}

async function loadActiveUsersAdmin() {
    const { data } = await supabaseClient.from('profiles').select('*, bank_sampah(nama_bank)').neq('role', 'pending').order('created_at', {ascending: false});
    const tb = document.getElementById('table-active-admin'); if(!tb) return;
    tb.innerHTML = '';
    if (!data || data.length === 0) { tb.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">Belum ada user aktif.</td></tr>'; return; }
    (data||[]).forEach(u => { 
        tb.innerHTML += `<tr><td class="px-6 py-4 font-bold">${u.nama_lengkap}</td><td class="px-6 py-4"><span class="px-2 py-1 rounded text-xs font-bold ${u.role==='admin'?'bg-purple-100 text-purple-700':u.role==='pengurus'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}">${u.role.toUpperCase()}</span></td><td class="px-6 py-4 text-gray-600">${u.bank_sampah?.nama_bank || '-'}</td><td class="px-6 py-4"><button onclick="resetPasswordAdmin('${u.id}', '${u.email}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold mr-2" title="Reset Password"><i class="fas fa-key"></i> Reset Pass</button><button onclick="editUserRole('${u.id}')" class="text-gray-600 hover:text-gray-800 text-xs font-bold" title="Edit Role"><i class="fas fa-edit"></i> Edit</button></td></tr>`; 
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
    await supabaseClient.from('profiles').update({ role: role, bank_sampah_id: bankId }).eq('id', userId);
    if (role === 'nasabah') await supabaseClient.from('nasabah').upsert({ profile_id: userId, bank_sampah_id: bankId }, { onConflict: 'profile_id' });
    alert('User berhasil di-approve!'); toggleModal('modal-approve-user'); loadPendingUsersAdmin(); loadActiveUsersAdmin();
}

// --- MANUAL USER CREATION (ADMIN) ---
async function openCreateUserModal() {
    const sel = document.getElementById('new-user-bs');
    sel.innerHTML = '<option value="">-- Tanpa Bank Sampah --</option>';
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').order('nama_bank');
    (bs||[]).forEach(b => sel.innerHTML += `<option value="${b.id}">${b.nama_bank}</option>`);
    toggleModal('modal-create-user');
}

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

        const tempId = crypto.randomUUID(); 
        
        const { error: profileError } = await supabaseClient.from('profiles').insert({
            id: tempId, role: 'pending', status: 'active', nama_lengkap: nama, no_hp: '-', alamat: '-', bank_sampah_id: bankId
        });

        if (profileError) throw profileError;

        alert(`✅ Entry Profil Berhasil Dibuat!\n\n⚠️ LANGKAH TERAKHIR (WAJIB):\nKarena keamanan browser, Anda harus membuat User Auth secara manual via SQL Editor agar bisa login.\n\nCopy script ini ke SQL Editor:\n\nINSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) VALUES ('00000000-0000-0000-0000-000000000000', '${tempId}', 'authenticated', 'authenticated', '${email}', crypt('${password}', gen_salt('bf')), NOW(), '{\"provider\":\"email\",\"providers\":[\"email\"]}', '{\"nama_lengkap\":\"${nama}\"}', NOW(), NOW(), '', '', '', '');\n\nSetelah itu, approve user ini di dashboard!`);
        
        toggleModal('modal-create-user');
        e.target.reset();
        loadPendingUsersAdmin(); 
        loadActiveUsersAdmin();
        
    } catch (err) {
        alert('Gagal membuat entry profil: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// --- FUNGSI LOAD DATA UNTUK TAB PDU ---
async function loadPduData() {
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').order('nama_bank');
    const selBs1 = document.getElementById('pdu-bs-select');
    const selBs2 = document.getElementById('kirim-bs-select');
    if(selBs1) {
        selBs1.innerHTML = '<option value="">-- Pilih Bank Sampah --</option>';
        selBs2.innerHTML = '<option value="">-- Pilih Bank Sampah --</option>';
        (bs||[]).forEach(b => {
            selBs1.innerHTML += `<option value="${b.id}">${b.nama_bank}</option>`;
            selBs2.innerHTML += `<option value="${b.id}">${b.nama_bank}</option>`;
        });
    }

    const selJenis = document.getElementById('kirim-jenis-select');
    if(selJenis) {
        selJenis.innerHTML = '<option value="">-- Pilih Jenis Sampah --</option>';
        jenisSampahList.forEach(js => {
            selJenis.innerHTML += `<option value="${js.id}" data-harga="${hargaOfftakerMap[js.id] || 0}">${js.nama_sampah}</option>`;
        });
        
        selJenis.addEventListener('change', function() {
            const opt = this.options[this.selectedIndex];
            document.getElementById('kirim-harga').value = opt.dataset.harga || '';
        });
    }
}

async function loadNasabahForAdmin() {
    const bsId = document.getElementById('pdu-bs-select').value;
    const selNasabah = document.getElementById('pdu-nasabah-select');
    selNasabah.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    document.getElementById('pdu-saldo-display').textContent = 'Rp 0';
    
    if (!bsId) return;

    const { data } = await supabaseClient.from('nasabah').select('*, profiles(nama_lengkap)').eq('bank_sampah_id', bsId);
    (data||[]).forEach(n => {
        selNasabah.innerHTML += `<option value="${n.id}" data-saldo="${n.saldo_tabungan || 0}">${n.profiles?.nama_lengkap}</option>`;
    });
}

function checkSaldoNasabah() {
    const sel = document.getElementById('pdu-nasabah-select');
    const opt = sel.options[sel.selectedIndex];
    const saldo = opt ? parseFloat(opt.dataset.saldo) || 0 : 0;
    document.getElementById('pdu-saldo-display').textContent = formatRupiah(saldo);
}

// --- HANDLE FORM PENGAMBILAN SALDO (ADMIN) ---
document.getElementById('admin-form-penarikan')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nasabahId = document.getElementById('pdu-nasabah-select').value;
    const nominal = parseFloat(document.getElementById('pdu-nominal').value);
    
    if (!nasabahId || !nominal || nominal <= 0) { alert('Lengkapi data penarikan!'); return; }
    
    const { data: nData } = await supabaseClient.from('nasabah').select('saldo_tabungan, bank_sampah_id, profile_id').eq('id', nasabahId).single();
    if (!nData || nData.saldo_tabungan < nominal) { 
        alert(`Saldo tidak cukup! Saldo tersedia: ${formatRupiah(nData?.saldo_tabungan || 0)}`); 
        return; 
    }

    await supabaseClient.from('nasabah').update({ saldo_tabungan: nData.saldo_tabungan - nominal }).eq('id', nasabahId);

    await supabaseClient.from('transaksi').insert({
        bank_sampah_id: nData.bank_sampah_id,
        nasabah_id: nasabahId,
        jenis_sampah_id: null,
        berat_kg: 0,
        harga_saat_transaksi: 0,
        total_harga: nominal,
        kategori_transaksi: 'penarikan',
        status_bayar: 'dibayar',
        tanggal_transaksi: new Date().toISOString()
    });

    alert('Pengambilan saldo berhasil dicatat!');
    e.target.reset();
    document.getElementById('pdu-saldo-display').textContent = 'Rp 0';
});

// --- HANDLE FORM PENGIRIMAN KE PDU ---
document.getElementById('admin-form-kirim-pdu')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bsId = document.getElementById('kirim-bs-select').value;
    const jsId = document.getElementById('kirim-jenis-select').value;
    const berat = parseFloat(document.getElementById('kirim-berat').value);
    const harga = parseFloat(document.getElementById('kirim-harga').value);
    const pembeli = document.getElementById('kirim-pembeli').value;

    if (!bsId || !jsId || !berat || !harga) { alert('Lengkapi data pengiriman!'); return; }

    const { error } = await supabaseClient.from('penjualan').insert({
        bank_sampah_id: bsId,
        jenis_sampah_id: jsId,
        berat_kg: berat,
        harga_jual_per_kg: harga,
        total_pendapatan: berat * harga,
        nama_pembeli: pembeli || 'PDU / Offtaker',
        tanggal_jual: new Date().toISOString()
    });

    if (error) {
        await supabaseClient.from('transaksi').insert({
            bank_sampah_id: bsId,
            nasabah_id: null,
            jenis_sampah_id: jsId,
            berat_kg: berat,
            harga_saat_transaksi: harga,
            total_harga: berat * harga,
            kategori_transaksi: 'beli',
            status_bayar: 'dibayar'
        });
    }

    alert('Pengiriman ke PDU berhasil dicatat!');
    e.target.reset();
});

// --- MANAJEMEN USER: RESET PASSWORD & EDIT ---
async function resetPasswordAdmin(userId, email) {
    const newPass = prompt(`Masukkan password baru untuk user ${email}:`, "Rajin123!");
    if (!newPass) return;
    alert(`⚠️ INSTRUKSI RESET PASSWORD MANUAL\n\nKarena alasan keamanan browser, reset password harus dilakukan via SQL Editor.\n\nSilakan copy-paste script ini ke Supabase SQL Editor:\n\nUPDATE auth.users SET encrypted_password = crypt('${newPass}', gen_salt('bf')) WHERE id = '${userId}';\n\nSetelah dijalankan, user bisa login dengan password baru.`);
}

async function editUserRole(userId) {
    const newRole = prompt("Ubah role user (admin/pengurus/nasabah):");
    if (!newRole || !['admin', 'pengurus', 'nasabah'].includes(newRole.toLowerCase())) {
        alert("Role tidak valid!"); return;
    }
    await supabaseClient.from('profiles').update({ role: newRole.toLowerCase() }).eq('id', userId);
    alert("Role berhasil diubah!");
    loadActiveUsersAdmin();
}

// --- PENGURUS FUNCTIONS (PDU) ---
async function loadPengurusDashboard() {
    document.getElementById('pengurus-dashboard').classList.remove('hidden-section');
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').eq('id', currentProfile.bank_sampah_id).single();
    document.getElementById('pengurus-nama-bs').textContent = bs?.nama_bank || 'Bank Sampah Saya';
    
    const { data: pending } = await supabaseClient.from('profiles').select('*').eq('role', 'pending').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const tb = document.getElementById('table-pending-pengurus'); tb.innerHTML = '';
    (pending||[]).forEach(u => { tb.innerHTML += `<tr><td class="py-3 px-4 font-medium">${u.nama_lengkap}</td><td class="py-3 px-4 text-right"><button onclick="approveUserByPengurus('${u.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">Accept</button></td></tr>`; });

    const { data: nasabah } = await supabaseClient.from('nasabah').select('*, profiles(nama_lengkap)').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const selN = document.getElementById('trx-nasabah'); selN.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    (nasabah||[]).forEach(n => selN.innerHTML += `<option value="${n.id}">${n.profiles?.nama_lengkap}</option>`);

    const selJ = document.getElementById('trx-jenis'); selJ.innerHTML = '<option value="">-- Pilih Sampah --</option>';
    const { data: hn } = await supabaseClient.from('harga_nasabah').select('*').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const hnm = {}; (hn||[]).forEach(h => hnm[h.jenis_sampah_id] = h);
    
    jenisSampahList.forEach(js => {
        const hd = hargaOfftakerMap[js.id] || 0; const st = hnm[js.id];
        let fp = 0; let ml = 'Persen (30%)';
        if(st) { if(st.mode_harga==='custom'){fp=st.harga_custom;ml='Custom'} else if(st.mode_harga==='offtaker'){fp=hd;ml='Ikut Offtaker'} else {fp=hd*(1-st.persentase/100);ml=`Persen (${st.persentase}%)`} } else { fp=hd*0.7; }
        const opt = document.createElement('option'); opt.value=js.id; opt.textContent=js.nama_sampah; opt.dataset.harga=fp; opt.dataset.satuan=js.satuan; selJ.appendChild(opt);
    });

    await loadDropdownNasabahTarik();
    loadRecentTransactions();
}

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

async function loadDropdownNasabahTarik() {
    const select = document.getElementById('tarik-nasabah'); select.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    const { data } = await supabaseClient.from('nasabah').select('*, profiles(nama_lengkap)').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    (data || []).forEach(n => { select.innerHTML += `<option value="${n.id}" data-saldo="${n.saldo_tabungan || 0}">${n.profiles?.nama_lengkap}</option>`; });
}

function loadSaldoNasabah() {
    const select = document.getElementById('tarik-nasabah');
    const selectedOpt = select.options[select.selectedIndex];
    const saldo = selectedOpt ? parseFloat(selectedOpt.dataset.saldo) || 0 : 0;
    document.getElementById('tarik-saldo-display').textContent = formatRupiah(saldo);
}

document.getElementById('form-tarik').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nasabahId = document.getElementById('tarik-nasabah').value;
    const nominal = parseFloat(document.getElementById('tarik-nominal').value);
    if (!nasabahId || !nominal || nominal <= 0) { alert('Mohon lengkapi data penarikan!'); return; }
    const { data: nData } = await supabaseClient.from('nasabah').select('saldo_tabungan').eq('id', nasabahId).single();
    if (!nData || nData.saldo_tabungan < nominal) { alert('Saldo tidak mencukupi!'); return; }
    
    await supabaseClient.from('nasabah').update({ saldo_tabungan: nData.saldo_tabungan - nominal }).eq('id', nasabahId);
    alert(`Penarikan ${formatRupiah(nominal)} berhasil!`);
    e.target.reset(); document.getElementById('tarik-saldo-display').textContent = 'Rp 0';
    loadPengurusDashboard();
});

async function approveUserByPengurus(userId) {
    await supabaseClient.from('profiles').update({ role: 'nasabah' }).eq('id', userId);
    await supabaseClient.from('nasabah').upsert({ profile_id: userId, bank_sampah_id: currentProfile.bank_sampah_id }, { onConflict: 'profile_id' });
    alert('Nasabah berhasil di-accept!'); loadPengurusDashboard();
}

function updateTrxPreview() { const s=document.getElementById('trx-jenis'); const b=parseFloat(document.getElementById('trx-berat').value)||0; const o=s.options[s.selectedIndex]; if(o&&o.value){document.getElementById('trx-preview-total').textContent=formatRupiah((parseFloat(o.dataset.harga)||0)*b);}else{document.getElementById('trx-preview-total').textContent='Rp 0';} }

document.getElementById('form-setor').addEventListener('submit', async(e)=>{
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

async function loadRecentTransactions() {
    const container = document.getElementById('list-riwayat-transaksi'); container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Memuat...</div>';
    const { data } = await supabaseClient.from('transaksi').select('*, jenis_sampah(nama_sampah), nasabah(profiles(nama_lengkap))').eq('bank_sampah_id', currentProfile.bank_sampah_id).order('tanggal_transaksi', { ascending: false }).limit(10);
    container.innerHTML = '';
    if (!data || data.length === 0) { container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Belum ada transaksi.</div>'; return; }
    data.forEach(t => {
        container.innerHTML += `<div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm"><div class="flex items-center gap-3"><div class="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0"><i class="fas fa-recycle text-xs"></i></div><div><p class="font-bold text-gray-800">${t.nasabah?.profiles?.nama_lengkap || 'Nasabah'}</p><p class="text-[10px] text-gray-500">${new Date(t.tanggal_transaksi).toLocaleDateString('id-ID')}</p></div></div><div class="text-right"><p class="font-bold text-emerald-600">${formatRupiah(t.total_harga)}</p><p class="text-[10px] text-gray-400">${t.jenis_sampah?.nama_sampah}</p></div></div>`;
    });
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

// --- EXPORT & IMPORT CSV (FIXED & SYNCED) ---
function exportOfftakerCSV(){
    // Format Export yang pasti bisa di-import ulang
    let csv = '\uFEFFNama Sampah,Harga\n'; 
    jenisSampahList.forEach(j=>{
        const harga = hargaOfftakerMap[j.id] || 0;
        // Pakai kutip untuk nama sampah biar aman kalau ada koma
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
        let successCount = 0;
        let errorCount = 0;
        
        // Lewati header (baris pertama)
        for(let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if(!line) continue;
            
            // Regex pintar buat handle CSV dengan koma di dalam kutip
            const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if(!matches || matches.length < 2) {
                errorCount++;
                continue;
            }
            
            let namaSampah = matches[0].replace(/"/g, '').trim();
            let hargaStr = matches[1].replace(/"/g, '').replace(/[^\d.-]/g, '').trim();
            let harga = parseFloat(hargaStr);
            
            if(isNaN(harga)) {
                errorCount++;
                continue;
            }
            
            // Cari ID jenis sampah yang cocok (case insensitive & partial match)
            const js = jenisSampahList.find(x => 
                x.nama_sampah.toLowerCase() === namaSampah.toLowerCase() ||
                x.nama_sampah.toLowerCase().includes(namaSampah.toLowerCase()) ||
                namaSampah.toLowerCase().includes(x.nama_sampah.toLowerCase())
            );
            
            if(js) {
                const { error } = await supabaseClient
                    .from('harga_offtaker')
                    .upsert(
                        { 
                            jenis_sampah_id: js.id, 
                            bank_sampah_id: null, 
                            harga_per_kg: harga 
                        },
                        { onConflict: 'jenis_sampah_id, bank_sampah_id' }
                    );
                    
                if(!error) successCount++;
                else errorCount++;
            } else {
                errorCount++; 
            }
        }
        
        let msg = `Import selesai!\n✅ Berhasil: ${successCount} data\n❌ Gagal/Skip: ${errorCount} data`;
        if(errorCount > 0) msg += '\n\n(Cek apakah nama sampah di CSV sama dengan Master Data)';
        
        alert(msg);
        loadTableHargaOfftaker(); 
        loadMasterData(); // Update variabel global biar real-time
        input.value = ''; 
        
    } catch(err) {
        alert('Error saat memproses file: ' + err.message);
    }
}

function toggleModal(id){document.getElementById(id).classList.toggle('hidden-section');}

// Start App
window.addEventListener('DOMContentLoaded', initApp);
