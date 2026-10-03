# Architecture Layer, Part 3: Housing Supply Pipeline, Workforce, Data and Accountability

**Author/work attribution:** Anthropic / claude-sonnet-5-5. Continues Parts 1 and 2. Labels: [Packet], [Calc], [Placeholder] (calibrate locally), [Verify]. Ratios and thresholds are indicative placeholders, not verified standards.

## 1. Landlord and housing-supply pipeline, operationally

### 1.1 The throughput question
FY25 SHS permanent-housing exits were 2,599 people [Packet]. At the PIT ratio of 1.086 people per household [Calc, an approximation for exits], that is about 2,394 households, or about **200 lease-ups a month** [Calc]. The stretch case in Part 1, section 2.4 (+595 exits a year) implies roughly 245 a month [Calc approx.]. The system must therefore find, inspect and lease about 200-245 suitable units every month.

Search workload follows from search duration (Little's law: concurrent searches = monthly lease-ups x average search months). At 60 days from "assistance in hand" to keys, about 400 searches are open at any time; at 30 days, about 200 [Calc]. **Halving search time halves the standing search workload.** Target: median 30 days from assistance approved to keys [Placeholder], measured at each stage.

### 1.2 Sourcing channels
| Channel | Use for | Note |
|---|---|---|
| Landlord recruitment (liaison team) | P2, P3, some P4 scattered-site | Main volume channel |
| Master leasing | People facing screening barriers; hard-to-lease markets; large families; scattered-site P4 | See 1.5 |
| Set-asides in affordable buildings | P3, P5, P4 | Referral agreements with capital funders [Verify who funds] |
| Acquisition / conversion | P4 and P3 | Capital partners; not an HSD line |
| Shared housing / host homes | Selected P2 | Required roommate is a deal-breaker for 42.5% [Packet]; offer, never require |

### 1.3 Landlord offer (what makes participation rational)
- Single landlord-facing application and one point of contact; a 24/7 landlord line with 24-hour response.
- Holding fees so a unit stays available during inspection; vacancy-loss payments for a capped period after a move-out; prompt, predictable rent payments (target within 5 business days).
- **Risk-mitigation fund** with defined caps (placeholder: up to two months' rent plus a damage cap per tenancy), claims paid within 14 days. Slow claim payment is the main reason landlords leave a program.
- Tenant support the landlord can call, with a written response protocol.
- Check local tenant-screening and source-of-income rules and how they interact with program screening [Verify].

### 1.4 Inspection and vacancy coordination
- **Inspection-ready inventory:** pre-inspect units in the pipeline before matching, using a bench of third-party inspectors; same-week target. Do not waive safety standards. Federal-funded units carry their own standards [Verify].
- **Vacancy register:** real-time list with bedrooms, accessibility, pet rules, rent, location and availability date.
- **Weekly matching conference** pairs vacancies with waiting people by preference and suitability; a vacancy is matched or escalated within 7 days of being identified.

### 1.5 Master leasing
Use where a landlord will not accept individual tenants but will accept an organization as tenant, or where screening barriers block placement. The organization leases and sub-leases; after 12 months the tenant takes over the lease directly if they choose. Cost is a rent guarantee premium, so use selectively. Starting planning range: 15-25% of P2 and scattered-site P4 units [Placeholder]. Exit risk: if a master lease ends, the resident must be able to transfer; write that into every master lease.

### 1.6 Keeping search from becoming the bottleneck
1. Start searching at assistance approval, not after all paperwork is done.
2. Housing-search support in tiers: self-directed with a stipend; navigator-supported; intensive.
3. Escalate at 45 days without a unit [Placeholder]: master lease, a different neighborhood, shared option, or a P3 slot.
4. **Move-on is the cheapest source of supportive-housing slots.** Residents of P4 who no longer need intensive support move to P3 (a long-term subsidy) by choice, freeing a P4 slot without new construction. Set a measured move-on target after the baseline; every move-on slot also reduces new multi-year liabilities (Part 1, section 2.3).
5. **Market link:** if rent assistance payment standards exceed market, assistance bids rents up; coordinate payment standards with the housing authority [Verify who sets them].
6. Track the unit pool (active landlords, repeat-landlord rate) as a leading indicator; landlord attrition is a failure mode (Part 4).

### 1.7 Liaison staffing
Start at one landlord liaison per 20-30 monthly lease-ups, which is about 7-10 FTE at current scale [Calc, placeholder ratio], and calibrate on actual workload.

## 2. Workforce architecture

### 2.1 Roles
Front-door staff; navigators of record; landlord liaisons; housing and inspection specialists; tenancy-support specialists; intensive multidisciplinary teams; peer specialists; outreach workers; shelter staff; clinical and administrative supervisors; contract managers; data analysts; tenant legal-aid attorneys.

### 2.2 Caseload logic (indicative; verify against program standards)
| Service band | Indicative caseload (clients per FTE) |
|---|---|
| Intensive multidisciplinary support | 1:10 to 1:12 |
| Standard tenancy support | 1:20 to 1:25 |
| Light-touch follow-up | 1:40 to 1:50 |
| Housing navigation (active search) | 1:20 to 1:25 |
| Landlord liaison | 1:20 to 1:30 monthly lease-ups |

Formula: FTE = sum over bands of (clients in band ÷ ratio), plus supervision at 1:8, plus a buffer for vacancies and leave (placeholder 10%).

**Worked illustration.** The 7,255 people supported in housing [Packet] with a **placeholder** mix of 20% intensive (1:12), 50% standard (1:25), 30% light-touch (1:50) need about 310 front-line FTE [Calc]; with supervision about 349 and with a 10% buffer about 383 [Calc, by hand]. The mix is invented. Each 10-percentage-point shift of people from standard to intensive support adds about 31 FTE [Calc]. The mix, not the headcount of people, is the largest lever on workforce need, so the profile data (section 3) must record support intensity.

### 2.3 Controls on burnout and turnover
- **Hard caseload caps**, not averages. Weighted caseloads where acuity differs.
- Supervision at 1:8 with weekly clinical supervision; paid time for secondary-trauma support; limits on on-call duty.
- Wages at least comparable to equivalent public roles [Verify local data]; career ladders including from peer roles.
- Track turnover and vacancy by provider quarterly. Alert thresholds: vacancy above 15% or annual turnover above 25% [Placeholder].

### 2.4 Lived-experience roles
Paid peer specialists with supervision and a career path; paid advisory seats on the executive steering group, appeals panel and contract review; hiring preference with supports so peers are not placed on caseloads above their capacity.

### 2.5 When staffing, not money, is the limit
1. **No throughput target may override a caseload cap.** If both bind, report the gap rather than overload staff.
2. Size each placement tranche to staffed support capacity (the tranche, not the individual's access to housing).
3. Shift low-acuity people to light-touch support and use phone or tele-support where suitable.
4. A shared float team that covers vacancies across providers.
5. A shared training academy and a cross-provider hiring compact to reduce poaching.
6. Unspent personnel funds convert to wage and retention increases, not clawback.
7. Temporary county staff for surge roles, with a time limit.
8. Expand the peer workforce deliberately.

## 3. Data and accountability layer

### 3.1 Minimum common data model
| Entity | Key fields |
|---|---|
| Person | Unique ID (deduplicated); demographics (race/ethnicity, age, gender, disability); consent status |
| Household | Household ID, composition, links to persons |
| Homelessness episode | Start, end, entry source (first-time, return, institutional discharge, eviction), living situation at entry |
| Enrollment | Program, dates, navigator, destination at exit with **verified / unverified** flag |
| Referral and offer | Date, resource, outcome, **decline reason**, which deal-breaker if any |
| Housing unit and subsidy | Unit ID, rent, subsidy ID, inspection date, landlord ID |
| Service contacts | Date, type, outcome (minimal) |
| Support intensity band | Intensive / standard / light-touch, for workforce and cost modeling |
| BNL status | Active / inactive with rule-based definition |

Fix a written definition of "active homeless" in the BNL (what contact within how many months) before using it for targets (Part 1, D-denominator-3).

### 3.2 Deduplication and identity
Deterministic matching plus probabilistic matching with human review of uncertain pairs. Measure the duplicate rate by audit, and report it. Count a household once when it changes programs while remaining housed.

### 3.3 Privacy
Data minimization; role-based access; retention limits; consent tiers (service-level consent; no broad sharing as a condition of help); aggregated public reporting with small-cell suppression; domestic-violence providers use a comparable, separate database; data-sharing agreements specify allowed uses, no routine enforcement access, correction rights and breach response. Health and education privacy rules apply [Verify].

### 3.4 Longitudinal outcomes and cohorts
Track **entry cohorts** (how long until exit, what share exit) and **exit cohorts** (return rates at 6, 12, 24 months, by exit type and provider). Use life tables, not single-month snapshots. Report censoring and follow-up completeness. Report first-time entries, returns and institutional-discharge entries separately: the inflow breakdown is the most important unknown (Part 1, section 2.4).

### 3.5 Safeguards against optimizing easy metrics
- **Exit-parity ratio** = (share of exits that are long-stayers, defined as 12+ months homeless) ÷ (share of the active stock that are long-stayers). Target at least 0.8 [Placeholder]. Below that, exits are skewing to easy cases.
- Report the **number and share of people homeless 12+ months** and the median and 90th-percentile duration, not only the average.
- Stratify every outcome by support-intensity band and by household type; publish the stratified results.
- **Unknown-destination tripwire:** unknown destinations above 15% of exits [Placeholder] suspends comparative claims for that program until repaired; essential services continue.
- **Independent audit:** each year sample about 200 exits [Placeholder], verify destinations by contact or records, and publish the error rate. Flag providers with improbable growth in "family or friend" destinations.
- Distinguish inflow-side from exit-side success: report the inflow-to-exit ratio monthly so rising exits cannot hide rising entries.
- Do not use the PIT as the outcome measure, and never compare PIT with BNL figures in one rate.

### 3.6 Public reporting and audit
Quarterly public dashboard (aggregated), monthly management view (operating package), annual independent audit of data and finance reporting to the elected bodies, and a published correction log so changes to definitions and past figures are visible.
