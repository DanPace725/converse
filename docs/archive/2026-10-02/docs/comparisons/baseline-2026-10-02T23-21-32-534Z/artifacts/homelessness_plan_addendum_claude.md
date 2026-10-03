# Addendum: Stress-Tested Model, Sequencing, and Operating Tools

**Author/work attribution:** Anthropic / claude-sonnet-5-5. This addendum is this assistant's work. It builds on `homelessness_policy_plan.md` (OpenAI / gpt-6.1-sol, source_event_id evt_87c6e1b4-112c-4f62-b730-591b9261c33a), which I read in full before writing. I have not edited that file.
**Status:** Illustrative planning material. Nothing here is a local needs assessment, forecast, legal opinion, or user-confirmed fact. All numbers come from the base plan's own hypothetical assumptions unless labeled otherwise. I did no web research and verified no current law, funding rule, or published evidence.

## 1. Purpose and what was checked

The base plan has the right architecture: prevention, matched housing, supply, interim care, governance, measurement. This addendum does four things:
1. Re-checks the base plan's arithmetic.
2. Shows how fragile the headline target is to its assumptions.
3. Identifies sequencing and budget-timing gaps.
4. Adds operating tools: a phased scope, a risk register, a KPI table, and a legislative and administrative agenda.

### Arithmetic re-check (all reproduced)

| Base-plan figure | Re-computed | Result |
|---|---|---|
| Five-year stock, base case | 2,000 + 5 × (1,500 − 450 − 1,250) | 1,000 ✓ |
| Prevention misses (225 averted) | 2,000 + 5 × (1,500 − 225 − 1,250) | 2,125 ✓ |
| Exits fall to 1,000 | 2,000 + 5 × (1,500 − 450 − 1,000) | 2,250 ✓ |
| Prevention yield | 450 ÷ 1,500 | 30% ✓ |
| Annual operating, year five | Sum of components | $55.00m ✓ |
| Five-year operating | $39.4m + $43.3m + $47.2m + $51.1m + $55.0m | $236.0m ✓ |
| Capital/gap with 15% contingency | $282.5m × 1.15 | $324.875m ✓ |
| Total | $236.0m + $324.875m | $560.875m ✓ |

No arithmetic errors found. The concerns below are about modeling assumptions, not computation.

## 2. How much the headline target depends on its assumptions

The base model is linear: the stock falls by 200 a year (2,000 → 1,800 → 1,600 → 1,400 → 1,200 → 1,000). Under the model's own flows, about 3,050 people would experience homelessness at some point in year one (the 2,000 starting stock plus 1,050 net entries). The 1,250 placements would then cover roughly 41% of them. This is simple arithmetic on hypothetical inputs, and it ignores overlap and timing within the year.

### Scenario table (five-year ending stock; starting stock 2,000)

| Scenario | Entries averted/yr | Exits/yr | Other change | Ending stock |
|---|---:|---:|---|---:|
| Base plan | 450 | 1,250 | none | 1,000 |
| Prevention underperforms | 225 | 1,250 | none | 2,125 |
| Exits underperform | 450 | 1,000 | none | 2,250 |
| Both underperform | 225 | 1,000 | none | 3,375 |
| Returns add 125 entries/yr (about 10% of 1,250 exits) | 450 | 1,250 | +125 entries/yr | 1,625 |

The returns row is my own illustration. The base plan says entries include returns "when applicable", so if its 1,500 already includes returns, this row double-counts. The point is only that a small return rate can erase a large share of the gain. The local baseline must say explicitly whether the entry count includes returns.

### Break-even and required-effort calculations

- **Stock flat at 2,000:** with 1,500 entries and 1,250 exits, flat requires averting 250 of 1,500 entries, a prevention yield of about **16.7%**. Any yield above that reduces the stock. With zero prevention yield, the same model would give 2,000 + 5 × (1,500 − 1,250) = 3,250, so in this model the prevention assumption is what turns a rising stock into the planned fall to 1,000.
- **If prevention yield is only 15% (225 averted), reaching 1,000 would need 1,475 exits a year**, 225 more than the base case. The model's drivers can substitute for one another, but each has a real-world cost and capacity limit.
- **Diminishing returns warning:** the model assumes exits stay at 1,250 as the stock shrinks. The people left are probably those with the most complex needs and hardest-to-place circumstances. Local data must test whether exit rates hold as the easier placements are done. This is a hypothesis, not a finding.

### Decision rule I recommend adding

Do not adopt a single point target. Publish a **target range** with the scenario table above, re-estimated annually. CORRECTION (Anthropic / claude-sonnet-5-5, after review): my earlier wording here was wrong. The "prevention underperforms" case ends at 2,125, which is growth from 2,000, not a reduction, so it cannot serve as a commitment floor. Instead, treat "no net growth in the stock" (ending stock at or below the starting snapshot, to be restated once the local baseline exists) as the minimum acceptable outcome, with the 50% reduction as the stretch goal. The prevention-underperforms and both-underperform cases would fail that floor and should be published as downside risks with corrective actions, not as acceptable outcomes. Tie the corrective-action trigger in base-plan section 12 to *leading indicators* (prevention yield, exit rate, return rate), not just the stock.

## 3. Cost sensitivity and timing

Base-plan total: **$560.875m** ($236.0m operating, $324.875m capital/gap).

| Variation | Operating | Capital/gap | Total |
|---|---:|---:|---:|
| Base plan | $236.000m | $324.875m | $560.875m |
| PSH leases up mid-year on average (each cohort pays half-year in its first year); non-PSH at full scale from year one | $226.250m | $324.875m | $551.125m |
| All unit and operating costs +20%; 15% contingency retained | $283.200m | $389.850m | $673.050m |
| 3% annual inflation on operating costs (year one uninflated), capital unchanged | about $251.815m | $324.875m | about $576.690m |

Notes:
- The +20% row shows that a plausible cost miss moves the total by about $112m. It would be more with higher construction inflation or financing costs, which none of these rows include.
- The staggered lease-up row saves $9.75m, but real ramp-up of non-PSH programs would also be gradual, so actual early-year spending would be lower still. That does not mean the money is surplus. Slow ramp-up usually signals delivery capacity problems. Carry unspent funds forward under a rule that requires an explicit explanation.
- The 3% inflation rate is an assumption for illustration only. Replace it with a local index. Capital inflation is deliberately excluded here, so the capital figure is understated in that row.
- Still excluded from every row: intensive clinical services, medical respite, financing costs, and the cost of operating beyond year five. The base plan flags these omissions, and they matter most for the sustainability of PSH. Land treatment is unconfirmed: the base plan says land variation is omitted but also says land should be confirmed within project costs, so audit it line by line rather than adding it again (correction after review).

### Unit economics (illustrative)

Caveat added after review: the figures below are sensitivity illustrations of assistance spending to targeting. They are not cost-effectiveness estimates, they cover different outcomes, durations, and populations, and they must not be used to rank prevention against supportive housing, to set a funding rule, or to deny any household urgent help.

- **Prevention:** $4,000 per assistance episode ÷ 30% causal yield = **about $13,333 per genuinely averted entry**. Targeting is therefore critical. If better targeting raises yield from 30% to 40%, the cost per averted entry drops to $10,000. If yield is 15%, it rises to about $26,667, roughly the same as an annual PSH slot ($26,000). Prevention is worth funding mainly when targeting is good, and that has to be measured.
- **Rapid rehousing:** $18,000 per placement. This is a one-off cost with a possible return risk, so compare it with PSH on a retention-adjusted basis, not on sticker price.
- **PSH:** $26,000 per slot per year, recurring. Over a long tenancy, cumulative cost is much larger than for time-limited assistance, which is appropriate only for people who need that level of support.
- **Per net stock reduction:** dividing $560.875m by the 1,000-person reduction gives about $561,000 per person. I do **not** recommend using this figure. Capital purchases create durable assets, operating spending sustains flows for people beyond year five, and the stock reduction understates the number of people helped. It is shown only so readers who compute it can see why it misleads.

## 4. Sequencing gap: PSH supply versus demand

The base plan's 150-per-year PSH cohorts imply cumulative occupied slots of 150, 300, 450, 600, and 750. Its supply is 250 leased, 250 acquired/rehabilitated, and 250 newly developed.

- Leased and acquired units total 500. They can plausibly cover years one to three (450) and part of year four.
- To reach 600 in year four, at least **100 newly developed units must be occupied by year four**. To reach 750 in year five, all **250** must be occupied by year five.
- New construction often takes multiple years from site control to occupancy (confirm locally), so predevelopment, site control, and financing commitments must start in **year one**. If they don't, a shortfall will emerge in years four and five unless more leasing or acquisition fills the gap.

### Recommended supply rules

1. Maintain a **two-year supply pipeline** that is greater than the planned lease-up, tracked as: identified → financed → under contract → completed → occupied.
2. Preapprove a **substitution rule**: if development units slip, a fixed share of the gap may be filled by additional leased or acquired units, within an approved cost ceiling and with service capacity confirmed.
3. Release service funding when units are ready for occupancy, not on a fixed calendar, to avoid paying for services without housing or housing without services.

## 5. Interim shelter: throughput check

The base plan funds 300 interim beds. Annual stays = beds × 365 ÷ average length of stay, assuming full occupancy and no turnover gaps:
- 90-day average stay: about **1,217 stays/year**
- 180-day average stay: about **608 stays/year**

Relative to the 2,000-person starting stock, 300 beds is 15% of the snapshot count. The base plan does not say what share of that 2,000 is unsheltered, so whether 300 beds is adequate is unknown. Local data should answer three questions:
1. How many people are currently unsheltered and unserved?
2. What is the actual average stay, and is it lengthening because permanent exits are slow?
3. How often are people turned away?

Rising shelter length of stay is an early warning that the permanent-exit rate is below target. Use it as a leading indicator, and don't respond to it by only adding beds.

## 6. A phased scope, so the plan can start with less than the full budget

If full funding is not available at once, I suggest protecting these elements in order and stating the sequencing publicly. This is my priority judgment, not a settled research finding.

**Tier 1: protect first (low cost, high leverage, quick)**
- Accountable lead, data baseline, privacy rules, lived-experience compensation.
- Prevention access with legal help for imminent eviction.
- Landlord liaison and a risk-mitigation reserve.
- Institutional discharge protocols.
- Safety and accessibility standards for existing shelter and outreach.

**Tier 2: scale as capacity allows**
- Rapid rehousing and long-term subsidies sized to verified local landlord participation.
- First PSH tranche using leased and acquired units, with clinical coverage confirmed first.
- Medical respite and mobile clinical teams, if funded by health partners.

**Tier 3: multi-year capital and reform**
- New PSH development and affordable-housing gap fund.
- Zoning, permitting, and public-land reforms.
- Preservation fund.

Tier 3 has the longest lead times, so start its **preparatory** work (site inventory, entitlement reforms, financing structure, predevelopment) in year one even if construction dollars flow later. Correction after review: this preparatory work is not free. Predevelopment, legal review, and recruitment cost money, so fund it under capped, stage-by-stage approvals. Do not skip Tier 1 to protect Tier 3 headlines.

## 7. Legislative and administrative agenda

The items below are options to evaluate with local counsel. Authority differs by jurisdiction, and I have not verified any specific statute.

**Local council or board action**
- Create the regional delivery office and set its authority, reporting duties, and data-sharing rules.
- Authorize multi-year contracting and a prompt-payment standard for providers.
- Adopt a public-land inventory and a disposition policy tied to affordability covenants.
- Pass zoning and permitting changes with defined timelines and accessibility requirements.
- Establish a dedicated, recurring funding stream and a rule against using one-time money for permanent commitments.
- Adopt data-governance rules: allowed uses, retention limits, and explicit limits on enforcement access.

**Executive or administrative action**
- Interagency discharge agreements with named responsibilities.
- Uniform eligibility and reasonable-accommodation procedures across providers.
- A unit-pipeline reporting format using the five stages in section 4.
- An independent complaint and appeals process with published response times.

**State and federal engagement (verify what is available)**
- Alignment of state housing, behavioral-health, and Medicaid housing-related services with local PSH needs.
- Cooperation with the housing authority on voucher use and administrative waivers where permitted.
- Regional coordination to prevent cost-shifting between neighboring jurisdictions.

## 8. Risk register (selected)

| Risk | Early indicator | Mitigation | Owner (suggested) |
|---|---|---|---|
| Prevention yield lower than assumed | Re-entry to homelessness or eviction within 12 months among assisted households | Tighten targeting, add legal help, extend assistance when needed, evaluate causally | Prevention lead / evaluator |
| Exit rate falls as stock gets harder to house | Rising median time to placement; longer shelter stays | Fund intensive support, lengthen subsidies, increase accessible units | Delivery office |
| Landlord reluctance or rising rents | Share of vouchers or subsidies unused; lease-up time | Liaison team, risk reserve, faster inspections, source-of-income enforcement | Housing authority |
| PSH development slippage | Pipeline stage slippage in year-one reviews | Substitution rule; early site control | Housing department |
| Clinical funding gap | Services-to-units ratio below standard; vacant services posts | Secure health-partner commitments before lease-up; phase cohorts | Health agencies |
| Workforce shortages | Provider vacancy and turnover rates | Wage review, peer workforce, caseload standards | Contract managers |
| Displacement masked as progress | Unknown destinations, jail bookings, outflow to neighboring jurisdictions | Track destinations; regional compact; report separately | Evaluator |
| Public opposition to siting | Delays at hearings, litigation | Early engagement, transparent standards, by-right pathways where authorized | Elected leadership |
| Data or privacy failure | Audit findings; unauthorized access | Access controls, breach protocol, independent review | Privacy officer |
| Funding cliff after year five | Share of operating costs on one-time funds | Funding ledger; recurring revenue plan by year three | Finance |

## 9. KPI scorecard (suggested targets are placeholders pending baseline)

| Indicator | Definition to fix in advance | Suggested direction | Frequency |
|---|---|---|---|
| Prevention yield | Causally estimated share of assisted households who would otherwise have become homeless | Report with interval; investigate if below 16.7% under the base model | Annual (causal), quarterly (proxy) |
| Permanent exits | Verified, by destination type; exclude deaths, jail, unknown | At or above planned annual rate | Quarterly |
| Returns | Re-entry within 6, 12, 24 months, across providers | Declining; set local threshold after baseline | Quarterly |
| Time to placement | Median days from identification to suitable permanent placement | 30% reduction in two years (base-plan target) | Quarterly |
| Housing retention | Share housed at 12 months, by program | At least 85% (base-plan aspiration; define denominators) | Semiannual |
| Unsheltered count | Snapshot plus annual estimate, with uncertainty | At least 50% reduction (base-plan stretch) | Annual and quarterly outreach counts |
| Pipeline integrity | Units at each of five stages versus schedule | On schedule for year-four and year-five PSH needs | Quarterly |
| Service coverage | Clinical staff-to-resident ratio by program intensity | Meets locally defined standard | Quarterly |
| Equity | Access, exits, and returns by race, disability, age, family type | No unexplained gaps; investigate and fix | Semiannual |
| Resident experience | Safety, dignity, and choice survey results | Improving, with unfavorable findings published | Annual |
| Unknown destinations | Share of exits with unknown destination | Falling; explain if above a set threshold | Quarterly |
| Spending against plan | Obligated versus planned, by funding source | Within tolerance; unspent funds explained | Quarterly |

## 10. First-year decision calendar (suggested)

- **Days 0–30:** Name the accountable lead. Confirm data owners and legal authority. Seat and pay lived-experience advisors.
- **Days 30–90:** Publish baseline definitions and the scenario table. Open prevention intake. Start the pipeline inventory in section 4.
- **Days 90–180:** Sign discharge agreements. Fund landlord liaison and risk reserve. Start predevelopment on sites for the first development units. Procure the first leased PSH tranche once clinical coverage is confirmed.
- **Days 180–365:** First quarterly dashboards. Mid-year review of prevention yield proxies and exit rates. Confirm budget ramp against section 3. Begin independent evaluation design.

## 11. Open items I could not resolve

1. Whether the 1,500 entries include returns. See the returns row in section 2.
2. The unsheltered share of the starting stock, which is needed to size interim capacity.
3. Whether the 300 "other durable placements" per year have a verified supply. The base plan already warns that they do not.
4. Local rents, vacancy rates, and landlord participation, which determine whether the rapid-rehousing cost and exit assumptions are feasible.
5. Clinical funding source and amount for PSH and medical respite.
6. A jurisdiction. Without one, legal and funding sections remain generic.

## 12. Suggested next contributions from other models or the user

- Supply a jurisdiction and its baseline data, and rerun sections 2 and 3 with local numbers.
- Draft model ordinance language and a data-sharing agreement template, reviewed by local counsel.
- Prepare a population-specific evidence matrix with dated citations (the base plan's section 13 agenda).
- Build a monthly flow model with seasonality, lag times, and the returns rate.
- Write a community engagement and siting plan.

**Bottom line (Anthropic / claude-sonnet-5-5):** The base plan's arithmetic holds, but its headline 50% reduction sits on a 30% prevention yield. The stock stays flat if yield falls to about 16.7%, and it rises if yield or exits fall short. Start the long-lead supply work in year one. Publish a target range, not a point. Judge progress by leading indicators and verified outcomes.
