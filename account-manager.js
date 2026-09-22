/**
 * ACCOUNT MANAGER MODULE (FINAL FIXED VERSION)
 * Menangani pembuatan akun manual, approval, dan reset password
 */

// Fungsi Utama: Membuat Akun Manual (Auth + Profile)
async function createManualAccount(email, password, nama, role, bankId) {
    try {
        let userId;
        let isNewUser = false;

        // LANGKAH 1: Coba SignUp dulu
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
            // Jika error karena user sudah terdaftar
            if (authError.message.toLowerCase().includes('already registered') || 
                authError.message.toLowerCase().includes('duplicate')) {
                
                // Login dulu buat dapetin UID user lama
                const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (loginError) {
                    return { 
                        success: false, 
                        message: `⚠️ User ${email} sudah ada tapi password salah atau belum confirmed.\n\nSilakan jalankan script ini di SQL Editor:\n\nUPDATE auth.users SET encrypted_password = crypt('${password}', gen_salt('bf')), email_confirmed_at = NOW() WHERE email = '${email}';\n\nSetelah itu coba buat akun lagi.` 
                    };
                }

                userId = loginData.user.id;
                isNewUser = false;
                
                // Logout lagi biar session admin tetap aman
                await supabaseClient.auth.signOut();
                
            } else {
                throw authError;
            }
        } else {
            // User baru berhasil dibuat
            userId = authData.user.id;
            isNewUser = true;
        }

        // LANGKAH 2: Konfirmasi Email (Jika user baru)
        let sqlNote = "";
        if (isNewUser) {
            sqlNote = `\n\n️ AGAR USER BISA LANGSUNG LOGIN TANPA VERIFIKASI EMAIL:\nSilakan jalankan script ini di SQL Editor Supabase:\n\nUPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '${email}';`;
        }

        // LANGKAH 3: PASTIKAN PROFILE ADA & BERSTATUS PENDING
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!existingProfile) {
            // Insert profile baru
            const { error: profileError } = await supabaseClient.from('profiles').insert({
                id: userId,
                role: 'pending',
                status: 'active',
                nama_lengkap: nama,
                no_hp: '-',
                alamat: '-',
                bank_sampah_id: bankId || null
            });
            if (profileError) throw profileError;
        } else {
            // Update profile jika sudah ada
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
