function trimStringWithEllipsis(str, n) {
  return str.length > n ? str.substring(0, n) + '...' : str;
}

function sanetizeLLMResult(llm_result) {
  llm_result = llm_result.replace("```html", '');
  llm_result = llm_result.replace("```", '');
  llm_result = llm_result.replace("'''html", '');
  llm_result = llm_result.replace("'''", '');
  llm_result = llm_result.replace('"""html', '');
  llm_result = llm_result.replace('"""', '');
  return llm_result;
}

// Initialize the add-on 
browser.runtime.onInstalled.addListener(async () => {
  // Prompt for API key and Options on installation
  const result = await browser.storage.local.get("apiKey");
  if (!result.apiKey) {
    browser.tabs.create({
      url: browser.runtime.getURL("options.html"),
    });
  }
});

// ===================================================
//  Message handler — popup sends requests here
// ===================================================
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "improve") {
    return handleImprove(message);
  } else if (message.action === "html2text") {
    return handleHtml2Text(message);
  }
});

async function handleImprove(message) {
  try {
    const settings = await browser.storage.local.get([
      "promptImprove",
      "promptHtml2Text",
      "selectedModel",
      "useConversationHistory"
    ]);
    const api_settings = await browser.storage.local.get([
      "apiKey",
      "temperature",
      "maxTokens",
      "customApiEndpoint",
      "customModel"
    ]);

    if (!api_settings.apiKey) {
      return { error: "API key not found. Please set your API key in settings." };
    }

    const selectedModel = settings.selectedModel;
    const useConversationHistory = settings.useConversationHistory;
    const promptImprove = settings.promptImprove;

    let history_trimmed = trimStringWithEllipsis(message.history || "", 3000);
    if (!useConversationHistory) {
      history_trimmed = "";
    }

    let systemPrompt = promptImprove;
    if (message.isNewEmail) {
      systemPrompt += "\n\nAlso generate 3 concise subject line alternatives for this email. Provide each subject wrapped exactly in <subject>...</subject> tags at the very beginning of your response.";
    }

    const improvedHtml = await promptAI(
      `<!--BEGIN DRAFT-->\n${message.draft}\n<!--END DRAFT-->\n<!-- BEGIN CONTEXT -->\n${history_trimmed}\n<!-- END CONTEXT -->`,
      selectedModel,
      systemPrompt,
      api_settings
    );

    return { improved: improvedHtml };
  } catch (error) {
    console.error("Error in handleImprove:", error);
    return { error: error.message };
  }
}

async function handleHtml2Text(message) {
  try {
    const settings = await browser.storage.local.get([
      "promptHtml2Text",
      "selectedModel"
    ]);
    const api_settings = await browser.storage.local.get([
      "apiKey",
      "temperature",
      "maxTokens",
      "customApiEndpoint",
      "customModel"
    ]);

    const plainText = await promptAI(
      message.html,
      settings.selectedModel,
      settings.promptHtml2Text,
      api_settings
    );

    return plainText;
  } catch (error) {
    console.error("Error in handleHtml2Text:", error);
    return { error: error.message };
  }
}

// ===================================================
//  AI prompt function (unchanged logic)
// ===================================================
async function promptAI(
  text,
  model,
  systemPrompt,
  api_settings
) {
  const apiKey = api_settings.apiKey;
  const temperature = api_settings.temperature;
  const maxTokens = api_settings.maxTokens
  
  // 1. Configure API endpoint and headers based on model
  let apiEndpoint, headers, modelName;
  if (model.startsWith("openai:")) {
    apiEndpoint = "https://api.openai.com/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    modelName = model.split(":")[1];
  } else if (model.startsWith("groq:")) {
    apiEndpoint = "https://api.groq.com/openai/v1/chat/completions";
    headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    modelName = model.split(":")[1];
  } else if (model.startsWith("google:")) {
    modelName = model.split(":")[1];
    apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    headers = {
      "Content-Type": "application/json",
    };
    console.log("Using Gemini API endpoint:", apiEndpoint.replace(apiKey, '***'));
  } else if (model.startsWith("custom:")) {
    apiEndpoint = api_settings.customApiEndpoint;
    headers = {
      "Content-Type": "application/json",
    };
    modelName = api_settings.customModel;
  } else {
    throw new Error("Unsupported model selected");
  }

  // 2. Prepare request body based on API
  let requestBody;
  if (model.startsWith("google:")) {
    requestBody = {
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: text,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: maxTokens,
      },
    };
  } else {
    requestBody = {
      model: modelName,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: temperature,
      max_tokens: maxTokens,
      stream: false,
    };
  }

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      console.error("API error response:", JSON.stringify(errorBody));
      if (errorBody.error) {
        errorDetail = errorBody.error.message || errorBody.error.status || errorDetail;
      }
    } catch (e) {
      // couldn't parse error body
    }
    throw new Error(`API request failed: ${errorDetail}`);
  }

  const data = await response.json();

  // 3. Extract response based on API
  let llm_result;
  if (model.startsWith("google:")) {
    llm_result = data.candidates[0].content.parts[0].text;
  } else if (model.startsWith("custom:")) {
    llm_result = data.message.content;
  } else {
    llm_result = data.choices[0].message.content;
  }

  return sanetizeLLMResult(llm_result);
}
