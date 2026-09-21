/**
 * Shared model configuration.
 *
 * Providers and models are declared in `config/models.json` instead of being
 * hard-coded. Users may override that file with their own JSON from the
 * settings page; the override is stored under `modelConfig`.
 */
var AIWA = AIWA || {};

AIWA.config = (function () {
  const DEFAULT_CONFIG_PATH = "config/models.json";
  const OVERRIDE_KEY = "modelConfig";
  const API_KEY_MODES = ["required", "optional", "none"];
  const SUPPORTED_APIS = ["openai", "google", "ollama"];

  /** Turns a `provider:model` string into its parts. */
  function parseModelRef(ref) {
    if (typeof ref !== "string" || !ref) {
      return { providerId: "", modelId: "" };
    }
    // Only split on the first colon: model ids may contain one themselves,
    // e.g. OpenRouter's "deepseek/deepseek-r1:free".
    const separator = ref.indexOf(":");
    if (separator === -1) {
      return { providerId: ref, modelId: "" };
    }
    return {
      providerId: ref.slice(0, separator),
      modelId: ref.slice(separator + 1),
    };
  }

  function formatModelRef(providerId, modelId) {
    return `${providerId}:${modelId}`;
  }

  function normalizeModel(model, index, providerId) {
    const normalized =
      typeof model === "string" ? { id: model } : { ...(model || {}) };
    if (typeof normalized.id !== "string" || !normalized.id.trim()) {
      throw new Error(
        `Provider "${providerId}": model #${index + 1} is missing an "id".`
      );
    }
    normalized.id = normalized.id.trim();
    normalized.label = normalized.label || normalized.id;
    return normalized;
  }

  function normalizeProvider(provider, index) {
    if (!provider || typeof provider !== "object") {
      throw new Error(`Provider #${index + 1} is not an object.`);
    }
    const normalized = { ...provider };
    if (typeof normalized.id !== "string" || !normalized.id.trim()) {
      throw new Error(`Provider #${index + 1} is missing an "id".`);
    }
    normalized.id = normalized.id.trim();
    if (normalized.id.includes(":")) {
      throw new Error(`Provider "${normalized.id}": ids must not contain ":".`);
    }
    if (!SUPPORTED_APIS.includes(normalized.api)) {
      throw new Error(
        `Provider "${normalized.id}": "api" must be one of ${SUPPORTED_APIS.join(
          ", "
        )}.`
      );
    }
    normalized.label = normalized.label || normalized.id;
    normalized.endpoint = normalized.endpoint || "";
    normalized.endpointEditable = normalized.endpointEditable === true;
    if (!normalized.endpoint && !normalized.endpointEditable) {
      throw new Error(
        `Provider "${normalized.id}": needs an "endpoint" unless "endpointEditable" is true.`
      );
    }
    normalized.apiKey = normalized.apiKey || "required";
    if (!API_KEY_MODES.includes(normalized.apiKey)) {
      throw new Error(
        `Provider "${normalized.id}": "apiKey" must be one of ${API_KEY_MODES.join(
          ", "
        )}.`
      );
    }
    normalized.headers = normalized.headers || {};
    const models = Array.isArray(normalized.models) ? normalized.models : [];
    normalized.models = models.map((model, modelIndex) =>
      normalizeModel(model, modelIndex, normalized.id)
    );
    return normalized;
  }

  /** Validates and normalizes a config object, throwing on the first problem. */
  function normalizeConfig(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Config must be a JSON object.");
    }
    if (!Array.isArray(raw.providers) || raw.providers.length === 0) {
      throw new Error('Config must contain a non-empty "providers" array.');
    }
    const providers = raw.providers.map(normalizeProvider);
    const seen = new Set();
    for (const provider of providers) {
      if (seen.has(provider.id)) {
        throw new Error(`Duplicate provider id "${provider.id}".`);
      }
      seen.add(provider.id);
    }
    return { version: raw.version || 1, providers };
  }

  function parseConfig(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    return normalizeConfig(raw);
  }

  async function loadDefaultConfig() {
    const response = await fetch(browser.runtime.getURL(DEFAULT_CONFIG_PATH));
    if (!response.ok) {
      throw new Error(`Could not read ${DEFAULT_CONFIG_PATH}.`);
    }
    return normalizeConfig(await response.json());
  }

  /**
   * Returns the config in use: the user's override when it is valid, the
   * bundled default otherwise. A broken override never breaks the add-on.
   */
  async function loadConfig() {
    const stored = await browser.storage.local.get(OVERRIDE_KEY);
    if (stored[OVERRIDE_KEY]) {
      try {
        return { config: parseConfig(stored[OVERRIDE_KEY]), custom: true };
      } catch (error) {
        console.warn("Ignoring invalid model config override:", error.message);
      }
    }
    return { config: await loadDefaultConfig(), custom: false };
  }

  function findProvider(config, providerId) {
    return config.providers.find((provider) => provider.id === providerId);
  }

  function findModel(provider, modelId) {
    return provider.models.find((model) => model.id === modelId);
  }

  /** First model of the first provider that ships one — used as a fallback. */
  function defaultModelRef(config) {
    for (const provider of config.providers) {
      if (provider.models.length > 0) {
        return formatModelRef(provider.id, provider.models[0].id);
      }
    }
    return "";
  }

  return {
    OVERRIDE_KEY,
    DEFAULT_CONFIG_PATH,
    parseModelRef,
    formatModelRef,
    parseConfig,
    normalizeConfig,
    loadDefaultConfig,
    loadConfig,
    findProvider,
    findModel,
    defaultModelRef,
  };
})();
