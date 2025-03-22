function trimStringWithEllipsis(str, n) {
  return str.length > n ? str.substring(0, n) + '...' : str;
}

// Initialize the add-on 
browser.runtime.onInstalled.addListener(async () => {
  // Prompt for API key on installation
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
      "promptSplit",
      "promptImprove",
      "promptHtml2Text",
      "selectedModel",
      "apiKey",
      "temperature",
      "maxTokens",
    ]);
    const promptSplit = settings.promptSplit;
    const promptImprove = settings.promptImprove;
    const promptHtml2Text = settings.promptHtml2Text;
    const selectedModel = settings.selectedModel;
    const apiKey = settings.apiKey;
    const temperature = settings.temperature;
    const maxTokens = settings.maxTokens ?? 2000; // Default to 2000 if not set

    if (!apiKey) {
      throw new Error(
        "API key not found. Please set up your API key in the extension settings."
      );
    }
    const htmlBody = trimStringWithEllipsis(composeWindow.body, 3000);
    
    // Split the email into draft and history
    const annotatedHtml = await promptAI(
      htmlBody,
      selectedModel,
      promptSplit, //"Given this email content, indicate with <!--EndOfDraft--> the end of the draft, and the start of the email signature / previous history of the conversation.",
      apiKey,
      temperature,
      maxTokens
    );
    const [draft, history] = annotatedHtml.split("<!--EndOfDraft-->");
    if (!draft.trim()) {
      throw new Error("Draft is empty. Please write an email before using the AI.");
    }
    
    const improvedHtml = await promptAI(
      draft,
      selectedModel,
      promptImprove,
      apiKey,
      temperature,
      maxTokens
    );

    // Join the improved text with the history
    const improvedHtmlWithHistory = `${improvedHtml}<br><br>${history}`;

    if (composeWindow.isPlainText) {
      const improvedText = await promptAI(
        improvedHtml,
        selectedModel,
        promptHtml2Text, //"This is the html code of the email. Please convert it to a plain text email. Do not change the content of the email, only the format. Use explicit line breaks to separate paragraphs.",
        apiKey,
        temperature,
        maxTokens
      );
      const improvedTextWithHistory = `${improvedText}\n\n${history}`;

      
      // Update the compose window with improved text
      await browser.compose.setComposeDetails(tab.id, {
        ...composeWindow,
        plainTextBody: improvedTextWithHistory,
      });
    } else {
      await browser.compose.setComposeDetails(tab.id, {
        ...composeWindow,
        body: improvedHtmlWithHistory,
      });
    }

    // Re-enable the button
    await browser.composeAction.enable(tab.id);
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
    } else {
      alert(
        "Failed to improve writing style. Please check your API key and try again."
      );
    }
  }
});

async function promptAI(
  text,
  model,
  systemPrompt,
  apiKey,
  temperature,
  maxTokens
) {
  if (!apiKey) {
    throw new Error("API key not found");
  }

  // Configure API endpoint and headers based on model
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
  } else {
    throw new Error("Unsupported model selected");
  }

  // Prepare request body based on API
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

  // Extract response based on API
  if (model.startsWith("google:")) {
    return data.candidates[0].content.parts[0].text;
  } else {
    return data.choices[0].message.content;
  }
}
