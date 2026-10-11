
require('dotenv').config();

const fs = require('fs');
const {
    Client,
    GatewayIntentBits,
    Events,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');

const play = require('play-dl');

const PREFIX = '.';
const BOJA = '#F3994A';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const redoviMuzike = new Map();
const nagradneIgre = new Map();

function embed(naslov, opis) {
    return new EmbedBuilder()
        .setColor(BOJA)
        .setTitle(naslov)
        .setDescription(opis)
        .setTimestamp();
}

function razlog(args) {
    return args.join(' ') || 'Nije naveden razlog.';
}

function trajanjeMs(tekst) {
    const m = String(tekst || '').match(/^(\d+)(s|m|h|d)$/i);
    if (!m) return null;

    const jedinice = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000
    };

    const ms = Number(m[1]) * jedinice[m[2].toLowerCase()];
    return Number(m[1]) > 0 && ms <= 604800000 ? ms : null;
}

function ucitajUpozorenja() {
    try {
        return JSON.parse(fs.readFileSync('./warnings.json', 'utf8'));
    } catch {
        return {};
    }
}

function sacuvajUpozorenja(data) {
    fs.writeFileSync('./warnings.json', JSON.stringify(data, null, 2));
}

function posaljiLog(guild, naslov, opis) {
    const kanal = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

    if (kanal && kanal.isTextBased()) {
        kanal.send({ embeds: [embed(naslov, opis)] }).catch(() => {});
    }
}

async function posaljiDM(user, naslov, opis) {
    try {
        await user.send({
            embeds: [
                embed(
                    naslov,
                    `**Server:** ${client.guilds.cache.first()?.name || 'HAOS'}\n${opis}`
                )
            ]
        });
        return true;
    } catch {
        return false;
    }
}

async function potvrdiModeraciju(message, user, naslov, opis) {
    const dmPoslat = await posaljiDM(
        user,
        'HAOS • Obaveštenje o moderaciji',
        `**Radnja:** ${naslov}\n` +
        `**Moderator:** ${message.author.tag}\n` +
        `**Razlog:** ${opis}`
    );

    await message.reply({
        embeds: [
            embed(
                naslov,
                `**Član:** ${user.tag}\n` +
                `**Razlog:** ${opis}\n\n` +
                (dmPoslat
                    ? '📩 Privatna poruka je poslata.'
                    : '⚠️ Privatna poruka nije mogla biti poslata.')
            )
        ]
    });

    posaljiLog(
        message.guild,
        naslov,
        `Član: ${user.tag}\nModerator: ${message.author.tag}\nRazlog: ${opis}`
    );
}

client.once(Events.ClientReady, bot => {
    console.log(`Bot je online: ${bot.user.tag}`);
});

// WELCOME — HAOS
client.on(Events.GuildMemberAdd, async member => {
    const kanal = member.guild.channels.cache.get(
        process.env.WELCOME_CHANNEL_ID
    );

    if (!kanal || !kanal.isTextBased()) return;

    const welcome = new EmbedBuilder()
        .setColor(BOJA)
        .setTitle('NOVI MEMBER')
        .setDescription(
            `<:haos_love:1530984544080232568> Ćao <@${member.id}>, dobrodošao/la na 🌴 ⨯ HAOS\n\n` +
            `<a:haos_mesec:1530984603479707861> Isprati [Informacije](https://discord.com/channels/1530299782738743306/1530976844956958993) & [obaveštenja](https://discord.com/channels/1530299782738743306/1530977278849188000) o serveru.\n` +
            `<:haos_zvezda:1531040788551700581> Podeli [boost](https://discord.com/channels/1530299782738743306/1530299852632887366) na serveru.\n` +
            `<:haos_majaba:1531052189915676772> Zabavi se u [chat](https://discord.com/channels/1530299782738743306/1530299783603028081)\n\n` +
            `<a:haos_vatra:1531053579039674400> Postani član <@&1530966431347245087> naše zajednice.`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({
            text: `#${member.guild.memberCount} member`,
            iconURL: member.guild.iconURL() || undefined
        });

    await kanal.send({
        embeds: [welcome],
        allowedMentions: { users: [member.id], roles: [] }
    }).catch(console.error);
});

client.on(Events.GuildMemberRemove, member => {
    posaljiLog(
        member.guild,
        'Član je napustio server',
        `Član: ${member.user.tag}`
    );
});

client.on(Events.GuildBanAdd, ban => {
    posaljiLog(ban.guild, 'Član je banovan', `Član: ${ban.user.tag}`);
});

client.on(Events.GuildBanRemove, ban => {
    posaljiLog(ban.guild, 'Ban je uklonjen', `Član: ${ban.user.tag}`);
});

// SVE KOMANDE
client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const komanda = (args.shift() || '').toLowerCase();

    if (!komanda) return;

    const clan = message.member;
    const target = message.mentions.members.first();

    const dozvola = potrebna => {
        if (clan.permissions.has(potrebna)) return true;

        message.reply({
            embeds: [
                embed('Nemaš dozvolu', 'Nemaš potrebnu dozvolu za ovu komandu.')
            ]
        }).catch(() => {});

        return false;
    };

    try {
        // POMOĆ
        if (['help', 'pomoc', 'pomoć'].includes(komanda)) {
            return message.reply({
                embeds: [
                    embed(
                        'HAOS • Komande',
                        '**🛡️ Moderacija**\n' +
                        '`.ban @član [razlog]`\n' +
                        '`.unban ID [razlog]`\n' +
                        '`.kick @član [razlog]`\n' +
                        '`.mute @član 10m [razlog]`\n' +
                        '`.unmute @član`\n' +
                        '`.warn @član [razlog]`\n' +
                        '`.warnings @član`\n\n' +
                        '**🎉 Nagradne igre**\n' +
                        '`.giveaway 10m 1 Nagrada`\n' +
                        '`.endgiveaway ID_poruke`\n\n' +
                        '**🎵 Muzika**\n' +
                        '`.play naziv pesme ili link`\n' +
                        '`.skip` `.stop` `.pause` `.resume`\n' +
                        '`.queue` `.leave`'
                    )
                ]
            });
        }

        // BAN
        if (komanda === 'ban') {
            if (!dozvola(PermissionFlagsBits.BanMembers)) return;

            if (!target) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.ban @član [razlog]`')]
                });
            }

            if (!target.bannable) {
                return message.reply({
                    embeds: [embed('Greška', 'Ne mogu da banujem ovog člana. Proveri uloge bota.')]
                });
            }

            const opis = razlog(args);
            const user = target.user;

            await posaljiDM(
                user,
                'HAOS • Banovanje',
                `**Moderator:** ${message.author.tag}\n**Razlog:** ${opis}`
            );

            await target.ban({
                reason: `${opis} | Moderator: ${message.author.tag}`
            });

            return message.reply({
                embeds: [
                    embed(
                        'Član je banovan',
                        `**Član:** ${user.tag}\n**Razlog:** ${opis}`
                    )
                ]
            });
        }

        // UNBAN
        if (komanda === 'unban') {
            if (!dozvola(PermissionFlagsBits.BanMembers)) return;

            const id = args.shift();

            if (!id || !/^\d{17,20}$/.test(id)) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.unban ID [razlog]`')]
                });
            }

            const opis = razlog(args);
            const user = await client.users.fetch(id);

            await message.guild.members.unban(
                id,
                `${opis} | Moderator: ${message.author.tag}`
            );

            const dm = await posaljiDM(
                user,
                'HAOS • Ban uklonjen',
                `Vaš ban na serveru je uklonjen.\n**Razlog:** ${opis}`
            );

            return message.reply({
                embeds: [
                    embed(
                        'Ban je uklonjen',
                        `**Korisnik:** ${user.tag}\n**Razlog:** ${opis}\n\n` +
                        (dm ? '📩 DM je poslat.' : '⚠️ DM nije mogao biti poslat.')
                    )
                ]
            });
        }

        // KICK
        if (komanda === 'kick') {
            if (!dozvola(PermissionFlagsBits.KickMembers)) return;

            if (!target) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.kick @član [razlog]`')]
                });
            }

            if (!target.kickable) {
                return message.reply({
                    embeds: [embed('Greška', 'Ne mogu da izbacim ovog člana.')]
                });
            }

            const user = target.user;
            const opis = razlog(args);

            await posaljiDM(
                user,
                'HAOS • Izbacivanje',
                `**Moderator:** ${message.author.tag}\n**Razlog:** ${opis}`
            );

            await target.kick(`${opis} | Moderator: ${message.author.tag}`);

            return message.reply({
                embeds: [
                    embed(
                        'Član je izbačen',
                        `**Član:** ${user.tag}\n**Razlog:** ${opis}`
                    )
                ]
            });
        }

        // MUTE
        if (komanda === 'mute') {
            if (!dozvola(PermissionFlagsBits.ModerateMembers)) return;

            if (!target || !args[0]) {
                return message.reply({
                    embeds: [
                        embed('Upotreba', '`.mute @član 10m [razlog]`\nPrimeri: `30s`, `10m`, `2h`, `1d`.')
                    ]
                });
            }

            const tekstTrajanja = args.shift();
            const ms = trajanjeMs(tekstTrajanja);

            if (!ms) {
                return message.reply({
                    embeds: [embed('Greška', 'Trajanje mora biti npr. `10m`, `2h` ili `1d` (najviše 7 dana).')]
                });
            }

            if (!target.moderatable) {
                return message.reply({
                    embeds: [embed('Greška', 'Ne mogu da utišam ovog člana.')]
                });
            }

            const opis = razlog(args);

            await target.timeout(ms, `${opis} | Moderator: ${message.author.tag}`);

            return potvrdiModeraciju(
                message,
                target.user,
                'Utišavanje',
                `${opis}\nTrajanje: ${tekstTrajanja}`
            );
        }

        // UNMUTE
        if (komanda === 'unmute') {
            if (!dozvola(PermissionFlagsBits.ModerateMembers)) return;

            if (!target) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.unmute @član`')]
                });
            }

            if (!target.moderatable) {
                return message.reply({
                    embeds: [embed('Greška', 'Ne mogu da uklonim utišavanje ovom članu.')]
                });
            }

            await target.timeout(null, `Uklonio/la ${message.author.tag}`);

            return potvrdiModeraciju(
                message,
                target.user,
                'Uklanjanje utišavanja',
                'Moderator je uklonio/la utišavanje.'
            );
        }

        // WARN
        if (komanda === 'warn') {
            if (!dozvola(PermissionFlagsBits.ModerateMembers)) return;

            if (!target) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.warn @član [razlog]`')]
                });
            }

            const opis = razlog(args);
            const podaci = ucitajUpozorenja();

            podaci[target.id] ||= [];
            podaci[target.id].push({
                razlog: opis,
                moderator: message.author.tag,
                datum: new Date().toISOString()
            });

            sacuvajUpozorenja(podaci);

            const dm = await posaljiDM(
                target.user,
                'HAOS • Upozorenje',
                `Dobili ste upozorenje na serveru **${message.guild.name}**.\n` +
                `**Moderator:** ${message.author.tag}\n**Razlog:** ${opis}`
            );

            return message.reply({
                embeds: [
                    embed(
                        'Upozorenje dodato',
                        `**Član:** ${target.user.tag}\n` +
                        `**Razlog:** ${opis}\n` +
                        `**Ukupno upozorenja:** ${podaci[target.id].length}\n\n` +
                        (dm ? '📩 DM je poslat.' : '⚠️ DM nije mogao biti poslat.')
                    )
                ]
            });
        }

        // PREGLED UPOZORENJA
        if (komanda === 'warnings') {
            if (!dozvola(PermissionFlagsBits.ModerateMembers)) return;

            if (!target) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.warnings @član`')]
                });
            }

            const lista = ucitajUpozorenja()[target.id] || [];

            if (!lista.length) {
                return message.reply({
                    embeds: [embed('Upozorenja', 'Ovaj član nema zabeleženih upozorenja.')]
                });
            }

            const tekst = lista.slice(-10).map((u, i) =>
                `**${i + 1}.** ${u.razlog}\nModerator: ${u.moderator}`
            ).join('\n\n');

            return message.reply({
                embeds: [embed(`Upozorenja • ${target.user.tag}`, tekst)]
            });
        }

        // POKRETANJE NAGRADNE IGRE
        if (komanda === 'giveaway') {
            if (!dozvola(PermissionFlagsBits.ManageGuild)) return;

            const trajanje = trajanjeMs(args.shift());
            const brojPobednika = Number(args.shift());
            const nagrada = args.join(' ');

            if (!trajanje || !Number.isInteger(brojPobednika) ||
                brojPobednika < 1 || brojPobednika > 20 || !nagrada) {
                return message.reply({
                    embeds: [
                        embed(
                            'Upotreba',
                            'Koristi: `.giveaway 10m 1 Nitro 1 mesec`\n' +
                            'Prvo trajanje, zatim broj pobednika i nagrada.'
                        )
                    ]
                });
            }

            const kraj = Date.now() + trajanje;

            const post = await message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(BOJA)
                        .setTitle('🎉 NAGRADNA IGRA 🎉')
                        .setDescription(
                            `**🎁 Nagrada:** ${nagrada}\n\n` +
                            `**🏆 Broj pobednika:** ${brojPobednika}\n` +
                            `**👤 Organizator:** ${message.author}\n\n` +
                            `Reaguj sa 🎉 da učestvuješ!\n\n` +
                            `**⏰ Završava se:** <t:${Math.floor(kraj / 1000)}:R>`
                        )
                        .setFooter({ text: 'HAOS • Nagradne igre' })
                        .setTimestamp(kraj)
                ]
            });

            await post.react('🎉');

            const zavrsi = async () => {
                try {
                    const reakcija = post.reactions.cache.get('🎉');
                    const fetched = reakcija ? await reakcija.users.fetch() : null;

                    const ucesnici = fetched
                        ? [...fetched.values()].filter(user => !user.bot)
                        : [];

                    const pobednici = [];

                    while (
                        ucesnici.length > 0 &&
                        pobednici.length < brojPobednika
                    ) {
                        const index = Math.floor(Math.random() * ucesnici.length);
                        pobednici.push(ucesnici.splice(index, 1)[0]);
                    }

                    const brojUcesnika = fetched
                        ? fetched.filter(user => !user.bot).size
                        : 0;

                    const tekstPobednika = pobednici.length
                        ? pobednici.map(user => `<@${user.id}>`).join(', ')
                        : 'Nema pobednika — niko nije učestvovao.';

                    // GLAVNI EMBED SE MENJA — POBEDNIK JE UNUTAR EMBEDA
                    const rezultat = new EmbedBuilder()
                        .setColor(BOJA)
                        .setTitle('🎉 NAGRADNA IGRA JE ZAVRŠENA!')
                        .setDescription(
                            `**🎁 Nagrada:** ${nagrada}\n\n` +
                            `**🏆 Pobednik/pobednici:**\n${tekstPobednika}\n\n` +
                            `**👥 Broj učesnika:** ${brojUcesnika}`
                        )
                        .setFooter({ text: 'HAOS • Nagradne igre' })
                        .setTimestamp();

                    await post.edit({
                        embeds: [rezultat]
                    });

                    // POSEBNA ČESTITKA — BEZ PINGA IZVAN EMBEDA
                    await post.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(BOJA)
                                .setTitle('🏆 REZULTAT NAGRADNE IGRE')
                                .setDescription(
                                    pobednici.length
                                        ? `🎉 Čestitamo ${tekstPobednika}!\n\n` +
                                          `Osvojili ste **${nagrada}**!`
                                        : 'Nagradna igra je završena bez pobednika.'
                                )
                                .setFooter({ text: 'HAOS • Čestitamo pobedniku!' })
                                .setTimestamp()
                        ],
                        allowedMentions: {
                            parse: []
                        }
                    });
                } catch (greska) {
                    console.error('Greška pri završavanju nagradne igre:', greska);
                }

                nagradneIgre.delete(post.id);
            };

            const timer = setTimeout(zavrsi, trajanje);

            nagradneIgre.set(post.id, {
                timer,
                zavrsi
            });

            return message.reply({
                embeds: [
                    embed(
                        'Nagradna igra pokrenuta',
                        `🎉 Nagradna igra za **${nagrada}** je objavljena!\n` +
                        `**Trajanje:** ${args.length ? 'podešeno' : 'aktivno'}`
                    )
                ]
            });
        }

        // RUČNO ZAVRŠAVANJE NAGRADNE IGRE
        if (komanda === 'endgiveaway') {
            if (!dozvola(PermissionFlagsBits.ManageGuild)) return;

            const igra = nagradneIgre.get(args[0]);

            if (!igra) {
                return message.reply({
                    embeds: [
                        embed(
                            'Greška',
                            'Nisam pronašao aktivnu nagradnu igru. Koristi ID poruke nagradne igre.'
                        )
                    ]
                });
            }

            clearTimeout(igra.timer);
            await igra.zavrsi();

            return message.reply({
                embeds: [
                    embed('Nagradna igra završena', 'Izvlačenje je završeno.')
                ]
            });
        }

        // PUŠTANJE MUZIKE
        if (komanda === 'play') {
            const upit = args.join(' ');
            const glasovniKanal = clan.voice.channel;

            if (!upit) {
                return message.reply({
                    embeds: [embed('Upotreba', '`.play naziv pesme ili link`')]
                });
            }

            if (!glasovniKanal) {
                return message.reply({
                    embeds: [embed('Glasovni kanal', 'Prvo uđi u glasovni kanal.')]
                });
            }

            const rezultati = await play.search(upit, { limit: 1 });

            if (!rezultati.length) {
                return message.reply({
                    embeds: [embed('Nema rezultata', 'Nisam pronašao tu pesmu.')]
                });
            }

            let red = redoviMuzike.get(message.guild.id);

            if (!red) {
                const veza = joinVoiceChannel({
                    channelId: glasovniKanal.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true
                });

                await entersState(veza, VoiceConnectionStatus.Ready, 20000);

                const plejer = createAudioPlayer();
                veza.subscribe(plejer);

                red = {
                    pesme: [],
                    veza,
                    plejer,
                    pusta: false,
                    kanal: message.channel
                };

                redoviMuzike.set(message.guild.id, red);

                plejer.on(AudioPlayerStatus.Idle, () => {
                    const trenutni = redoviMuzike.get(message.guild.id);
                    if (!trenutni) return;

                    if (trenutni.pesme.length) trenutni.pesme.shift();

                    trenutni.pusta = false;
                    pustiSledecuPesmu(message.guild.id).catch(console.error);
                });

                plejer.on('error', greska => {
                    console.error(greska);

                    const trenutni = redoviMuzike.get(message.guild.id);
                    if (!trenutni) return;

                    trenutni.pesme.shift();
                    trenutni.pusta = false;
                    pustiSledecuPesmu(message.guild.id).catch(console.error);
                });
            } else if (
                red.veza.joinConfig.channelId !== glasovniKanal.id
            ) {
                return message.reply({
                    embeds: [
                        embed('Muzika', 'Bot već pušta muziku u drugom glasovnom kanalu.')
                    ]
                });
            }

            const pesma = rezultati[0];

            red.pesme.push({
                naziv: pesma.title,
                url: pesma.url
            });

            if (!red.pusta) {
                await pustiSledecuPesmu(message.guild.id);
            } else {
                await message.reply({
                    embeds: [embed('Dodato u red 🎵', pesma.title)]
                });
            }

            return;
        }

        // MUZIČKE KOMANDE
        if (['skip', 'stop', 'leave', 'pause', 'resume', 'queue'].includes(komanda)) {
            const red = redoviMuzike.get(message.guild.id);

            if (!red) {
                return message.reply({
                    embeds: [embed('Muzika', 'Bot nije u glasovnom kanalu.')]
                });
            }

            if (komanda === 'skip') {
                if (!red.pesme.length) {
                    return message.reply({
                        embeds: [embed('Muzika', 'Nema pesme za preskakanje.')]
                    });
                }

                red.plejer.stop();

                return message.reply({
                    embeds: [embed('Muzika', 'Pesma je preskočena.')]
                });
            }

            if (komanda === 'pause') {
                if (!red.plejer.pause()) {
                    return message.reply({
                        embeds: [embed('Muzika', 'Nema pesme koju mogu da pauziram.')]
                    });
                }

                return message.reply({
                    embeds: [embed('Muzika', 'Pesma je pauzirana.')]
                });
            }

            if (komanda === 'resume') {
                if (!red.plejer.unpause()) {
                    return message.reply({
                        embeds: [embed('Muzika', 'Nema pauzirane pesme.')]
                    });
                }

                return message.reply({
                    embeds: [embed('Muzika', 'Pesma se nastavlja.')]
                });
            }

            if (komanda === 'queue') {
                const lista = red.pesme.slice(0, 10)
                    .map((pesma, i) => `**${i + 1}.** ${pesma.naziv}`)
                    .join('\n') || 'Red je prazan.';

                return message.reply({
                    embeds: [embed('Red muzike 🎵', lista)]
                });
            }

            red.pesme = [];
            red.plejer.stop();
            red.veza.destroy();
            redoviMuzike.delete(message.guild.id);

            return message.reply({
                embeds: [
                    embed(
                        'Muzika',
                        komanda === 'stop'
                            ? 'Muzika je zaustavljena i red je obrisan.'
                            : 'Bot je napustio glasovni kanal.'
                    )
                ]
            });
        }
    } catch (greska) {
        console.error(greska);

        message.reply({
            embeds: [
                embed(
                    'Greška',
                    'Komanda nije uspela. Proveri dozvole bota i terminal.'
                )
            ]
        }).catch(() => {});
    }
});

async function pustiSledecuPesmu(guildId) {
    const red = redoviMuzike.get(guildId);

    if (!red || red.pusta) return;

    if (!red.pesme.length) {
        red.veza.destroy();
        redoviMuzike.delete(guildId);
        return;
    }

    red.pusta = true;

    const pesma = red.pesme[0];

    try {
        const izvor = await play.stream(pesma.url);

        const resurs = createAudioResource(izvor.stream, {
            inputType: izvor.type
        });

        red.plejer.play(resurs);

        red.kanal.send({
            embeds: [
                embed('Sada se pušta 🎵', `**${pesma.naziv}**`)
            ]
        }).catch(() => {});
    } catch (greska) {
        console.error('Greška pri puštanju muzike:', greska);

        red.pesme.shift();
        red.pusta = false;

        await pustiSledecuPesmu(guildId);
    }
}

if (!process.env.DISCORD_TOKEN) {
    console.error('Nedostaje DISCORD_TOKEN u .env fajlu.');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
