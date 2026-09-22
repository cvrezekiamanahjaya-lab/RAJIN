// --- FIX: DAFTAR NASABAH BARU (HANDLE EMAIL INVALID/DUPLICATE & PASSWORD SALAH) ---
document.getElementById('form-register-nasabah')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // VALIDASI FORM DASAR
    const nama = document.getElementById('reg-nasabah-nama').value.trim();
    const hp = document.getElementById('reg-nasabah-hp').value.trim();
    const alamat = document.getElementById('reg-nasabah-alamat').value.trim();
    let email = document.getElementById('reg-nasabah-email').value.trim();
    const password = document.getElementById('reg-nasabah-pass').value;

    if(!nama || !hp || !alamat) {
        alert('Nama, No HP, dan Alamat wajib diisi!');
        return;
    }
    if(password.length < 6) {
        alert('Password minimal 6 karakter!');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mendaftar...';
    btn.disabled = true;

    try {
        // Generate email otomatis jika kosong
        if (!email) {
            email = `nasabah_${Date.now()}@rajin.temp`;
        } else {
            // Validasi format email sederhana
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if(!emailRegex.test(email)) {
                throw new Error('Format email tidak valid!');
            }
        }

        let userId;
        let isNewUser = true;

        // Coba signUp dulu
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { nama_lengkap: nama, no_hp: hp, alamat: alamat }
            }
        });

        if (authError) {
            // Handle error "Email already registered" atau "Invalid email"
            if (authError.message.toLowerCase().includes('already registered') || 
                authError.message.toLowerCase().includes('invalid')) {
                
                console.log("Email sudah terdaftar, mencoba login untuk mendapatkan UID...");
                
                const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (loginError) {
                    // Jika login gagal, berarti password beda
                    // Beri opsi ke user: pakai email lain ATAU reset password via Admin
                    const useOtherEmail = confirm(`Email "${email}" sudah terdaftar tapi password yang kamu masukkan salah.\n\nApakah kamu mau pakai email lain? (Klik OK untuk ganti email, Klik Cancel untuk batal)`);
                    
                    if(useOtherEmail) {
                        // Biarkan user isi ulang email di form
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        document.getElementById('reg-nasabah-email').value = '';
                        document.getElementById('reg-nasabah-email').focus();
                        alert('Silakan masukkan email lain yang belum terdaftar.');
                        return; // Stop eksekusi, biarkan user isi ulang
                    } else {
                        throw new Error(`Pendaftaran dibatalkan. Silakan hubungi Admin untuk reset password email "${email}" atau gunakan email lain.`);
                    }
                }

                userId = loginData.user.id;
                isNewUser = false;
                
                // Logout lagi biar session pengurus tetap aman
                await supabaseClient.auth.signOut();
                
            } else {
                throw authError;
            }
        } else {
            userId = authData.user.id;
        }

        // Insert/Update Profile dengan bank_sampah_id milik pengurus
        const { error: profileError } = await supabaseClient.from('profiles').upsert({
            id: userId,
            role: 'nasabah', 
            status: 'active',
            nama_lengkap: nama,
            no_hp: hp,
            alamat: alamat,
            bank_sampah_id: currentProfile.bank_sampah_id 
        }, { onConflict: 'id' });

        if (profileError) throw profileError;

        // Insert ke Tabel Nasabah (Saldo 0)
        await supabaseClient.from('nasabah').upsert({
            profile_id: userId,
            bank_sampah_id: currentProfile.bank_sampah_id,
            saldo_tabungan: 0
        }, { onConflict: 'profile_id' });

        let msg = `✅ Nasabah "${nama}" berhasil didaftarkan!\n\nEmail: ${email}\nPassword: ${password}`;
        
        if (isNewUser) {
            msg += `\n\n️ PENTING: Jalankan script ini di SQL Editor agar user bisa login tanpa verifikasi email:\n\nUPDATE auth.users SET email_confirmed_at = NOW() WHERE id = '${userId}';`;
        }

        alert(msg);
        
        toggleModal('modal-register-nasabah');
        e.target.reset();
        loadPengurusDashboard(); // Refresh list nasabah
        
    } catch (err) {
        alert('Gagal mendaftarkan nasabah: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});
// --- AUTO-LOAD DASHBOARD PENGURUS SAAT LOGIN ---
// Ini akan dipanggil otomatis setelah addon.js selesai load master data
window.addEventListener('DOMContentLoaded', async () => {
    // Tunggu sampai currentProfile dan master data siap
    const checkAndLoad = setInterval(() => {
        if (currentProfile && currentProfile.role === 'pengurus' && jenisSampahList.length > 0) {
            clearInterval(checkAndLoad);
            loadPengurusDashboard();
        }
    }, 500); // Cek setiap 500ms
    
    // Timeout setelah 10 detik kalau data nggak ready
    setTimeout(() => clearInterval(checkAndLoad), 10000);
});
