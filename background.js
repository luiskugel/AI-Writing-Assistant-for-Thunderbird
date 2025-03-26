function trimStringWithEllipsis(str, n) {
  return str.length > n ? str.substring(0, n) + '...' : str;
}

function splitHtmlByTag(htmlString, tagName) {
  const index = htmlString.indexOf(tagName);
  if (index === -1) {
    return [htmlString, '']; // tag not found
  }
  const before = htmlString.slice(0, index);
  const after = htmlString.slice(index);
  return [before, after];
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

// Listen for the compose action button click
browser.composeAction.onClicked.addListener(async (tab) => {
  // Get the current compose window
  const composeWindow = await browser.compose.getComposeDetails(tab.id);

  try {
    // Disable the button while processing
    await browser.composeAction.disable(tab.id);

    // Get the custom prompt and model from settings
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
    const promptImprove = settings.promptImprove;
    const promptHtml2Text = settings.promptHtml2Text;
    const selectedModel = settings.selectedModel;
    const useConversationHistory = settings.useConversationHistory;
    
    // Split the draft from the history
    const [draft, history] = splitHtmlByTag(composeWindow.body, '<div class="moz-cite-prefix">');
    if (!draft.trim()) {
      throw new Error("Draft is empty. Please write an email before using the AI.");
    }

    let history_trimmed = trimStringWithEllipsis(history, 3000);
    if (!useConversationHistory) {
      history_trimmed = "";
    }

    // Improve the writing of the draft
    const improvedHtml = await promptAI(
      `<!--BEGIN DRAFT-->\n${draft}\n<!--END DRAFT-->\n<!-- BEGIN CONTEXT -->\n${history_trimmed}\n<!-- END CONTEXT -->`,
      selectedModel,
      promptImprove,
      api_settings
    );

    // Join the improved text with the history and update the compose window
    // Depending on plain text or HTML different compose details must be set
    if (composeWindow.isPlainText) {
      const improvedText = await promptAI(
        improvedHtml,
        selectedModel,
        promptHtml2Text, 
        api_settings
      );
      const improvedTextWithHistory = `${improvedText}\n\n${history}`;
      await browser.compose.setComposeDetails(tab.id, {
        ...composeWindow,
        plainTextBody: improvedTextWithHistory,
      });
    } else {
      const improvedHtmlWithHistory = `${improvedHtml}<br><br>${history}`;
      await browser.compose.setComposeDetails(tab.id, {
        ...composeWindow,
        body: improvedHtmlWithHistory,
      });
    }

    // Re-enable the button
    await browser.composeAction.enable(tab.id);
  
    // Error handling
  } catch (error) {
    console.error("Error improving writing style:", error);
    // Re-enable the button
    await browser.composeAction.enable(tab.id);
    // Show error notification with option to open settings
    if (error.message.includes("API key not found")) {
      if (
        confirm(
          "API key not found. Would you like to open the settings page to set up your API key?"
        )
      ) {
        browser.runtime.openOptionsPage();
      }
    } else if (error.message.includes("Cross-Origin")) {
      alert(
        "Ollama Requires to set 'OLLAMA_ORIGINS \"moz-extension://*\" see https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-web-origins-to-access-ollama."
      );
    } else {
      alert(
        "Failed to improve writing. Please check your API key and try again."
      );
    }
  }
});

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
    apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    headers = {
      "Content-Type": "application/json",
    };
    modelName = model.split(":")[1];
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
      contents: [
        {
          parts: [
            {
              text: `${systemPrompt}\n\n${text}`,
            },
          ],
        },
      ],
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
    throw new Error("API request failed");
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
