/**
 * PENGURUS MODULE
 * Menangani semua logika khusus untuk role Pengurus
 * Terintegrasi dengan addon.js dan account-manager.js
 */

// --- LOAD DASHBOARD PENGURUS ---
async function loadPengurusDashboard() {
    document.getElementById('pengurus-dashboard').classList.remove('hidden-section');
    
    // 1. Load Info Bank Sampah
    const { data: bs } = await supabaseClient.from('bank_sampah').select('*').eq('id', currentProfile.bank_sampah_id).single();
    document.getElementById('pengurus-nama-bs').textContent = bs?.nama_bank || 'Bank Sampah Saya';
    
    // 2. Load Total Tabungan Semua Nasabah di BS ini
    const { data: allNasabah } = await supabaseClient.from('nasabah').select('saldo_tabungan').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const totalTabungan = (allNasabah || []).reduce((sum, n) => sum + (n.saldo_tabungan || 0), 0);
    document.getElementById('pengurus-total-tabungan').textContent = formatRupiah(totalTabungan);
    
    // 3. Load & Tampilkan Harga Berlaku (Offtaker - 30%)
    const hargaListEl = document.getElementById('pengurus-harga-list');
    if(hargaListEl) {
        hargaListEl.innerHTML = '';
        const popularSampah = ['PLASTIK PUTIH (PP)', 'KARDUS', 'BESI', 'BOTOL BELING', 'ALUMINIUM PANCI'];
        
        jenisSampahList.forEach(js => {
            if (popularSampah.some(p => js.nama_sampah.includes(p))) {
                const hargaOfftaker = hargaOfftakerMap[js.id] || 0;
                const hargaNasabah = Math.round(hargaOfftaker * 0.7); // Kurangi 30%
                hargaListEl.innerHTML += `
                    <div class="bg-white/5 rounded p-1.5 border border-white/5">
                        <p class="text-[9px] text-emerald-200 truncate">${js.nama_sampah}</p>
                        <p class="font-bold text-white">${formatRupiah(hargaNasabah)}</p>
                    </div>
                `;
            }
        });
    }

    // 4. Load Pending Users (Approval Anggota)
    const { data: pending } = await supabaseClient.from('profiles').select('*').eq('role', 'pending').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    const tb = document.getElementById('table-pending-pengurus'); 
    if(tb) {
        tb.innerHTML = '';
        if (!pending || pending.length === 0) {
            tb.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-xs text-gray-400">Tidak ada anggota pending.</td></tr>';
        } else {
            (pending||[]).forEach(u => { 
                tb.innerHTML += `<tr><td class="py-3 px-4 font-medium text-sm">${u.nama_lengkap}</td><td class="py-3 px-4 text-right"><button onclick="approveUserByPengurus('${u.id}')" class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">Accept</button></td></tr>`; 
            });
        }
    }

    // 5. Load Dropdown Nasabah (Untuk Setor & Tarik)
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

    // 6. Load Dropdown Jenis Sampah (DARI MASTER DATA) & Hitung Harga Nasabah
    const selJ = document.getElementById('trx-jenis'); 
    if(selJ) {
        selJ.innerHTML = '<option value="">-- Pilih Jenis Sampah --</option>';
        
        // Load custom harga per BS jika ada (tabel harga_nasabah)
        const { data: hn } = await supabaseClient.from('harga_nasabah').select('*').eq('bank_sampah_id', currentProfile.bank_sampah_id);
        const hnm = {}; (hn||[]).forEach(h => hnm[h.jenis_sampah_id] = h);

        jenisSampahList.forEach(js => {
            const hd = hargaOfftakerMap[js.id] || 0; 
            const st = hnm[js.id];
            let fp = 0; 
            
            // LOGIKA HARGA: Jika ada custom price pakai itu, jika tidak pakai Offtaker - 30%
            if(st) { 
                if(st.mode_harga==='custom'){ fp=st.harga_custom; } 
                else if(st.mode_harga==='offtaker'){ fp=hd; } 
                else { fp=hd*(1-st.persentase/100); } 
            } else { 
                fp = Math.round(hd * 0.7); // DEFAULT: Kurangi 30% dari harga off-taker
            }
            
            const opt = document.createElement('option'); 
            opt.value = js.id; 
            opt.textContent = `${js.nama_sampah} (${formatRupiah(fp)})`; // Tampilkan harga di dropdown
            opt.dataset.harga = fp; 
            opt.dataset.satuan = js.satuan || 'Kg'; 
            selJ.appendChild(opt);
        });
    }

    await loadDropdownNasabahTarik();
    loadRecentTransactions();
}

// --- FUNGSI DAFTAR NASABAH BARU (KHUSUS PENGURUS) ---
function openRegisterNasabahModal() {
    toggleModal('modal-register-nasabah');
}

document.getElementById('form-register-nasabah')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mendaftar...';
    btn.disabled = true;

    try {
        const nama = document.getElementById('reg-nasabah-nama').value;
        const hp = document.getElementById('reg-nasabah-hp').value;
        const alamat = document.getElementById('reg-nasabah-alamat').value;
        const email = document.getElementById('reg-nasabah-email').value || `nasabah_${Date.now()}@rajin.temp`; // Auto-generate email jika kosong
        const password = document.getElementById('reg-nasabah-pass').value;

        // 1. Buat Auth User
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { nama_lengkap: nama, no_hp: hp, alamat: alamat }
            }
        });

        if (authError) throw authError;
        const userId = authData.user.id;

        // 2. Insert Profile (Role: nasabah, Status: active Langsung)
        const { error: profileError } = await supabaseClient.from('profiles').insert({
            id: userId,
            role: 'nasabah', // LANGSUNG NASABAH, TIDAK PERLU APPROVE
            status: 'active',
            nama_lengkap: nama,
            no_hp: hp,
            alamat: alamat,
            bank_sampah_id: currentProfile.bank_sampah_id
        });

        if (profileError) throw profileError;

        // 3. Insert ke Tabel Nasabah (Saldo 0)
        await supabaseClient.from('nasabah').insert({
            profile_id: userId,
            bank_sampah_id: currentProfile.bank_sampah_id,
            saldo_tabungan: 0
        });

        alert(`✅ Nasabah "${nama}" berhasil didaftarkan!\n\nEmail: ${email}\nPassword: ${password}\n\n⚠️ PENTING: Jalankan script ini di SQL Editor agar user bisa login tanpa verifikasi email:\n\nUPDATE auth.users SET email_confirmed_at = NOW() WHERE id = '${userId}';`);
        
        toggleModal('modal-register-nasabah');
        e.target.reset();
        loadPengurusDashboard(); // Refresh dropdown nasabah
        
    } catch (err) {
        alert('Gagal mendaftarkan nasabah: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// --- UPDATE PREVIEW HARGA SAAT INPUT SETOR ---
function updateTrxPreview() { 
    const s = document.getElementById('trx-jenis'); 
    const b = parseFloat(document.getElementById('trx-berat').value) || 0; 
    const o = s.options[s.selectedIndex]; 
    
    if(o && o.value){
        const harga = parseFloat(o.dataset.harga) || 0;
        const total = harga * b;
        document.getElementById('trx-preview-total').textContent = formatRupiah(total);
        document.getElementById('trx-harga-detail').textContent = `Harga: ${formatRupiah(harga)} x ${b} Kg`;
        document.getElementById('trx-satuan-label').textContent = o.dataset.satuan || 'Kg';
    } else {
        document.getElementById('trx-preview-total').textContent = 'Rp 0';
        document.getElementById('trx-harga-detail').textContent = 'Harga Offtaker - 30%';
    }
}

// --- APPROVE USER OLEH PENGURUS ---
async function approveUserByPengurus(userId) {
    const result = await approveUserAccount(userId, 'nasabah', currentProfile.bank_sampah_id);
    if(result.success) { alert('Nasabah berhasil di-accept!'); loadPengurusDashboard(); }
    else { alert('Gagal: ' + result.message); }
}

// --- HELPER FUNCTIONS (Dipanggil dari addon.js saat init) ---
async function loadDropdownNasabahTarik() {
    const select = document.getElementById('tarik-nasabah'); 
    if(!select) return;
    select.innerHTML = '<option value="">-- Pilih Nasabah --</option>';
    const { data } = await supabaseClient.from('nasabah').select('*, profiles(nama_lengkap)').eq('bank_sampah_id', currentProfile.bank_sampah_id);
    (data || []).forEach(n => { select.innerHTML += `<option value="${n.id}" data-saldo="${n.saldo_tabungan || 0}">${n.profiles?.nama_lengkap}</option>`; });
}

function loadSaldoNasabah() {
    const select = document.getElementById('tarik-nasabah');
    if(!select) return;
    const selectedOpt = select.options[select.selectedIndex];
    const saldo = selectedOpt ? parseFloat(selectedOpt.dataset.saldo) || 0 : 0;
    document.getElementById('tarik-saldo-display').textContent = formatRupiah(saldo);
}

async function loadRecentTransactions() {
    const container = document.getElementById('list-riwayat-transaksi'); 
    if(!container) return;
    container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Memuat...</div>';
    const { data } = await supabaseClient.from('transaksi').select('*, jenis_sampah(nama_sampah), nasabah(profiles(nama_lengkap))').eq('bank_sampah_id', currentProfile.bank_sampah_id).order('tanggal_transaksi', { ascending: false }).limit(10);
    container.innerHTML = '';
    if (!data || data.length === 0) { container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Belum ada transaksi.</div>'; return; }
    data.forEach(t => {
        container.innerHTML += `<div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm"><div class="flex items-center gap-3"><div class="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0"><i class="fas fa-recycle text-xs"></i></div><div><p class="font-bold text-gray-800">${t.nasabah?.profiles?.nama_lengkap || 'Nasabah'}</p><p class="text-[10px] text-gray-500">${new Date(t.tanggal_transaksi).toLocaleDateString('id-ID')}</p></div></div><div class="text-right"><p class="font-bold text-emerald-600">${formatRupiah(t.total_harga)}</p><p class="text-[10px] text-gray-400">${t.jenis_sampah?.nama_sampah}</p></div></div>`;
    });
}

// Event Listener Form Tarik Dana
document.getElementById('form-tarik')?.addEventListener('submit', async (e) => {
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

// Event Listener Form Setor Sampah
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

// Fungsi Switch Tab Transaksi
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
