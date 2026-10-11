require('dotenv').config();

const fs = require('fs');
const {
  Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits
} = require('discord.js');
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState
} = require('@discordjs/voice');
const play = require('play-dl');

const PREFIX = '.';
const COLOR = '#F3994A';
const queues = new Map();
const giveaways = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function reason(args) {
  return args.join(' ') || 'Nije naveden razlog.';
}

function durationMs(text) {
  const m = String(text || '').match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;

  const unit = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  }[m[2].toLowerCase()];

  const ms = Number(m[1]) * unit;
  return Number(m[1]) > 0 && ms <= 604800000 ? ms : null;
}

function loadWarnings() {
  try {
    return JSON.parse(fs.readFileSync('./warnings.json', 'utf8'));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  fs.writeFileSync('./warnings.json', JSON.stringify(data, null, 2));
}

function log(guild, title, description) {
  const channel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

  if (channel?.isTextBased()) {
    channel.send({ embeds: [embed(title, description)] }).catch(() => {});
  }
}

async function dm(user, title, description) {
  try {
    await user.send({
      embeds: [
        embed(
          title,
          `**Server:** ${client.guilds.cache.first()?.name || 'HAOS'}\n${description}`
        )
      ]
    });
    return true;
  } catch {
    return false;
  }
}

async function confirmModeration(message, user, title, description) {
  const sent = await dm(
    user,
    'HAOS • Obaveštenje o moderaciji',
    `**Radnja:** ${title}\n**Moderator:** ${message.author.tag}\n**Razlog:** ${description}`
  );

  await message.reply({
    embeds: [
      embed(
        title,
        `**Član:** ${user.tag}\n**Razlog:** ${description}\n\n` +
        (sent
          ? '📩 Privatna poruka je poslata.'
          : '⚠️ Privatna poruka nije mogla biti poslata.')
      )
    ]
  });

  log(
    message.guild,
    title,
    `Član: ${user.tag}\nModerator: ${message.author.tag}\nRazlog: ${description}`
  );
}

// BOT ONLINE
client.once(Events.ClientReady, bot => {
  console.log(`Bot je online: ${bot.user.tag}`);
});

// WELCOME
client.on(Events.GuildMemberAdd, async member => {
  const channel = member.guild.channels.cache.get(
    process.env.WELCOME_CHANNEL_ID
  );

  if (!channel?.isTextBased()) return;

  const welcome = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('NOVI MEMBER')
    .setDescription(
      `Ćao <@${member.id}>, dobrodošao/la na 🌴 ⨯ HAOS!\n\n` +
      `Isprati informacije i obaveštenja o serveru i zabavi se u našoj zajednici.`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: `#${member.guild.memberCount} member`,
      iconURL: member.guild.iconURL() || undefined
    });

  await channel.send({
    embeds: [welcome],
    allowedMentions: { users: [member.id], roles: [] }
  }).catch(console.error);
});

client.on(Events.GuildMemberRemove, member => {
  log(member.guild, 'Član je napustio server', `Član: ${member.user.tag}`);
});

client.on(Events.GuildBanAdd, ban => {
  log(ban.guild, 'Član je banovan', `Član: ${ban.user.tag}`);
});

client.on(Events.GuildBanRemove, ban => {
  log(ban.guild, 'Ban je uklonjen', `Član: ${ban.user.tag}`);
});

// PUŠTANJE SLEDEĆE PESME
async function playNext(guildId) {
  const q = queues.get(guildId);

  if (!q || q.playing) return;

  if (!q.songs.length) {
    q.connection.destroy();
    queues.delete(guildId);
    return;
  }

  q.playing = true;
  const song = q.songs[0];

  try {
    if (!song.url || !/^https?:\/\//i.test(song.url)) {
      throw new Error('Pesma nema ispravan URL.');
    }

    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    q.player.play(resource);

    q.channel.send({
      embeds: [embed('Sada se pušta 🎵', `**${song.title}**`)]
    }).catch(() => {});
  } catch (err) {
    console.error('Greška pri puštanju muzike:', err);

    q.channel.send({
      embeds: [
        embed(
          'Greška sa muzikom',
          `Ne mogu da pustim **${song.title}**. Preskačem pesmu.`
        )
      ]
    }).catch(() => {});

    q.songs.shift();
    q.playing = false;
    await playNext(guildId);
  }
}

// SVE KOMANDE
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || '').toLowerCase();

  if (!command) return;

  const member = message.member;
  const target = message.mentions.members.first();

  const hasPermission = permission => {
    if (member.permissions.has(permission)) return true;

    message.reply({
      embeds: [
        embed('Nemaš dozvolu', 'Nemaš potrebnu dozvolu za ovu komandu.')
      ]
    }).catch(() => {});

    return false;
  };

  try {
    // HELP
    if (['help', 'pomoc', 'pomoć'].includes(command)) {
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
            '`.play naziv pesme ili YouTube link`\n' +
            '`.skip` `.stop` `.pause` `.resume` `.queue` `.leave`'
          )
        ]
      });
    }

    // BAN
    if (command === 'ban') {
      if (!hasPermission(PermissionFlagsBits.BanMembers)) return;
      if (!target) return message.reply('Upotreba: `.ban @član [razlog]`');
      if (!target.bannable) {
        return message.reply('Ne mogu da banujem ovog člana. Proveri uloge bota.');
      }

      const why = reason(args);

      await dm(
        target.user,
        'HAOS • Banovanje',
        `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`
      );

      await target.ban({
        reason: `${why} | Moderator: ${message.author.tag}`
      });

      log(message.guild, 'Član je banovan',
        `Član: ${target.user.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('Član je banovan',
            `**Član:** ${target.user.tag}\n**Razlog:** ${why}`)
        ]
      });
    }

    // UNBAN
    if (command === 'unban') {
      if (!hasPermission(PermissionFlagsBits.BanMembers)) return;

      const id = args.shift();

      if (!id || !/^\d{17,20}$/.test(id)) {
        return message.reply('Upotreba: `.unban ID [razlog]`');
      }

      const why = reason(args);
      const user = await client.users.fetch(id);

      await message.guild.members.unban(id, why);
      await dm(user, 'HAOS • Ban uklonjen',
        `Vaš ban na serveru je uklonjen.\n**Razlog:** ${why}`);

      return message.reply({
        embeds: [
          embed('Ban je uklonjen',
            `**Korisnik:** ${user.tag}\n**Razlog:** ${why}`)
        ]
      });
    }

    // KICK
    if (command === 'kick') {
      if (!hasPermission(PermissionFlagsBits.KickMembers)) return;
      if (!target) return message.reply('Upotreba: `.kick @član [razlog]`');
      if (!target.kickable) {
        return message.reply('Ne mogu da izbacim ovog člana.');
      }

      const why = reason(args);

      await dm(
        target.user,
        'HAOS • Izbacivanje',
        `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`
      );

      await target.kick(`${why} | Moderator: ${message.author.tag}`);

      return message.reply({
        embeds: [
          embed('Član je izbačen',
            `**Član:** ${target.user.tag}\n**Razlog:** ${why}`)
        ]
      });
    }

    // MUTE
    if (command === 'mute') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target || !args[0]) {
        return message.reply('Upotreba: `.mute @član 10m [razlog]`');
      }

      const text = args.shift();
      const ms = durationMs(text);

      if (!ms) {
        return message.reply('Trajanje mora biti npr. `10m`, `2h` ili `1d` (najviše 7 dana).');
      }

      if (!target.moderatable) {
        return message.reply('Ne mogu da utišam ovog člana.');
      }

      const why = reason(args);

      await target.timeout(ms, `${why} | Moderator: ${message.author.tag}`);

      return confirmModeration(
        message, target.user, 'Utišavanje', `${why}\nTrajanje: ${text}`
      );
    }

    // UNMUTE
    if (command === 'unmute') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.unmute @član`');

      if (!target.moderatable) {
        return message.reply('Ne mogu da uklonim utišavanje ovom članu.');
      }

      await target.timeout(null, `Uklonio/la ${message.author.tag}`);

      return confirmModeration(
        message, target.user, 'Uklanjanje utišavanja',
        'Moderator je uklonio/la utišavanje.'
      );
    }

    // WARN
    if (command === 'warn') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.warn @član [razlog]`');

      const why = reason(args);
      const data = loadWarnings();

      data[target.id] ||= [];
      data[target.id].push({
        razlog: why,
        moderator: message.author.tag,
        datum: new Date().toISOString()
      });

      saveWarnings(data);

      const sent = await dm(
        target.user,
        'HAOS • Upozorenje',
        `Server: **${message.guild.name}**\n` +
        `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`
      );

      return message.reply({
        embeds: [
          embed(
            'Upozorenje dodato',
            `**Član:** ${target.user.tag}\n` +
            `**Razlog:** ${why}\n` +
            `**Ukupno upozorenja:** ${data[target.id].length}\n` +
            (sent ? '📩 DM je poslat.' : '⚠️ DM nije mogao biti poslat.')
          )
        ]
      });
    }

    // PREGLED UPOZORENJA
    if (command === 'warnings') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.warnings @član`');

      const list = loadWarnings()[target.id] || [];

      if (!list.length) {
        return message.reply({
          embeds: [embed('Upozorenja', 'Ovaj član nema zabeleženih upozorenja.')]
        });
      }

      return message.reply({
        embeds: [
          embed(
            `Upozorenja • ${target.user.tag}`,
            list.slice(-10).map((w, i) =>
              `**${i + 1}.** ${w.razlog}\nModerator: ${w.moderator}`
            ).join('\n\n')
          )
        ]
      });
    }

    // POKRETANJE NAGRADNE IGRE
    if (command === 'giveaway') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const ms = durationMs(args.shift());
      const winnersCount = Number(args.shift());
      const prize = args.join(' ');

      if (!ms || !Number.isInteger(winnersCount) ||
          winnersCount < 1 || winnersCount > 20 || !prize) {
        return message.reply('Upotreba: `.giveaway 10m 1 Nitro 1 mesec`');
      }

      const endsAt = Date.now() + ms;

      const post = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('🎉 NAGRADNA IGRA 🎉')
            .setDescription(
              `**🎁 Nagrada:** ${prize}\n\n` +
              `**🏆 Broj pobednika:** ${winnersCount}\n` +
              `**👤 Organizator:** ${message.author}\n\n` +
              `Reaguj sa 🎉 da učestvuješ!\n\n` +
              `**⏰ Završava se:** <t:${Math.floor(endsAt / 1000)}:R>`
            )
            .setFooter({ text: 'HAOS • Nagradne igre' })
            .setTimestamp(endsAt)
        ]
      });

      await post.react('🎉');

      const finish = async () => {
        try {
          const reaction = post.reactions.cache.get('🎉');
          const fetched = reaction ? await reaction.users.fetch() : new Map();
          const entrants = [...fetched.values()].filter(u => !u.bot);
          const winners = [];

          while (entrants.length && winners.length < winnersCount) {
            winners.push(entrants.splice(
              Math.floor(Math.random() * entrants.length), 1
            )[0]);
          }

          const names = winners.length
            ? winners.map(u => `<@${u.id}>`).join(', ')
            : 'Nema pobednika — niko nije učestvovao.';

          await post.edit({
            embeds: [
              embed(
                '🎉 NAGRADNA IGRA JE ZAVRŠENA!',
                `**🎁 Nagrada:** ${prize}\n\n` +
                `**🏆 Pobednik/pobednici:**\n${names}\n\n` +
                `**👥 Broj učesnika:** ${[...fetched.values()].filter(u => !u.bot).length}`
              )
            ]
          });

          await post.reply({
            embeds: [
              embed(
                '🏆 REZULTAT NAGRADNE IGRE',
                winners.length
                  ? `🎉 Čestitamo ${names}!\nOsvojili ste **${prize}**!`
                  : 'Nagradna igra je završena bez pobednika.'
              )
            ],
            allowedMentions: { parse: [] }
          });
        } catch (e) {
          console.error('Greška pri završavanju nagradne igre:', e);
        }

        giveaways.delete(post.id);
      };

      const timer = setTimeout(finish, ms);
      giveaways.set(post.id, { timer, finish });

      return message.reply({
        embeds: [embed('Nagradna igra pokrenuta', `🎉 Nagrada: **${prize}**`)]
      });
    }

    // RUČNO ZAVRŠAVANJE NAGRADNE IGRE
    if (command === 'endgiveaway') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const giveaway = giveaways.get(args[0]);

      if (!giveaway) {
        return message.reply(
          'Nisam pronašao aktivnu nagradnu igru. Koristi ID poruke nagradne igre.'
        );
      }

      clearTimeout(giveaway.timer);
      await giveaway.finish();

      return message.reply({
        embeds: [embed('Nagradna igra završena', 'Izvlačenje je završeno.')]
      });
    }

    // PLAY
    if (command === 'play') {
      const query = args.join(' ');
      const voice = member.voice.channel;

      if (!query) {
        return message.reply('Upotreba: `.play naziv pesme ili YouTube link`');
      }

      if (!voice) {
        return message.reply('Prvo uđi u glasovni kanal.');
      }

      let result;

      try {
        if (/^https?:\/\//i.test(query)) {
          result = [{ title: query, url: query }];
        } else {
          result = await play.search(query, {
            limit: 1,
            source: { youtube: 'video' }
          });
        }
      } catch (e) {
        console.error('Greška pri pretrazi:', e);
        return message.reply(
          'Pretraga muzike nije uspela. Probaj direktan YouTube link.'
        );
      }

      const song = result?.[0];

      if (!song?.url || !/^https?:\/\//i.test(song.url)) {
        return message.reply(
          'Nisam dobio ispravan link pesme. Probaj direktan YouTube link.'
        );
      }

      let q = queues.get(message.guild.id);

      if (!q) {
        const connection = joinVoiceChannel({
          channelId: voice.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: true
        });

        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 20000);
        } catch (e) {
          connection.destroy();
          throw e;
        }

        const player = createAudioPlayer();
        connection.subscribe(player);

        q = {
          songs: [],
          connection,
          player,
          playing: false,
          channel: message.channel
        };

        queues.set(message.guild.id, q);

        player.on(AudioPlayerStatus.Idle, () => {
          const current = queues.get(message.guild.id);
          if (!current) return;

          if (current.songs.length) current.songs.shift();
          current.playing = false;

          playNext(message.guild.id).catch(console.error);
        });

        player.on('error', err => {
          console.error('Audio player error:', err);
          const current = queues.get(message.guild.id);
          if (!current) return;

          if (current.songs.length) current.songs.shift();
          current.playing = false;

          playNext(message.guild.id).catch(console.error);
        });
      } else if (q.connection.joinConfig.channelId !== voice.id) {
        return message.reply('Bot već pušta muziku u drugom glasovnom kanalu.');
      }

      q.songs.push({
        title: song.title || query,
        url: song.url
      });

      if (!q.playing) {
        await playNext(message.guild.id);
      } else {
        await message.reply({
          embeds: [embed('Dodato u red 🎵', song.title || query)]
        });
      }

      return;
    }

    // MUZIČKE KOMANDE
    if (['skip', 'stop', 'leave', 'pause', 'resume', 'queue'].includes(command)) {
      const q = queues.get(message.guild.id);

      if (!q) return message.reply('Bot nije u glasovnom kanalu.');

      if (command === 'skip') {
        if (!q.songs.length) return message.reply('Nema pesme za preskakanje.');
        q.player.stop();
        return message.reply('Pesma je preskočena.');
      }

      if (command === 'pause') {
        return message.reply(
          q.player.pause()
            ? 'Pesma je pauzirana.'
            : 'Nema pesme koju mogu da pauziram.'
        );
      }

      if (command === 'resume') {
        return message.reply(
          q.player.unpause()
            ? 'Pesma se nastavlja.'
            : 'Nema pauzirane pesme.'
        );
      }

      if (command === 'queue') {
        const list = q.songs.slice(0, 10)
          .map((s, i) => `**${i + 1}.** ${s.title}`)
          .join('\n') || 'Red je prazan.';

        return message.reply({
          embeds: [embed('Red muzike 🎵', list)]
        });
      }

      q.songs = [];
      q.player.stop();
      q.connection.destroy();
      queues.delete(message.guild.id);

      return message.reply(
        command === 'stop'
          ? 'Muzika je zaustavljena i red je obrisan.'
          : 'Bot je napustio glasovni kanal.'
      );
    }
  } catch (err) {
    console.error('Greška u komandi:', err);

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

// PROVERA TOKENA I POKRETANJE
if (!process.env.DISCORD_TOKEN) {
  console.error('Nedostaje DISCORD_TOKEN u .env fajlu.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
