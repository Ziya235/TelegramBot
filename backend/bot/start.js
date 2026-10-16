import { formatBotConfigError, validateBotEnv } from "./config.js";
import { createLogger } from "./errors.js";
import { createUpdateHandler } from "./handler.js";
import { createOpenAiCompleter } from "./openai.js";
import { createTelegramClient, startPolling } from "./telegramApi.js";
import { mountTelegramWebhook } from "./webhook.js";

export async function startTelegramBot(app, env = process.env) {
  const config = validateBotEnv(env);
  if (!config.ok) {
    console.error(`[telegram-bot] Not started. ${formatBotConfigError(config)}`);
    return { started: false, missing: config.missing, problems: config.problems };
  }

  const log = createLogger([config.token, config.apiKey, config.webhookSecret]);
  const telegram = createTelegramClient({ token: config.token });
  const ai = createOpenAiCompleter({ apiKey: config.apiKey, model: config.model });
  const handleUpdate = createUpdateHandler({
    complete: (input) => ai.complete(input),
    telegram,
    log,
  });

  try {
    if (config.mode === "webhook") {
      mountTelegramWebhook(app, {
        secret: config.webhookSecret,
        handleUpdate,
        log,
      });
      await telegram.setWebhook({ url: config.webhookUrl, secret: config.webhookSecret });
      log("info", "webhook_ready", { mode: "webhook" });
      return { started: true, mode: "webhook" };
    }

    await telegram.deleteWebhook();
    const polling = startPolling({ telegram, handleUpdate, log });
    log("info", "polling_ready", { mode: "polling" });
    return { started: true, mode: "polling", stop: polling.stop };
  } catch (error) {
    log("error", "start_failed", { status: error?.status, name: error?.name || "Error" });
    return { started: false, missing: [], problems: ["Telegram API setup failed"] };
  }
}
