# Architecture Layer, Part 2: Front Door, Allocation Under Scarcity, Contracting

**Author/work attribution:** Anthropic / claude-sonnet-5-5. Continues `homelessness_architecture_part1_claude.md`. Labels as in Part 1: [Packet], [Calc], [Placeholder] (to be calibrated locally), [Verify]. All numeric thresholds below are placeholders unless marked otherwise; none is a verified standard.

## 1. One front door, five pathways, one record

### 1.1 Design rules
- **Many doors, one system.** Phone, walk-in hubs, outreach, shelters, hospitals, schools, corrections and domestic-violence providers can all open a case. The domestic-violence route keeps confidential records outside the shared system, linked only by a safe referral.
- **Assess once.** One short profile, updated only when circumstances change. No program may require a new full intake for someone already in the system.
- **A navigator of record follows the person** across prevention, shelter, rent assistance and housing. Handoffs are warm and the navigator does not change at a program boundary. This removes the queue-per-program structure that creates bottlenecks.
- **Frontline spending authority.** Staff can spend flexible funds up to a cap without supervisor approval (placeholder $2,500) and up to a higher cap with same-day supervisor sign-off (placeholder $7,500). Most diversion fails when approval takes a week.

### 1.2 Flow
| Step | What happens | Standard (builds on the operating package's provisional standards) |
|---|---|---|
| 1. Contact and safety screen | Immediate danger, medical risk, imminent eviction or discharge | Same day, about 10 minutes |
| 2. Problem-solving conversation | Can this be resolved without a program resource: mediation, a landlord call, a small payment, a family option? | Same day to 3 days; delegated spend authority |
| 3. Profile and pathway recommendation | Income gap, rental history, disability and support needs, household composition, legal barriers, **stated deal-breakers** | Within 5 business days of engagement; person chooses among options |
| 4. Interim, if needed | Shelter or bridge accommodation attached to a pathway and the navigator | Housing plan within 7 days |
| 5. Match | Resource offered under the rules in section 2 | See section 2 |
| 6. Move-in and follow-up | Keys, utilities, accessibility, subsidy confirmed; contact at 72 hours, 30 and 90 days | Per operating package |

### 1.3 The five pathways (one system, not five programs)
| Pathway | Fits | Connects to |
|---|---|---|
| P1 Prevention / diversion | Housed but at imminent risk; or just homeless with a viable alternative | Can convert to P2 if it fails; legal aid and benefits |
| P2 Time-limited rent assistance (rapid rehousing) | Barrier is income gap or credit/rental history; likely stable after support | Reassess 60 days before end; converts to P3 if a lasting gap remains |
| P3 Long-term rental subsidy | Lasting affordability gap without intensive support needs (many older adults, fixed incomes) | Receives move-on from P2 and P4 |
| P4 Permanent supportive housing | Substantial, persistent need for tenancy support | Move-on to P3 when need falls, without forced displacement |
| P5 Other stable placement | Verified voluntary family reunification, existing affordable unit, set-aside unit | Needs a verified supply schedule (Part 3) |

Interim shelter is a **waiting room with a plan**, not a pathway. Day 14: a first matched option or a documented barrier. Day 60: case conference. Shelter stays are measured against the closure-gate throughput figures (section 3.4).

### 1.4 Preferences are part of eligibility for a "suitable offer"
The Pathways Study [Packet] reports that stated deal-breakers are common: no partners or guests 49.8%, room checks 48.6%, curfews 46.1%, short-term placement 44.5%, required roommate 42.5%, mandatory religious requirements 40.5%, distance 38.4%, no pets 36.8%, mandatory drug testing 34.3%, mandatory treatment 33.2%, mandatory case management 18.2%. It is a survey of stated preferences, not observed behavior, but it is a strong design signal.
- Record deal-breakers in the profile. An offer that breaches a stated, non-safety deal-breaker is **not a suitable offer**; declining it does not count as a refusal.
- **Rules audit.** Every funded program justifies each rule on that list by a safety or legal necessity, or drops it. Mandatory religious participation is not fundable as a condition of public-funded services [Verify with counsel].
- Track decline rate by program rule. A program with unusually high declines for the same rule is flagged for review.

## 2. When demand exceeds capacity

### 2.1 Capacity is declared, not assumed
Each week HSD publishes a capacity register for each scarce resource (P3, P4, and move-in-ready P2 slots): units available now, expected within 30 days, staffed support slots, and the matching pool. No one is told a resource exists when it does not.

### 2.2 Priority: right resource first, then most urgent
1. **Match the resource to the barrier before ranking.** A person with a high vulnerability score but a mainly financial barrier goes to P2/P3 if suitable, saving P4 for people who need services. This is the main protection against using the scarcest resource for the wrong people.
2. **Tiers for scarce resources (P3, P4)**, with definitions calibrated to local mortality and harm data [Verify]:
   - Tier 1: imminent risk to life or health (serious medical or behavioral fragility, repeated victimization) with a disabling condition.
   - Tier 2: long homelessness (12+ months, cumulative) with a disabling condition.
   - Tier 3: unsheltered families with children, young people, and older adults unsheltered.
   - Tier 4: everyone else, ordered by time homeless.
3. **Within a tier:** longest time homeless first; ties broken at random. A vulnerability score informs the tier but never decides alone; a human reviewer can move someone up with a written reason.
4. **Reserves per quarter:** 10% emergency-override reserve (2.5); 10% exception and equity reserve reviewed by a committee including lived-experience members, with its use published. Both are placeholders; recalibrate to observed use.

### 2.3 Waitlist rules
- Waiting people see their tier and an expected wait band based on recent actual waits, not a promise.
- **No removal without effort.** Status moves to inactive only after three documented contact attempts over at least 60 days across at least two channels (including outreach and shelters). Reactivation restores the original date.
- Declined unsuitable offers do not change priority. After two declined *suitable* offers, a case conference is held; the person is not dropped.
- **Reassessment** every 90 days of waiting, and on triggers: hospitalization, victimization, pregnancy, new disability, extreme weather, loss of a safe interim bed. Priority can rise on triggers.
- **Bridge floor.** Anyone waiting for P3/P4 keeps access to a defined minimum: safe interim place if available, storage, document help, health access and a navigator. Rationing a housing resource must never mean no service at all.

### 2.4 Appeals
Grounds: eligibility error; wrong tier; unsuitable offer or denied accommodation.
- Step 1: a reviewer who did not make the decision, within 3 business days (24 hours if urgent).
- Step 2: independent panel including lived-experience members, within 10 business days.
- Remedies: re-tier, restore queue date, order an accommodation, trigger a systemic review if the same error recurs. The appeal and reversal rate is public.

### 2.5 Emergency override
- Criteria: imminent threat to life or safety; hospital or institutional discharge with no safe alternative; imminent danger from domestic violence; fire or disaster; child safety.
- Authority: a 24/7 duty manager, with a spending cap. Review within 5 business days.
- Guard against gaming: alert if overrides exceed 15% of placements in a quarter, or if one referrer accounts for a disproportionate share [Placeholder].

### 2.6 Rationing during contraction
When funds fall below obligations, the order is: keep existing tenancies; admit fewer new people into permanent subsidies; publish the reduced capacity and the queue; keep the bridge floor. **Never cut by quietly lengthening waits without telling people.** Admissions can be paused by resource type, but pausing P1 prevention for people facing imminent eviction should be the last pause, since it protects people who are still housed.

## 3. Shelter as part of the system

### 3.1 Shelter's job
Provide safety and a launch pad into a pathway. Each shelter has an allocated flow of placement resources (voucher slots, P2 funds, set-asides) in proportion to its population. This follows the January 2026 shelter review's finding [Packet] that placement resources were limited and uneven across the 31 shelters reviewed.

### 3.2 No accountability without authority
A shelter is held to exit outcomes only for resources it can actually access. Where HSD allocates placement resources, HSD, not the shelter, owns the shelter's throughput target until the resource arrives.

### 3.3 Accessibility
Shelter rules follow the rules audit (section 1.4). Couples, pets, storage and access hours are part of "usable", not extras.

### 3.4 Closure gate
No shelter unit closes unless all of the following hold:
1. Each current resident has a documented next option that passes the suitability test, or a funded placement offer.
2. Placement resources for the unit's expected annual flow are funded. Rule of thumb: **placements per closed unit per year at least equal to the stays that unit served** (for example, about 2.4 stays per unit-year at the FY25 SHS average [Calc]), unless the shelter's occupancy history shows the unit was underused.
3. Unsheltered counts and outreach contact rates for the affected area are monitored for 90 days after closure; if the unsheltered BNL count in the area rises more than 5% [Placeholder], further closures pause.
4. The closure choice uses case-mix-adjusted outcomes, accessibility and cost, not the date of the contract renewal.
Winter and extreme-weather capacity is exempt from closure-gate savings and is handled in Part 4.

## 4. Provider contracting

### 4.1 What the system pays for
| Component | Share of a housing-service contract [Placeholder] | Basis |
|---|---|---|
| Availability and capacity | 80-85% | Staffed slots, units under management, hours of service; paid fixed and on time |
| Activity unit rates | within the above where volume-driven | Move-ins, lease-ups completed |
| Performance holdback | 10-15% | Case-mix-adjusted outcomes, partly shared across providers |
| Quality | about 5% | Participant experience, accessibility, complaint handling |
For shelters: about 90% capacity-based and 10% placement-linked, with the placement-linked share payable only where the shelter received placement resources (section 3.2).

### 4.2 Outcomes that matter, and how to measure them fairly
Verified permanent exit (not unknown destinations); retention check at 6 and 12 months; returns attributed back to the exiting provider for 12 months, shared with the receiving provider; time from enrollment to placement; participant-reported safety and dignity. Adjust for case mix with observed-versus-expected comparisons using duration, disability, household type and prior returns. No provider is penalized on outcomes with fewer than a minimum number of participants (placeholder 30 per year). Deaths are neither success nor failure in the metric; they trigger a separate review. Outcome pay never exceeds 15% of a contract.

### 4.3 Perverse incentives and counters
| Incentive | Counter |
|---|---|
| Creaming easy cases | Referrals come from allocation, not provider choice; difficulty weights; exit-parity metric (Part 3) |
| Parking hard cases | Long-stay caps with case conferences; exit-parity metric |
| Premature exit to hit targets | Retention component; returns attributed back |
| Rejecting complex tenants | Track acceptance; no rejection without independent review |
| Churn across programs | Count by household, once |
| Data gaming | Independent audit of destinations; flags on spikes in "family/friend" destinations |
| Cost-shifting to hospitals or jail | Track emergency service use as context; do not reward it as savings |

### 4.4 Where outcome-linked funding helps and where it hurts
| Useful | Dangerous |
|---|---|
| Shelter-to-housing conversion with placement resources attached | Tenancy retention as the only outcome (discourages lawful safety removals or encourages keeping poor-fit placements) |
| Lease-up speed | Prevention (hard to measure causally): pay on activity and evaluate separately |
| Move-on to long-term subsidy | Street outreach: pay on contact quality, not exits |
| Participant experience | Domestic-violence services: confidentiality limits outcome data |
| | Small providers: outcome volatility without working capital |

### 4.5 Correction and replacement
1. **Level 1:** written notice and technical assistance, 30 days.
2. **Level 2:** corrective action plan with milestones, 60-90 days; referrals may be reduced but existing residents are unaffected.
3. **Level 3:** managed transition to a pre-qualified successor from a bench; tenants and staff continuity protected; records transferred.
4. **Termination.** Immediate for safety, abuse or fraud; otherwise after Level 3.
Contract terms: three-year terms with annual options; payment within 30 days; a working-capital advance of up to one month for small and culturally specific organizations; an indirect-cost floor (placeholder 15%) so oversight and admin are not starved. **Oversight capacity:** 98 HSD FTE for a $242.9m budget [Packet; Calc] means monitoring cannot be case-by-case; use risk-tiered monitoring, with audit sampling concentrated on large contracts and on those with red flags.
