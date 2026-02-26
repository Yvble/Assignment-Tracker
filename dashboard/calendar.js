const STORAGE_KEY = "assignments";
const SCAN_ENABLED_KEY = "scanEnabled";
const DUE_SOON_MS = 48 * 60 * 60 * 1000;
const DUE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthLabelEl = document.getElementById("monthLabel");
const weekdayRowEl = document.getElementById("weekdayRow");
const calendarGridEl = document.getElementById("calendarGrid");
const detailsLabelEl = document.getElementById("detailsLabel");
const assignmentListEl = document.getElementById("assignmentList");
const emptyStateEl = document.getElementById("emptyState");

const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const openTabBtn = document.getElementById("openTabBtn");
const donutChartEl = document.getElementById("donutChart");
const donutTotalEl = document.getElementById("donutTotal");
const overdueCountEl = document.getElementById("overdueCount");
const dueWeekCountEl = document.getElementById("dueWeekCount");
const futureCountEl = document.getElementById("futureCount");

let allAssignments = [];
let selectedDateKey = null;
const viewDate = new Date();
viewDate.setDate(1);

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

function toDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function assignmentDateKey(item) {
  const dt = new Date(item.dueDateISO);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return toDateKey(dt);
}

function dateFromKey(dateKey) {
  const parts = (dateKey || "").split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dateKeyLabel(dateKey) {
  const dt = dateFromKey(dateKey);
  return dt ? dt.toLocaleDateString() : "Selected Day";
}

function dueState(iso) {
  const now = Date.now();
  const dueTime = new Date(iso).getTime();
  if (Number.isNaN(dueTime)) {
    return "none";
  }
  if (dueTime < now) {
    return "overdue";
  }
  return dueTime - now <= DUE_SOON_MS ? "soon" : "none";
}

function weekBounds(baseDate) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(baseDate.getDate() - baseDate.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function statusBucket(iso) {
  const nowDate = new Date();
  const now = nowDate.getTime();
  const dueTime = new Date(iso).getTime();
  if (Number.isNaN(dueTime)) {
    return "none";
  }
  if (dueTime < now) {
    return "overdue";
  }

  const { start, end } = weekBounds(nowDate);
  if (dueTime >= start.getTime() && dueTime <= end.getTime()) {
    return "week";
  }
  return "future";
}

function sortAssignments(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.dueDateISO).getTime();
    const bTime = new Date(b.dueDateISO).getTime();
    return aTime - bTime;
  });
}

function activeAssignments() {
  return allAssignments;
}

function assignmentsByDay(assignments) {
  const map = new Map();
  for (const item of assignments) {
    const key = assignmentDateKey(item);
    if (!key) {
      continue;
    }
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function renderWeekdays() {
  weekdayRowEl.innerHTML = "";
  for (const day of WEEKDAYS) {
    const el = document.createElement("div");
    el.className = "weekday";
    el.textContent = day;
    weekdayRowEl.appendChild(el);
  }
}

function renderList(items, labelText) {
  detailsLabelEl.textContent = labelText;
  assignmentListEl.innerHTML = "";

  if (!items.length) {
    emptyStateEl.classList.remove("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");
  for (const item of items) {
    const li = document.createElement("li");
    const state = dueState(item.dueDateISO);
    li.className = `assignment${state === "none" ? "" : ` ${state}`}${item.completed ? " completed" : ""}`;

    const link = document.createElement("a");
    link.href = item.assignmentUrl || item.sourceUrl || "#";
    link.textContent = item.title || "Untitled Assignment";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const dueMeta = document.createElement("div");
    dueMeta.className = "meta";
    dueMeta.textContent = `Due: ${new Date(item.dueDateISO).toLocaleString()}`;

    const actions = document.createElement("div");
    actions.className = "assignment-actions";

    const doneLabel = document.createElement("label");
    doneLabel.className = "done-toggle";
    const doneInput = document.createElement("input");
    doneInput.type = "checkbox";
    doneInput.checked = Boolean(item.completed);
    doneInput.dataset.assignmentId = item.id;
    doneInput.dataset.action = "toggle-complete";
    doneLabel.appendChild(doneInput);
    doneLabel.appendChild(document.createTextNode("Done"));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.dataset.assignmentId = item.id;
    removeBtn.dataset.action = "remove-assignment";

    actions.appendChild(doneLabel);
    actions.appendChild(removeBtn);

    li.appendChild(link);
    li.appendChild(dueMeta);
    li.appendChild(actions);
    assignmentListEl.appendChild(li);
  }
}

function renderDonutSummary(assignments) {
  const totals = {
    overdue: 0,
    week: 0,
    future: 0
  };

  for (const item of assignments) {
    const bucket = statusBucket(item.dueDateISO);
    if (bucket !== "none") {
      totals[bucket] += 1;
    }
  }

  const total = totals.overdue + totals.week + totals.future;
  const overduePct = total ? (totals.overdue / total) * 100 : 0;
  const weekPct = total ? (totals.week / total) * 100 : 0;
  const p1 = overduePct;
  const p2 = overduePct + weekPct;

  donutChartEl.classList.remove("ready");
  donutChartEl.style.setProperty("--p1", `${p1}%`);
  donutChartEl.style.setProperty("--p2", `${p2}%`);
  requestAnimationFrame(() => {
    donutChartEl.classList.add("ready");
  });

  donutTotalEl.textContent = String(total);
  overdueCountEl.textContent = String(totals.overdue);
  dueWeekCountEl.textContent = String(totals.week);
  futureCountEl.textContent = String(totals.future);
}

function renderCalendar() {
  const month = viewDate.getMonth();
  const year = viewDate.getFullYear();
  const today = new Date();
  const todayKey = toDateKey(today);
  const { start: weekStart, end: weekEnd } = weekBounds(today);

  monthLabelEl.textContent = viewDate.toLocaleString(undefined, {
    month: "long",
    year: "numeric"
  });

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const byDay = assignmentsByDay(activeAssignments());

  calendarGridEl.innerHTML = "";

  for (let i = 0; i < 42; i += 1) {
    const dayEl = document.createElement("button");
    dayEl.type = "button";
    dayEl.className = "day";

    let dayNumber;
    let dateObj;
    if (i < startWeekday) {
      dayNumber = prevMonthDays - (startWeekday - i - 1);
      dateObj = new Date(year, month - 1, dayNumber);
      dayEl.classList.add("muted");
    } else if (i >= startWeekday + daysInMonth) {
      dayNumber = i - (startWeekday + daysInMonth) + 1;
      dateObj = new Date(year, month + 1, dayNumber);
      dayEl.classList.add("muted");
    } else {
      dayNumber = i - startWeekday + 1;
      dateObj = new Date(year, month, dayNumber);
    }

    const dateKey = toDateKey(dateObj);
    const items = sortAssignments(byDay.get(dateKey) || []);

    if (dateObj >= weekStart && dateObj <= weekEnd) {
      dayEl.classList.add("current-week");
    }
    if (dateKey === todayKey) {
      dayEl.classList.add("current-day");
    }

    if (selectedDateKey === dateKey) {
      dayEl.classList.add("selected");
    }

    const dayNumberEl = document.createElement("div");
    dayNumberEl.className = "day-number";
    dayNumberEl.textContent = String(dayNumber);
    dayEl.appendChild(dayNumberEl);

    if (items.length) {
      const hasOverdue = items.some((x) => dueState(x.dueDateISO) === "overdue");
      const hasSoon = items.some((x) => dueState(x.dueDateISO) === "soon");
      const hasCompleted = items.some((x) => Boolean(x.completed));

      if (hasOverdue) {
        dayEl.classList.add("due-overdue");
      } else if (hasSoon) {
        dayEl.classList.add("due-soon");
      }
      if (hasCompleted) {
        dayEl.classList.add("done-mark");
      }

      const badgeRow = document.createElement("div");
      badgeRow.className = "badge-row";

      const totalBadge = document.createElement("span");
      totalBadge.className = "badge";
      totalBadge.textContent = `${items.length} due`;
      badgeRow.appendChild(totalBadge);

      if (hasSoon) {
        const soonBadge = document.createElement("span");
        soonBadge.className = "badge soon";
        soonBadge.textContent = "48h";
        badgeRow.appendChild(soonBadge);
      }

      if (hasOverdue) {
        const overdueBadge = document.createElement("span");
        overdueBadge.className = "badge overdue";
        overdueBadge.textContent = "Overdue";
        badgeRow.appendChild(overdueBadge);
      }

      dayEl.appendChild(badgeRow);
    }

    dayEl.addEventListener("click", () => {
      selectedDateKey = dateKey;
      renderCalendar();
      renderList(items, `Assignments on ${dateObj.toLocaleDateString()}`);
    });

    calendarGridEl.appendChild(dayEl);
  }
}

function detectInTab() {
  return new Promise((resolve) => {
    chrome.tabs.getCurrent((tab) => {
      resolve(Boolean(tab && tab.id));
    });
  });
}

async function toggleAssignmentCompleted(id, completed) {
  allAssignments = allAssignments.map((item) =>
    item.id === id
      ? {
          ...item,
          completed
        }
      : item
  );
  await storageSet({ [STORAGE_KEY]: allAssignments });
}

async function removeAssignment(id) {
  allAssignments = allAssignments.filter((item) => item.id !== id);
  await storageSet({ [STORAGE_KEY]: allAssignments });
}

async function rerenderForSelection() {
  const currentItems = activeAssignments().filter(
    (item) => assignmentDateKey(item) === selectedDateKey
  );
  renderDonutSummary(activeAssignments());
  renderCalendar();
  renderList(currentItems, `Assignments on ${dateKeyLabel(selectedDateKey)}`);
}

async function init() {
  renderWeekdays();
  allAssignments = sortAssignments((await storageGet(STORAGE_KEY)) || []);
  selectedDateKey = toDateKey(new Date());
  renderDonutSummary(activeAssignments());

  renderCalendar();

  const todayItems = activeAssignments().filter(
    (item) => assignmentDateKey(item) === selectedDateKey
  );
  renderList(todayItems, `Assignments on ${new Date().toLocaleDateString()}`);

  prevMonthBtn.addEventListener("click", () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
  });

  if (openTabBtn) {
    openTabBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/calendar.html") });
    });
  }

  assignmentListEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset.action !== "remove-assignment") {
      return;
    }
    const id = target.dataset.assignmentId;
    if (!id) {
      return;
    }
    await removeAssignment(id);
    await rerenderForSelection();
  });

  assignmentListEl.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.action !== "toggle-complete") {
      return;
    }
    const id = target.dataset.assignmentId;
    if (!id) {
      return;
    }
    await toggleAssignmentCompleted(id, target.checked);
    await rerenderForSelection();
  });

  const inTab = await detectInTab();
  if (inTab && openTabBtn) {
    openTabBtn.style.display = "none";
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[STORAGE_KEY]) {
      const nextAssignments = Array.isArray(changes[STORAGE_KEY].newValue)
        ? changes[STORAGE_KEY].newValue
        : [];
      allAssignments = sortAssignments(nextAssignments);
      renderDonutSummary(activeAssignments());
      renderCalendar();

      const selectedItems = activeAssignments().filter(
        (item) => assignmentDateKey(item) === selectedDateKey
      );
      renderList(
        selectedItems,
        `Assignments on ${dateKeyLabel(selectedDateKey)}`
      );
    }

  });
}

init().catch(() => {
  renderWeekdays();
  renderCalendar();
  renderList([], "Assignments");
});
