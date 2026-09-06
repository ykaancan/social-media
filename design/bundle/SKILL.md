---
name: brand-design
description: Use this skill to generate well-branded interfaces and assets for [BRAND] (the Erasmus-community wall & live-board app), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, en/tr strings and UI kit components for prototyping.
user-invocable: true
---

Read the readme.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Non-negotiables from the brief: anonymity level visible on every card (AnonymityBadge), locked cards visually distinct but honest (LockedCard), one saturated color per event (`--event`), projector mode dark and readable from 15 m, all copy in both `strings/en.json` and `strings/tr.json` (Turkish in "sen"), and one locale per surface: dates, month abbreviations (`dates.monthsShort`), labels and chips switch together — pass `locale="tr"` to components that render their own copy (`EventCard`), never hand-mix "Kas" with "Upcoming". Events can span one night (`day` + `month`) or several days (`dayEnd`, `monthEnd`) in every status.
