chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["assignments"], (result) => {
    if (chrome.runtime.lastError) {
      return;
    }

    if (!Array.isArray(result.assignments)) {
      chrome.storage.local.set({ assignments: [] });
    }
  });
});
