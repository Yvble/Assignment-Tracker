# LMS Assignment Due Date Collector

Chrome Extension that automatically extracts assignment due dates from LMS pages and stores them locally.

## Features
- Detects likely LMS pages (Canvas, D2L/Brightspace, Blackboard, Moodle, Schoology, and `lite.msu.edu`).
- Explicitly supports extraction on WeBWorK, LON-CAPA, and McGraw Hill Connect pages.
- Extracts:
  - Assignment title
  - Due date (normalized to ISO-8601)
  - Assignment link
- Stores data in `chrome.storage.local`.
- Calendar home UI (extension homepage):
  - Monthly calendar with due-date badges
  - Highlights due soon (48h) and overdue assignments
  - Click any day to view assignment details
  - Exports all assignments as JSON
  - "Open Website View" to launch the same calendar in a full browser tab

## Install (Developer Mode)
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Browse LMS pages and open the extension popup to view collected assignments.

## Data Schema
Each assignment entry includes:
- `id`
- `title`
- `dueDateISO`
- `dueDateText`
- `assignmentUrl`
- `sourceUrl`
- `updatedAt`
- `firstSeenAt`
- `lastSeenAt`
