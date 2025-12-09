/**
 * Bot Pengelola Grup WhatsApp (Node.js & whatsapp-web.js)
 *
 * Dikembangkan oleh: Nexus Dev
 *
 * Catatan Penting:
 * 1. Bot ini memerlukan Node.js dan library 'whatsapp-web.js'.
 * 2. Data PREMIUM_GROUPS dan GROUP_RULES saat ini disimpan di memori dan akan hilang saat bot di-restart.
 * Untuk penggunaan permanen, ganti dengan database seperti SQLite3 atau Firestore.
 * 3. Fitur ini menggunakan library non-resmi dan mungkin melanggar Ketentuan Layanan WhatsApp.
 */

// Impor library yang diperlukan
const { Client, LocalAuth, Buttons } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// --- KONFIGURASI BOT ---
const BOT_NAME = "Nexus Dev Bot";
// GANTI DENGAN NOMOR BOT OWNER (Format: 62812xxxxxx@c.us)
const BOT_OWNER_NUMBER = '6281234567890@c.us'; 
const GROUP_RULES = {}; 
const PREMIUM_GROUPS = {};
const ANTI_SPAM_KEYWORDS = ['http://', 'https://', '.com', '.xyz', '.biz', 't.me/', 'wa.me/'];
const KNOWN_COMMANDS = ['bantuan', 'help', 'rules', 'addrule', 'delrule', 'listspam', 'addprem', 'checkprem', 'mute', 'unmute', 'tagall', 'clearchat', 'groupinfo']; // Daftar semua perintah

// Inisialisasi Klien WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// --- UTILITY FUNCTIONS ---

/**
 * Memeriksa apakah grup memiliki status premium yang aktif.
 */
const checkPremiumStatus = (chatId) => {
    const data = PREMIUM_GROUPS[chatId];
    if (!data || !data.expiry) {
        return { isPremium: false, expires: null };
    }

    const expiryDate = new Date(data.expiry);
    const isPremium = expiryDate.getTime() > Date.now();
    
    return { isPremium, expires: isPremium ? expiryDate : null };
};

/**
 * Menghitung tanggal kedaluwarsa berdasarkan durasi.
 */
const calculateExpiryDate = (amount, unit) => {
    const now = new Date();
    const expiry = new Date(now);
    
    amount = parseInt(amount);

    switch (unit.toLowerCase()) {
        case 'day':
        case 'days':
            expiry.setDate(now.getDate() + amount);
            break;
        case 'month':
        case 'months':
            expiry.setMonth(now.getMonth() + amount);
            break;
        case 'year':
        case 'years':
            expiry.setFullYear(now.getFullYear() + amount);
            break;
        default:
            throw new Error("Satuan durasi tidak valid (day, month, year).");
    }
    return expiry;
};

// --- LIFECYCLE BOT ---

client.on('qr', (qr) => {
    console.log('QR CODE DIPERLUKAN. Silakan scan dengan WhatsApp Anda:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log(`\n[${BOT_NAME}] Bot sudah siap dan terhubung!`);
    console.log('Ketik "bantuan" di grup untuk melihat perintah.');
});

client.on('authenticated', () => {
    console.log('Autentikasi BERHASIL!');
});

client.on('auth_failure', msg => {
    console.error('Autentikasi GAGAL', msg);
});

client.on('disconnected', (reason) => {
    console.log('Klien terputus.', reason);
});

// --- FITUR UTAMA: EVENT ANGGOTA GRUP (WELCOME, GOODBYE, AUTO-LEAVE) ---

client.on('group_join', async (notification) => {
    const chatId = notification.chatId;
    const chat = await notification.getChat();

    if (!chat.isGroup) return;

    const { isPremium, expires } = checkPremiumStatus(chatId);
    
    // Auto-leave jika bot baru saja di-add dan grup tidak premium
    if (notification.recipientIds.includes(client.info.wid._serialized)) {
        if (!isPremium) {
            await client.sendMessage(chatId, `
*❌ AKSES DITOLAK ❌*

Terima kasih telah mengundang *${BOT_NAME}*.
Bot ini memerlukan akses premium untuk berfungsi. Karena grup *${chat.name}* tidak terdaftar sebagai premium, bot akan keluar secara otomatis.

Silakan hubungi Owner Bot (${BOT_OWNER_NUMBER.split('@')[0]}) untuk pembelian akses premium.
            `);
            await chat.leave();
            console.log(`[PREMIUM CHECK] Bot keluar dari grup ${chat.name} karena non-premium.`);
            return;
        }
    }
    
    // Lanjutkan proses welcome message
    const participantId = notification.recipientIds[0];
    const participant = await client.getContactById(participantId);
    const rules = GROUP_RULES[chatId] ? GROUP_RULES[chatId].length : 0;

    console.log(`[JOIN] Anggota baru: ${participant.pushname || participantId} di grup ${chat.name}`);

    const expiryText = expires ? `Akses Premium grup ini akan berakhir pada: *${expires.toLocaleDateString('id-ID')}*` : '';

    const welcomeMessage = `
*🎉 SELAMAT DATANG DI GRUP ${chat.name}! (PREMIUM) 🎉*

Halo @${participantId.split('@')[0]}!

Kami senang Anda bergabung. Mohon kerjasamanya agar grup ini tetap kondusif dan bermanfaat.

Saat ini, terdapat *${rules}* peraturan yang berlaku di grup ini.
${expiryText}

*Baca Peraturan Grup sekarang!*
    `;

    const button = new Buttons(welcomeMessage, [
        { body: 'Baca Peraturan Grup', id: 'RULES_BUTTON' },
        { body: 'Hubungi Admin', id: 'ADMIN_BUTTON' }
    ], 'Pesan Otomatis', BOT_NAME);

    await client.sendMessage(chatId, button, { mentions: [participant] });
});

client.on('group_leave', async (notification) => {
    const chatId = notification.chatId;
    const chat = await notification.getChat();

    if (chat.isGroup) {
        const participantId = notification.recipientIds[0];
        const participant = await client.getContactById(participantId);

        console.log(`[LEAVE] Anggota keluar: ${participant.pushname || participantId} dari grup ${chat.name}`);

        const goodbyeMessage = `
*👋 SAMPAI JUMPA! 👋*

@${participantId.split('@')[0]} telah meninggalkan grup *${chat.name}*.
Semoga sukses selalu!
        `;

        await client.sendMessage(chatId, goodbyeMessage, { mentions: [participant] });
    }
});

// --- FITUR UTAMA: ANTI-SPAM DAN PERINTAH BOT ---

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const sender = await msg.getContact();
    const messageBodyLower = msg.body.toLowerCase().trim();

    let commandFound = false;
    let command = '';
    let rawBody = '';

    // Cari Command (Tanpa Prefix)
    for (const cmd of KNOWN_COMMANDS) {
        if (messageBodyLower === cmd || messageBodyLower.startsWith(cmd + ' ')) {
            commandFound = true;
            command = cmd;
            rawBody = msg.body.slice(cmd.length).trim();
            break;
        }
    }

    // 0. Cek Status Premium pada Setiap Perintah
    if (chat.isGroup && commandFound) {
        const { isPremium } = checkPremiumStatus(chat.id);
        
        // Cek jika premium kedaluwarsa (kecuali jika owner bot yang menjalankan perintah)
        if (!isPremium && msg.author !== BOT_OWNER_NUMBER) {
             const ownerContactId = PREMIUM_GROUPS[chat.id]?.owner || BOT_OWNER_NUMBER;
             const ownerContact = await client.getContactById(ownerContactId);
             
             await client.sendMessage(chat.id, `
*❗ AKSES PREMIUM KEDALUWARSA ❗*

Layanan bot di grup *${chat.name}* telah berakhir.
Bot akan keluar dalam 1 menit.

Silakan hubungi Owner Bot (@${ownerContact.id.user}) untuk memperpanjang akses.
             `, { mentions: [ownerContact] });
             
             setTimeout(async () => {
                 await chat.leave();
                 console.log(`[PREMIUM CHECK] Bot keluar dari grup ${chat.name} karena premium kedaluwarsa.`);
             }, 5000);
             return;
        }
    }


    // 1. Anti-Spam (Hanya di Grup Premium)
    if (chat.isGroup && !msg.fromMe && checkPremiumStatus(chat.id).isPremium) {
        const isGroupAdmin = chat.participants.find(p => p.id._serialized === msg.author && p.isAdmin);

        if (!isGroupAdmin) {
            let isSpam = false;

            for (const keyword of ANTI_SPAM_KEYWORDS) {
                if (messageBodyLower.includes(keyword)) {
                    isSpam = true;
                    break;
                }
            }

            if (isSpam) {
                console.log(`[SPAM BLOCKED] Pesan dari ${sender.pushname || msg.author} di ${chat.name} diblokir.`);
                try {
                    if (chat.participants.find(p => p.id._serialized === client.info.wid._serialized).isAdmin) {
                        await msg.delete(true); 
                        await client.sendMessage(chat.id, `
*🛑 ANTI-SPAM AKTIF 🛑*

Pesan dari @${msg.author.split('@')[0]} telah dihapus karena terdeteksi mengandung promosi/link yang tidak diizinkan.
Harap patuhi peraturan grup.
                        `, { mentions: [sender] });
                    }
                } catch (error) {
                    console.error('Gagal menghapus pesan atau mengirim peringatan:', error.message);
                }
            }
        }
    }

    // 2. Perintah Bot
    if (commandFound) {
        const args = rawBody.split(/\s+/).filter(arg => arg.length > 0);
        
        const isBotOwner = msg.author === BOT_OWNER_NUMBER;
        const isBotAdmin = chat.isGroup && chat.participants.find(p => p.id._serialized === client.info.wid._serialized).isAdmin;
        const isAdmin = chat.isGroup && chat.participants.find(p => p.id._serialized === msg.author && p.isAdmin);

        switch (command) {
            case 'bantuan':
            case 'help':
                msg.reply(`
*📜 Daftar Perintah Bot ${BOT_NAME} 📜*
(Tidak perlu menggunakan prefix apa pun)

*Perintah Umum:*
1. *rules* - Menampilkan semua peraturan grup.
2. *groupinfo* - Menampilkan informasi detail grup.

*Perintah Admin/Owner Grup (Memerlukan Premium Aktif):*
1. *addrule [teks peraturan]* - Menambahkan peraturan baru.
2. *delrule [nomor]* - Menghapus peraturan.
3. *listspam* - Menampilkan daftar kata kunci anti-spam.
4. *tagall [pesan]* - Menandai semua anggota grup.
5. *clearchat [jumlah]* - Menghapus sejumlah pesan terakhir (maks 20).
6. *mute/unmute* - (Simulasi) Untuk bisukan/aktifkan anggota.

*Perintah Owner Bot (${BOT_OWNER_NUMBER.split('@')[0]}):*
1. *addprem [nomor_grup] [durasi] [satuan]* - Contoh: *addprem 6281234567890 30 day*
2. *checkprem [nomor_grup]* - Cek status premium.
                `);
                break;

            // --- Perintah Owner Bot (Khusus Premium Management) ---
            case 'addprem':
                if (!isBotOwner) {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya dapat dijalankan oleh Owner Bot.");
                    return;
                }
                
                const [targetNumber, amount, unit] = args;
                if (!targetNumber || !amount || !unit) {
                    msg.reply("❌ *Gagal:* Format salah. Contoh: *addprem 6281234567890 30 day*");
                    return;
                }
                
                try {
                    const chatId = targetNumber.includes('@g.us') ? targetNumber : `${targetNumber.replace(/\D/g, '')}@c.us`; 
                    const expiryDate = calculateExpiryDate(amount, unit);
                    
                    PREMIUM_GROUPS[chatId] = { 
                        expiry: expiryDate.toISOString(), 
                        owner: msg.author 
                    };
                    
                    msg.reply(`
*✅ PREMIUM BERHASIL DITAMBAHKAN!*
Grup/User: ${targetNumber}
Kedaluwarsa: ${expiryDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                    `);
                } catch (e) {
                    msg.reply(`❌ *Gagal:* ${e.message}`);
                }
                break;
                
            case 'checkprem':
                if (!isBotOwner) {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya dapat dijalankan oleh Owner Bot.");
                    return;
                }
                
                const targetNum = args[0];
                if (!targetNum) {
                    msg.reply("❌ *Gagal:* Format salah. Contoh: *checkprem 6281234567890*");
                    return;
                }

                const checkId = targetNum.includes('@g.us') ? targetNum : `${targetNum.replace(/\D/g, '')}@c.us`;
                const { isPremium: isCheckedPremium, expires: checkedExpires } = checkPremiumStatus(checkId);

                if (isCheckedPremium) {
                    msg.reply(`
*✅ STATUS PREMIUM AKTIF*
Grup/User ID: ${checkId}
Kedaluwarsa: ${checkedExpires.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                    `);
                } else {
                    msg.reply(`
*❌ STATUS PREMIUM NON-AKTIF/KEDALUWARSA*
Grup/User ID: ${checkId}
                    `);
                }
                break;

            // --- Perintah Admin Grup (Premium Dependent) ---
            case 'rules':
                if (chat.isGroup) {
                    const currentRules = GROUP_RULES[chat.id];
                    let rulesMessage = `*📜 PERATURAN GRUP ${chat.name} 📜*\n\n`;

                    if (!currentRules || currentRules.length === 0) {
                        rulesMessage += "Belum ada peraturan yang ditetapkan. Admin/Owner dapat menambahkannya menggunakan perintah *addrule*."
                    } else {
                        currentRules.forEach((rule, index) => {
                            rulesMessage += `${index + 1}. ${rule}\n`;
                        });
                    }
                    msg.reply(rulesMessage);
                }
                break;
                
            case 'groupinfo':
                if (chat.isGroup) {
                    const groupOwner = chat.participants.find(p => p.isSuperAdmin)?.id?._serialized || 'Tidak Diketahui';
                    
                    msg.reply(`
*📊 INFORMASI GRUP ${chat.name}*

*ID Grup:* ${chat.id._serialized}
*Dibuat:* ${new Date(chat.createdAt * 1000).toLocaleDateString('id-ID')}
*Total Anggota:* ${chat.participants.length}
*Total Admin:* ${chat.participants.filter(p => p.isAdmin).length}
*Owner Grup (WA):* @${groupOwner.split('@')[0]}
*Akses Premium:* ${checkPremiumStatus(chat.id).isPremium ? '✅ AKTIF' : '❌ NON-AKTIF'}
                    `, { mentions: groupOwner !== 'Tidak Diketahui' ? [await client.getContactById(groupOwner)] : [] });
                }
                break;

            case 'addrule':
                if (chat.isGroup && isAdmin) {
                    const ruleText = rawBody;
                    if (ruleText) {
                        if (!GROUP_RULES[chat.id]) {
                            GROUP_RULES[chat.id] = [];
                        }
                        GROUP_RULES[chat.id].push(ruleText);
                        msg.reply(`*✅ Berhasil:* Peraturan baru "${ruleText}" telah ditambahkan.`);
                    } else {
                        msg.reply("❌ *Gagal:* Format salah. Gunakan: *addrule [teks peraturan]*");
                    }
                } else {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya untuk Admin/Owner grup.");
                }
                break;

            case 'delrule':
                if (chat.isGroup && isAdmin) {
                    const ruleNumber = parseInt(args[0]);
                    const currentRules = GROUP_RULES[chat.id];

                    if (currentRules && ruleNumber > 0 && ruleNumber <= currentRules.length) {
                        const deletedRule = currentRules.splice(ruleNumber - 1, 1);
                        msg.reply(`*✅ Berhasil:* Peraturan nomor ${ruleNumber} ("${deletedRule}") telah dihapus.`);
                    } else if (!currentRules || currentRules.length === 0) {
                        msg.reply("❌ *Gagal:* Tidak ada peraturan untuk dihapus.");
                    } else {
                        msg.reply("❌ *Gagal:* Nomor peraturan tidak valid.");
                    }
                } else {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya untuk Admin/Owner grup.");
                }
                break;

            case 'listspam':
                 if (chat.isGroup && isAdmin) {
                     const spamList = ANTI_SPAM_KEYWORDS.map(keyword => `- ${keyword}`).join('\n');
                     msg.reply(`*⚙️ Daftar Kata Kunci Anti-Spam:* \n\n${spamList}\n\nSetiap pesan yang mengandung kata kunci di atas akan dihapus.`);
                 } else {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya untuk Admin/Owner grup.");
                 }
                 break;
                 
            case 'mute':
            case 'unmute':
                if (chat.isGroup && isAdmin) {
                    // Mute/Unmute bersifat simulasi
                    const mentionedContact = await msg.getMentions();
                    const targetId = mentionedContact[0]?.id._serialized || args[0];
                    
                    if (!targetId) {
                        msg.reply(`❌ *Gagal:* Format salah. Gunakan: *${command}* [mention user] atau [nomor user]`);
                        return;
                    }

                    let userToTarget = targetId.includes('@c.us') ? targetId : `${targetId.replace(/\D/g, '')}@c.us`;
                    
                    if (command === 'mute') {
                        msg.reply(`*🔇 MUTE:* @${userToTarget.split('@')[0]} dibisukan. Pesan Anda hanya dapat dilihat oleh admin/owner. (Simulasi)`);
                    } else if (command === 'unmute') {
                        msg.reply(`*🔊 UNMUTE:* @${userToTarget.split('@')[0]} diaktifkan kembali. (Simulasi)`);
                    }
                } else {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya untuk Admin grup.");
                }
                break;

            case 'tagall':
                if (chat.isGroup && isAdmin) {
                    let text = rawBody || "Pesan dari Admin/Owner grup.";
                    let mentions = [];
                    let message = `*📢 PEMBERITAHUAN DARI ADMIN/OWNER! 📢*\n\n${text}\n\n`;

                    for (let participant of chat.participants) {
                        mentions.push(participant.id._serialized);
                        message += `@${participant.id.user} `;
                    }

                    await client.sendMessage(chat.id, message, { mentions });
                } else {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya untuk Admin/Owner grup.");
                }
                break;
                
            case 'clearchat':
                if (chat.isGroup && isAdmin && isBotAdmin) {
                    const count = parseInt(args[0]) || 5;
                    const maxCount = 20;

                    if (count <= 0 || count > maxCount) {
                        msg.reply(`❌ *Gagal:* Jumlah pesan harus antara 1 sampai ${maxCount}.`);
                        return;
                    }
                    
                    try {
                        // Ambil N pesan + 1 untuk pesan perintah
                        const msgs = await chat.fetchMessages({ limit: count + 1 }); 
                        
                        let deletedCount = 0;
                        for (const message of msgs.reverse()) { 
                            if (message.body === msg.body && message.author === msg.author) continue; // Hindari hapus pesan perintah sendiri
                            await message.delete(true); 
                            deletedCount++;
                        }
                        
                        await client.sendMessage(chat.id, `✅ *Berhasil:* ${deletedCount} pesan terakhir telah dihapus oleh Admin/Bot.`);

                    } catch (error) {
                        console.error('Gagal menghapus pesan (Clear Chat):', error.message);
                        msg.reply('❌ *Gagal:* Bot mungkin tidak memiliki hak admin untuk menghapus pesan anggota lain atau terjadi kesalahan API.');
                    }
                } else {
                    msg.reply("❌ *Akses Ditolak:* Perintah ini hanya untuk Admin grup, dan Bot harus menjadi Admin.");
                }
                break;
        }
    }
});

// --- Penanganan Interaksi Tombol ---
client.on('message_create', async (msg) => {
    if (msg.has
    && msg.body === 'Baca Peraturan Grup') {
        const chat = await msg.getChat();
        const currentRules = GROUP_RULES[chat.id];
        let rulesMessage = `*📜 PERATURAN GRUP ${chat.name} 📜*\n\n`;

        if (!currentRules || currentRules.length === 0) {
            rulesMessage += "Belum ada peraturan yang ditetapkan. Admin/Owner dapat menambahkannya menggunakan perintah *addrule*."
        } else {
            currentRules.forEach((rule, index) => {
                rulesMessage += `${index + 1}. ${rule}\n`;
            });
        }
        msg.reply(rulesMessage);
    }
});


// Jalankan klien
client.initialize();
