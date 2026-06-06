# KNOWLEDGE BASE SEED (For Human Review)

All entries are marked `needsVerification: true` before production activation.

| # | Lender | Product | Rate Range (%) | Processing Fee (%) | TAT (days) |
|---|---|---|---:|---:|---:|
| 1 | HDFC Bank | personal_loan | 10.50-24.00 | 2.00 | 3 |
| 2 | SBI | personal_loan | 11.15-15.30 | 1.50 | 5 |
| 3 | ICICI Bank | personal_loan | 10.85-19.00 | 2.25 | 2 |
| 4 | Axis Bank | personal_loan | 10.49-22.00 | 2.00 | 3 |
| 5 | Kotak Mahindra Bank | personal_loan | 10.99-24.00 | 2.50 | 4 |
| 6 | Bajaj Finserv | personal_loan | 11.00-26.00 | 3.00 | 2 |
| 7 | Tata Capital | personal_loan | 10.99-24.00 | 2.75 | 3 |
| 8 | HDFC Bank | home_loan | 8.50-9.60 | 0.50 | 10 |
| 9 | SBI | home_loan | 8.40-9.30 | 0.35 | 12 |
| 10 | ICICI Bank | home_loan | 8.75-9.85 | 0.50 | 9 |
| 11 | Axis Bank | home_loan | 8.75-10.40 | 1.00 | 8 |
| 12 | Kotak Mahindra Bank | home_loan | 8.70-10.20 | 1.00 | 9 |
| 13 | Bajaj Finserv | home_loan | 8.75-11.00 | 1.00 | 7 |
| 14 | Tata Capital | home_loan | 8.75-10.75 | 0.75 | 8 |
| 15 | HDFC Bank | lap | 9.75-13.50 | 1.00 | 9 |
| 16 | SBI | lap | 10.15-12.25 | 1.00 | 12 |
| 17 | ICICI Bank | lap | 10.25-15.00 | 1.50 | 8 |
| 18 | Axis Bank | lap | 10.00-16.00 | 1.50 | 7 |
| 19 | Kotak Mahindra Bank | lap | 10.50-14.50 | 1.50 | 9 |
| 20 | Tata Capital | lap | 10.99-16.00 | 2.00 | 8 |

## Review Checklist
- Validate product-level interest bands against current lender circulars (2024-25 baseline used).
- Validate product fees (percentage + fixed fee overrides) by lender branch policy.
- Confirm documentation sets per salaried/self-employed applicant by lender and city.
- Validate CIBIL/income thresholds with current underwriting matrix.
- Approve or revise before running `src/jobs/seedKnowledge.ts` in production.
