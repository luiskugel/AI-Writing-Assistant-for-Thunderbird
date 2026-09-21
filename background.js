/**
 * Compose-window action: rewrites the current draft with the configured model.
 */

const HISTORY_MARKER = '<div class="moz-cite-prefix">';
const HISTORY_CHAR_LIMIT = 3000;

function trimStringWithEllipsis(str, n) {
  return str.length > n ? str.substring(0, n) + "..." : str;
}

function splitHtmlByTag(htmlString, tagName) {
  const index = htmlString.indexOf(tagName);
  if (index === -1) {
    return [htmlString, ""]; // tag not found
  }
  return [htmlString.slice(0, index), htmlString.slice(index)];
}

/** Strips the code fences some models wrap their answer in. */
function sanitizeLLMResult(llmResult) {
  return llmResult
    .replace(/^\s*(?:```|'''|""")[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?\s*(?:```|'''|""")\s*$/, "")
    .trim();
}

/** Resolves the stored `provider:model` selection against the active config. */
async function resolveSelection() {
  const [settings, { config }] = await Promise.all([
    AIWA.settings.load(),
    AIWA.config.loadConfig(),
  ]);

  const { providerId, modelId } = AIWA.config.parseModelRef(
    settings.selectedModel
  );
  const provider = AIWA.config.findProvider(config, providerId);
  if (!provider) {
    throw new AIWA.api.ApiError(
      settings.selectedModel
        ? `Unknown provider "${providerId}". Check your model configuration.`
        : "No model selected yet."
    );
  }
  if (!modelId) {
    throw new AIWA.api.ApiError(`No model selected for ${provider.label}.`);
  }
  // A model typed by hand is legitimate; the config entry only adds metadata.
  const model = AIWA.config.findModel(provider, modelId) || {
    id: modelId,
    label: modelId,
  };

  return { settings, provider, model };
}

async function promptAI({ provider, model, settings }, systemPrompt, text) {
  const result = await AIWA.api.complete({
    provider,
    model,
    systemPrompt,
    text,
    settings,
  });
  return sanitizeLLMResult(result);
}

// Open the settings page on install, so the add-on can be configured.
browser.runtime.onInstalled.addListener(async () => {
  const settings = await AIWA.settings.load();
  if (!settings.selectedModel) {
    browser.tabs.create({ url: browser.runtime.getURL("options.html") });
  }
});

browser.composeAction.onClicked.addListener(async (tab) => {
  const composeWindow = await browser.compose.getComposeDetails(tab.id);

  try {
    // Disable the button while processing
    await browser.composeAction.disable(tab.id);

    const selection = await resolveSelection();
    const { settings } = selection;

    // Split the draft from the quoted history
    const [draft, history] = splitHtmlByTag(composeWindow.body, HISTORY_MARKER);
    if (!draft.trim()) {
      throw new Error("Draft is empty. Please write an email before using the AI.");
    }

    const historyTrimmed = settings.useConversationHistory
      ? trimStringWithEllipsis(history, HISTORY_CHAR_LIMIT)
      : "";

    const improvedHtml = await promptAI(
      selection,
      settings.promptImprove,
      `<!--BEGIN DRAFT-->\n${draft}\n<!--END DRAFT-->\n<!-- BEGIN CONTEXT -->\n${historyTrimmed}\n<!-- END CONTEXT -->`
    );

    // Join the improved text with the history and update the compose window.
    // Plain text and HTML compose windows take different detail fields.
    if (composeWindow.isPlainText) {
      const improvedText = await promptAI(
        selection,
        settings.promptHtml2Text,
        improvedHtml
      );
      await browser.compose.setComposeDetails(tab.id, {
        ...composeWindow,
        plainTextBody: `${improvedText}\n\n${history}`,
      });
    } else {
      await browser.compose.setComposeDetails(tab.id, {
        ...composeWindow,
        body: `${improvedHtml}<br><br>${history}`,
      });
    }
  } catch (error) {
    console.error("Error improving writing style:", error);
    reportError(error);
  } finally {
    await browser.composeAction.enable(tab.id);
  }
});

function reportError(error) {
  const message = error.message || String(error);
  const needsSetup =
    message.includes("API key not found") ||
    message.includes("No model selected") ||
    message.includes("Unknown provider") ||
    message.includes("No API endpoint configured");

  if (needsSetup) {
    if (confirm(`${message}\n\nOpen the settings page now?`)) {
      browser.runtime.openOptionsPage();
    }
    return;
  }

  if (message.includes("Could not reach") && message.includes("localhost")) {
    alert(
      `${message}\n\nOllama requires OLLAMA_ORIGINS to include "moz-extension://*". See https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-web-origins-to-access-ollama`
    );
    return;
  }

  alert(`Failed to improve writing.\n\n${message}`);
}
