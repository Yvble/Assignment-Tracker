(function () {
  // Selector lists are intentionally broad to support Canvas, D2L, Blackboard and similar LMS DOMs.
  const TITLE_SELECTORS = [
    "h1",
    "h2",
    "h3",
    "[data-testid*='title']",
    "[class*='title' i]",
    "[class*='name' i]",
    "[class*='assignment' i] a",
    ".assignment-title",
    ".d2l-foldername",
    ".ig-title",
    ".name",
    ".set_name",
    ".problem-title"
  ];

  const DUE_SELECTORS = [
    "[data-testid*='due']",
    "[class*='due' i]",
    "[id*='due' i]",
    "[aria-label*='due' i]",
    "[data-due-date]",
    "[data-duedate]",
    "[data-date]",
    "[datetime]",
    ".due-date",
    ".assignment-date-due",
    ".dates",
    ".d2l-dates-text",
    ".set_due_date",
    ".dueDate",
    "time"
  ];

  const CANDIDATE_SELECTORS = [
    ".assignment-card",
    "[data-automation-id*='todo' i] li",
    "[data-automation-id*='assignment' i] li",
    "[data-automation-id*='todo' i] [class*='card' i]",
    "li",
    "tr",
    "article",
    ".assignment",
    "[class*='assignment' i]",
    "[class*='activity' i]",
    "[class*='homework' i]",
    "[class*='problem' i]",
    ".list-item",
    ".discussion-topic",
    ".calendar_event",
    ".todo-list-item",
    ".setlist2 tr",
    ".problem_set_table tr",
    ".contentTable tr"
  ];

  function sanitizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function getTitle(container) {
    for (const selector of TITLE_SELECTORS) {
      const node = container.querySelector(selector);
      if (!node) {
        continue;
      }

      const text = sanitizeText(node.textContent);
      if (text.length > 3) {
        return text;
      }
    }

    const fallback = sanitizeText(container.textContent).slice(0, 180);
    if (!fallback) {
      return null;
    }

    // Avoid using full schedule lines as titles (common in Connect wrappers).
    if (/\bstart:\b/i.test(fallback) && /\bdue:\b/i.test(fallback)) {
      return null;
    }

    return fallback;
  }

  function getDueDate(container) {
    for (const selector of DUE_SELECTORS) {
      const node = container.querySelector(selector);
      if (!node) {
        continue;
      }

      const candidateTexts = [
        node.getAttribute("datetime"),
        node.getAttribute("data-due-date"),
        node.getAttribute("data-duedate"),
        node.getAttribute("data-date"),
        node.textContent
      ]
        .map((x) => sanitizeText(x))
        .filter(Boolean);

      for (const text of candidateTexts) {
        const parsed = window.DateUtils.parseDateText(text);
        if (parsed) {
          return parsed;
        }
      }
    }

    // Fallback: only parse blocks that indicate a due/deadline context.
    const blockText = sanitizeText(container.textContent);
    if (!/\b(due|deadline)\b/i.test(blockText)) {
      return null;
    }
    return window.DateUtils.parseDateText(blockText);
  }

  function getLink(container) {
    const anchor = container.querySelector("a[href]");
    if (!anchor) {
      return window.location.href;
    }

    try {
      const rawHref = (anchor.getAttribute("href") || "").trim();
      if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("#")) {
        return window.location.href;
      }
      return new URL(rawHref, window.location.href).toString();
    } catch (error) {
      return window.location.href;
    }
  }

  function makeId(title, link, dueIso) {
    return `${title}||${link}||${dueIso || "no-date"}`.toLowerCase();
  }

  function isConnectPage() {
    const host = window.location.hostname.toLowerCase();
    return (
      host.includes("mheducation.com") ||
      host.includes("connect.mheducation") ||
      host.includes("newconnect")
    );
  }

  function isScheduleLikeTitle(title) {
    const text = sanitizeText(title).toLowerCase();
    return text.includes("start:") && text.includes("due:");
  }

  function parseConnectCardsOnly() {
    const cards = Array.from(document.querySelectorAll(".assignment-card"));
    const extracted = [];

    for (const container of cards) {
      const titleNode =
        container.querySelector(".assignment-card__first-row-title") ||
        container.querySelector("[data-automation-id*='assignment-name' i]") ||
        container.querySelector("[class*='first-row-title' i]") ||
        container.querySelector("h3");
      const dueNode =
        container.querySelector(".assignment-card__second-row") ||
        container.querySelector("[data-automation-id*='due' i]") ||
        container.querySelector("[class*='second-row' i]") ||
        container.querySelector("[class*='due' i]");

      const title = sanitizeText(titleNode?.textContent);
      const dueText = sanitizeText(dueNode?.textContent) || sanitizeText(container.textContent);

      if (!title || isScheduleLikeTitle(title) || !dueText || !/\bdue\b/i.test(dueText)) {
        continue;
      }

      const parsedDue = window.DateUtils.parseDateText(dueText);
      if (!parsedDue || !parsedDue.iso) {
        continue;
      }

      extracted.push({
        id: makeId(title, window.location.href, parsedDue.iso),
        title,
        dueDateISO: parsedDue.iso,
        dueDateText: parsedDue.display,
        assignmentUrl: window.location.href,
        sourceUrl: window.location.href,
        updatedAt: new Date().toISOString()
      });
    }

    const deduped = new Map();
    for (const item of extracted) {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item);
      }
    }
    return Array.from(deduped.values());
  }

  function extractAssignmentsFromDom() {
    if (isConnectPage()) {
      return parseConnectCardsOnly();
    }

    // Gather potential assignment containers from multiple structural patterns.
    const candidates = Array.from(
      new Set(
        CANDIDATE_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      )
    );

    const extracted = [];
    for (const container of candidates) {
      // Prevent duplicate parsing of wrappers that already contain a Connect card.
      if (!container.matches(".assignment-card") && container.querySelector(".assignment-card")) {
        continue;
      }

      // McGraw Hill Connect assignment cards.
      if (
        container.matches(".assignment-card") ||
        container.querySelector(".assignment-card__first-row-title")
      ) {
        const inConnectList = container.closest(
          "[data-automation-id='assignment-list'], [data-automation-id*='todo' i], [data-automation-id*='assignment' i]"
        );
        if (!inConnectList) {
          continue;
        }
        const titleNode =
          container.querySelector(".assignment-card__first-row-title") ||
          container.querySelector("[data-automation-id*='assignment-name' i]") ||
          container.querySelector("[class*='first-row-title' i]") ||
          container.querySelector("h3");
        const dueNode =
          container.querySelector(".assignment-card__second-row") ||
          container.querySelector("[data-automation-id*='due' i]") ||
          container.querySelector("[class*='second-row' i]") ||
          container.querySelector("[class*='due' i]");
        const title = sanitizeText(titleNode?.textContent);
        const dueText = sanitizeText(dueNode?.textContent) || sanitizeText(container.textContent);

        if (title && dueText && /\bdue\b/i.test(dueText)) {
          const parsedDue = window.DateUtils.parseDateText(dueText);
          if (parsedDue && parsedDue.iso) {
            extracted.push({
              id: makeId(title, window.location.href, parsedDue.iso),
              title,
              dueDateISO: parsedDue.iso,
              dueDateText: parsedDue.display,
              assignmentUrl: window.location.href,
              sourceUrl: window.location.href,
              updatedAt: new Date().toISOString()
            });
            continue;
          }
        }
      }

      // WeBWorK table rows: first cell is title, second cell often contains status/due text.
      if (container.matches("tr")) {
        const cells = container.querySelectorAll("td");
        if (cells.length >= 2) {
          const statusText = sanitizeText(cells[1].textContent);
          if (!/\b(due|deadline)\b/i.test(statusText)) {
            continue;
          }
          const parsedDue = window.DateUtils.parseDateText(statusText);
          if (!parsedDue || !parsedDue.iso) {
            continue;
          }

          const rowAnchor = cells[0].querySelector("a[href]");
          const rowTitle = sanitizeText(cells[0].textContent) || getTitle(container);
          if (!rowTitle) {
            continue;
          }

          const rowLink = rowAnchor
            ? new URL(rowAnchor.getAttribute("href"), window.location.href).toString()
            : getLink(container);

          extracted.push({
            id: makeId(rowTitle, rowLink, parsedDue.iso),
            title: rowTitle,
            dueDateISO: parsedDue.iso,
            dueDateText: parsedDue.display,
            assignmentUrl: rowLink,
            sourceUrl: window.location.href,
            updatedAt: new Date().toISOString()
          });
          continue;
        }
      }

      const due = getDueDate(container);
      if (!due || !due.iso) {
        continue;
      }

      const title = getTitle(container);
      if (!title || isScheduleLikeTitle(title)) {
        continue;
      }

      const link = getLink(container);
      extracted.push({
        id: makeId(title, link, due.iso),
        title,
        dueDateISO: due.iso,
        dueDateText: due.display,
        assignmentUrl: link,
        sourceUrl: window.location.href,
        updatedAt: new Date().toISOString()
      });
    }

    // De-duplicate by stable ID so repeated scans of dynamic pages do not spam storage.
    const deduped = new Map();
    for (const item of extracted) {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item);
      }
    }

    return Array.from(deduped.values());
  }

  window.AssignmentExtractor = {
    extractAssignmentsFromDom
  };
})();
