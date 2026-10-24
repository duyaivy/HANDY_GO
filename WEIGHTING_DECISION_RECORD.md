# HandyGo — Architectural Decision Record: AI Ranking Weighting Methodology

**Record ID:** ADR-MATCHING-001  
**Status:** `UNVALIDATED_BASELINE`  
**Date:** October 2026  
**Author:** Senior Backend Engineer & Software Architect  
**Target System:** HandyGo Matching Service & AI Ranking Pipeline

---

## 1. Context & Problem Statement

In the HandyGo marketplace, when a Customer publishes a Service Request, an asynchronous Matching Service evaluates eligible Workers and scores them to produce a ranked recommendation list. The Top 5 recommendations are displayed to the Customer alongside incoming bids.

The ranking algorithm requires combining multiple heterogenous criteria (semantic relevance, physical distance, ratings, domain tenure, and order reliability) into a single composite matching score:

$$S_{\text{total}} = \sum_{i=1}^{5} w_i \cdot s_i \quad \text{where } \sum_{i=1}^{5} w_i = 1.0 \text{ and } s_i \in [0, 100]$$

A common architectural trap in early-stage platforms is treating arbitrary weighting coefficients as scientifically proven ground truth or fabricating fake survey statistics to justify them. 

This document defines:
1. The **initial baseline weights** and their business rationale.
2. An explicit categorization distinguishing **business assumptions**, **expert judgment**, and **empirically validated findings**.
3. A formal Multi-Criteria Decision Analysis (MCDA) framework based on **Swing Weighting** for future stakeholder calibration.
4. A validation roadmap for Phase 3 using offline evaluation metrics ($NDCG@5$).

---

## 2. Status Classification: `UNVALIDATED_BASELINE`

The proposed initial weights ($30\%, 25\%, 20\%, 15\%, 10\%$) represent an **unvalidated operational baseline**. They are established via expert architectural judgment and domain knowledge of home-services marketplaces, but have **not yet been validated against production behavioral data or offline click-through logs**.

```
+-----------------------------------------------------------------------------------+
|                        EVIDENTIARY STATUS CLASSIFICATION                          |
+--------------------------+--------------------------------------------------------+
| Dimension                | Current Evidentiary Level                              |
+--------------------------+--------------------------------------------------------+
| Semantic Relevance (30%) | Expert Judgment & Product Assumption                   |
| Geographical Match (25%) | Physical Operational Constraint & Expert Judgment      |
| Rating Quality (20%)     | Trust & Safety Policy & Expert Judgment                |
| Service Experience (15%) | Domain Heuristic Assumption                            |
| Completion Rate (10%)    | Reliability Baseline Assumption                        |
| Mathematical Framework   | Formal MCDA (Swing Weighting) Protocol                 |
+--------------------------+--------------------------------------------------------+
```

---

## 3. Feature Definitions and Baseline Weights

| Feature ($i$) | Dimension | Proposed Weight ($w_i$) | Raw Metric Range | Normalized Score $s_i \in [0, 100]$ |
|---|---|---|---|---|
| 1 | **Semantic Expertise** | **30%** (0.30) | Cosine similarity $\in [-1.0, 1.0]$ between request description embedding and worker offering text embedding | $\max(0, \cos(\theta)) \times 100$ |
| 2 | **Geographical Suitability** | **25%** (0.25) | Haversine distance $d$ (km) relative to service area radius $R$ (km) | $(1 - \frac{d}{R}) \times 100$ |
| 3 | **Customer Rating Quality** | **20%** (0.20) | Bayesian smoothed average rating $R_{\text{adj}} \in [1.0, 5.0]$ | $\frac{R_{\text{adj}} - 1.0}{4.0} \times 100$ |
| 4 | **Service-Specific Experience** | **15%** (0.15) | Registered experience years $Y \ge 0$ | $\min(100, \frac{Y}{10} \times 100)$ (caps at 10 years) |
| 5 | **Historical Completion** | **10%** (0.10) | Completed orders / (Completed + Worker-Fault Cancelled) | $\text{Rate} \times 100$ |

---

## 4. Architectural Rationale for Feature Weights

1. **Semantic Expertise (30% - Highest):**
   - *Rationale:* If a worker specializes in electrical wiring but the request requires high-pressure plumbing, proximity or rating is meaningless. Skill congruence is the foundational prerequisite of customer conversion.
2. **Geographical Suitability (25% - Second):**
   - *Rationale:* Home services are hyper-local. Workers located closer to the customer incur lower travel costs, arrive faster, and exhibit significantly lower job abandonment rates.
3. **Customer Rating Quality (20% - Third):**
   - *Rationale:* High ratings build immediate customer trust. Customers are reluctant to select recommended workers with poor or unproven track records.
4. **Service-Specific Experience (15% - Fourth):**
   - *Rationale:* Years of experience within the specific requested trade differentiate master craftsmen from novices, especially for complex diagnostic repairs.
5. **Historical Completion Performance (10% - Fifth):**
   - *Rationale:* Demonstrates operational reliability. Weighted lowest initially because early in the platform's lifecycle, the Order Service has limited order history, making this feature sparse.

---

## 5. The Swing Weighting Methodology for Stakeholder Calibration

To formally validate and adjust weights with Product and Business stakeholders in subsequent phases, HandyGo will execute the **Swing Weighting MCDA method**.

### 5.1 Procedure
1. **Establish Anchor State (Worst Case):**
   Construct a hypothetical worst-case worker scenario where all 5 features are at their worst acceptable levels:
   - Semantic: Zero relevance to request.
   - Distance: At the outer boundary ($d = R$).
   - Rating: Bare minimum threshold (e.g., 3.0 / 5.0).
   - Experience: 0 years.
   - Completion: 50% completion rate.
2. **Evaluate Single-Dimension Swings:**
   Present stakeholders with 5 alternative profiles, each swinging exactly one feature from its **worst state** to its **best state** while holding all other features at the worst state.
3. **Rank the Swings:**
   Stakeholders rank which swing provides the highest incremental value to the marketplace (e.g., Swing 1: Semantic, Swing 2: Geo, etc.).
4. **Assign Relative Swing Points ($P_k$):**
   Assign 100 points to the most valuable swing, and relative scores ($0 < P_k \le 100$) to the other swings.
5. **Normalize Points into Weights:**
   $$w_i = \frac{P_i}{\sum_{j=1}^{5} P_j}$$

### 5.2 Mathematical Illustration
Assuming a stakeholder evaluation yields relative swing points of:
- Semantic Expertise: $P_1 = 60$
- Geographical Proximity: $P_2 = 50$
- Rating Quality: $P_3 = 40$
- Service Experience: $P_4 = 30$
- Completion Reliability: $P_5 = 20$
- **Total Points:** $\sum P = 200$

Normalized weights:
- $w_1 = 60 / 200 = 30\%$
- $w_2 = 50 / 200 = 25\%$
- $w_3 = 40 / 200 = 20\%$
- $w_4 = 30 / 200 = 15\%$
- $w_5 = 20 / 200 = 10\%$

*(Note: This illustration demonstrates the mathematical normalization mechanics and must not be cited as empirical survey evidence).*

---

## 6. Sensitivity Analysis Protocol

Prior to production deployment in Phase 3, sensitivity analysis will evaluate how rank order changes under alternative weight scenarios:

1. **Hyper-Local Scenario:** $(25\%, 40\%, 15\%, 10\%, 10\%)$ - Stress tests urban dense clusters where physical travel time dominates.
2. **High-Trust / High-Value Scenario:** $(35\%, 15\%, 30\%, 15\%, 5\%)$ - Stress tests premium services (e.g. electrical overhaul, luxury remodeling) where rating and craftsmanship outweigh proximity.
3. **Rank Stability Metric:** Calculate Spearman's rank correlation ($\rho$) between the baseline Top 5 and alternative configurations. If $\rho < 0.70$ across realistic perturbations, the feature pipeline must alert engineers to review weight sensitivity.

---

## 7. Phase 3 Validation Plan

In Phase 3, the unvalidated baseline will undergo rigorous offline and online empirical validation:

1. **Offline Evaluation ($NDCG@5$):**
   - Construct a benchmark set of 100 representative Service Requests with manually annotated relevance grades (0 to 3) for 20 candidate Workers per request.
   - Compute Normalized Discounted Cumulative Gain at rank 5 ($NDCG@5$):
     $$DCG@5 = \sum_{r=1}^{5} \frac{2^{\text{rel}_r} - 1}{\log_2(r + 1)}, \quad NDCG@5 = \frac{DCG@5}{IDCG@5}$$
   - Target acceptance threshold: $NDCG@5 \ge 0.78$.
2. **Online A/B Testing:**
   - Test baseline weights against an equal-weight control ($20\%$ each) measuring:
     - Booking Proposal Initiation Rate from AI Recommendations.
     - Worker Acceptance Rate.
     - Order Completion Rate.
