# Architecture Layer, Part 1: Reconciliation, Multnomah Constraints, Governance

**Author/work attribution:** Anthropic / claude-sonnet-5-5. All design decisions, placeholders and calculations here are this assistant's work, not government decisions or user-confirmed facts.
**Series:** Part 1 (this file), Part 2 `homelessness_architecture_part2_claude.md` (front door, allocation, contracting), Part 3 `homelessness_architecture_part3_claude.md` (housing supply, workforce, data), Part 4 `homelessness_architecture_part4_claude.md` (failure modes, surge, siting, rural, ledger).
**Inputs read in full:** the user's instruction file `homlesness.md`; the user-uploaded `multnomah_county_homelessness_research_packet.md` (its figures come from the packet's cited county/city/PSU sources; I did no web research and have not independently verified them); and the four existing project files (base plan, addendum, operating package, decision memo).
**Convention:** [Packet] = figure from the uploaded packet. [Calc] = my calculation from packet figures. [Placeholder] = my assumption to be calibrated locally. [Verify] = from my general background knowledge, not the packet, and needing local confirmation.

## 1. Reconciliation: the current working version

The earlier files described a hypothetical region. The packet replaces it with Multnomah County / Portland. Where files conflict, the decision below governs. Earlier files stay unedited as history.

| # | Conflict or obsolete item | Decision (current working version) |
|---|---|---|
| R1 | Hypothetical region (2,000 stock; $55m year-five operating; $560.9m five-year total) vs real Multnomah data | **Retire the hypothetical dollar and headcount tables as sizing.** Keep only their method: stock-flow logic, scenario testing, gate structure. |
| R2 | Base plan section 8 creates a new "regional delivery office" | **Withdrawn.** The County Homeless Services Department (HSD), the City-County Homelessness Response Action Plan (HRAP) and the Continuum of Care lead role already exist [Packet]. Its functions (accountable executive, public steering, independent audit) go to existing bodies under a compact (section 4). |
| R3 | 50% five-year reduction (base plan) vs "no net growth floor" (addendum, memo) in a system whose FY27 budget fell 21.7% | **Retire 50% as a headline.** Working targets: (a) floor: no increase in the by-name-list (BNL) active stock or the unsheltered count in FY27-FY28; (b) primary: higher exits for the longest-stayers and shorter median time homeless; (c) conditional stretch: 20% BNL reduction over five years, only if recurring funding holds at the FY27 level and inflow is not rising. Section 2.4 shows what (c) requires. |
| R4 | Memo D10 "hold 300 shelter beds" and 1,070-1,220 stays/year | **Obsolete.** Replaced by the shelter closure gate (Part 2, section 3.4). Implied Multnomah stay is in section 2.2. |
| R5 | Memo D3/D4: local gap fund for 1,000 affordable units with referral set-asides | **Keep the supply-linked-schedule principle and the referral set-aside ask.** Drop the gap fund as an HSD budget line: the packet shows HSD contracts services and shelter, not housing capital. Set-asides are negotiated with whichever bodies fund affordable housing capital [Verify who]. |
| R6 | Addendum tiers (1-3) vs package gates A-D | **Tiers retired.** Gates A-D govern release of money. Under contraction, phasing uses the protect / redesign / reduce order in section 2.6. |
| R7 | Addendum prevention-yield diagnostics (16.7% break-even, $13,333 per averted entry) | **Stay model-only.** The packet's 2,416 people avoiding eviction is an output, not a causal yield. Never substitute one for the other. |
| R8 | Package service standards (same-day triage, two-business-day contact, etc.) | **Keep as provisional.** Part 2 section 1 builds the intake design that meets them. |
| R9 | Packet refers to a "$100M/year hypothetical portfolio" and a "3,600-person" scenario | **Not found in this workspace.** The files here use 2,000 people and $55m. Treat those references as another draft; do not use them. |
| R10 | Package monthly flow model, quarterly dashboard, monthly triggers | **Keep unchanged.** Part 3 section 3 adds the data model beneath them. |

**Denominator decisions.** Multnomah has several non-interchangeable counts [Packet]: 2025 PIT 10,526 people / 9,696 households (3,614 sheltered; 6,912 counted or presumed unsheltered); April 2025 BNL 14,864 people (6,796 unsheltered, 46%).
- D-denominator-1: **Flow and target modeling uses the BNL; the PIT is reported for HUD and as a lower reference.** Report both, never mix them in one rate.
- D-denominator-2: The two unsheltered figures (6,796 and 6,912) differ by 116 people (1.7%) [Calc], but the packet says the PIT's presumed-unsheltered group comes from the county BNL process, so they are **not independent confirmation**. Use 6,800-6,900 as the working unsheltered anchor with that caveat.
- D-denominator-3: The BNL's non-unsheltered group (14,864 − 6,796 = 8,068) is more than double the PIT sheltered figure (3,614) [Calc]. Its composition is unknown to me. Defining it is the first data task (Part 3).

**New versus existing.** Per the packet, already in place: joint City-County governance and HRAP (updated December 2025: 5 goal areas, 16 strategies, 90 actions); HSD contracting and CoC lead role; monthly BNL dashboard; SHS-funded eviction prevention, shelter and housing; a January 2026 adult shelter review; the Pathways Study. **New proposals in this layer:** the funding compact with notice rules, outcome-ownership matrix and dispute ladder; the single front door and pathway rules; allocation, waitlist, appeal and override rules; the closure gate; the contracting structure; the landlord pipeline operations; workforce rules; the exit-parity metric; failure-mode and surge protocols; siting decision rules. I have not read the 90 HRAP actions, so some of these may overlap with them [Verify].

## 2. What the real numbers imply for design

### 2.1 The contraction is mostly revenue-side
FY27 HSD adopted operating budget $242.9m, down $67.3m (21.7%) from FY26, which implies FY26 at $310.2m [Calc]. Named drivers [Packet]: City funding ends (−$29.6m) and SHS revenue falls from $192.4m to $172.0m (−$20.4m). Together $50.0m, or 74.3% of the cut [Calc]; the City exit alone is 44.0% [Calc]. These two may overlap with the "reduced carryover" the packet also names, so treat 74% as approximate. Two further observations:
- The listed fund sources ($63.5m + $148.3m + $27.9m = $239.7m) fall $3.2m short of $242.9m [Calc]. Ask HSD what the remainder is.
- 98 FTE oversee $242.9m, roughly $2.5m of operating budget per FTE [Calc], and FTE fell by 16. This is a crude indicator, but contract oversight capacity is itself a risk (Part 2, section 4).

**Design implication:** about 44% of the shortfall came from one partner's decision. Governance must therefore regulate funding withdrawal (section 4, rule G1), not just service delivery.

### 2.2 Shelter: stays must shorten if units close
FY25: 3,778 people used SHS-supported shelter against 1,606 sustained units [Packet]. That is 2.35 people per unit per year, an implied average stay of at most about 155 days [Calc]. It is an upper bound: it assumes one person per unit, full occupancy and constant capacity (270 units were added during the year, so true average capacity was lower). A plausible range is 120-155 days [Placeholder].

The budget removes 695 shelter units [Packet]. Whether they come from the 1,606 SHS-sustained units or a larger all-funder base is unknown. To serve the same number of people with 695 fewer units, average stay must fall by 695 ÷ base:
- base 1,606 units: stays fall about 43% [Calc]
- base 2,000: about 35%
- base 2,500: about 28%

Can shelter cuts cover the budget gap? At placeholder unit costs of $15,000, $22,000 and $35,000 per unit-year (the $22,000 is from the hypothetical plan, **not Multnomah data**), 695 units save 15.5%, 22.7% and 36.1% of the $67.3m cut [Calc]. **Shelter ramp-down alone cannot close the gap unless real unit costs are well above the placeholders**, and it only avoids street growth if placements rise in step. This is consistent with the shelter review's finding [Packet] that fewer units plus targeted placement resources can serve more people.

### 2.3 Housing obligations are the dominant fixed cost
7,255 people were supported in housing in FY25, including earlier years' placements [Packet]. Average annual cost per supported person is unknown. If it is $10,000, $15,000 or $26,000 (the last from the hypothetical PSH slot), these commitments would absorb 29.9%, 44.8% or 77.7% of the FY27 budget [Calc]. This is an upper bound because some slots are funded outside HSD. **Implications:**
- Every new rent-assistance placement is a multi-year liability. Under contraction, new placement capacity is what remains after obligations, so growth must come from turnover and move-on (Part 3, section 1.6), not only new money.
- The first deliverable is a committed-obligation schedule by program, cost and expiry date. Nothing can be sized without it.

### 2.4 What a 20% reduction requires
Reducing the 14,864 BNL stock by 20% (2,973 people) over five years with inflow flat requires about 595 more net exits per year [Calc]. That is +22.9% against the 2,599 SHS-reported permanent exits [Calc], taking exits to about 3,194 [Calc]. Caveats: total exits (non-SHS programs, self-resolution, non-housing exits) are unknown, so the true proportional increase differs; the calculation assumes exits are capacity-limited and ignores returns. The packet's inputs imply a naive mean duration of 14,864 ÷ 2,599 = 5.7 years if SHS exits were the only exits [Calc]. That is **not** an estimate of actual duration. It shows that inflow and total exit flows are the two numbers most needed and least known.

### 2.5 Scale check on the retired hypothetical
Scaling the hypothetical $55m year-five operating budget by people: 5.26x on the PIT ratio gives $289.5m; 7.43x on the BNL ratio gives $408.8m [Calc]. FY27's $242.9m is 84% and 59% of those. Per person, FY27 is $23,076 per PIT person and $16,341 per BNL person [Calc]. The hypothetical plan excluded capital and some clinical costs, and HSD's budget excludes housing capital and health-system spending, so this is a sanity check, not a comparison.

### 2.6 Protect / redesign / reduce order under contraction
1. **Protect first:** rent and tenancy support for people already housed (no one loses housing because of a funding decision); life-safety and weather shelter capacity; placement staff (navigators, landlord liaisons), because they are the throughput engine; minimal data and audit.
2. **Redesign:** the shelter portfolio (closure gate); contract structure (Part 2); outreach consolidation; prevention targeting.
3. **Reduce last:** pace of new permanent supportive housing; services not linked to housing exits; administrative layers; the lowest-performing shelters on case-mix-adjusted placements and accessibility.
4. **No across-the-board percentage cuts.** They penalize efficient providers equally with weak ones. Cut by portfolio review, with 90 days' notice and funded transition for any affected tenant or resident.

## 3. Outcome ownership

HSD does not control the main inflow sources (eviction, discharge, rents), so one owner cannot be answerable for all outcomes. Each metric gets a named owner and the levers that owner holds.

| Outcome | Owner | Levers held | Escalates to |
|---|---|---|---|
| Exits, time to placement, shelter throughput, retention, returns | HSD director | contracts, allocation rules, navigators | Executive steering |
| Unit pipeline, vouchers, set-asides, permitting, public land | City housing / planning and housing authority heads [Verify names] | capital, vouchers, zoning | Executive steering, then elected bodies |
| Discharge from hospitals and behavioral health; medical respite; housing-related health benefits | Health and behavioral-health agency heads | clinical capacity, Medicaid housing supports [Verify] | Executive steering |
| Discharge from corrections and courts; eviction process | Corrections and court-liaison heads | release planning, legal aid | Executive steering |
| Public-space policy and enforcement coordination | City | enforcement protocol | Executive steering |
| Data integrity, audit, appeals | Independent audit function reporting to the boards | access to records | Elected boards |

## 4. Operating and governance architecture

| Level | Authority | Does not do |
|---|---|---|
| Elected bodies (County board, City council, regional partners) | Appropriate money; adopt the compact; receive escalations; set policy | Manage contracts or placements |
| Executive steering group (HSD, housing, health, corrections, City bureau heads, plus paid lived-experience members) | Monthly: resolve cross-agency blockers, review the dashboard, approve surge activation | Override individual placements |
| HSD | Single contracting and system-administration body; CoC lead; runs front door, allocation rules, data | Hold other agencies' outcomes |
| Provider network | Delivers services under contract; raises systemic problems | Set priority rules unilaterally |
| Independent functions (audit, appeals panel, complaints) | Verify data, hear appeals, publish findings | Run programs |

**Compact rules.** The funders sign a multi-year funding and accountability compact; whether it binds is a legal question for counsel [Verify].
- **G1. Withdrawal notice.** A partner reducing its contribution by more than 10% gives 18-24 months' notice or pays a transition amount [Placeholder]. The City exit was 44% of the cut.
- **G2. Fund the tail.** No new multi-year rent commitment unless recurring revenue covers its first three years.
- **G3. Reserves.** A stabilization reserve covers a defined number of months of rent obligations (size to be set from the obligation schedule), separate from the surge reserve in Part 4.
- **G4. Pooling.** Partners may retain appropriation authority but contract through HSD, to avoid duplicate provider contracts.

**Disputes and failures.** (1) Operational disputes go to the HSD director and bureau heads, resolved within 10 business days. (2) Unresolved ones go to the executive steering group within 30 days. (3) Still unresolved: a pre-agreed neutral mediator, then the elected bodies. (4) Default rule: if no decision, the status quo continues for 90 days; no partner may unilaterally stop a service that people are depending on. (5) A partner missing a compact commitment (discharge, units, funding) triggers a written remediation plan within 30 days and a public line in the quarterly report. (6) Systemic failure (two consecutive quarters of missed floor targets) triggers an independent review reporting to the elected bodies.
