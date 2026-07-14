---
type: source
title: "Observation: Activity Log windowed rendering fix"
slug: obs-2026-06-24-activity-log-windowed-rendering-fix
status: observation
created: 2026-06-24
updated: 2026-06-24
relevance: medium
observed_at: 2026-06-24T12:10:43.831Z
tags: ["main-street", "ui", "activity-log", "scrolling", "bugfix"]
source_context: "Implementing CG-0MQK4H9180049050: Activity Log scrolls off top of container"
---
# 🔍 Observation: Activity Log windowed rendering fix
Fixed Activity Log content overflowing its container by implementing windowed rendering. Previously all log entries were rendered in the logContentContainer with a geometry mask clipping the overflow. Now only entries within the visible panel area are rendered, determined by calculating maxDisplayEntries from the panel height divided by LOG_LINE_H. The scroll offset (logScrollOffset) is converted to a start index, and only that window of entries is rendered. The container stays at its initial Y position instead of being moved. The handleLogWheel handler triggers refreshLog after each scroll change. Commit 52715d7c pushed to dev.
*Relevance: medium*

*Context: Implementing CG-0MQK4H9180049050: Activity Log scrolls off top of container*

*Tags: main-street ui activity-log scrolling bugfix*
---
*Observed: 2026-06-24T12:10:43.831Z*