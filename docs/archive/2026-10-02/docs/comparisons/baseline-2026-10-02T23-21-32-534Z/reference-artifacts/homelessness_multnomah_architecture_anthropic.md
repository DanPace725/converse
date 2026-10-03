# Operating Architecture for the Multnomah County Homelessness Plan (Working Version 2)

**Author: Anthropic / claude-sonnet-5-5.** Written in response to the user's two uploads: `multnomah_county_homelessness_research_packet.md` (jurisdiction and data) and `homlesness.md` (the brief for this turn). All additions here are mine. They are assistant proposals, not user-approved decisions and not enacted policy.

I did not edit `homelessness_policy_plan.md` (Sections 1-12 by OpenAI / gpt-6.1-sol; Appendix A by me), `homelessness_implementation_decisions.md` (OpenAI / gpt-6.1-sol) or `homelessness_plan_extension_anthropic.md` (me).

**Evidence limits.**
- Local facts come only from the user-uploaded packet. I did no browsing and did not open its cited primary sources.
- I have not read the Homelessness Response Action Plan (HRAP), the intergovernmental agreement, Metro's Supportive Housing Services rules or Oregon land-use and tenancy law. Statements about who has authority are therefore design proposals that need legal confirmation.
- Numbers marked *(default)* or *(hypothetical)* are my planning defaults or invented illustrations. They are not data.
- The packet gives no program-level split of the $242.9M, no inflow or return rates, and no contractor workforce data.

---

## 1. Reconciliation: what is the current working version?

Each row is a conflict or obsolete assumption in the existing project, with my decision.

| Item | Earlier position | Decision for Working Version 2 (WV2) |
|---|---|---|
| Jurisdiction and baseline | Generic hypothetical (about 3,600-person stock, $100m/yr operations, $150m capital) in the OpenAI plan and in my Appendix A and extension | **Multnomah County is the working jurisdiction.** The generic scenario is retired as a budget. It survives only as a design-scale test: "what could a $100m increment buy?" It is not a funding assumption. |
| Envelope | $450m three-year scenario (OpenAI, my Appendix A) | **The FY2027 adopted HSD operating budget of $242.9M (down $67.3M, or 21.7%, from FY26) is the envelope. No new money is assumed.** The earlier $450m figure was never a ceiling and now has no role. |
| New governance | OpenAI delivery package proposes an accountable lead and oversight, as if starting fresh | **Overlay, don't replace.** HSD (CoC lead, contracting) and the joint HRAP are the vehicle. This document supplies rules that could be adopted as HRAP amendments (section 3). |
| 90-day baseline publication | OpenAI plan Section 2 | **Obsolete as written.** The county already publishes a monthly by-name-list (BNL) dashboard. Replace it with a *bridge table* reconciling PIT, BNL and fiscal-year "people served" (section 9). |
| Median vs mean duration | Appendix A conflated them. OpenAI qualified it, and I accepted the correction in my extension. | **Settled.** Stock is approximately entries x mean duration. Targets use flows (entries, exits, returns), not a single duration claim. |
| Separate ongoing rental-assistance line | OpenAI: $12m rapid rehousing plus $6m rental assistance | **Keep the principle** (temporary assistance and long-term subsidy are different instruments). **The dollar figures are obsolete** until program-level Multnomah budget lines are obtained. |
| Cohort model | My extension: two-cohort hypothetical | **Keep the lesson, discard the numbers.** The system must target long-stay homelessness explicitly. Real cohort data come from the BNL. |
| Capital pipeline | $150m capital in earlier scenario | **Deferred.** With a 21.7% operating cut, new capital that creates recurring obligations is gated. Existing-unit leasing, master leasing and vacancy coordination come first (section 7). |

**Budget protection order (default), applied to the real contraction:**
1. Existing tenancies and housing-attached subsidies. Abrupt withdrawal creates returns to homelessness.
2. Eviction prevention and diversion. They are the lowest cost per outcome-avoided in most systems, but this is unverified locally.
3. Exit-capable shelter, meaning shelters with housing-placement resources.
4. Shelter ramp-down, beginning with low-exit capacity (see section 2.3).
5. New capital, last.

---

## 2. Design-question calculations (Multnomah inputs from the packet)

Each calculation answers a design question. I did not re-check old sums.

### 2.1 What do exits imply about duration?
- 10,526 (PIT stock) / 2,599 (FY25 SHS permanent-housing exits) = **4.05 years**.
- 14,864 (April 2025 BNL) / 2,599 = **5.72 years**.
- **Read these as upper bounds, not durations.** The exit figure counts only SHS-attributed exits. Other exits (non-SHS housing, self-resolution, reunification) would raise outflow and lower implied duration. The numerators and denominators use different time bases (a single night, a month, a fiscal year). The result shows that **the exit count is small relative to the stock, so small percentage changes in exits move the stock materially**.

### 2.2 How sensitive is the stock to exits, and what does the budget cut risk?
Assume, for a rough linear stress test, constant inflow and a stock of 10,526:
- A 20% stock reduction over 3 years is 2,105 people, or about **702 more exits per year than inflow**. That is **27% above the 2,599 baseline exits**.
- **Downside:** if exit capacity fell in proportion to the 21.7% budget cut, annual exits would fall by about 564 (2,599 x 0.217). Over 3 years that adds about 1,692 people to the stock, **about 16% of the PIT stock**.
- This is **not a forecast.** The cut falls partly on shelter, not only on exits, and the FY27 budget includes money for placements out of shelter. But it shows why the exit pipeline must be protected before anything else is reduced.

### 2.3 Can fewer shelter units work? (Shelter Review finding)
The packet reports 3,778 SHS-supported shelter users across 1,606 sustained units, and 695 shelter units reduced in FY27.
- Throughput today: 3,778 / 1,606 = **2.35 people per unit-year**, an implied average stay of **about 155 days** if units run near full.
- **If** the 695-unit reduction came out of the 1,606 base, serving the same 3,778 people would need 3,778 / (1,606 - 695) = **4.15 people per unit-year**, an average stay of **about 88 days**. The reduction otherwise removes about 1,635 shelter stays a year (695 x 2.35).
- **Caveats:** I do not know whether the 695 units are inside the 1,606 SHS-funded base (HSD's shelter system is probably larger). Turnover is also assumed uniform across shelters, which the review itself says it is not.
- **Design implication:** fewer beds only avoid a service loss if average stays fall by about 43%. That requires housing-placement resources in the shelters where they are currently thin. Without them, ramp-down simply reduces shelter access.

### 2.4 How much do rules compound refusal? (Pathways Study)
The deal-breaker shares are marginal and overlapping, so the joint refusal rate is unknown. Two bounds:
- A placement with no guests (49.8%), room checks (48.6%) and a curfew (46.1%) would be refused by **at least 49.8%** of respondents and at most all of them.
- **If** the deal-breakers were independent (they are probably positively correlated, so this is a rough illustration), the refusal rate is 1 - (0.502 x 0.514 x 0.539) = **86.1%**. Adding "short-term placement" (44.5%) gives **92.3%**.
- **Design implication:** modelled capacity must be **acceptable capacity**. Each restrictive rule must be justified (safety or legal) and must have an alternative placement available. Mandatory case management (18.2%) is much less of a barrier than guest, curfew and room-check rules.

### 2.5 What does HSD's size say about governance?
$242.9M / 98 FTE = about **$2.5M of budget per HSD FTE**. HSD is mostly a contract manager, and the 16 FTE reduction (16 of an implied 114, or 14.0%) cuts monitoring capacity at the moment contracts are most numerous and most stressed. The contractors' workforce is not in the packet.

---

## 3. Governance and operating architecture

**Principle:** one party owns the system outcome (people in the stock, entries, exits, returns); providers own program outcomes; funders own funding stability. Nobody may disclaim the system.

| Level | Body (existing, per packet) | Decision rights (proposed) | Owns |
|---|---|---|---|
| 1. Policy and funding | Joint City-County leadership, Metro as SHS funder | Sets the pooled envelope; adopts system targets and the protection order; approves surge declarations | Funding stability |
| 2. System operator | HSD (CoC lead, contracting, shelter oversight) | Allocates funds to program types within the envelope; sets the common rules (intake, allocation, data, contract standards); runs corrective action | **System outcomes** |
| 3. Providers | Nonprofit contractors | Run programs to the contract standard; may propose operational variations; may appeal | Program outcomes, client rights |
| 4. Partners | Housing authorities, health systems, corrections and hospital discharge, state agencies | Hold housing units, vouchers and clinical services under written agreements with response-time commitments | Their own pipeline |
| 5. Independent oversight | A body outside HSD with audit and data access, including people with lived experience | Reviews reports, samples cases, receives complaints, can require a public response | Accountability |

Proposed rules:
- **Stability covenant:** a funding partner that reduces its contribution gives **at least 12 months' notice and a transition plan**, and may not cut protected obligations (existing tenancies, in-progress placements) mid-year. The City ending its HSD contribution in FY27 is the motivating example. Legal feasibility within the existing agreement is unverified.
- **Authority ladder:** operating decisions below a threshold *(default: below 5% of any program line)* sit with HSD. Larger reallocations need Level 1 approval.
- **Dispute process (default):**
  1. Operational, HSD and provider, 30 days.
  2. Inter-agency working group, 60 days.
  3. Elected leaders or an independent mediator.
  
  During any dispute the status quo continues for protected obligations.
- **Failure handling (corrective-action ladder):** technical assistance (60 days), then a corrective plan, then reduced referrals, then non-renewal, then step-in with client-protective transfer. System-level failure (section 10) escalates to Level 1 with a public report and a required response within 30 days.

---

## 4. Intake, triage and allocation as one system

**Design goal:** a household touches the system once, gets the least intensive adequate help quickly, and can step up or down without re-applying.

1. **No wrong door.** Any access point (outreach, shelter, 211, health, school, court, eviction-court help desk) can start a record and does a **brief screen of about 15 minutes** *(default)*. Full assessments happen only after a first offer is made.
2. **Three paths, one record:**
   - **Path A: resolve now.** Diversion, prevention, flexible cash, mediation, reunification. Eviction cases start here, before the person is homeless.
   - **Path B: housing-focused interim and time-limited assistance.** Interim housing *only if* it is attached to a housing plan, then rapid rehousing.
   - **Path C: long-term support.** Ongoing rental assistance for affordability-only needs, and permanent supportive housing for people needing intensive services. Affordability need and service need are scored **separately**, so subsidy-only households do not occupy supportive units.
3. **Step-up and step-down.** Households can move between paths. A **housing-retention check at 30, 90 and 180 days** triggers step-up before a failure. Step-down moves to lighter support when stable.
4. **Acceptable-offer rule** (from the Pathways findings): ask about deal-breakers (guests, pets, curfews, location, roommates) before offering. Offer **at least two options where inventory exists**, and record refusal reasons. **Refusal is not penalized** and does not drop a household's place.
5. **Anti-bottleneck rules:**
   - One shared record, so a household is not re-assessed by each program.
   - Referral response clocks *(default)*: provider acceptance or rejection with reasons within 2 business days.
   - Rejections for "not appropriate" must be reviewed. Providers may not reject for criteria beyond the program's written eligibility.
   - Funding goes to **flow capacity** (slots filled and turned over), not to assessment volume.

---

## 5. When demand exceeds capacity

Demand exceeds capacity now, so this is a standing rule set, not a contingency.

**Priority tiers (default).** Priority rests on three factors: (1) risk of serious harm or death if unhoused, including medical vulnerability and survivors of violence; (2) length of time homeless (long-stay priority, because that cohort drives the stock, see the extension's cohort model); (3) fit with the available resource. Within a tier, **longest wait goes first**. Tie-breaks use documented rules, not staff discretion.

**Waitlist rules:**
- The queue is **public in aggregate** (counts, median wait by tier) and **private for individuals**.
- A household's place is **not lost for non-response** until at least three outreach attempts via different channels, and any hold is reinstatable.
- **Waitlist honesty:** the system reports the expected wait. A queue with no realistic path to housing is not presented as an offer.

**Emergency override:**
- Allowed for documented imminent danger or medical emergency.
- Capped at **10% of monthly slots** *(default)*.
- Logged with reasons and **reviewed monthly** by independent oversight. Repeated use above the cap triggers a capacity review, not a quiet increase.

**Appeals and reassessment:**
- Emergency appeals are decided in **3 business days**. Standard appeals take **10 business days** *(defaults)*, decided by someone outside the original decision.
- Households can request reassessment when circumstances change. Routine reassessment is every 90 days for waiting households, so priority tracks need.

**Demand rationing must not hide cuts.** If capacity falls (for example through the FY27 shelter ramp-down), the priority tier boundary rises and **the public report states that more households in the lower tiers are going unserved**.

---

## 6. Provider contracting and procurement

**What to pay for:**
- **Base:** cost-based or capacity-based pay covering real, audited costs. Starting figure *(default)*: **70-80% of contract value**. Providers must be able to staff before they are judged.
- **Performance share:** *(default)* 10-20% tied to throughput measures, **risk-adjusted** for client acuity and length of homelessness so that harder cases are not penalized.
- **Quality and equity share:** *(default)* 5-10%, covering client-experience surveys (lived-experience-designed), refusal handling, disparities in outcomes and accessibility.

**Where outcome-based funding helps:** where the provider controls the outcome and the measure is hard to fake. Examples: move-in time, housing retention at 6, 12 and 24 months, returns, response clocks.

**Where it is dangerous:**
- Pay-per-exit alone rewards **creaming**, taking the easiest households.
- It also rewards **counting** exits to unstable destinations.
- It pushes providers into **cash-flow risk**, and small providers fail first.
- Single-metric contracts distort behavior. Always use a measure set and always report outcomes for the **long-stay and high-acuity cohorts separately**.

**Perverse incentives and safeguards:**
- Exits count only to verified permanent housing with a **retention check**. "Unknown" is never a success.
- Extra payment for exits of long-stay cohorts and high-acuity clients.
- Cap reliance on performance pay for small providers, and use advance payments.
- **Multi-year contracts** *(default: 3+1+1 years)* so a funder budget cycle does not turn into provider insolvency.

**Correction and replacement:** follow the ladder in section 3. The key client-protection rule is that **no client loses housing or shelter because a contract ends.** Replacement includes a funded transition plan *(default: 90 days)* and the right to follow staff or stay in the unit. The performance data on which a provider is judged are shared with it **at least quarterly** before any action.

**Procurement:** open solicitation with common standards, **small-provider and culturally specific provider set-asides** *(default: reserve a share of the contracts)*, and a standard rate and cost-allocation model so cost comparisons are real.

---

## 7. Landlord and housing-supply pipeline

**The throughput problem in numbers.** 2,599 exits a year is about **217 placements a month**. For the +27% exit increase in section 2.2 (about 3,301 a year, or 275 a month), if only about half of surfaced units end in a lease *(hypothetical conversion rate)*, the system must surface about **550 candidate units a month**. Housing search is therefore a throughput constraint in its own right.

**Operating design:**
1. **Landlord liaison team** with a **24-hour response guarantee** to landlords and a single point of contact. Landlords are recruited by building portfolio, not by one-off listing.
2. **Risk mitigation:**
   - A damage and unpaid-rent fund with a claims process (*default cap per unit: set locally*).
   - Prompt payment guarantee.
   - A mediation line for tenancy problems before any eviction filing.
   - Rapid inspection.
3. **Inspection:** one streamlined inspection, **reciprocal with the housing authority's** where possible, scheduled within *(default)* 5 business days.
4. **Vacancy coordination:** a shared vacancy board visible to all navigators, with **holding payments** *(default: up to 30 days)* so units do not go to the market while paperwork finishes.
5. **Master leasing:** use where (a) a provider can aggregate units from small landlords, (b) clients face high screening barriers, or (c) rapid inventory is needed (including during a surge). Master leasing needs ongoing funding, so it is gated like any recurring commitment.
6. **Pre-qualify households.** Navigators prepare documents, IDs and references **before** a unit is found, so search time falls.
7. **Link to housing production.** The packet reports that Portland has ample zoned capacity but needs about 63,000 more affordable units by 2045. The homelessness system cannot fix that, so it must feed **priority-access agreements** (set-asides in new affordable projects) into the housing strategy.

**Bottleneck early warnings:** days from referral to keys, share of vouchers or subsidies unused, and the ratio of candidate units to placements.

---

## 8. Workforce architecture

**Roles:** outreach workers, housing navigators, retention case managers, landlord liaisons, peer specialists (lived experience), clinical staff, supervisors, data staff.

**Caseload logic (hypothetical defaults; locally validate):**

| Service intensity | Indicative caseload | Used for |
|---|---:|---|
| Intensive (supportive housing) | 1:10 | Highest-need households |
| Standard (rapid rehousing, navigation) | 1:20 | Time-limited help |
| Light (retention and check-ins) | 1:40 | Stable subsidy households |

Scale check: **7,255 people supported in housing** (FY25) at a uniform 1:20 would imply about 363 FTE. In practice, intensity differs, so **the mix matters more than the average**. A system-wide staffing model needs actual enrolments by intensity.

**Controls:**
- **Supervision** at about 1:8 *(default)*, with clinical supervision where clients have behavioral-health needs.
- **Burnout and turnover:** pay-floor requirements in contracts (turnover is often a wage problem), caseload caps enforced by contract, and a **turnover trigger** *(default: above 25% a year)* that opens a contract review of pay and supervision, not a staff-blame review.
- **Lived-experience roles:** a target share of frontline roles *(default 20%)*, with pay, career ladders and support. Lived experience must not be unpaid or tokenistic.

**When staffing, not money, is the limit:**
1. **Gate enrolment to staff capacity.** Do not enroll households beyond what can be served. Quietly diluting caseloads is a failure mode.
2. Shift low-service-need households to **lighter models** (flexible financial assistance, peer navigation).
3. A **shared navigator pool** across providers for housing search.
4. Surge contracts and short-term cross-training for neighbouring-system staff (health, benefits).
5. **Report staffing vacancies publicly** as part of the capacity report.

---

## 9. Data and accountability layer

**Minimum common data model (all funded programs):** person ID, household ID, episode ID; program enrolment and exit with **destination**; entry source (including first-time vs return); offers made, accepted and refused with **reason**; waiting time; retention checks; demographics, disability and accessibility needs; and staff caseload.

**Privacy constraints:**
- Informed consent, with notice of what is shared and why.
- A **separate, comparable database for survivors of violence** with limited identifiers.
- Role-based access.
- **No data sharing for immigration or law-enforcement purposes** unless legally compelled *(proposed default; legal review needed)*.
- A correction process for individuals.

**Deduplication:** link HMIS and BNL records with documented matching rules and an error-rate audit. Report people, households and episodes separately.

**Bridge table (new, replaces the 90-day baseline):** monthly reconciliation of PIT (10,526), BNL (14,864 in April 2025) and fiscal-year people served, **stating the time basis and definitions**. The 2025 PIT report itself warns that part of the increase from 2023 comes from method changes. The system must not report a "rise" or "fall" without separating measurement from reality.

**Longitudinal and cohort tracking:** follow **entry cohorts** at 6, 12 and 24 months for housing, returns and unknown status. Report the **long-stay cohort** and **high-acuity** households separately.

**Public reporting:** monthly dashboard with stock, entries, exits (permanent and other), returns, waits by tier, refusals by reason, shelter days-to-exit, retention, disparities, and staffing vacancies. Counts of "unknown" are shown, not dropped.

**Auditing:** independent annual audit and **random case-file sampling** to confirm that reported exits match reality. Audit findings are published.

**Safeguards against easy metrics:**
- Outcomes are always shown with denominators that include the people who left the data (unknown).
- Headline success requires the **long-stay stock to fall**, not only total exits.
- Programs are compared on *risk-adjusted* outcomes.

---

## 10. Failure modes (system fails while programs look successful)

| # | Failure | How it hides | Early warning | Corrective action |
|---|---|---|---|---|
| 1 | **Shelter as storage** | Occupancy high, clients satisfied | Days in shelter rising; share of shelter exits going to permanent housing falling | Move placement resources to low-exit shelters (Shelter Review finding); stop expansion |
| 2 | **Exits offset by inflow** | Exits rise yearly, stock does not fall | Entries >= exits for 2 quarters; first-time entries rising | Shift resources to prevention; check rent and eviction signals |
| 3 | **Creaming** | Exit counts and retention look good | Long-stay cohort share of stock rising | Risk-adjust pay; bonus for long-stay exits; audit rejections |
| 4 | **Subsidy cliff** | Enrolment rises, then forced disenrollment | Committed obligations / secured recurring funding > 1 | Enrolment gate; cap new subsidies; protect existing tenancies first |
| 5 | **Fragmentation and cost-shifting** | Each funder meets its metrics | Partner reductions without notice; rising refusal of referrals | Stability covenant; Level 1 escalation |
| 6 | **Acceptability gap** | "Available" units are unused | High refusal share by reason (guest, curfew, location) | Rule review; alternative placements |
| 7 | **Data drift** | Count "rises" or "falls" with method | Bridge table breaks (PIT vs BNL divergence) | Publish bridge; freeze comparisons until reconciled |
| 8 | **Provider fragility** | Programs perform until a provider collapses | Late payments, vacancy in staff, thin reserves | Advance payments, multi-year contracts, transition fund |
| 9 | **Monitoring collapse** | Fewer staff to audit | HSD FTE and contract monitoring ratio falling (98 FTE, down 16) | Protect monitoring and audit capacity in the protection order |

**Trigger rule:** two failure indicators in the same quarter cause a **system review** at Level 1, not only a provider review.

---

## 11. Surge protocol

**Triggers (hypothetical thresholds; set locally):**
- Eviction filings 25% above the 12-month baseline.
- A rapid rent rise.
- Shelter occupancy above 95% for several nights.
- Dangerous heat, cold or smoke.
- Loss of a shelter site.
- Displacement of a defined number of people from a disaster or migration event.

**Levels:** 1 watch (monitoring and pre-staging), 2 elevated (pre-authorized prevention and shelter activation), 3 emergency (Level 1 declaration, emergency contracting).

**Pre-authorized actions:**
- Flexible-cash prevention.
- Temporary weather shelter and cooling or warming centers, with transport.
- Hotel or motel master leases.
- Pre-negotiated surge contracts with providers.
- Emergency use of reserved vacancy units.

**Funding:** a **contingency reserve** of about 3-5% of operating spend *(default; at $242.9M that is about $7.3M-$12.1M)*, plus a pre-agreed trigger for Level 1 reallocation. The surge protocol **cannot be funded by cutting protected obligations** (existing tenancies, in-progress placements).

**Exit plan:** every surge action has a sunset date and a plan for people in it, so surge capacity does not become the new, unfunded baseline.

---

## 12. Siting and community implementation

**Decision rules (set before specific sites):**
1. **Criteria first:** access to transit and services, infrastructure, fire and building-code compliance, fair distribution across districts, and avoidance of over-concentration. Criteria are public.
2. **Fair-share rule:** distribute capacity across districts using a published formula, so no district is a repeated default.
3. **Streamlined path:** projects meeting the criteria go through an expedited, time-limited process *(legal feasibility in Oregon land-use law not verified)*.

**Legitimate community input:**
- Input covers **design, operations and the good-neighbour plan.** It does not decide **whether** a site that meets the criteria is used.
- Fixed comment window *(default: 30 days)*, and a written response to substantive objections.

**Boundaries on veto:** no neighbourhood or council-district veto. Objections prevail only on **specific, objective grounds** (code or safety defect, infrastructure inadequacy, concentration over the published threshold).

**Addressing real neighbourhood impacts:**
- A 24-hour hotline with a response clock *(default: same day)*.
- Cleanup and trash services around the site.
- A **good-neighbour agreement** with named contacts and quarterly public review.
- A small mitigation fund for documented impacts.
- Temporary sites have a **performance review and sunset**. Failure to meet the agreement triggers corrective action.

---

## 13. Rural implementation (separate module)

Multnomah County is mostly urban, and the packet has no rural data. This module applies to the other counties in a tri-county or state-level plan and is **generic**.

- **Why the metro model fails:** low density, long travel times, few providers, limited rental stock and thin transportation.
- **Minimum viable system:** one regional intake line; mobile navigators; prevention cash; diversion and reunification; landlord incentives; shared or host housing; motel vouchers with a housing plan; telehealth.
- **Hub and spoke:** a regional hub pools staff and data, with part-time spokes in small communities. Use **lower caseloads for travel time** *(hypothetical: about 1:12-1:15 where visits average long drives)*.
- **Funding:** pooled funds with a formula that gives small counties a floor and does not depend on competition against metro providers.
- **Housing supply:** small modular or manufactured-housing options, adaptive reuse and master leases; transportation assistance for any housing offer.
- **When to use which model:** a default test of density, provider count and housing stock, set locally.

---

## 14. Decisions made this turn (ledger) — Anthropic / claude-sonnet-5-5

| # | Decision |
|---|---|
| D1 | Multnomah County is the working jurisdiction. The generic $100m/$450m scenario is retired as a budget. |
| D2 | The $242.9M FY27 HSD operating budget is the envelope. No new money is assumed. |
| D3 | HSD and the existing HRAP are the vehicle for governance. This document overlays them and does not create a parallel structure. |
| D4 | The 90-day baseline is replaced with a PIT/BNL/fiscal-year bridge table. |
| D5 | Budget protection order: existing tenancies, prevention, exit-capable shelter, low-exit shelter ramp-down, new capital last. |
| D6 | Affordability need and service need are scored separately. Long-term subsidy is distinct from supportive housing. |
| D7 | Offers must be acceptable (deal-breakers screened). Refusal is not penalized. |
| D8 | Emergency overrides are capped at 10% of monthly slots (default) and reviewed monthly. |
| D9 | Contract structure: 70-80% base, 10-20% risk-adjusted performance, 5-10% quality and equity (defaults). Multi-year contracts. |
| D10 | Funding partners give 12 months' notice before reducing contributions (proposed covenant). |
| D11 | Siting: criteria first, fair-share distribution, community input on design and operations but no veto. |
| D12 | Two failure indicators in a quarter trigger a system review. |

All of these are assistant-selected planning defaults, not user-approved or enacted.

---

## 15. Unresolved questions that need local evidence

1. Program-level split of the $242.9M, and which obligations are legally restricted (SHS, federal, state, General Fund).
2. Whether the 695 shelter-unit reduction sits inside the 1,606 SHS base, and each shelter's actual exit rate.
3. Annual inflow, returns and non-SHS exits (needed to turn section 2 from a sensitivity test into a model).
4. The relationship between PIT, BNL and fiscal-year counts (the bridge table needs actual data).
5. Legal authority: the intergovernmental agreement, Metro SHS rules, and Oregon land-use and tenancy law.
6. What the 90 HRAP action items already cover, so new proposals can be told apart from existing work.
7. Contractor workforce size, wages and turnover.
8. Landlord conversion rates and actual unit supply for voucher holders.
9. Whether the data-sharing limits in section 9 are legally consistent with state and federal requirements.

---

## 16. Next three pieces of work for another model

1. **HRAP crosswalk and authority map.** Map each of the 90 HRAP action items against sections 3-12 and label each as already-underway, partially covered, or new. Confirm the actual authority of each body. *Needs the HRAP text and the intergovernmental agreement.*
2. **Multnomah stock-flow and budget model.** Replace section 2's sensitivity test with a model using actual inflow, exit, return and shelter data and the HSD program budget lines. Show scenarios under the 21.7% contraction with uncertainty ranges, keeping PIT and BNL denominators separate.
3. **Shelter redesign and contract specification.** Use the Adult Shelter Review to decide which shelters get placement resources and which ramp down, and write contract language implementing section 6 (payment shares, risk adjustment, transition protections). *Needs the Shelter Review data.*
