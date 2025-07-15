// ✅ FIXED VERSION OF YOUR BOT CODE (Only ONE modal handler, safe .showModal usage)

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events
} = require('discord.js');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('@discordjs/builders');

const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for server whitelist')
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash command registered');
  } catch (error) {
    console.error('❌ Failed to register slash command:', error);
  }
  await client.login(process.env.DISCORD_TOKEN);
})();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    // Handle /apply command
    if (interaction.isChatInputCommand() && interaction.commandName === 'apply') {
      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_application_modal')
          .setLabel('🧾 Submit Application')
          .setStyle(ButtonStyle.Secondary)
      );

      const embed = new EmbedBuilder()
        .setTitle('📝 𝗠𝗧𝗔:𝗦𝗔 𝗥𝗢𝗟𝗘𝗣𝗟𝗔𝗬 𝗪𝗛𝗜𝗧𝗘𝗟𝗜𝗦𝗧 𝗔𝗣𝗣𝗟𝗜𝗖𝗔𝗧𝗜𝗢𝗡')
        .setColor(0x2C2F33)
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(
          'Welcome to the roleplay whitelist system!\n' +
          '1 | Apply and wait for approval or rejection.\n' +
          '2 | Fill the form properly or risk getting rejected.'
        )
        .setFooter({ text: 'MTA:SA Whitelist System', iconURL: client.user.displayAvatarURL() });

      return interaction.reply({ embeds: [embed], components: [button] });
    }

    // Handle button click (show modal only, no DB checks yet)
    if (interaction.isButton() && interaction.customId === 'open_application_modal') {
      const modal = new ModalBuilder()
        .setCustomId('whitelist_application')
        .setTitle('✨ Whitelist Application')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('irl_name')
              .setLabel('🧑‍🦱 Your Full Name (IRL)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('irl_age')
              .setLabel('🎂 Your Age (IRL)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ingame_name')
              .setLabel('🎮 In-game Name')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ingame_age')
              .setLabel('🕹️ Character Age')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('serial')
              .setLabel('🔐 MTA Serial (32 characters)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(32)
              .setMaxLength(32)
          )
        );

      return await interaction.showModal(modal);
    }

    // Handle modal submission
    if (interaction.isModalSubmit() && interaction.customId === 'whitelist_application') {
      const serial = interaction.fields.getTextInputValue('serial');

      if (!/^[a-fA-F0-9]{32}$/.test(serial)) {
        return interaction.reply({ content: '❌ Serial must be 32 hex characters.', ephemeral: true });
      }

      const [existing] = await pool.execute(
        'SELECT * FROM whitelist_submissions WHERE discord_id = ? LIMIT 1',
        [interaction.user.id]
      );

      let retries = 0;
      if (existing.length > 0) {
        if (existing[0].retries >= 1) {
          return interaction.reply({
            content: '❌ You have already reapplied once after rejection.',
            ephemeral: true
          });
        }
        retries = existing[0].retries + 1;
        await pool.execute('DELETE FROM whitelist_submissions WHERE discord_id = ?', [interaction.user.id]);
      }

      const fields = {
        irlName: interaction.fields.getTextInputValue('irl_name'),
        irlAge: interaction.fields.getTextInputValue('irl_age'),
        ingameName: interaction.fields.getTextInputValue('ingame_name'),
        ingameAge: interaction.fields.getTextInputValue('ingame_age')
      };

      await pool.execute(
        `INSERT INTO whitelist_submissions (discord_id, irl_name, irl_age, ingame_name, ingame_age, serial, retries, experience)
         VALUES (?, ?, ?, ?, ?, ?, ?, '')`,
        [interaction.user.id, fields.irlName, fields.irlAge, fields.ingameName, fields.ingameAge, serial, retries]
      );

      const embed = new EmbedBuilder()
        .setTitle('📝 New Whitelist Application')
        .setColor(0xFFA500)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🧑‍🦱 IRL Name', value: `\`${fields.irlName}\``, inline: true },
          { name: '🎂 IRL Age', value: `\`${fields.irlAge}\``, inline: true },
          { name: '🎮 In-game Name', value: `\`${fields.ingameName}\``, inline: true },
          { name: '🕹️ Character Age', value: `\`${fields.ingameAge}\``, inline: true },
          { name: '🔐 MTA Serial', value: `\`${serial}\``, inline: false },
          { name: '🔁 Reapply Count', value: `\`${retries}\` / \`1\``, inline: true },
          { name: '👤 Discord', value: `<@${interaction.user.id}>`, inline: true },
          { name: '🆔 Discord ID', value: `\`${interaction.user.id}\``, inline: true }
        )
        .setFooter({ text: 'Whitelist System', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_${interaction.user.id}`)
          .setLabel('✅ Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject_${interaction.user.id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger)
      );

      const logChannel = await client.channels.fetch(process.env.SUBMISSIONS_CHANNEL_ID);
      await logChannel.send({ embeds: [embed], components: [buttons] });

      return interaction.reply({ content: '✅ Your application has been submitted!', ephemeral: true });
    }

    // Handle accept/reject buttons
    if (interaction.isButton() && (interaction.customId.startsWith('accept_') || interaction.customId.startsWith('reject_'))) {
      const userId = interaction.customId.split('_')[1];
      const [rows] = await pool.execute('SELECT * FROM whitelist_submissions WHERE discord_id = ? LIMIT 1', [userId]);

      if (rows.length === 0) {
        return interaction.reply({ content: '❌ Application not found in database.', ephemeral: true });
      }

      const { serial, discord_id } = rows[0];

      if (interaction.customId.startsWith('accept_')) {
        await pool.execute(
          `INSERT INTO mta_whitelist (mta_serial, discord_id, added_by)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE discord_id = VALUES(discord_id), added_by = VALUES(added_by)`,
          [serial, discord_id, interaction.user.tag]
        );

        const user = await client.users.fetch(discord_id).catch(() => null);
        if (user) await user.send(`🎉 Your whitelist application has been accepted!`);

        return interaction.update({ content: '✅ Application accepted and user whitelisted.', components: [] });
      }

      if (interaction.customId.startsWith('reject_')) {
        await pool.execute('UPDATE whitelist_submissions SET retries = retries + 1 WHERE discord_id = ?', [userId]);

        const user = await client.users.fetch(userId).catch(() => null);
        if (user) await user.send(`❌ Your application has been rejected. Good luck next time.`);

        return interaction.update({ content: '❌ Application rejected.', components: [] });
      }
    }
  } catch (error) {
    console.error('❌ Error handling interaction:', error);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Unexpected error occurred.', ephemeral: true });
    }
  }
});
