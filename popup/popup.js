const statusTextEl = document.getElementById("statusText");
const resultSummaryEl = document.getElementById("resultSummary");
const assignmentListEl = document.getElementById("assignmentList");
const savedMessageEl = document.getElementById("savedMessage");
const openDashboardBtn = document.getElementById("openDashboardBtn");

function setStatus(text, type) {
  statusTextEl.textContent = text;
  statusTextEl.className = `status ${type}`;
}

function clearResults() {
  assignmentListEl.innerHTML = "";
  resultSummaryEl.classList.add("hidden");
  savedMessageEl.classList.add("hidden");
}

function formatDue(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return "Unknown due date";
  }
  return dt.toLocaleString();
}

function renderResults(assignments) {
  clearResults();

  resultSummaryEl.classList.remove("hidden");
  resultSummaryEl.textContent = `Assignments Found: ${assignments.length}`;

  for (const assignment of assignments) {
    const li = document.createElement("li");
    li.className = "assignment-item";

    const title = document.createElement("p");
    title.className = "assignment-title";
    title.textContent = assignment.title || "Untitled Assignment";

    const due = document.createElement("p");
    due.className = "assignment-due";
    due.textContent = `Due: ${formatDue(assignment.dueDateISO)}`;

    li.appendChild(title);
    li.appendChild(due);
    assignmentListEl.appendChild(li);
  }

  savedMessageEl.classList.remove("hidden");
}

function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

function sendScanMessage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "scanAssignmentsNow" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });
}

function injectContentScripts(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "lib/date-utils.js",
      "lib/lms-detector.js",
      "lib/extractor.js",
      "content/content.js"
    ]
  });
}

async function runDetectionFlow() {
  setStatus("🔍 Scanning current page...", "scanning");
  clearResults();

  const tab = await queryActiveTab();
  if (!tab || !tab.id || !tab.url) {
    setStatus("⚠️ This page is not supported", "warning");
    return;
  }

  if (!window.LMSDetector.isLikelyLmsUrl(tab.url)) {
    setStatus("⚠️ This page is not supported", "warning");
    return;
  }

  let response = null;
  try {
    response = await sendScanMessage(tab.id);
  } catch (error) {
    try {
      await injectContentScripts(tab.id);
      response = await sendScanMessage(tab.id);
    } catch (injectError) {
      setStatus("⚠️ This page is not supported", "warning");
      return;
    }
  }

  if (!response || !response.supported) {
    setStatus("⚠️ This page is not supported", "warning");
    return;
  }

  const found = Array.isArray(response.assignments) ? response.assignments : [];
  if (!found.length) {
    setStatus("ℹ️ No assignments found", "info");
    return;
  }

  setStatus(
    `✅ ${found.length} assignment${found.length === 1 ? "" : "s"} detected`,
    "success"
  );
  renderResults(found);
}

openDashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/calendar.html") });
});

runDetectionFlow().catch(() => {
  setStatus("⚠️ This page is not supported", "warning");
  clearResults();
});
