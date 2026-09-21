/**
 * Settings page. The provider and model pickers are built from the active
 * model configuration, which is either `config/models.json` or the user's
 * own JSON override.
 */

const CUSTOM_MODEL_VALUE = "__custom__";
const DISCOVERED_MODELS_KEY = "discoveredModels";

const state = {
  config: null,
  isCustomConfig: false,
  settings: null,
  // Model lists fetched from a provider's API, kept per provider id.
  discovered: {},
};

const el = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  state.settings = await AIWA.settings.load();
  const stored = await browser.storage.local.get([
    DISCOVERED_MODELS_KEY,
    AIWA.config.OVERRIDE_KEY,
  ]);
  state.discovered = stored[DISCOVERED_MODELS_KEY] || {};

  const loaded = await AIWA.config.loadConfig();
  state.config = loaded.config;
  state.isCustomConfig = loaded.custom;

  el("modelConfig").value =
    stored[AIWA.config.OVERRIDE_KEY] || (await defaultConfigText());

  fillSettingsFields(state.settings);
  renderProviders();
  bindEvents();

  if (state.isCustomConfig) {
    setText("configStatus", "Your own model configuration is in use.");
  }
});

async function defaultConfigText() {
  const response = await fetch(
    browser.runtime.getURL(AIWA.config.DEFAULT_CONFIG_PATH)
  );
  return response.text();
}

function fillSettingsFields(settings) {
  el("promptImprove").value = settings.promptImprove;
  el("promptHtml2Text").value = settings.promptHtml2Text;
  el("temperature").value = settings.temperature;
  el("temperatureValue").textContent = Number(settings.temperature).toFixed(2);
  el("maxTokens").value = settings.maxTokens;
  el("useConversationHistory").checked = settings.useConversationHistory;
}

/* ------------------------------------------------------------------ *
 * Provider / model pickers
 * ------------------------------------------------------------------ */

function selectedProvider() {
  return AIWA.config.findProvider(state.config, el("provider").value);
}

function renderProviders() {
  const select = el("provider");
  const { providerId, modelId } = AIWA.config.parseModelRef(
    state.settings.selectedModel || AIWA.config.defaultModelRef(state.config)
  );

  select.replaceChildren(
    ...state.config.providers.map((provider) => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.label;
      return option;
    })
  );

  const known = AIWA.config.findProvider(state.config, providerId);
  select.value = known ? providerId : state.config.providers[0].id;
  // The stored model id only means something for the provider it was saved
  // for; falling back to another provider starts from its own default.
  renderProviderDetails(known ? modelId : "");
}

/** Updates every field that depends on the selected provider. */
function renderProviderDetails(preferredModelId) {
  const provider = selectedProvider();
  if (!provider) {
    return;
  }

  const note = el("providerNote");
  note.textContent = provider.note || "";
  note.hidden = !provider.note;

  const needsKey = provider.apiKey !== "none";
  el("apiKeyGroup").hidden = !needsKey;
  el("apiKey").value = (state.settings.apiKeys || {})[provider.id] || "";
  const keyLink = el("apiKeyLink");
  keyLink.hidden = !provider.apiKeyUrl;
  if (provider.apiKeyUrl) {
    keyLink.href = provider.apiKeyUrl;
  }

  el("endpointGroup").hidden = !provider.endpointEditable;
  el("endpoint").value =
    (state.settings.endpoints || {})[provider.id] || provider.endpoint || "";

  el("refreshModels").hidden = !provider.modelsUrl;
  setText("modelStatus", "");
  renderModels(preferredModelId);
}

/** Config models first, then anything fetched from the provider. */
function modelsForProvider(provider) {
  const models = [...provider.models];
  const known = new Set(models.map((model) => model.id));
  for (const model of state.discovered[provider.id] || []) {
    if (!known.has(model.id)) {
      models.push(model);
      known.add(model.id);
    }
  }
  return models;
}

function renderModels(preferredModelId) {
  const provider = selectedProvider();
  const select = el("model");
  const models = modelsForProvider(provider);

  const options = models.map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent =
      model.label === model.id ? model.id : `${model.label} (${model.id})`;
    return option;
  });
  const manual = document.createElement("option");
  manual.value = CUSTOM_MODEL_VALUE;
  manual.textContent = "Other - enter a model ID…";
  options.push(manual);
  select.replaceChildren(...options);

  const known = models.some((model) => model.id === preferredModelId);
  if (preferredModelId && !known) {
    // The stored model is not in the list (hand-typed, or the config changed).
    select.value = CUSTOM_MODEL_VALUE;
    el("customModel").value = preferredModelId;
  } else {
    select.value = preferredModelId || models[0]?.id || CUSTOM_MODEL_VALUE;
  }
  updateCustomModelVisibility();
}

function updateCustomModelVisibility() {
  el("customModelGroup").hidden = el("model").value !== CUSTOM_MODEL_VALUE;
  updateTemperatureNote();
}

/**
 * Several current models (the OpenAI GPT-5.6/6 line, Claude Sonnet 5, ...)
 * reject the temperature parameter outright, so it is left out for them.
 */
function updateTemperatureNote() {
  const model = AIWA.config.findModel(selectedProvider(), currentModelId());
  setText(
    "temperatureNote",
    model && model.supportsTemperature === false
      ? `${model.label} does not accept a temperature - this slider is ignored for it.`
      : ""
  );
}

function currentModelId() {
  const value = el("model").value;
  return value === CUSTOM_MODEL_VALUE ? el("customModel").value.trim() : value;
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

function bindEvents() {
  el("provider").addEventListener("change", () => renderProviderDetails(""));
  el("model").addEventListener("change", updateCustomModelVisibility);
  el("customModel").addEventListener("input", updateTemperatureNote);
  el("refreshModels").addEventListener("click", refreshModels);

  el("temperature").addEventListener("input", (event) => {
    el("temperatureValue").textContent = parseFloat(
      event.target.value
    ).toFixed(2);
  });

  el("save").addEventListener("click", saveSettings);
  el("saveConfig").addEventListener("click", saveConfig);
  el("resetConfig").addEventListener("click", resetConfig);
  el("importConfig").addEventListener("click", () => el("configFile").click());
  el("configFile").addEventListener("change", importConfigFile);
}

async function refreshModels() {
  const provider = selectedProvider();
  const button = el("refreshModels");
  const previous = currentModelId();
  button.disabled = true;
  setText("modelStatus", `Loading models from ${provider.label}…`);
  try {
    const models = await AIWA.api.listModels(provider, el("apiKey").value.trim());
    state.discovered = { ...state.discovered, [provider.id]: models };
    await browser.storage.local.set({
      [DISCOVERED_MODELS_KEY]: state.discovered,
    });
    renderModels(previous);
    setText("modelStatus", `Loaded ${models.length} models.`);
  } catch (error) {
    setText("modelStatus", error.message);
  } finally {
    button.disabled = false;
  }
}

async function saveSettings() {
  const provider = selectedProvider();
  const modelId = currentModelId();
  const apiKey = el("apiKey").value.trim();
  const endpoint = el("endpoint").value.trim();
  const promptImprove = el("promptImprove").value.trim();
  const promptHtml2Text = el("promptHtml2Text").value.trim();
  const temperature = parseFloat(el("temperature").value);
  const maxTokens = parseInt(el("maxTokens").value, 10);

  if (!provider) {
    return showStatus("Please select a provider", "error");
  }
  if (!modelId) {
    return showStatus("Please select or enter a model", "error");
  }
  if (provider.apiKey === "required" && !apiKey) {
    return showStatus(`Please enter an API key for ${provider.label}`, "error");
  }
  if (provider.endpointEditable && !endpoint) {
    return showStatus(`Please enter an API endpoint for ${provider.label}`, "error");
  }
  if (!promptImprove || !promptHtml2Text) {
    return showStatus("Please enter all prompts", "error");
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 4000) {
    return showStatus("Max tokens must be between 1 and 4000", "error");
  }
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return showStatus("Temperature must be between 0 and 2", "error");
  }

  const apiKeys = { ...(state.settings.apiKeys || {}) };
  if (apiKey) {
    apiKeys[provider.id] = apiKey;
  } else {
    delete apiKeys[provider.id];
  }

  const endpoints = { ...(state.settings.endpoints || {}) };
  if (provider.endpointEditable && endpoint !== provider.endpoint) {
    endpoints[provider.id] = endpoint;
  } else {
    delete endpoints[provider.id];
  }

  const settings = {
    selectedModel: AIWA.config.formatModelRef(provider.id, modelId),
    apiKeys,
    endpoints,
    promptImprove,
    promptHtml2Text,
    temperature,
    maxTokens,
    useConversationHistory: el("useConversationHistory").checked,
  };

  try {
    await AIWA.settings.save(settings);
    state.settings = settings;
    showStatus("Settings saved successfully!", "success");
  } catch (error) {
    showStatus("Error saving settings: " + error.message, "error");
  }
}

/* ------------------------------------------------------------------ *
 * Model configuration editor
 * ------------------------------------------------------------------ */

/** Validates the JSON, adopts it and rebuilds the pickers. Throws if invalid. */
function applyConfig(text, { custom }) {
  state.config = AIWA.config.parseConfig(text);
  state.isCustomConfig = custom;
  // renderProviders() keeps the stored selection when the new config offers
  // it, and falls back to the first provider otherwise.
  renderProviders();
}

async function saveConfig() {
  const text = el("modelConfig").value;
  try {
    applyConfig(text, { custom: true });
    await browser.storage.local.set({ [AIWA.config.OVERRIDE_KEY]: text });
    setText(
      "configStatus",
      "Configuration saved. Remember to save your settings if you changed the model."
    );
  } catch (error) {
    setText("configStatus", error.message);
  }
}

async function resetConfig() {
  const text = await defaultConfigText();
  el("modelConfig").value = text;
  await browser.storage.local.remove(AIWA.config.OVERRIDE_KEY);
  applyConfig(text, { custom: false });
  setText("configStatus", "Reset to the bundled configuration.");
}

async function importConfigFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) {
    return;
  }
  const text = await file.text();
  try {
    AIWA.config.parseConfig(text);
    el("modelConfig").value = text;
    setText("configStatus", `Loaded ${file.name}. Press "Save Configuration" to apply.`);
  } catch (error) {
    setText("configStatus", `${file.name}: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * Status messages
 * ------------------------------------------------------------------ */

function setText(id, message) {
  const node = el(id);
  node.textContent = message;
  node.hidden = !message;
}

let statusTimer;
function showStatus(message, type) {
  const statusDiv = el("status");
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.hidden = false;

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusDiv.hidden = true;
  }, 4000);
}
