/**
 * ACCOUNT MANAGER MODULE
 * Menangani pembuatan akun manual, approval, dan reset password
 * Terintegrasi dengan Supabase Auth & Profiles
 */

// Fungsi Utama: Membuat Akun Manual (Auth + Profile)
async function createManualAccount(email, password, nama, role, bankId) {
    try {
        // LANGKAH 1: Buat User di Auth.users terlebih dahulu
        // Kita gunakan signUp dengan autoConfirm=false agar aman, 
        // tapi karena ini admin, kita butuh cara bypass atau pakai service key.
        // CARA TERAMAN TANPA SERVICE KEY DI FRONTEND:
        // Kita buat entry di profiles dulu dengan status pending, 
        // TAPI ID-nya harus valid. 
        
        // SOLUSI ALTERNATIF YANG PASTI JALAN DI FRONTEND (ANON KEY):
        // 1. Sign Up user baru (ini otomatis bikin row di auth.users)
        // 2. Ambil UID dari hasil signup
        // 3. Update profile yang terbentuk (atau bikin jika trigger belum jalan)
        
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    nama_lengkap: nama,
                    role: role, // Simpan role di metadata buat jaga-jaga
                    bank_sampah_id: bankId
                },
                // Email confirmation tidak diperlukan untuk akun buatan admin
                // Tapi karena Anon Key, kita mungkin perlu konfirmasi manual via SQL nanti
                // Atau biarkan user confirm email pertama kali login
            }
        });

        if (authError) throw authError;

        const userId = authData.user.id;

        // LANGKAH 2: Pastikan Profile Terbentuk
        // Cek apakah trigger 'handle_new_user' sudah jalan?
        // Kalau belum, kita insert manual. Kalau sudah, kita update.
        
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!existingProfile) {
            // Insert profile baru
            const { error: profileError } = await supabaseClient.from('profiles').insert({
                id: userId,
                role: 'pending', // Selalu pending dulu biar perlu approval
                status: 'active',
                nama_lengkap: nama,
                no_hp: '-',
                alamat: '-',
                bank_sampah_id: bankId || null
            });
            if (profileError) throw profileError;
        } else {
            // Update profile jika sudah ada (misal user pernah daftar sendiri sebelumnya)
            const { error: updateError } = await supabaseClient.from('profiles').update({
                role: 'pending',
                status: 'active',
                nama_lengkap: nama,
                bank_sampah_id: bankId || null
            }).eq('id', userId);
            if (updateError) throw updateError;
        }

        return { success: true, message: `Akun berhasil dibuat! User ${email} masuk list Pending.` };

    } catch (err) {
        console.error("Create Account Error:", err);
        return { success: false, message: err.message };
    }
}

// Fungsi Approve User (Mengubah role dari pending jadi aktif)
async function approveUserAccount(userId, newRole, bankId) {
    try {
        // 1. Update Role di Profiles
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({ 
                role: newRole, 
                bank_sampah_id: bankId 
            })
            .eq('id', userId);

        if (profileError) throw profileError;

        // 2. Jika role Nasabah, pastikan entry di tabel nasabah ada
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

// Fungsi Reset Password (Memberikan instruksi SQL karena keterbatasan Anon Key)
function getResetPasswordSQL(userId, newPassword) {
    return `UPDATE auth.users SET encrypted_password = crypt('${newPassword}', gen_salt('bf')) WHERE id = '${userId}';`;
}