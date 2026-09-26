# Product

## Register

product

## Users

Indian shop owners (kirana, hardware, electricals, wholesale) who buy stock on GST tax invoices and keep the paper bills in a pile until their accountant asks for them. The main user sits at the counter after closing time, laptop beside the cash box under a bright tube light, clearing a stack of supplier bills one after another before the CA's weekly call. They are not accountants. They know what a GSTIN and CGST are, but checking every bill's math by hand is exactly the chore they skip. Their accountant is the second reader: they receive the exported purchase register.

## Product Purpose

Shoebox turns a phone photo of a bill into a GST-ready ledger entry, entirely on the user's own laptop. A local vision model copies what is printed; plain code checks it: GSTIN checksum (with a one-tap fix for look-alike misreads), CGST equals SGST, lines add up, tax matches the rates, grand total adds up, right tax type for the states involved, sane dates. The owner reviews, fixes, saves to the ledger, and exports a purchase-register CSV.

Success: a pile of bills becomes a clean ledger in minutes; every bill that could cost input tax credit (misread GSTIN, wrong totals, wrong tax type, duplicate) is caught before the CA sees it; nothing ever leaves the laptop.

## Brand Personality

Modern bahi-khata: the red cloth-bound ledger of an Indian trading shop, rebuilt as a precise instrument. Trustworthy, exact, quietly proud. Voice is plain and direct, like a good munim (accountant): short sentences, real numbers, no jargon without a plain explanation. It never guesses; when it isn't sure, it says what to check.

## Anti-references

- Tally or government portals: grey forms, cramped tables, 2005 energy.
- Generic SaaS dashboards: card grids, gradients, big-number hero stats.
- Cute consumer fintech: mascots, pastel illustrations, confetti.
- Dark "AI terminal" tools: black backgrounds, neon green, fake hacker vibe.
- Must be a light theme, and unique rather than templated.

## Design Principles

1. The model reads, the code decides. Every verdict shows the rule and the numbers behind it, never a vague confidence score.
2. Point at the exact problem. A wrong bill highlights the one field, character or line that is off, and offers the fix when there is one.
3. The ledger is the metaphor, not decoration. Ruled pages, stamped verdicts and double-ruled totals exist because they carry meaning an Indian trader already reads fluently.
4. Offline is a promise. Nothing in the interface implies a cloud, an account or a network call.
5. Clear the pile. Optimise for the tenth bill of the night: keyboard-friendly, fast to confirm, next bill already waiting.

## Accessibility & Inclusion

WCAG 2.2 AA. English copy. Full keyboard use with visible focus. Status is never shown by colour alone (every check has an icon and words). Reduced-motion users get instant state changes instead of animation. Money in Indian digit grouping (₹1,23,456.00), GSTINs in a monospaced face so 0/O and 1/I stay distinct.
