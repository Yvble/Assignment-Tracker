(function () {
  const DATE_PATTERN =
    /\b(?:due[:\s-]*)?((?:mon|tue|wed|thu|fri|sat|sun)?\.?,?\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{2,4})?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i;

  const NUMERIC_DATE_PATTERN =
    /\b(?:due[:\s-]*)?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i;

  function parseFlexibleDate(text) {
    const cleaned = (text || "").trim();
    if (!cleaned) {
      return null;
    }

    const direct = new Date(cleaned);
    if (!Number.isNaN(direct.getTime())) {
      return direct;
    }

    // Common LMS format: "Jan 23, 2026 at 11:59 PM EST"
    const withoutAt = cleaned.replace(/\s+at\s+/i, " ");
    const parsedWithoutAt = new Date(withoutAt);
    if (!Number.isNaN(parsedWithoutAt.getTime())) {
      return parsedWithoutAt;
    }

    // Connect sometimes appends timezone abbreviations that can parse inconsistently.
    const withoutTz = withoutAt.replace(/\s+(?:est|edt|cst|cdt|mst|mdt|pst|pdt)\b/gi, "");
    const parsedWithoutTz = new Date(withoutTz);
    if (!Number.isNaN(parsedWithoutTz.getTime())) {
      return parsedWithoutTz;
    }

    return null;
  }

  function normalizeYear(yearText) {
    if (!yearText) {
      return new Date().getFullYear();
    }

    const yearNum = Number(yearText);
    if (yearNum < 100) {
      return 2000 + yearNum;
    }
    return yearNum;
  }

  function parseNumericDate(raw) {
    const trimmed = raw.trim();
    const match = trimmed.match(
      /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i
    );

    if (!match) {
      return null;
    }

    let month = Number(match[1]);
    const day = Number(match[2]);
    const year = normalizeYear(match[3]);
    let hours = match[4] ? Number(match[4]) : 23;
    const minutes = match[5] ? Number(match[5]) : 59;
    const period = match[6] ? match[6].toLowerCase() : null;

    if (period === "pm" && hours < 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    month -= 1;
    const parsed = new Date(year, month, day, hours, minutes, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseDateText(rawText) {
    if (!rawText) {
      return null;
    }

    const text = rawText.replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();

    // Avoid treating "will open on ..." as due dates.
    if (lower.includes("will open on") && !lower.includes("due")) {
      return null;
    }

    // On platforms like McGraw Hill Connect, one line can include both
    // "Start: ..." and "Due: ...". Prioritize the due segment.
    if (lower.includes("due")) {
      const dueStartIndex = lower.indexOf("due");
      const dueSegment = text.slice(dueStartIndex);
      const dueOnlyText = dueSegment.replace(/^due[:\s-]*/i, "").trim();

      const dueMonthMatch = dueOnlyText.match(DATE_PATTERN);
      if (dueMonthMatch) {
        const parsed = parseFlexibleDate(dueMonthMatch[0].replace(/^due[:\s-]*/i, "").trim());
        if (parsed) {
          return {
            iso: parsed.toISOString(),
            display: dueMonthMatch[0].replace(/^due[:\s-]*/i, "").trim()
          };
        }
      }

      const dueNumericMatch = dueOnlyText.match(NUMERIC_DATE_PATTERN);
      if (dueNumericMatch) {
        const parsedNumeric = parseNumericDate(dueNumericMatch[1]);
        if (parsedNumeric) {
          return {
            iso: parsedNumeric.toISOString(),
            display: dueNumericMatch[1]
          };
        }
      }
    }

    const monthLikeMatch = text.match(DATE_PATTERN);
    if (monthLikeMatch) {
      const maybeDateText = monthLikeMatch[0].replace(/^due[:\s-]*/i, "").trim();
      const parsed = parseFlexibleDate(maybeDateText);
      if (parsed) {
        return {
          iso: parsed.toISOString(),
          display: maybeDateText
        };
      }
    }

    const numericMatch = text.match(NUMERIC_DATE_PATTERN);
    if (numericMatch) {
      const numericText = numericMatch[1];
      const parsedNumeric = parseNumericDate(numericText);
      if (parsedNumeric) {
        return {
          iso: parsedNumeric.toISOString(),
          display: numericText
        };
      }
    }

    const fallback = parseFlexibleDate(text);
    if (fallback) {
      return {
        iso: fallback.toISOString(),
        display: text
      };
    }

    return null;
  }

  window.DateUtils = {
    parseDateText
  };
})();
