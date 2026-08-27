# HMS UI Design Exploration

## Three Possible Directions

| Theme Name | Very Brief Intro | Probability |
| --- | --- | ---: |
| Clinical Ledger | A crisp hospital operations console inspired by printed patient charts, appointment boards, and pharmacy labels. It feels trustworthy and highly legible rather than consumer-app glossy. | 0.07 |
| Quiet Rounds | A soft, daylight-oriented care workspace with generous breathing room, sage tints, and editorial typography. It emphasizes calm review and humane coordination. | 0.04 |
| Signal Ward | A dense dark-mode incident-control view for urgent care operations, using data pulses and compact status surfaces. It prioritizes speed and high-contrast scanning. | 0.09 |

## Chosen Direction — Clinical Ledger

**Design Movement:** Clinical modernism blended with hospital charting systems and editorial information design.

**Core Principles:** The application will privilege calm hierarchy over visual noise, show data as operational evidence, use deliberate asymmetry rather than a generic centered dashboard, and make workflow state visible through restrained color coding. Interfaces will use crisp surfaces, strong type contrast, and meaningful composition instead of decorative gradients or generic rounded-card grids.

**Color Philosophy:** Warm paper white and near-black navy establish trust and preserve long-session legibility. A saturated surgical teal acts as the ownable action color, while pale aqua, chart blue, amber, and rose are reserved for information states such as scheduled, completed, pending, and urgent—not decoration.

**Layout Paradigm:** A permanent narrow left rail creates a clinical-record spine; the main workspace is an asymmetric editorial canvas with a top command strip, a wide activity area, and a smaller context column. Lists and panels are aligned to a 12-column rhythm, but the hero dashboard will use a feature-driven composition rather than a uniform card grid.

**Signature Elements:** A vertical patient-file marker in the sidebar, small uppercase data labels above key content, and an offset teal “care pulse” dot/timeline will recur throughout the product. Status markers will resemble precise chart stamps rather than casual tags.

**Interaction Philosophy:** Every interaction must support a demonstrable hospital workflow. Sidebar navigation swaps working modules; search filters patient records; appointment, patient, and payment actions open functional dialogs; report tabs change the visible analysis. Motion is quick and quiet, confirming changes without distracting from data.

**Animation:** Under `prefers-reduced-motion: no-preference`, new content will enter with 180ms opacity/translate transitions using a custom ease-out. Hover elevation and button press feedback will stay under 160ms and animate only transform and opacity. There will be no looping dashboard animation or decorative motion.

**Typography System:** **DM Serif Display** is reserved for the primary dashboard welcome and major record names, supplying human seriousness. **Manrope** is used for UI labels, tables, and controls in 500–800 weights. **IBM Plex Mono** is used for IDs, timestamps, and billing values. The hierarchy favors compact uppercase metadata, 15–16px interface text, 28–36px headings, and one restrained 44px display welcome.

**Brand Essence:** A clinical operations workspace for small hospital teams that turns fragmented records into calm, actionable care coordination. Personality: precise, reassuring, disciplined.

**Brand Voice:** Headlines are concise and operational; CTAs use clear verbs; microcopy explains state without drama. Examples: “Today’s care, in order.” and “Record the visit before the details drift.” Generic filler such as “Welcome to our website” and “Get started today” is prohibited.

**Wordmark & Logo:** The mark is a bold, textless “patient file with care pulse” symbol: a squared vertical file tab intersected by a clean teal pulse line and a single circular record marker. The wordmark pairs the mark with the product name in a distinct serif/sans composition rather than a default system font.

**Signature Brand Color:** **Surgical Teal — #007C83**.

## Style Decisions

- Dark surfaces are now reserved for clinical record artifacts and operational focus zones rather than generic feature panels.
- The patient-file tab and care-pulse marker recur in the hero, care summary, appointment evidence, and side intelligence panels.
- Visible product copy describes a live hospital workspace and avoids demo, sample, or builder-facing language.
