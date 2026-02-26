(function () {
  const STORAGE_KEY = "assignments";
  const SCAN_ENABLED_KEY = "scanEnabled";
  const MAX_ASSIGNMENTS = 1000;

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[key]);
      });
    });
  }

  function storageSet(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  function mergeAssignments(existing, incoming) {
    const isScheduleLikeTitle = (title) => {
      const text = String(title || "").toLowerCase();
      return text.includes("start:") && text.includes("due:");
    };

    const map = new Map();
    for (const item of existing) {
      if (isScheduleLikeTitle(item.title)) {
        continue;
      }
      map.set(item.id, item);
    }

    for (const item of incoming) {
      if (isScheduleLikeTitle(item.title)) {
        continue;
      }
      const prev = map.get(item.id);
      map.set(item.id, {
        ...prev,
        ...item,
        firstSeenAt: prev?.firstSeenAt || new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });
    }

    // Keep the dataset sorted and capped so popup rendering stays responsive.
    const merged = Array.from(map.values());
    merged.sort((a, b) => {
      const aTime = new Date(a.dueDateISO).getTime();
      const bTime = new Date(b.dueDateISO).getTime();
      return aTime - bTime;
    });

    return merged.slice(0, MAX_ASSIGNMENTS);
  }

  function isNotOverdueAtScan(item) {
    const dueTime = new Date(item.dueDateISO).getTime();
    if (Number.isNaN(dueTime)) {
      return false;
    }
    return dueTime >= Date.now();
  }

  function delay(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function extractWithRetries(attempts, waitMs) {
    let extracted = [];
    for (let i = 0; i < attempts; i += 1) {
      extracted = window.AssignmentExtractor.extractAssignmentsFromDom();
      if (extracted.length) {
        return extracted;
      }
      if (i < attempts - 1) {
        await delay(waitMs);
      }
    }
    return extracted;
  }

  async function scanAndStore(options = {}) {
    const attempts = options.attempts || 1;
    const waitMs = options.waitMs || 0;
    const save = options.save === true;

    // Skip non-LMS pages entirely to minimize overhead and avoid irrelevant data.
    if (!window.LMSDetector.isLikelyLmsUrl(window.location.href)) {
      return [];
    }

    const extracted = await extractWithRetries(attempts, waitMs);
    const filtered = extracted.filter(isNotOverdueAtScan);
    if (!filtered.length) {
      return [];
    }

    if (save) {
      const scanEnabled = await storageGet(SCAN_ENABLED_KEY);
      if (scanEnabled === false) {
        return filtered;
      }
      const existing = (await storageGet(STORAGE_KEY)) || [];
      const merged = mergeAssignments(existing, filtered);
      await storageSet({ [STORAGE_KEY]: merged });
    }

    return filtered;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !message ||
      (message.type !== "scanAssignmentsPreview" && message.type !== "scanAssignmentsSave")
    ) {
      return false;
    }

    if (!window.LMSDetector.isLikelyLmsUrl(window.location.href)) {
      sendResponse({
        supported: false,
        assignments: []
      });
      return false;
    }

    // SPA pages like McGraw Connect often render assignment cards asynchronously.
    scanAndStore({
      attempts: 12,
      waitMs: 350,
      save: message.type === "scanAssignmentsSave"
    })
      .then((assignments) => {
        sendResponse({
          supported: true,
          assignments: assignments || []
        });
      })
      .catch(() => {
        sendResponse({
          supported: true,
          assignments: []
        });
      });

    return true;
  });
})();
