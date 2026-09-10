-- =====================================================================
-- Reference data. NEVER EDITED ONCE APPLIED — a wrong or missing section is a
-- new migration, not a hand edit.
--
-- [B13] This is the only seeded data in the product. No people, no events, no
-- messages, ever (product principle 4, "Never fake anything").
--
-- The list below is the publicly known set of ESN sections in Türkiye.
-- >>> THE FOUNDER CONFIRMS THIS LIST BEFORE THE FIRST DEPLOY. <<<
-- Corrections after that ship as V3__sections_*.sql.
--
-- [D11] Country is reached only through the section, and means where the person
-- sits in the network, not their nationality — so one country row is enough for
-- stage 1, and every section here points at it.
-- =====================================================================

insert into country (code, name)
values ('TR', 'Türkiye');

insert into section (name, country_code)
values ('ESN Ankara', 'TR'),
       ('ESN METU', 'TR'),
       ('ESN Bilkent', 'TR'),
       ('ESN Hacettepe', 'TR'),
       ('ESN Gazi', 'TR'),
       ('ESN İzmir', 'TR'),
       ('ESN Ege', 'TR'),
       ('ESN DEU', 'TR'),
       ('ESN Boğaziçi', 'TR'),
       ('ESN ITU', 'TR'),
       ('ESN Marmara', 'TR'),
       ('ESN Yeditepe', 'TR'),
       ('ESN İstanbul', 'TR'),
       ('ESN Sabancı', 'TR'),
       ('ESN Koç', 'TR'),
       ('ESN Uludağ', 'TR'),
       ('ESN Anadolu', 'TR'),
       ('ESN Kocaeli', 'TR'),
       ('ESN Selçuk', 'TR'),
       ('ESN Akdeniz', 'TR'),
       ('ESN Çukurova', 'TR'),
       ('ESN Erciyes', 'TR'),
       ('ESN Samsun', 'TR'),
       ('ESN KTÜ', 'TR'),
       ('ESN Pamukkale', 'TR'),
       ('ESN Muğla', 'TR');
