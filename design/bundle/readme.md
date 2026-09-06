# Design bundle snapshot

Read-only copy of the Claude Design project `53473b1a-7982-4553-910f-db1346106023`
("Design system for event platform"), fetched with the DesignSync tool on 2026-09-06.
`HANDOFF.md` in the parent folder is the written record of this bundle; the `.jsx`
CSS strings here are the pixel-level source of truth the React Native components in
`/app` were ported from.

Not included on purpose: `support.js`, `guidelines/dev-loader.js`, `guidelines/*.html`,
`*.dc.html` wrappers, `uploads/*.png` (canvas runtime and scaffolding, not product).
The four `components/*/*.card.html` files keep only the specimen `<script>` body.

Never edit these files. Re-fetch from the project if the design changes.
