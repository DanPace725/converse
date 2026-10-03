# Architecture Layer, Part 4: Failure Modes, Surge, Siting, Rural, Ledger

**Author/work attribution:** Anthropic / claude-sonnet-5-5. Continues Parts 1-3. Labels: [Packet], [Calc], [Placeholder] (calibrate locally), [Verify]. Thresholds are placeholders; replace them with limits derived from a 12-month local baseline (for example, 20% worse than the trailing mean).

## 1. System failure modes (the programs look fine, the system fails)

| # | Failure | How it hides | Early indicator and trigger | Corrective action |
|---|---|---|---|---|
| F1 | **Treadmill:** exits rise but stock stays flat because inflow rises | Placement counts look strong | Inflow-to-exit ratio above 1.0 for 3 consecutive months; first-time entries and eviction filings rising | Shift money to the source of inflow (prevention, discharge compacts); escalate rent and eviction levers to the steering group |
| F2 | **Shelter shrinks faster than placements** | Unit closures count as savings | Placements per closed unit below the closure-gate rule; unsheltered BNL up more than 5% in a quarter | Closure gate halts further closures |
| F3 | **Cream-skimming** | Exit counts up | Exit-parity below 0.8; share of 12+ month stayers rising | Reweight difficulty adjustments; audit referrals; change queue rules |
| F4 | **Placement without retention** | Returns lag by 6-12 months | Rising 6-month return rate in newer cohorts | More tenancy support; extend assistance; review landlord matches |
| F5 | **Obligation squeeze or funding cliff** | New placements outrun recurring revenue | Committed obligations above a set share of recurring revenue | Freeze new multi-year commitments; fund the tail (G2); use the stabilization reserve |
| F6 | **Paid but empty capacity** | Contracts are fully paid | Units vacant over 30 days; staffed slots unfilled | Weekly matching conference; reallocate slots |
| F7 | **Governance fracture** (cost-shifting; enforcement actions that break contact with navigators) | Each agency meets its own targets | Contact-loss events after enforcement actions; compact breaches | Joint protocol; remediation plan; elected-body review |
| F8 | **Data illusion** | Dashboard improves | Unknown-destination share above 15%; duplicate rate rising; reporting lags | Independent audit; discount affected figures |
| F9 | **Landlord attrition** | Placement numbers fall late | Falling active-landlord count; slow claim payment | Clear claims backlog; liaison outreach; raise guarantees |
| F10 | **Workforce collapse** | Quality drops before counts do | Vacancy above 15%; turnover above 25% | Section 2.5 of Part 3 |

A failure is declared when a trigger is met for the stated period, not when someone disputes the data. The steering group must record a response within 30 days.

## 2. Surge protocol

**Triggers** (placeholders):
- Inflow surge: monthly new entries above 120% of the trailing 12-month average for 2 months.
- Shelter occupancy at or above 95% for 5 consecutive nights, or recurring turn-aways.
- Weather thresholds set locally (heat, cold, smoke, flood).
- Shelter loss: closure, fire or regulatory loss of 50 or more beds.
- Disaster or sudden displacement; sharp rent-index rise; recession signal such as a marked rise in unemployment claims.

**Levels:** Level 1 Watch (weekly monitoring, standby contracts alerted); Level 2 Activate (surge capacity and reserve released); Level 3 Emergency (emergency declaration, mutual aid, state and federal requests).

**Resources.** A standing surge reserve of about 2% of the operating budget, which is **$4.9m at the FY27 level** [Calc; placeholder percentage], separate from the stabilization reserve in Part 1, G3. Pre-qualified standby capacity: hotel or motel blocks, community centers, public buildings, with signed terms. Staff surge from the float team and temporary county staff.

**Authority.** The HSD director may activate Level 2 immediately with 24-hour notice to the chairs of the boards. Level 3 requires the elected bodies' declaration where law requires.

**Guardrails.**
- Surge spending never draws on rent obligations for existing tenants (protect-first order, Part 1, section 2.6).
- Surge authority sunsets in 30 days unless renewed. Each surge site needs an exit plan; a surge site cannot become permanent without passing the capital gate (Gate C).
- Extreme weather: no-turn-away rule, intensified outreach, pre-positioned warming and cooling spaces, and a review of every weather-related death.
- Recession and rent spikes: raise prevention caps and capacity; do not respond by tightening eligibility. Adjust payment standards with the housing authority.
- Sudden migration or displacement: coordinate with state and federal agencies; funding streams carry their own eligibility rules [Verify]; use a separate fund line and report it separately.

## 3. Siting: decision rules, input, and limits on veto

1. **Published criteria** for every site: transit and service access, hazard-free (environmental and safety), readiness and cost, accessibility, and a district fair-share measure.
2. **Fair-share rule.** Track supportive and shelter units per 10,000 residents by district; prefer districts below the citywide median when criteria are otherwise equal [Placeholder]. Avoid concentrating units in already-burdened districts.
3. **Input window.** A structured 30-day window before final site decision. Input can change design, operations, mitigation, transit and hours; it does not decide whether a lawful use proceeds on a site that meets the criteria and zoning.
4. **Legitimate grounds to change or relocate a site:** an objective hazard; a legal or title defect; infeasible cost; an evidenced serious safety risk that cannot be mitigated; breach of the fair-share cap. Opposition by itself is not one of them.
5. **Administrative approval by default.** Elected bodies vote only on exceptions where criteria fail or law requires. This removes the delay that makes sites cost more. By-right treatment of shelters and supportive housing depends on state and local law [Verify].
6. **Good Neighbor Agreement** for each site: a 24/7 contact line; a response within 4 hours for urgent issues and 2 business days for others; monthly meetings for the first 6 months; litter and safety patrol in a defined radius (placeholder 2 blocks); a named community liaison.
7. **Impact remedy.** Verified impacts (damage, litter, noise) are repaired or reimbursed from a small impact fund (placeholder: a fixed share of operating contract value).
8. **Evidence, not anecdote.** Report calls for service and complaints near sites against comparison areas before and after opening; publish incident logs in aggregate.
9. **Operator accountability.** Sustained breach of the agreement triggers the same correction ladder as other contracts (Part 2, section 4.5), not automatic closure. Temporary sites carry an end date.
10. **Fair housing.** Do not condition siting on resident characteristics; do not release resident-level data to neighbors; counsel reviews all siting rules for fair housing and disability law [Verify].

## 4. Rural and small-county implementation

Multnomah is overwhelmingly urban, so this section applies to other counties and any rural edges rather than to the Multnomah baseline.

- **Governance:** a regional hub (a lead county or balance-of-state body) with pooled funds and a single contract, plus local access points in existing institutions: libraries, clinics, schools, community action agencies, tribal offices, faith organizations, sheriff's office. Phone and video access to the same front door.
- **Interim housing:** shelters in every town are not viable. Use flexible interim options: motel vouchers with a navigator and a maximum stay with exit-plan review (placeholder 30 days), host homes, safe parking, and small hub sites. Transport to hubs is voluntary.
- **Housing supply:** few landlords and personal networks mean recruitment works through known contacts; a direct landlord guarantee often matters more than master leasing. Look at manufactured homes, accessory units, rehabilitation of vacant units, farmworker and tribal housing, and rural federal programs [Verify availability].
- **Services and caseloads:** travel time cuts capacity. If half of contacts are virtual and the others add one hour of round-trip travel to a one-hour visit, time per contact rises by half (1.5 hours vs 1.0), so a 1:25 caseload falls to about 1:17 [Calc, illustrative]. Use telehealth, mobile clinics, community health workers and hub teams that rotate; cross-train generalist roles; supervise remotely.
- **Funding:** formula funding by population leaves small counties below a minimum viable capacity. Set a floor allocation and pay for availability, not only volume.
- **Eligibility and counting:** hidden homelessness (vehicles, doubled-up, encampments off roads) is widely under-counted; use school and clinic data; check which definitions each funding stream accepts [Verify].
- **Provider scarcity:** one provider may be the only provider. Keep a provider-of-last-resort arrangement and mutual aid with neighboring counties so a failed provider does not mean no service.
- **Data:** small-cell suppression is stricter; publish regional aggregates.
- **Disasters:** wildfire, flood and smoke are routine risks; pre-agree evacuation and sheltering with emergency management.

## 5. Decisions made this turn (ledger)

Numbering continues the memo's D1-D12. All are my proposals within the planning exercise.

| ID | Decision |
|---|---|
| D13 | Multnomah County / Portland is the working jurisdiction; the hypothetical region's dollars and counts are retired as sizing (R1). |
| D14 | Flow modeling uses the BNL (14,864) with the PIT (10,526) as a reported lower reference; no mixed-denominator rates. |
| D15 | Unsheltered working anchor is 6,800-6,900, flagged as non-independent. |
| D16 | Withdraw the new "regional delivery office"; strengthen HSD, HRAP and CoC through a funding and accountability compact. |
| D17 | Retire the 50% headline; adopt floor (no growth in BNL stock and unsheltered count FY27-28), primary (longest-stayer exits, shorter median time), conditional 20% stretch. |
| D18 | Retire the addendum tiers and memo D10; use gates A-D plus protect / redesign / reduce order. |
| D19 | No across-the-board percentage cuts; portfolio review with 90 days' notice and funded transition. |
| D20 | Single front door, navigator of record, delegated spend authority, five pathways. |
| D21 | Deal-breakers are recorded; an offer breaching one is not a suitable offer; funded programs justify rules on the Pathways list. |
| D22 | Allocation: match resource to barrier first; priority tiers; longest-time-homeless ordering within tier; 10% emergency and 10% equity reserves. |
| D23 | Waitlist, appeal and override rules as in Part 2, section 2. |
| D24 | Shelter closure gate; shelters are held to exit outcomes only for resources they can access. |
| D25 | Contract mix 80-85% availability, 10-15% performance, about 5% quality; shelters 90/10; outcome pay capped at 15%. |
| D26 | Provider correction ladder with funded transition, bench of successors, indirect-cost floor. |
| D27 | Landlord offer, inspection-ready inventory, vacancy register, weekly matching conference, selective master leasing, move-on as a slot source. |
| D28 | Caseload bands and hard caps; no throughput target overrides a cap. |
| D29 | Exit-parity ratio, unknown-destination tripwire, annual exit audit, inflow-to-exit ratio as standing safeguards. |
| D30 | Failure-mode triggers F1-F10 with a 30-day response rule. |
| D31 | Surge protocol with a 2% reserve, 30-day sunset, and a rule that surge spending never touches tenant rent obligations. |
| D32 | Siting rules: administrative approval by default, input without veto, defined legitimate grounds to change a site, Good Neighbor Agreements. |
| D33 | Rural model: regional hub, flexible interim options, availability-based funding floors. |

## 6. Unresolved questions that cannot be decided without local evidence

1. Annual inflow into the BNL by source (first-time, returning, institutional discharge, eviction) and total exits by destination, not only SHS-reported exits.
2. What the BNL's 8,068 non-unsheltered people are, and the BNL's rule-based definition of "active."
3. Which 695 shelter units are being removed, the all-funder unit base, occupancy, cost per unit and stay distribution.
4. The committed recurring obligation schedule for the 7,255 supported people: cost, funding source and expiry by program.
5. Vacancy rates, rents against payment standards, landlord participation and actual days from assistance approved to keys.
6. Whether Oregon health-system housing supports can fund services or short-term rent, and the behavioral-health capacity for P4 [Verify].
7. Legal authority: whether the compact can bind partners, by-right siting rules, tenant-screening rules, and the enforcement context.
8. Overlap between the proposals here and the 90 HRAP actions.
9. Whether the City's funding exit is permanent and whether it offers non-cash contributions (land, permitting).
10. Local causal effect of eviction prevention; the 2,416 figure is an output.
11. How well Pathways Study stated deal-breakers predict actual refusals, and whether respondents represent the whole population.
12. Provider wages, vacancy and turnover.

## 7. Next three pieces of work, in priority order

1. **Multnomah flow model v1.** Specify and run, once data are obtained, a BNL-based model with inflow by source, exits by destination, returns by cohort and duration by segment, under three funding paths (FY27 level, further decline, restored). Start by drafting the exact data request to HSD. This sets the real targets in D17.
2. **FY27 contraction budget and shelter portfolio plan.** Build the obligation schedule, the unit-by-unit closure-gate review of the 695 units, contract amendment rules, and sensitivity to the unknown unit costs, so the protect / redesign / reduce order becomes line items.
3. **Compact and policy text with legal-verification checklist.** Draft the funding and accountability compact term sheet, allocation, appeal, override and provider-ladder policy text, and siting rules, each with the Oregon and local law questions counsel must resolve.
