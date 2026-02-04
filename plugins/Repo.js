import { Module } from '../lib/plugins.js';

Module({
  command: "repo",
  package: "general",
  description: "Get bot repository link",
})(async (message, match) => {
  try {
    const repoText = `
🤖 *Rabbit MD Bot Repository*

🌐 *GitHub Repository:*
https://github.com/INCONNU-BOY/INCONNU-XD-V2

🤖 *Telegram Bot:*
@queen_akuma_bot

📱 *Features:*
• Multi-device support
• 300+ commands
• Plugin system
• Image/video tools
• AI features
• Group management

🔧 *Setup Instructions:*
1. Clone the repository
2. Install dependencies
3. Configure environment variables
4. Run the bot

⚡ *Support:*
For help with setup, contact the support team.
    `.trim();

    // Create buttons with quick copy links
    const buttons = [
      {
        buttonId: 'github',
        buttonText: { 
          displayText: '📁 Copy GitHub Link' 
        },
        type: 1
      },
      {
        buttonId: 'telegram',
        buttonText: { 
          displayText: '🤖 Copy Telegram Link' 
        },
        type: 1
      }
    ];

    const buttonMessage = {
      text: repoText,
      footer: 'Click a button to copy the link instantly',
      buttons: buttons,
      headerType: 1
    };

    await message.conn.sendMessage(message.from, buttonMessage);
    
  } catch (err) {
    console.error("Repo command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err?.message || err}`,
      mimetype: "text/plain"
    });
  }
});
