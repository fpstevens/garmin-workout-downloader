if (!("browser" in self)) {
  self.browser = self.chrome;
}

function extractAuthHeader(e) {
  for (let header of e.requestHeaders) {
    if (header.name === "Authorization" && header.value.startsWith("Bearer")) {
      browser.storage.local.set({ garminAuthHeader: header.value });
    }
  }
}

browser.webRequest.onBeforeSendHeaders.addListener(
  extractAuthHeader,
  { urls: ["*://connect.garmin.com/*"] },
  ["requestHeaders", "extraHeaders"],
);

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.command === "getWorkouts") {
    chrome.tabs.query({ url: "*://connect.garmin.com/*" }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ error: "no_garmin_tab" });
        return;
      }

      const tabId = tabs[0].id;

      const listener = (msg) => {
        if (msg.status === "loadingSuccess" || msg.status === "loadingError") {
          chrome.runtime.onMessage.removeListener(listener);
          if (msg.status === "loadingError") {
            sendResponse({ error: "fetch_failed" });
            return;
          }
          chrome.storage.local.get(["workoutData"], (result) => {
            sendResponse({ data: result.workoutData || null });
          });
        }
      };
      chrome.runtime.onMessage.addListener(listener);

      chrome.tabs.sendMessage(tabId, {
        command: "fetch",
        numActivitiesToFetch: 20,
      });
    });

    return true;
  }
});