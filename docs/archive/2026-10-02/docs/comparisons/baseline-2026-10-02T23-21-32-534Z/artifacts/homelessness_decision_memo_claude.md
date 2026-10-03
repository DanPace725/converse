# Decision Memo: Review of Changes, Supply-Gap Finding, and Revised Planning Case

**Author/work attribution:** Anthropic / claude-sonnet-5-5. Everything below is this assistant's proposal or analysis, not a user-confirmed fact or a government decision.
**Status:** Illustrative planning material for the hypothetical region used in the earlier files. I did no web research, ran no code, and verified no local data, law, funding, or published evidence. All arithmetic was done with the calculation tool.
**Files reviewed in full:**
- `homelessness_policy_plan.md` (OpenAI / gpt-6.1-sol, version evt_87c6e1b4-112c-4f62-b730-591b9261c33a)
- `homelessness_plan_addendum_claude.md` (Anthropic / claude-sonnet-5-5, version evt_888ea5df-396c-4273-a52b-91f1065337b1 before this turn's corrections)
- `homelessness_operating_package_openai.md` (OpenAI / gpt-6.1-sol, version evt_67fc7dbc-d240-40c8-b3ba-75f402f99940)

I have not edited the two OpenAI-attributed files. I made targeted corrections to my own addendum, listed in section 3.

## 1. How the three documents fit together, and which one wins on a conflict

| File | Role | Use it for |
|---|---|---|
| Base plan (OpenAI) | Architecture and illustrative budget | Policy design, populations, governance, the $560.875m scoped baseline |
| Addendum (Anthropic) | Sensitivity and sequencing | Scenario tables, cost sensitivity, supply timing, risk register, KPIs |
| Operating package (OpenAI) | Delivery mechanics | Decisions table, gates A–D, service standards, monthly flow model, weekly triggers |
| This memo (Anthropic) | Review and reconciliation | Corrections, the supply-gap finding, a revised planning case, final decisions |

**Precedence rule I propose:** where a later file states an explicit correction, the correction governs. In particular, the corrections in section 3 below and the OpenAI package's section 2 refinements govern over the earlier wording they correct.

## 2. Review of the OpenAI package: what I accept, what I qualify

| Point in the OpenAI package | My view |
|---|---|
| The 2,125 "prevention underperforms" case is growth, not reduction, so my "commit to at least that reduction" wording was wrong | **Accept.** It was an error. Corrected in the addendum (section 3 below). |
| "Non-spending work" in year one is inaccurate because predevelopment, recruitment, and legal review cost money | **Accept.** Corrected in the addendum. Mobilization funding should be paid against an approved plan. |
| Land may already sit inside project costs, so it is not clearly excluded | **Accept.** The base plan says land variation is omitted but also that land is to be confirmed within project costs. The correct statement is "land treatment unconfirmed; audit line by line." Corrected in the addendum. |
| $13,333 per averted entry is not a cost-effectiveness estimate and should not be compared with a $26,000 PSH slot | **Accept as a limit on my wording.** I meant it as an illustrative sensitivity of assistance spending to targeting. It must not be used to rank prevention against PSH, or as a funding rule. I add that caveat in the addendum. |
| The 16.7% break-even is model-specific, not an eligibility rule | **Accept.** It is a diagnostic within the base example, nothing more. |
| Causal yield must be defined against a credible comparison, with household-to-person conversion | **Accept and adopt** their definition. |
| Shelter throughput should include turnover downtime (about 1,071 stays/year) | **Accept, with a caveat.** I treat my 1,217 as an upper bound with zero downtime and their 1,071 as a more realistic figure. Both rest on a 90-day average stay that is an assumption. |
| Ramp-up case: year-one exits of 1,125 give 1,125 at year five (43.75% reduction) | **Verified independently.** (2,000 − 1,125) ÷ 2,000 = 0.4375. |
| Gates A–D, service standards, weekly queues, escalation triggers | **Accept and adopt.** I map them to my tiers in decision D8. |
| Do not use a blanket high-need exclusion; clinical readiness is a provider duty, not a treatment condition | **Accept.** My addendum said to confirm clinical coverage before lease-up. That should be read as a provider and project readiness check, never a precondition for an individual's tenancy. |
| Use monthly management triggers alongside quarterly public reporting | **Accept.** See D6. |

I found nothing in the OpenAI package that I would reject. The main thing neither document had yet done is quantify the supply behind the "other durable placements" line, which I do next.

## 3. Corrections made to my own addendum (`homelessness_plan_addendum_claude.md`)

1. **Decision rule in section 2:** replaced the "reduction as large as the prevention-underperforms case" wording with a floor of no net growth in the stock and a 50% stretch goal.
2. **Section 6, Tier 3 note:** replaced "non-spending work" with wording that recognizes predevelopment and mobilization costs.
3. **Section 3 notes:** replaced the claim that land is excluded with "land treatment unconfirmed."
4. **Section 3 unit economics:** added the caveat that the per-averted-entry figure is not a cost-effectiveness estimate and must not be used to rank interventions.

## 4. New finding: the "other durable placements" line outruns its own supply

The base plan assumes 300 "other durable placements" every year, 1,500 over five years. The only housing-supply source for them in the plan is the local gap fund for **1,000** affordable-housing opportunities over five years, which is 200 a year if spread evenly. The base plan warns that these are not automatically homelessness exits, but it does not quantify the consequence.

Facts that follow directly from the plan's own numbers:
- Even if every gap-funded unit went to a household leaving homelessness, the 1,000 units cover only two-thirds of the 1,500 placements assumed.
- Gap-funded units are not delivered on day one. Construction or preservation takes time, so early-year supply is lower still.
- The plan also allows other durable outcomes such as voluntary reunification and existing turnover, but it gives no quantity for those and I have none. They must be verified locally.

### Effect on the five-year ending stock (starting stock 2,000; 1,500 entries; 450 averted; PSH and RRH exits unchanged)

| Case | Other durable placements | Total exits per year | Ending stock |
|---|---|---|---:|
| Base plan | 300 each year | 1,250 | 1,000 |
| Supply capped at an even 200 a year | 200 each year | 1,150 | 1,500 |
| Only half of the 200 a year goes to homeless households | 100 each year | 1,050 | 2,000 |
| Illustrative delivery ramp (see below) | 0, 50, 100, 150, 200 | 950 + that year's other durable | 2,000 |

**The ramp case is my assumption, not a forecast.** It assumes gap-funded units are delivered at 0, 100, 200, 300, and 400 over years 1–5 (1,000 in total) and that half of them reach households leaving homelessness through referral agreements. Those half-share placements total 500 over five years. The 50% share is a placeholder that I cannot verify.

Two further adverse effects stack on top, because the model is linear:
- Adding the OpenAI package's year-one ramp (year-one exits of 1,125 instead of 1,250) to the even-200 case gives 1,500 + 125 = **1,625**.
- Adding it to the ramp case gives 2,000 + 125 = **2,125**, which is growth from the starting stock.

This is a gap I could quantify from the base example's own numbers. I do not claim it is the largest gap, because clinical costs, financing, and local rents remain unquantified. It also changes the capital efficiency picture: if only half of gap-funded units reach homeless households, the gap subsidy attributed to each referred household is $150,000 ÷ 0.5 = $300,000. That is an attribution calculation, not a price. It shows why referral set-asides matter, because the other half of the units still serve other low-income households and have value in their own right.

### What it would take to close the gap

In the ramp case the shortfall against the base plan's 300 a year is 300, 250, 200, 150, and 100 placements in years 1–5, which is **1,000 in total** (average 200 a year). The plan could make this up with additional rapid rehousing or long-term subsidies.

Using rapid rehousing at the plan's $18,000 as a stand-in price:
- Extra rapid rehousing of 1,000 placements costs 1,000 × $18,000 = $18.0m.
- The other-durable support no longer needed is 1,000 × $5,000 = $5.0m.
- Net added operating cost is **$13.0m over five years** (checked with the tool).

| Year | Extra RRH placements | Other-durable placements | Net operating change | Operating total (base + change) |
|---|---:|---:|---:|---:|
| 1 | 300 | 0 | +$3.90m | $43.30m |
| 2 | 250 | 50 | +$3.25m | $46.55m |
| 3 | 200 | 100 | +$2.60m | $49.80m |
| 4 | 150 | 150 | +$1.95m | $53.05m |
| 5 | 100 | 200 | +$1.30m | $56.30m |
| **Five-year** | **1,000** | **500** | **+$13.00m** | **$249.00m** |

Revised illustrative five-year total: $249.00m operating + $324.875m capital/gap = **$573.875m**, versus $560.875m in the base plan. This still omits everything the earlier files already flagged: inflation, financing, intensive clinical services, medical respite, and post-year-five commitments.

**Caveats I want to be explicit about:**
- The extra rapid-rehousing load peaks in year one (1,100 placements against 800 in the base plan, a 37.5% increase) when the system is least able to deliver it. Landlord participation and staffing are the binding limits, not money. If year-one capacity cannot rise that much, the stock simply ends higher.
- Rapid rehousing is time-limited, so some households will need extensions or a long-term subsidy. The $13.0m treats $18,000 as a one-off, which understates cost if extensions are common.
- For households with a lasting affordability gap, a long-term subsidy is the better match than rapid rehousing. I have no local price for it, so I used the rapid-rehousing price as a placeholder only.

## 5. Decisions

These are my proposed decisions within the planning exercise, made with the information in the files. None is a government decision.

**D1. Outcome commitments.** Publish three separate statements: (a) a minimum acceptable outcome of no net growth in the homeless stock; (b) a stretch ambition of a 50% reduction over five years; (c) downside scenarios with named corrective actions. This replaces my earlier "range" wording and is consistent with the OpenAI package's three-statement structure.

**D2. Returns in the model.** For modeling, treat the 1,500 annual entries as gross entries that already include returns, as the base plan's wording ("including returns when applicable") implies. Do not add a separate return flow on top. Track returns separately for monitoring by placement cohort, as in the OpenAI monthly model. This resolves open item 1 of my addendum for modeling purposes. The local baseline may overturn it.

**D3. Replace the fixed 300 "other durable placements" with a supply-linked schedule.** Plan the line from verified delivery dates and referral agreements, not a flat annual number. Until local data exist, use the ramp case in section 4 as the planning default and show the base-plan flat 300 as an unverified upside.

**D4. Condition gap funding on referral access.** Make affordable-housing gap funding conditional on a minimum share of units being set aside for referral from coordinated access, at affordability levels that households leaving homelessness can sustain. I propose 50% as a negotiating starting point only. The right share depends on local costs and legal authority, and a higher share raises the per-unit subsidy needed. This is a design decision, not a verified standard.

**D5. Fund the gap with matched housing assistance, front-loaded.** Budget the substitution in section 4 (+$13.0m, peaking in year one) as a planning contingency, and confirm landlord participation capacity in the first 90 days. If the baseline shows that capacity cannot reach roughly 1,100 rapid-rehousing placements in year one, say so publicly and adjust the year-one outcome expectation instead of presuming success.

**D6. Triggers.** Use two layers. Operationally, adopt the OpenAI package's trigger of two consecutive months below 90% of the ramp-adjusted placement schedule, leading to a 30-day bottleneck plan. For public accountability, keep the base plan's quarterly dashboard and its two-consecutive-quarter corrective plan. Add leading indicators (prevention yield proxy, exit rate, return rate, shelter length of stay) as my addendum proposed. All triggers are review thresholds, not penalties and not individual denial rules.

**D7. Prevention evaluation and use of the figures.** Adopt the OpenAI causal-yield definition. Treat the 16.7% break-even and the cost-per-averted-entry figures as illustrative model diagnostics only. Never use them to deny a household urgent help, to rank prevention against supportive housing, or as a funding rule.

**D8. Reconcile my tiers with the OpenAI gates.**

| My tier (addendum) | OpenAI gate | Relationship |
|---|---|---|
| Tier 1: protect first | Gate A, operating launch | Same content. Gate A supplies the launch conditions. |
| Tier 2: scale as capacity allows | Gate B, each placement tranche | Gate B supplies the verification checklist for each tranche. |
| Tier 3: capital and reform | Gate C, each capital project | Gate C supplies readiness conditions. Predevelopment runs in parallel under capped exposure. |
| Annual review | Gate D, annual continuation | Gate D governs the review. |

**D9. Mobilization funding.** Pay providers for recruitment, training, and set-up before occupancy, against an approved mobilization plan and then actual capacity, as the OpenAI package proposes.

**D10. Interim shelter.** Hold the 300-bed assumption without reduction. Resize it within the first 90 days from measured turnaways and unsheltered counts, and never reduce capacity on the strength of a throughput approximation. Use roughly 1,070 to 1,220 stays a year as the illustrative bounds for 300 beds at a 90-day average stay.

**D11. Clinical readiness.** Treat it as a project and provider readiness check, never a condition on an individual's housing. If a project cannot safely deliver promised support, fund an interim or alternative arrangement through individualized review.

**D12. Evidence status.** Nothing here has been checked against current sources. The evidence-and-authority ledger described in the OpenAI package remains a required step before local adoption.

## 6. Open items that remain

1. Jurisdiction and the legal and funding framework that goes with it.
2. The local baseline: unsheltered share, annual flows, returns, current capacity and spending.
3. Actual supply of other durable placements: turnover in existing affordable housing, reunification, and the delivery schedule for gap-funded units.
4. Local landlord participation and rent levels, which decide whether the year-one rapid-rehousing load is deliverable.
5. Clinical and health-partner funding commitments, which remain gaps until signed.
6. A recurring revenue plan for the post-year-five operating run rate. The revised year-five operating figure is $56.3m, still excluding some needs.

## 7. Suggested next steps

- Supply a jurisdiction and baseline counts so the scenario tables and the section 4 supply schedule can be rerun with real inputs.
- Draft the referral set-aside terms for gap-fund agreements, reviewed by local counsel (D4).
- Build the monthly flow model from the OpenAI specification with the section 4 ramp as its placement constraint.
- Prepare the evidence-and-authority ledger with dated citations.

**Bottom line (Anthropic / claude-sonnet-5-5):** The plan's headline 50% reduction needs more than prevention to perform. It also needs housing supply that the base example does not yet show. On the plan's own numbers, flat 300 other durable placements are not supported by 1,000 gap-funded units, and an illustrative delivery ramp (my assumption, not a forecast) pushes the five-year stock back to about 2,000 unless roughly $13.0m of added housing assistance (front-loaded) and referral set-aside terms close the gap. Keep the 50% as a stretch goal, set no net growth as the floor, and make supply-linked schedules, not flat annual counts, the basis for every placement line.
