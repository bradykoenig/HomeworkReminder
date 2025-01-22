const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const dotenv = require("dotenv");
const moment = require("moment");
const express = require("express");

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let homeworkDeadlines = {};
let announcementChannelId = null;

// Track already sent reminders
const sentReminders = {};

// Keep-alive server for UptimeRobot
const app = express();
app.get("/", (req, res) => {
    res.send("Bot is running!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
    console.log(`Keep-alive server running on port ${PORT}`),
);

// Define slash commands
const commands = [
    {
        name: "set-announcement-channel",
        description: "Set the announcement channel",
        options: [
            {
                name: "channel",
                description: "The channel to set for announcements",
                type: 7, // Channel type
                required: true,
            },
        ],
    },
    {
        name: "create-announcement",
        description: "Create a new homework announcement",
        options: [
            {
                name: "title",
                description: "The name of the homework",
                type: 3, // String type
                required: true,
            },
            {
                name: "due_date",
                description: "The due date in YYYY-MM-DD format",
                type: 3, // String type
                required: true,
            },
        ],
    },
    {
        name: "list-homework",
        description: "List all upcoming homework",
    },
];

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Set bot activity
    client.user.setActivity("Announcing Homework :mega:", { type: "PLAYING" });

    // Register global commands
    const rest = new REST({ version: "10" }).setToken(
        process.env.DISCORD_BOT_TOKEN,
    );
    try {
        console.log("Started refreshing global application (/) commands.");
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
        });
        console.log("Successfully reloaded global application (/) commands.");
    } catch (error) {
        console.error("Error registering global commands:", error);
    }

    // Start background task
    setInterval(checkDeadlines, 60000);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === "set-announcement-channel") {
        const channel = options.getChannel("channel");
        if (channel.isTextBased()) {
            announcementChannelId = channel.id;
            await interaction.reply(
                `Announcement channel set to ${channel.name}`,
            );
        } else {
            await interaction.reply("Please specify a text-based channel.");
        }
    }

    if (commandName === "create-announcement") {
        const title = options.getString("title");
        const dueDate = options.getString("due_date");

        if (!moment(dueDate, "YYYY-MM-DD", true).isValid()) {
            await interaction.reply("Invalid date format. Use YYYY-MM-DD.");
            return;
        }

        homeworkDeadlines[title] = moment(dueDate, "YYYY-MM-DD").toDate();
        await interaction.reply(
            `Homework "${title}" has been added with a deadline of ${dueDate}.`,
        );
    }

    if (commandName === "list-homework") {
        if (Object.keys(homeworkDeadlines).length === 0) {
            await interaction.reply("No homework deadlines set.");
        } else {
            let response = "Upcoming Homework Deadlines:\n";
            for (const [title, deadline] of Object.entries(homeworkDeadlines)) {
                response += `- ${title}: ${moment(deadline).format("YYYY-MM-DD")}\n`;
            }
            await interaction.reply(response);
        }
    }
});

// Background task to check deadlines
function checkDeadlines() {
    if (!announcementChannelId) return;

    const channel = client.channels.cache.get(announcementChannelId);
    if (!channel) return;

    const now = new Date();

    for (const [title, deadline] of Object.entries(homeworkDeadlines)) {
        const deadlineKey = `${title}-${moment(deadline).format("YYYY-MM-DD")}`;

        // Check if the reminder has already been sent for this homework
        if (!sentReminders[deadlineKey]) {
            if (
                moment(deadline).isSameOrBefore(moment(now).add(1, "days")) &&
                moment(deadline).isAfter(now)
            ) {
                channel.send(
                    `⏰ Reminder: Homework "${title}" is due tomorrow! @everyone`,
                );
                sentReminders[deadlineKey] = true; // Mark reminder as sent
            } else if (moment(deadline).isSameOrBefore(now)) {
                channel.send(`⏰ Reminder: Homework "${title}" is due now! @everyone`);
                delete homeworkDeadlines[title]; // Remove homework after sending reminder
            }
        }
    }
}

client.login(process.env.DISCORD_BOT_TOKEN);
