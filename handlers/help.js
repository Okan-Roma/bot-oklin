const { buildHelpMessage } = require("../services/helpText");
const { mainMenuKeyboard } = require("./menu");

module.exports = (bot) => {
  bot.command("help", async (ctx) => {
    return ctx.reply(buildHelpMessage(), mainMenuKeyboard());
  });
};