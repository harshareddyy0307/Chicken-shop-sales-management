# Chicken Shop Management System 🍗

A complete, production-grade, responsive, full-stack **Chicken Shop Management System** built for real-world poultry retail & wholesale shops to record daily business operations, track counter money collections, manage live bird stock, maintain distributor supply accounts, record customer Katha credit, and calculate daily net profit.

All monetary calculations use high-precision Decimal arithmetic (preventing floating-point inaccuracies), historical transactions are permanently preserved in a normalized **PostgreSQL** relational database, and daily reports reflect real-time entries with zero double-counting.

---

## 🚀 Key Modules & Architecture

1. **Main Executive Dashboard**
   - **10 Core Business Cards**:
     1. Today's Total Counter Collection (Cash + UPI + Card + Other)
     2. Today's Chicken Purchase Cost
     3. Today's Chicken Sales Revenue
     4. Today's Estimated Gross Profit
     5. Today's Net Profit Estimate
     6. Today's Chicken Stock Sold (kg)
     7. Today's New Distributor Supply (kg)
     8. Total Outstanding Distributor Payments
     9. Total Customer Katha Outstanding
     10. Today's Operating Expenses
   - Separate distinction between **Counter Collection** (liquid money received) vs **Chicken Sales Revenue** (stock value sold).
   - 7-Day sales & counter collection trend chart.
   - 12-Month annual profit & revenue performance chart.
   - Live chicken stock balance overview & low-stock discrepancy alerts.
   - Date selector to view and compare historical days.

2. **Daily Business Closing 4-Step Wizard**
   - **Step 1: Distributor Chicken Purchase**: Live bird weight (kg), rate per kg, auto-calculated total amount, multiple deliveries support, linked to distributor supply without double-counting.
   - **Step 2: Daily Counter Collection**: Liquid money received across Cash, UPI / QR, Card, and Other payment methods.
   - **Step 3: Chicken Stock & Daily Sales**: Opening Stock (kg), New Stock Received (kg), Total Available Stock, Closing Stock (kg), Selling Price/kg, auto Quantity Sold, auto Chicken Sales Revenue. Validates that closing stock cannot exceed available stock.
   - **Step 4: Review, Adjustments & Confirmation**: Full summary of purchases, collections, stock & sales. Add financial adjustments with mandatory reasons. Atomic database transaction submission.
   - **Completed State Locking**: Submitted closings are locked. Reopening requires Owner/Admin role and an auditable reason.

3. **Chicken Sales Module**
   - Fast counter sale transaction entry with weight (kg), price/kg, and payment method.
   - Supports decimal quantities (e.g. 1.75 kg, 12.5 kg).
   - Reconciles counter sales against stock movement.

4. **Stock Management & Inventory Continuity**
   - Daily opening stock automatically carries forward from previous day's verified closing stock.
   - Incorporates distributor deliveries and counter sales.
   - Manual stock adjustment tool for shrinkage, cutting loss, or surplus found on scale with reason and audit log.

5. **Distributor Supply Management**
   - Records live bird batches: Weight (kg), Price/kg, Total Amount, Invoice/DC #, Notes.
   - Automatically increases inventory and updates accounts payable.
   - Edit and delete actions with mandatory reasons and audit trail.

6. **Distributor Payment Records & Ledger**
   - Partial payments, advance payments, and multiple payments per supply.
   - Prevents paying more than outstanding debt unless advance payment is explicitly flagged.
   - Chronological running balance ledger: Opening Balance, Deliveries, Payments, Running Balance.
   - Screenshot upload for UPI/bank transfer receipts.

7. **Customer Katha / Credit Accounts**
   - Customer account creation with duplicate warning check.
   - Customer Katha list with current balance, credit purchases, payments received, and last activity date.
   - Detailed ledger statement with Debit (Credit Purchase), Credit (Payment Received), and Running Balance.

8. **Customer Billing / POS Counter**
   - Fast billing screen: Customer selection, Weight (kg), Price/kg, Total Bill Amount.
   - **Pay Now**: Immediate settlement (Cash, UPI, Card). Generates Bill slip. Does not increase debt.
   - **Pay Later**: Adds purchase to customer's Katha debt and marks bill as Unpaid.
   - **Partial**: Split payment between immediate cash and debt.
   - Unique bill numbers: `BILL-YYYYMMDD-XXXX`.

9. **Operating Expenses Module**
   - Daily expense logging by category: Shop Rent, Electricity, Water, Transport, Labour, Packaging, Cleaning, Repairs, Maintenance, Miscellaneous, or Custom.
   - Monthly expense analysis emphasizing category breakdowns, payment method distributions, and monthly comparisons.

10. **Reports & Analytics Center**
    - Daily operations summary report.
    - Monthly P&L statement.
    - Export to **Excel (.xlsx)** via ExcelJS.
    - Export to **CSV**.
    - Printable PDF/statement view.

11. **Immutable Server-Side Audit Log**
    - Permanent database storage of all sensitive actions.
    - Tracks user, timestamp, module, record ID, previous values, new values, and mandatory reasons.
    - Cannot be modified or deleted via API.

12. **Role-Based Access Control (RBAC)**
    - **Owner / Administrator**: Full access, financial deletions, reopening submitted closings, user management, audit logs.
    - **Shop Manager**: Daily business closing wizard, stock receipts, customer bills, expenses.
    - **Counter Staff**: Fast retail sales and customer bills. Restricted from deletions or closed record modifications.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts.
- **Backend**: Node.js, Express, TypeScript (`tsx`), node-postgres (`pg`), Decimal.js, Bcrypt, JWT, ExcelJS, Multer.
- **Database**: PostgreSQL 18 relational database with numeric decimal precision (`NUMERIC(12, 2)` for currency, `NUMERIC(10, 3)` for weights).
- **Localization**: Indian Rupees (₹), Indian Date Format (`DD-MM-YYYY`), Indian Numbering Formatting.

---

## 🧪 Acceptance Test Suite (All 10 Scenarios Verified)

Run `npm test` inside `backend/` or double-click `run_tests.bat`.

```
====================================================
🍗 RUNNING CHICKEN SHOP SYSTEM ACCEPTANCE TESTS (1-10)
====================================================

--- TEST 1: Distributor Purchase Calculation ---
✅ [PASS] Test 1: 150 kg @ ₹180/kg equals exactly ₹27,000

--- TEST 2: Counter Collection Calculation ---
✅ [PASS] Test 2: Cash ₹8k + UPI ₹12k + Card ₹1k + Other ₹500 = ₹21,500

--- TEST 3: Chicken Stock & Sales Calculation ---
✅ [PASS] Test 3a: Total Available Stock = 150 kg
✅ [PASS] Test 3b: Quantity Sold = 120 kg
✅ [PASS] Test 3c: Chicken Sales Revenue = 120 kg * ₹250/kg = ₹30,000

--- TEST 4: Distributor Payments & Running Balance ---
✅ [PASS] Test 4: ₹10,000 supply - (₹5k + ₹2k + ₹3k) = ₹0 outstanding

--- TEST 5: Customer Katha Balance Tracking ---
✅ [PASS] Test 5: Opening ₹1,000 + Purchase ₹500 - Payment ₹700 = ₹800 outstanding

--- TEST 6: Operating Expenses October Total ---
✅ [PASS] Test 6: October expenses ₹5,000 + ₹2,000 + ₹1,000 = ₹8,000

--- TEST 7: Duplicate Prevention in Stock & Distributor Records ---
✅ [PASS] Test 7: Delivery recorded exactly once in supplies and once in inventory (no duplicates)

--- TEST 8: Daily Closing Submission & Reopen Audit ---
✅ [PASS] Test 8: Daily closing successfully reopened and recorded in audit log with reason

--- TEST 9: Customer Payment Reduction & Collections ---
✅ [PASS] Test 9: ₹1,500 balance reduced by ₹500 payment = ₹1,000 outstanding

--- TEST 10: Audit Log on Bill Edit ---
✅ [PASS] Test 10: Bill modification accurately logged in audit trail with previous/new values & reason

====================================================
TEST RESULTS: 12 PASSED, 0 FAILED
====================================================
```

---

## 🔑 Default Login Credentials

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Owner / Administrator** | `owner` | `admin123` | Full administrative access, reopen closings, audit logs, user management |
| **Shop Manager** | `manager` | `manager123` | Daily business closing, stock entries, customer billing, expenses |
| **Counter Staff** | `staff` | `staff123` | Counter retail sales, bill generation |

---

## 🏃 Quick Start Guide

### 1. Launch All with Single Click
Double click:
```cmd
start_all.bat
```
This automatically verifies PostgreSQL, starts the Backend on `http://localhost:5000`, and starts the Frontend on `http://localhost:5173`.

### 2. Manual Terminal Commands

#### Start Backend:
```bash
cd backend
npm install
npm start
```

#### Start Frontend:
```bash
cd frontend
npm install
npm run dev
```

#### Run Test Suite:
```bash
cd backend
npm test
```
