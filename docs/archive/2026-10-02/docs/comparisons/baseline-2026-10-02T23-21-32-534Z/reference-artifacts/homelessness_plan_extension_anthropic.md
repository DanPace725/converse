# Homelessness Plan Extension: Review, Cohort Model, Ramp Forecast, and Localization Kit

**Author: Anthropic / claude-sonnet-5-5.** Written in response to user request E63 ("Review changes and decisions and keep working on developing the broader plan") and the retry request E73. This file is separate. I did not edit `homelessness_policy_plan.md` (Sections 1-12 by OpenAI / gpt-6.1-sol; Appendix A by me) or `homelessness_implementation_decisions.md` (by OpenAI / gpt-6.1-sol). Every proposal here is an assistant proposal, not a user-approved decision. Numbers marked *hypothetical* are invented for illustration and are not data about any place. No external research, browsing, local legal analysis or cost verification was done. No jurisdiction, baseline count, budget ceiling, spending restriction, site or access requirement has been supplied by the user.

## 1. Review of the changes and decisions so far

**Arithmetic re-checked with the calculator (no errors found in OpenAI / gpt-6.1-sol's delivery package):**
- Six unit-costed operating lines: 12 + 12 + 6 + 25 + 16 + 8 = $79m. Full operating total: 79 + 8 + 5 + 3 + 5 = $100m.
- 600 x $20,000 = $12m and 400 x $15,000 = $6m, so the rapid-rehousing and ongoing-assistance lines still sum to the earlier $18m.
- A 20% rise on $79m = $15.8m; less the $5m reserve leaves a $10.8m annual shortfall.
- $120m / $360,000 = 333.3, so at most 333 whole units.

**Corrections I accept (affecting my own Appendix A):**
1. *Median versus mean.* Appendix A.2 treated the Section 10 target (a 30% cut in **median** episode duration) as if it were a 30% cut in **mean** duration. The stock = entries x duration relationship uses the mean. So the "about 14.3% inflow reduction" result does not validate the 40% target. OpenAI / gpt-6.1-sol's qualification is correct. Section 2 below shows how large the gap can be.
2. *"Ceiling" wording.* Appendix A.1 called $450m a ceiling for the scenario. It is an uninflated scenario total, not a cap and not a validated need estimate. Inflation, new obligations and exclusions can push real costs above it.
3. *Ongoing-assistance unit.* Appendix A.3 item 4 used $15,000 as a rental gap only, with 500 households. OpenAI's $15,000 is an all-inclusive figure for 400 household-years. The two are not comparable. If local data show 500 households and a rental gap alone near $15,000, the $6m line is short. That is unverified either way.

**Gaps I found in the package so far (addressed below):**
- It says targets stay provisional but does not say how to set them. See Sections 2 and 6.
- It does not model cash timing, so the $450m is not turned into year-by-year funding needs. See Section 3.
- It has no scale comparison, workforce check, or siting rules. See Sections 4 and 5.
- It lists missing inputs but not how each changes the numbers. See Section 7.

## 2. Cohort model: why a median target can leave the count nearly unchanged (hypothetical)

*Hypothetical baseline:* 4,800 episode entries a year (including returns). 90% are short episodes with mean 0.4 years. 10% are long episodes with mean 4.0 years. Under steady state, stock = entries x mean duration.

| Scenario | Mean duration (yrs) | Steady-state stock | Change from baseline |
|---|---:|---:|---:|
| Baseline | 0.9 x 0.4 + 0.1 x 4.0 = 0.760 | 3,648 | - |
| A. Short episodes 30% faster; long episodes unchanged | 0.9 x 0.28 + 0.1 x 4.0 = 0.652 | 3,129.6 | -14.2% |
| B. A plus long episodes cut 50% (4.0 to 2.0 yrs) | 0.9 x 0.28 + 0.1 x 2.0 = 0.452 | 2,169.6 | -40.5% |

Checked: 4,800 x 0.76 = 3,648; 4,800 x 0.652 = 3,129.6; 4,800 x 0.452 = 2,169.6.

**What this shows (conditional on the invented split):**
- Long episodes are 10% of entries but 4,800 x 0.1 x 4.0 = 1,920 of 3,648 stock, or **52.6%** of people homeless at a point in time. This is why point-in-time counts are dominated by persistent homelessness.
- With 90% short episodes, the overall median lies inside the short group. In Scenario A the median falls about 30% (if short durations scale proportionally) while the stock falls only 14.2%. A median target can be met while the count barely moves.
- In this example a 40% fall in stock came only when the long-stay group was also cut sharply (Scenario B). In practice that is the work of ongoing rental assistance and supportive housing, which are the most expensive and slowest lines.
- The model ignores inflow changes. Prevention that lowers entries would reduce stock further. Real distributions are not two-point, and the 90/10 split, 0.4 and 4.0 are invented.

**Decision I select (assistant-selected under the delegated discretion in E46/E63; not user-approved):** when targets are adopted after the baseline is validated, state them as a set rather than one headline percentage:
1. Episode entries (first entries and returns reported separately).
2. People/households homeless longer than a defined threshold (for example 12 months; the threshold to be set locally).
3. Verified permanent-housing exits and 12-month retention, with unknown outcomes reported.
4. Median **and** mean duration, shown with censored (ongoing) episodes handled by time-to-event methods.

The overall-stock target should then be derived from entries and the duration distribution, not set independently of them. This changes how Section 10 targets would be adopted. It does not drop them.

## 3. Ramp and cash-flow forecast for the illustrative scenario (hypothetical)

OpenAI's package says first-year outlays may be lower than the annual allowance. Here is one worked version. Assumptions, all *hypothetical*: the $95m of operating lines other than the $5m reserve is used at 50%, 80% and 100% in years 1, 2 and 3; the reserve is treated as uncommitted; capital ($150m) is spent 20%, 45% and 35%.

| Year | Operating committed | Capital | Total |
|---|---:|---:|---:|
| 1 | 47.5 | 30.0 | 77.5 |
| 2 | 76.0 | 67.5 | 143.5 |
| 3 | 95.0 | 52.5 | 147.5 |
| **Three-year total** | **218.5** | **150.0** | **368.5** |

Checked: 95 x (0.5 + 0.8 + 1.0) = 218.5; 218.5 + 150 = 368.5. The scenario total of $450m minus $368.5m = $81.5m, which is $15m of uncommitted reserve plus $66.5m (285 - 218.5) of unspent ramp-up.

**Implications:**
- **Do not size recurring funding to year-1 cash.** Steady-state committed operations are $95m a year (about $100m with the reserve), which is 2.0 times the year-1 figure of $47.5m. A funding source approved against year-1 spending would be about half of what year 3 needs.
- **Lower early spending is not savings.** Lease-ups create obligations that continue after the plan period. Capital delays also push operating costs to later years.
- **Capital is not recurring.** Year-3 capital ($52.5m in this ramp) ends, but the operating costs of the units it produces do not.
- Reforecast quarterly using actual lease-up, project milestones and reimbursement timing. Keep obligations (multi-year) and cash (this year) in separate columns. The 20% overrun test from the delivery package applies at full run-rate: $15.8m a year, or $10.8m after the reserve.

## 4. Scale check and workforce check (hypothetical)

**Scale check.** The $100m operating scenario against the hypothetical 3,648 stock is $100,000,000 / 3,648 = about **$27,400 per person-in-stock per year**. This mixes households and people, and the 3,648 is invented. Use it only as a localization comparator: if a place's stock is far from 3,648, the scenario should be rescaled, but fixed costs (data, administration, central staff) will not scale proportionally. A locality with one quarter of this stock should not assume one quarter of every line.

**Workforce check.** Required staff = concurrent households / caseload. *Hypothetical* example at a caseload of 20 households per case manager: 1,000 supported household-years / 20 = **50 FTE** by full ramp. At the Section 3 ramp (50%, 80%, 100%) that is about 25, 40 and 50 FTE across years 1-3, before supervisors and non-case-management roles. If providers cannot recruit at that pace, the binding limit is staffing, not money, and tranche release should slow, as the delivery package's workforce gate already requires. Real caseloads must come from provider data and household need.

**Unit-sourcing check.** The 600 rapid-rehousing packages a year imply about 600 / 12 = **50 new leases a month** at full ramp (about 25 a month at 50%). Landlord outreach has to find more than that, because some units fail inspection or are refused. The refusal rate is unknown and must be measured.

## 5. Siting, community engagement and tenant protection (proposed rules)

- Set siting criteria before specific sites are proposed: access to transit, healthcare, schools and work; accessibility; distribution across neighborhoods rather than concentration in one area; and a displacement-risk check for current residents.
- Publish operating plans for each project (staffing, security and maintenance approach, referral rules, a contact for complaints) and hold early engagement that can change design and operations.
- Engagement informs design. It does not authorize excluding people from housing on discriminatory grounds, and it does not replace legal approval. Local fair-housing and land-use law must be reviewed; I have not done that.
- Rehabilitation and acquisition of occupied buildings must include relocation protections for existing tenants, in line with the original plan's displacement safeguards.
- Track neighborhood complaint and response times in the dashboard, so that concerns are handled with data rather than anecdote.

## 6. Decisions I select now (assistant-selected, not user-approved)

| # | Decision | Release condition or limit |
|---|---|---|
| D1 | Adopt targets as a set (entries, long-duration stock, verified exits and retention, mean and median duration), derived from the validated baseline | Baseline published; Section 2 relationship re-run with real data; lived-experience advisory review |
| D2 | Size any recurring funding request to steady-state run-rate, not year-1 cash | Finance confirms source, renewal terms and permitted uses |
| D3 | Forecast by ramp and reforecast quarterly; keep obligations and cash separate | Replace the hypothetical 50/80/100% ramp with actual lease-up data |
| D4 | Publish siting criteria and operating plans before site proposals | Legal review of land-use and fair-housing rules |
| D5 | Use staffing capacity as an explicit gate for each tranche | Provider vacancy and caseload data |
| D6 | Use the intake in Section 7 to replace hypothetical inputs with real ones, in the order shown | User or local lead supplies inputs |

These do not override OpenAI / gpt-6.1-sol's decisions (leasing-first, separate ongoing-assistance line, continuity of current tenancies, funding gates, accountable lead). They add to them.

## 7. Localization intake: inputs, and which numbers each changes

| Input needed | What it changes |
|---|---|
| Jurisdiction and legal authority | Whether any measure here is lawful or fundable; terminology; the governance design |
| Current stock count, annual first entries and returns | Section 2 baseline; scale check; prevention sizing |
| Duration distribution (mean, median, share homeless over 12 months) | Section 2 cohort split; which lines carry the most weight for stock reduction |
| Local rent gap and landlord inventory | Ongoing-assistance cost and capacity; unit-sourcing check |
| All-in capital cost per unit and available sites | Supportive-housing unit count ($120m / cost per unit) |
| Budget ceiling and restricted funds | Whether the $100m / $150m scenario is feasible; which lines can be funded by which source |
| Existing spending and commitments | Net new funding need versus gross program cost |
| Workforce vacancy, wages, caseloads | Workforce check; ramp speed |
| Accessibility and site/clearance requirements | Eligible sites; capital timing |
| Funding renewal terms | Recurring-funding gate; cliff exposure |
| Timeline and priority populations | Ramp shape; weighting of family, youth, survivor and other pathways |

## 8. Limits

- Everything above is an assistant proposal or hypothetical illustration. Nothing is validated against local data.
- The cohort split, ramp percentages, caseload and capital-spend profile are invented to demonstrate method.
- The user has not approved any decision in this file. OpenAI / gpt-6.1-sol and I have both made choices under the instruction in E46 to decide on what is known. Those choices are planning defaults, not enacted policy.
- Legal, funding eligibility, site and access requirements remain unverified because none were supplied.
