-- Database schema for Chicken Shop Management System

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff')),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  opening_balance NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributor_supplies (
  id SERIAL PRIMARY KEY,
  distributor_id INTEGER NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  supply_date DATE NOT NULL,
  weight_kg NUMERIC(10, 3) NOT NULL CHECK (weight_kg > 0),
  price_per_kg NUMERIC(12, 2) NOT NULL CHECK (price_per_kg >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  invoice_number VARCHAR(100),
  notes TEXT,
  daily_closing_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributor_payments (
  id SERIAL PRIMARY KEY,
  distributor_id INTEGER NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Other')),
  transaction_reference VARCHAR(100),
  screenshot_url TEXT,
  notes TEXT,
  is_advance BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  opening_balance NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  account_status VARCHAR(20) DEFAULT 'Active' CHECK (account_status IN ('Active', 'Suspended', 'Inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_bills (
  id SERIAL PRIMARY KEY,
  bill_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  bill_date DATE NOT NULL,
  weight_kg NUMERIC(10, 3) NOT NULL CHECK (weight_kg > 0),
  price_per_kg NUMERIC(12, 2) NOT NULL CHECK (price_per_kg >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('Pay Now', 'Pay Later', 'Partial')),
  paid_amount NUMERIC(12, 2) DEFAULT 0 CHECK (paid_amount >= 0),
  payment_method VARCHAR(30) CHECK (payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Other')),
  payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('Paid', 'Unpaid', 'Partially Paid')),
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_payments (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Other')),
  transaction_reference VARCHAR(100),
  screenshot_url TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chicken_sales (
  id SERIAL PRIMARY KEY,
  sale_date DATE NOT NULL,
  weight_sold_kg NUMERIC(10, 3) NOT NULL CHECK (weight_sold_kg > 0),
  price_per_kg NUMERIC(12, 2) NOT NULL CHECK (price_per_kg >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'Card', 'Other', 'Katha')),
  notes TEXT,
  customer_bill_id INTEGER REFERENCES customer_bills(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_closings (
  id SERIAL PRIMARY KEY,
  business_date DATE UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Completed', 'Reopened')),
  opening_stock_kg NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (opening_stock_kg >= 0),
  opening_stock_rate_per_kg NUMERIC(12, 2) DEFAULT 0 CHECK (opening_stock_rate_per_kg >= 0),
  opening_stock_amount NUMERIC(12, 2) DEFAULT 0 CHECK (opening_stock_amount >= 0),
  new_stock_kg NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (new_stock_kg >= 0),
  total_available_stock_kg NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (total_available_stock_kg >= 0),
  total_available_stock_cost NUMERIC(12, 2) DEFAULT 0 CHECK (total_available_stock_cost >= 0),
  closing_stock_kg NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (closing_stock_kg >= 0),
  closing_stock_rate_per_kg NUMERIC(12, 2) DEFAULT 0 CHECK (closing_stock_rate_per_kg >= 0),
  closing_stock_amount NUMERIC(12, 2) DEFAULT 0 CHECK (closing_stock_amount >= 0),
  quantity_sold_kg NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (quantity_sold_kg >= 0),
  selling_price_per_kg NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (selling_price_per_kg >= 0),
  chicken_sales_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (chicken_sales_revenue >= 0),
  distributor_purchase_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (distributor_purchase_cost >= 0),
  cost_of_chicken_sold NUMERIC(12, 2) NOT NULL DEFAULT 0,
  egg_opening_stock NUMERIC(10, 2) DEFAULT 0,
  egg_opening_stock_rate NUMERIC(12, 2) DEFAULT 0,
  egg_opening_stock_amount NUMERIC(12, 2) DEFAULT 0,
  egg_new_stock NUMERIC(10, 2) DEFAULT 0,
  egg_purchase_rate NUMERIC(12, 2) DEFAULT 0,
  egg_purchase_cost NUMERIC(12, 2) DEFAULT 0,
  egg_total_available_stock NUMERIC(10, 2) DEFAULT 0,
  egg_total_available_cost NUMERIC(12, 2) DEFAULT 0,
  egg_closing_stock NUMERIC(10, 2) DEFAULT 0,
  egg_closing_stock_rate NUMERIC(12, 2) DEFAULT 0,
  egg_closing_stock_amount NUMERIC(12, 2) DEFAULT 0,
  egg_quantity_sold NUMERIC(10, 2) DEFAULT 0,
  egg_sales_revenue NUMERIC(12, 2) DEFAULT 0,
  total_sales_revenue NUMERIC(12, 2) DEFAULT 0,
  estimated_gross_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  operating_expenses_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adjustments_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estimated_net_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_collection NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cash_collection >= 0),
  upi_collection NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (upi_collection >= 0),
  card_collection NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (card_collection >= 0),
  other_collection NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (other_collection >= 0),
  total_counter_collection NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_counter_collection >= 0),
  counter_collection_difference NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock_transferred_kg NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (stock_transferred_kg >= 0),
  stock_available_for_sale_kg NUMERIC(10, 3) NOT NULL DEFAULT 0,
  is_cogs_estimated BOOLEAN DEFAULT FALSE,
  notes TEXT,
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_closing_purchases (
  id SERIAL PRIMARY KEY,
  daily_closing_id INTEGER NOT NULL REFERENCES daily_closings(id) ON DELETE CASCADE,
  distributor_id INTEGER REFERENCES distributors(id) ON DELETE SET NULL,
  distributor_name VARCHAR(100) NOT NULL,
  weight_kg NUMERIC(10, 3) NOT NULL CHECK (weight_kg > 0),
  price_per_kg NUMERIC(12, 2) NOT NULL CHECK (price_per_kg >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  distributor_supply_id INTEGER REFERENCES distributor_supplies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS financial_adjustments (
  id SERIAL PRIMARY KEY,
  business_date DATE NOT NULL,
  adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN ('Additional Income', 'Expense', 'Stock Adjustment', 'Other')),
  amount NUMERIC(12, 2) NOT NULL,
  reason TEXT NOT NULL,
  daily_closing_id INTEGER REFERENCES daily_closings(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS operating_expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Other')),
  receipt_url TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  txn_date DATE NOT NULL,
  txn_type VARCHAR(30) NOT NULL CHECK (txn_type IN ('opening', 'supply_in', 'sales_out', 'adjustment', 'closing', 'transfer_out', 'transfer_in')),
  weight_kg NUMERIC(10, 3) NOT NULL,
  cost_per_kg NUMERIC(12, 2),
  reference_module VARCHAR(50),
  reference_id INTEGER,
  reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  transfer_date DATE NOT NULL,
  source_shop VARCHAR(100) NOT NULL DEFAULT 'Reddy Chicken and Mutton Center',
  destination_shop VARCHAR(100) NOT NULL,
  weight_kg NUMERIC(10, 3) NOT NULL CHECK (weight_kg > 0),
  cost_per_kg NUMERIC(12, 2) DEFAULT 0 CHECK (cost_per_kg >= 0),
  total_cost NUMERIC(12, 2) DEFAULT 0 CHECK (total_cost >= 0),
  daily_closing_id INTEGER REFERENCES daily_closings(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_name VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  record_type VARCHAR(50) NOT NULL,
  record_id VARCHAR(50) NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_settings (
  id SERIAL PRIMARY KEY,
  shop_name VARCHAR(100) NOT NULL DEFAULT 'Star Fresh Chicken & Meat Center',
  address TEXT NOT NULL DEFAULT 'Shop #4, Market Yard Road, Hyderabad, Telangana',
  phone VARCHAR(20) NOT NULL DEFAULT '+91 98765 43210',
  currency VARCHAR(10) NOT NULL DEFAULT '₹',
  date_format VARCHAR(20) NOT NULL DEFAULT 'DD-MM-YYYY',
  allow_negative_stock BOOLEAN DEFAULT FALSE,
  warn_duplicate_customer BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_distributor_supplies_date ON distributor_supplies(supply_date);
CREATE INDEX IF NOT EXISTS idx_distributor_payments_date ON distributor_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_customer_bills_date ON customer_bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_customer_payments_date ON customer_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_chicken_sales_date ON chicken_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(business_date);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_date ON operating_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
