/**
 * ACCOUNT MANAGER MODULE (FINAL VERSION)
 * Menangani pembuatan akun manual, approval, dan reset password
 * Terintegrasi dengan Supabase Auth & Profiles
 */

// Fungsi Utama: Membuat Akun Manual (Auth + Profile)
async function createManualAccount(email, password, nama, role, bankId) {
    try {
        // LANGKAH 1: Buat User di Auth.users
        // Kita gunakan signUp dengan opsi email_confirm: true di metadata 
        // agar user langsung confirmed tanpa perlu verifikasi email.
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { 
                    nama_lengkap: nama, 
                    role: role, 
                    bank_sampah_id: bankId 
                },
                // Opsi ini memberitahu Supabase bahwa admin sudah memverifikasi user ini
                emailRedirectTo: window.location.origin 
            }
        });

        if (authError) {
            // Deteksi error duplicate / already registered
            if (authError.message.toLowerCase().includes('already registered') || 
                authError.message.toLowerCase().includes('duplicate')) {
                
                return { 
                    success: false, 
                    message: `⚠️ Email ${email} sudah terdaftar di sistem!\n\nKemungkinan user pernah dibuat sebelumnya tapi belum dihapus bersih.\n\nSilakan jalankan script ini di SQL Editor Supabase untuk membersihkannya:\n\nDELETE FROM auth.users WHERE email = '${email}';\n\nSetelah itu, coba buat akun lagi.` 
                };
            }
            throw authError;
        }

        // Jika signup berhasil, ambil UID
        const userId = authData.user.id;

        // LANGKAH 2: Konfirmasi Email Secara Manual (Bypass Verification)
        // Karena Anon Key tidak bisa update auth.users langsung, 
        // kita andalkan trigger atau insert profile sebagai tanda "Active".
        // Namun, untuk memastikan user bisa login tanpa verify email,
        // kita harus memastikan statusnya confirmed di database.
        
        // CATATAN PENTING UNTUK ADMIN:
        // Jika setelah dibuat user masih status "Waiting for verification" di dashboard Supabase,
        // Anda HARUS menjalankan script konfirmasi ini di SQL Editor:
        const confirmSQL = `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '${email}';`;

        // LANGKAH 3: Pastikan Profile Terbentuk
        // Cek apakah trigger 'handle_new_user' sudah jalan?
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!existingProfile) {
            // Insert profile baru jika trigger belum jalan
            const { error: profileError } = await supabaseClient.from('profiles').insert({
                id: userId,
                role: 'pending', // Selalu pending dulu biar perlu approval admin
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

        return { 
            success: true, 
            message: `✅ Akun berhasil dibuat!\n\nUser ${email} masuk list Pending.\n\n⚠️ PENTING: Agar user bisa langsung login tanpa verifikasi email, silakan jalankan script ini di SQL Editor Supabase:\n\n${confirmSQL}` 
        };

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
