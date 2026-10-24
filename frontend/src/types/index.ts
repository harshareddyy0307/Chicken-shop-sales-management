export interface User {
  id: number;
  username: string;
  fullName: string;
  role: 'owner' | 'admin' | 'manager' | 'staff';
  phone?: string;
  normalizedPhone?: string;
  isActive?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  isLocked?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Distributor {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  openingBalance: number;
  totalSuppliesAmount: number;
  totalWeightPurchased: number;
  totalPaymentsAmount: number;
  outstandingBalance: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface DistributorSupply {
  id: number;
  distributor_id: number;
  distributor_name?: string;
  supply_date: string;
  weight_kg: number;
  price_per_kg: number;
  total_amount: number;
  invoice_number?: string;
  notes?: string;
  daily_closing_id?: number;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
}

export interface DistributorPayment {
  id: number;
  distributor_id: number;
  distributor_name?: string;
  payment_date: string;
  amount: number;
  payment_method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other';
  transaction_reference?: string;
  screenshot_url?: string;
  notes?: string;
  is_advance: boolean;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  openingBalance: number;
  totalCreditPurchases: number;
  totalPaymentsReceived: number;
  outstandingBalance: number;
  lastTransactionDate?: string;
  accountStatus: 'Active' | 'Suspended' | 'Inactive';
  notes?: string;
  createdAt: string;
}

export interface BillItem {
  id?: string;
  name: 'Skinless' | 'Dressed' | 'Boneless' | 'Liver' | 'Eggs' | 'Natukodi' | 'Masala' | string;
  unit: 'kg' | 'pcs' | 'pkt';
  quantity: number;
  rate: number;
  amount: number;
}

export interface CustomerBill {
  id: number;
  bill_number: string;
  customer_id?: number;
  customer_name?: string;
  customer_phone?: string;
  bill_date: string;
  weight_kg: number;
  price_per_kg: number;
  total_amount: number;
  payment_type: 'Pay Now' | 'Pay Later' | 'Partial';
  paid_amount: number;
  payment_method?: string;
  payment_status: 'Paid' | 'Unpaid' | 'Partially Paid';
  description?: string;
  items?: BillItem[];
  created_by_name?: string;
  created_at: string;
}

export interface CustomerPayment {
  id: number;
  customer_id: number;
  customer_name?: string;
  payment_date: string;
  amount: number;
  payment_method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other';
  transaction_reference?: string;
  screenshot_url?: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
}

export interface ChickenSale {
  id: number;
  sale_date: string;
  weight_sold_kg: number;
  price_per_kg: number;
  total_amount: number;
  payment_method: 'Cash' | 'UPI' | 'Card' | 'Other' | 'Katha';
  notes?: string;
  customer_bill_id?: number;
  bill_number?: string;
  created_by_name?: string;
  created_at: string;
}

export interface DailyClosing {
  id: number;
  business_date: string;
  status: 'Draft' | 'Completed' | 'Reopened';
  opening_stock_kg: number;
  new_stock_kg: number;
  total_available_stock_kg: number;
  closing_stock_kg: number;
  quantity_sold_kg: number;
  selling_price_per_kg: number;
  chicken_sales_revenue: number;
  distributor_purchase_cost: number;
  cost_of_chicken_sold: number;
  egg_opening_stock?: number;
  egg_opening_stock_rate?: number;
  egg_opening_stock_amount?: number;
  egg_new_stock?: number;
  egg_purchase_rate?: number;
  egg_purchase_cost?: number;
  egg_total_available_stock?: number;
  egg_total_available_cost?: number;
  egg_closing_stock?: number;
  egg_closing_stock_rate?: number;
  egg_closing_stock_amount?: number;
  egg_quantity_sold?: number;
  egg_sales_revenue?: number;
  total_sales_revenue?: number;
  estimated_gross_profit: number;
  operating_expenses_amount: number;
  adjustments_amount: number;
  estimated_net_profit: number;
  cash_collection: number;
  upi_collection: number;
  card_collection: number;
  other_collection: number;
  total_counter_collection: number;
  counter_collection_difference: number;
  is_cogs_estimated: boolean;
  notes?: string;
  submitted_at?: string;
  submitted_by_name?: string;
}

export interface OperatingExpense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other';
  receipt_url?: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  user_name: string;
  action: string;
  module: string;
  record_type: string;
  record_id: string;
  previous_values?: any;
  new_values?: any;
  reason?: string;
  ip_address?: string;
  created_at: string;
}

export interface DashboardData {
  date: string;
  startDate?: string;
  endDate?: string;
  period?: string;
  isClosingCompleted: boolean;
  closingId?: number | null;
  statusBadgeText?: string;
  cards: {
    todayCounterCollection: number;
    todayChickenPurchaseCost: number;
    todayChickenSalesRevenue: number;
    todayEggSalesRevenue?: number;
    todayEstimatedGrossProfit: number;
    todayEstimatedNetProfit: number;
    todayChickenStockSoldKg: number;
    todayNewDistributorSupplyKg: number;
    totalOutstandingDistributorPayments: number;
    totalCustomerKathaOutstanding: number;
    todayOperatingExpenses: number;
  };
  stockOverview: {
    openingStockKg: number;
    newStockKg: number;
    soldKg: number;
    closingStockKg: number;
  };
  sevenDaysTrend: {
    date: string;
    salesRevenue: number;
    counterCollection: number;
    netProfit: number;
    weightSoldKg: number;
  }[];
  monthlyTrend: {
    month: number;
    salesRevenue: number;
    counterCollection: number;
    netProfit: number;
    expenses: number;
  }[];
  recentTransactions: any[];
  recentExpenses: any[];
  alerts: {
    type: 'warning' | 'info' | 'danger';
    title: string;
    message: string;
  }[];
}
