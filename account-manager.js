/**
 * ACCOUNT MANAGER MODULE (ULTRA FINAL VERSION)
 * Menangani pembuatan akun manual tanpa error Foreign Key
 */

// Fungsi Utama: Membuat Akun Manual (Auth + Profile)
async function createManualAccount(email, password, nama, role, bankId) {
    try {
        let userId;
        let isNewUser = false;

        // LANGKAH 1: Cek apakah user sudah ada di auth.users
        // Kita coba login dulu. Kalau berhasil, berarti user sudah ada.
        const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (!loginError && loginData.user) {
            // User sudah ada, pakai ID-nya
            userId = loginData.user.id;
            isNewUser = false;
            
            // Logout lagi biar session admin tetap aman
            await supabaseClient.auth.signOut();
        } else {
            // User belum ada, buat baru via signUp
            const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { 
                        nama_lengkap: nama, 
                        role: role, 
                        bank_sampah_id: bankId 
                    },
                    emailRedirectTo: window.location.origin 
                }
            });

            if (authError) {
                // Jika error duplicate meski login gagal (kasus edge)
                if (authError.message.toLowerCase().includes('already registered')) {
                     return { 
                        success: false, 
                        message: `⚠️ Email ${email} sudah terdaftar tapi password salah.\n\nSilakan reset password via SQL Editor atau gunakan password yang benar.` 
                    };
                }
                throw authError;
            }

            userId = authData.user.id;
            isNewUser = true;
            
            // TUNGGU 2 DETIK biar Supabase selesai proses auth & trigger
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // LANGKAH 2: Konfirmasi Email (Jika user baru)
        let sqlNote = "";
        if (isNewUser) {
            sqlNote = `\n\n️ AGAR USER BISA LANGSUNG LOGIN TANPA VERIFIKASI EMAIL:\nSilakan jalankan script ini di SQL Editor Supabase:\n\nUPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '${email}';`;
        }

        // LANGKAH 3: UPSERT PROFILE (Insert atau Update jika sudah ada)
        // Gunakan upsert dengan onConflict untuk menghindari error duplicate
        const { error: profileError } = await supabaseClient.from('profiles').upsert({
            id: userId,
            role: 'pending',
            status: 'active',
            nama_lengkap: nama,
            no_hp: '-',
            alamat: '-',
            bank_sampah_id: bankId || null
        }, {
            onConflict: 'id' // Jika ID sudah ada, update saja jangan insert baru
        });

        if (profileError) {
            // Jika masih error foreign key, berarti RLS memblokir
            // Kita kasih instruksi SQL manual sebagai fallback
            return {
                success: false,
                message: `⚠️ Gagal insert profile otomatis (kemungkinan diblokir RLS).\n\nSilakan jalankan script ini di SQL Editor Supabase untuk membuat profile manual:\n\nINSERT INTO profiles (id, role, status, nama_lengkap, no_hp, alamat, bank_sampah_id)\nVALUES ('${userId}', 'pending', 'active', '${nama}', '-', '-', ${bankId ? `'${bankId}'` : 'NULL'})\nON CONFLICT (id) DO UPDATE SET role = 'pending', status = 'active', nama_lengkap = '${nama}';${sqlNote}`
            };
        }

        return { 
            success: true, 
            message: `✅ Akun berhasil diproses!\n\nUser ${email} sekarang berstatus PENDING.${sqlNote}` 
        };

    } catch (err) {
        console.error("Create Account Error:", err);
        return { success: false, message: err.message };
    }
}

// Fungsi Approve User
async function approveUserAccount(userId, newRole, bankId) {
    try {
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({ role: newRole, bank_sampah_id: bankId })
            .eq('id', userId);

        if (profileError) throw profileError;

        if (newRole === 'nasabah' && bankId) {
            await supabaseClient.from('nasabah').upsert(
                { profile_id: userId, bank_sampah_id: bankId, saldo_tabungan: 0 },
                { onConflict: 'profile_id' }
            );
        }

        return { success: true, message: "User berhasil di-approve!" };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

// Fungsi Edit Role User Aktif
async function updateUserRole(userId, newRole) {
    try {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);
            
        if (error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

// Fungsi Reset Password
function getResetPasswordSQL(userId, newPassword) {
    return `UPDATE auth.users SET encrypted_password = crypt('${newPassword}', gen_salt('bf')) WHERE id = '${userId}';`;
}
