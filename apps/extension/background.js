chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "hgs-save-snippet",
    title: "Save to High Ground",
    contexts: ["selection", "page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "hgs-save-snippet") {
    // Determine the highlighted text or the page URL
    const highlightedText = info.selectionText || "";
    const sourceUrl = info.pageUrl;
    const sourceTitle = tab?.title || "Unknown Title";

    try {
      // Send the payload to the local Next.js API
      const response = await fetch("http://localhost:3000/api/snippets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer hgs_dev_token" // Hardcoded dev token for now
        },
        body: JSON.stringify({
          sourceUrl,
          sourceTitle,
          highlightedText
        })
      });

      if (response.ok) {
        console.log("Snippet saved successfully.");
        // We could create a notification or badge here, but we don't have icon files yet!
        await chrome.action.setBadgeText({ text: "OK" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
      } else {
        console.error("Failed to save snippet.");
        await chrome.action.setBadgeText({ text: "ERR" });
        await chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
      }
    } catch (err) {
      console.error("Fetch failed:", err);
      await chrome.action.setBadgeText({ text: "ERR" });
      await chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
    }
  }
});
