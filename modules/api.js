/**
 * Provider adapters. Every provider in `config/models.json` maps onto one of
 * three request shapes, so adding a provider (OpenRouter, a company gateway,
 * ...) is a config change rather than a code change.
 */
var AIWA = AIWA || {};

AIWA.api = (function () {
  class ApiError extends Error {
    constructor(message, { status = 0, provider = "" } = {}) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.provider = provider;
    }
  }

  function endpointFor(provider, settings, modelId) {
    const override = (settings.endpoints || {})[provider.id];
    const endpoint = (override || provider.endpoint || "").trim();
    if (!endpoint) {
      throw new ApiError(
        `No API endpoint configured for ${provider.label}.`,
        { provider: provider.id }
      );
    }
    return endpoint.replace("{model}", encodeURIComponent(modelId));
  }

  function apiKeyFor(provider, settings) {
    const apiKey = ((settings.apiKeys || {})[provider.id] || "").trim();
    if (!apiKey && provider.apiKey === "required") {
      throw new ApiError(`API key not found for ${provider.label}.`, {
        provider: provider.id,
      });
    }
    return apiKey;
  }

  function buildRequest(provider, model, { systemPrompt, text, settings }) {
    const modelId = model.id;
    const apiKey = apiKeyFor(provider, settings);
    const url = endpointFor(provider, settings, modelId);
    const headers = { "Content-Type": "application/json", ...provider.headers };
    const temperature =
      model.supportsTemperature === false ? undefined : settings.temperature;
    let body;

    switch (provider.api) {
      case "google": {
        if (apiKey) {
          headers["x-goog-api-key"] = apiKey;
        }
        body = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            maxOutputTokens: settings.maxTokens,
            ...(temperature === undefined ? {} : { temperature }),
          },
        };
        break;
      }
      case "ollama": {
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        body = {
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
          stream: false,
          options: {
            num_predict: settings.maxTokens,
            ...(temperature === undefined ? {} : { temperature }),
          },
        };
        break;
      }
      case "openai":
      default: {
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        // Newer OpenAI and Groq models expect `max_completion_tokens`, while
        // most OpenAI-compatible gateways still only know `max_tokens`.
        const maxTokensParam = provider.maxTokensParam || "max_tokens";
        body = {
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
          [maxTokensParam]: settings.maxTokens,
          ...(temperature === undefined ? {} : { temperature }),
          stream: false,
        };
        break;
      }
    }

    return { url, headers, body };
  }

  function extractText(provider, data) {
    let result;
    switch (provider.api) {
      case "google":
        result = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("");
        break;
      case "ollama":
        result = data?.message?.content ?? data?.response;
        break;
      default:
        result = data?.choices?.[0]?.message?.content;
        break;
    }
    if (typeof result !== "string" || !result.trim()) {
      throw new ApiError(
        `${provider.label} returned an empty response.`,
        { provider: provider.id }
      );
    }
    return result;
  }

  /** Pulls the human-readable error out of whatever the provider returned. */
  async function readErrorMessage(response) {
    const raw = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(raw);
      const message =
        parsed?.error?.message || parsed?.error || parsed?.message || "";
      if (typeof message === "string" && message) {
        return message;
      }
    } catch (error) {
      // Not JSON - fall through to the raw body.
    }
    return raw.slice(0, 300);
  }

  async function request(url, options, provider) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      // A blocked cross-origin request surfaces here as a generic TypeError.
      throw new ApiError(
        `Could not reach ${provider.label} at ${url}. ${error.message}`,
        { provider: provider.id }
      );
    }
    if (!response.ok) {
      const detail = await readErrorMessage(response);
      throw new ApiError(
        `${provider.label} request failed (HTTP ${response.status})` +
          (detail ? `: ${detail}` : "."),
        { status: response.status, provider: provider.id }
      );
    }
    return response.json();
  }

  /** Runs one completion against the configured provider. */
  async function complete({ provider, model, systemPrompt, text, settings }) {
    const { url, headers, body } = buildRequest(provider, model, {
      systemPrompt,
      text,
      settings,
    });
    const data = await request(
      url,
      { method: "POST", headers, body: JSON.stringify(body) },
      provider
    );
    return extractText(provider, data);
  }

  /**
   * Fetches the provider's live model list, for providers that expose one
   * (`modelsUrl` in the config). Used by the settings page.
   */
  async function listModels(provider, apiKey) {
    if (!provider.modelsUrl) {
      throw new ApiError(`${provider.label} has no model list endpoint.`, {
        provider: provider.id,
      });
    }
    const headers = { ...provider.headers };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const data = await request(
      provider.modelsUrl,
      { method: "GET", headers },
      provider
    );
    const entries = provider.api === "ollama" ? data?.models : data?.data;
    if (!Array.isArray(entries)) {
      throw new ApiError(`${provider.label} returned an unexpected model list.`, {
        provider: provider.id,
      });
    }
    return entries
      .map((entry) => {
        const id = entry?.id || entry?.name || entry?.model;
        if (!id) {
          return null;
        }
        return { id, label: entry?.name && entry.name !== id ? entry.name : id };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return { ApiError, complete, listModels, buildRequest, extractText };
})();
