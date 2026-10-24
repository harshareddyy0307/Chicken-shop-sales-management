import { query } from '../src/db/connection';
import { Decimal, toDecimal, formatMoney, formatWeight } from '../src/utils/decimal';

async function testMonthlyReport() {
  console.log('Testing monthly report calculation for October 2026...');

  const year = 2026;
  const month = 10;

  // 1. Closings in month
  const closingsRes = await query(
    `SELECT * FROM daily_closings
     WHERE EXTRACT(YEAR FROM business_date) = $1 AND EXTRACT(MONTH FROM business_date) = $2
     ORDER BY business_date ASC`,
    [year, month]
  );
  console.log(`Found ${closingsRes.rows.length} daily closings for ${month}-${year}.`);

  // 2. Stock transfers in month (verifying weight_kg and total_cost columns)
  const monthTransfersRes = await query(
    `SELECT COALESCE(SUM(weight_kg), 0) AS total_transferred_kg,
            COALESCE(SUM(total_cost), 0) AS total_transfer_cost,
            COUNT(*) AS count
     FROM stock_transfers
     WHERE EXTRACT(YEAR FROM transfer_date) = $1 AND EXTRACT(MONTH FROM transfer_date) = $2
       AND LOWER(status) != 'cancelled'`,
    [year, month]
  );
  console.log(`Stock transfers query executed successfully: ${monthTransfersRes.rows[0].total_transferred_kg} kg transferred.`);

  // 3. Aggregate totals
  const agg = closingsRes.rows.reduce(
    (acc, c) => {
      acc.counterCollection = acc.counterCollection.plus(toDecimal(c.total_counter_collection));
      const chickenRev = toDecimal(c.chicken_sales_revenue);
      const eggRev = toDecimal(c.egg_sales_revenue || 0);
      const totalRev = c.total_sales_revenue ? toDecimal(c.total_sales_revenue) : chickenRev.plus(eggRev);
      acc.salesRevenue = acc.salesRevenue.plus(totalRev);
      acc.chickenSalesRevenue = acc.chickenSalesRevenue.plus(chickenRev);
      acc.eggSalesRevenue = acc.eggSalesRevenue.plus(eggRev);
      acc.weightSold = acc.weightSold.plus(toDecimal(c.quantity_sold_kg));
      acc.stockTransferred = acc.stockTransferred.plus(toDecimal(c.stock_transferred_kg || 0));
      acc.purchaseCost = acc.purchaseCost.plus(toDecimal(c.distributor_purchase_cost));
      acc.grossProfit = acc.grossProfit.plus(toDecimal(c.estimated_gross_profit));
      acc.netProfit = acc.netProfit.plus(toDecimal(c.estimated_net_profit));
      return acc;
    },
    {
      counterCollection: new Decimal(0),
      salesRevenue: new Decimal(0),
      chickenSalesRevenue: new Decimal(0),
      eggSalesRevenue: new Decimal(0),
      weightSold: new Decimal(0),
      stockTransferred: new Decimal(0),
      purchaseCost: new Decimal(0),
      grossProfit: new Decimal(0),
      netProfit: new Decimal(0),
    }
  );

  // 4. Expenses
  const expRes = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total_expenses
     FROM operating_expenses
     WHERE EXTRACT(YEAR FROM expense_date) = $1 AND EXTRACT(MONTH FROM expense_date) = $2`,
    [year, month]
  );
  const monthlyExpenses = toDecimal(expRes.rows[0].total_expenses);
  const calculatedGrossProfit = agg.netProfit.minus(monthlyExpenses);

  if (closingsRes.rows.length > 0) {
    if (agg.counterCollection.lte(0)) {
      throw new Error('Expected positive counter collection for October 2026!');
    }
    if (agg.salesRevenue.lte(0)) {
      throw new Error('Expected positive sales revenue for October 2026!');
    }
  }

  console.log('✅ Monthly report verified successfully:');
  console.log(`- Total Counter Collection: ₹${formatMoney(agg.counterCollection)}`);
  console.log(`- Total Sales Revenue: ₹${formatMoney(agg.salesRevenue)} (Chicken: ₹${formatMoney(agg.chickenSalesRevenue)}, Eggs: ₹${formatMoney(agg.eggSalesRevenue)})`);
  console.log(`- Total Chicken Sold: ${formatWeight(agg.weightSold)} kg`);
  console.log(`- Monthly Net Profit: ₹${formatMoney(agg.netProfit)}`);
  console.log(`- Operating Expenses: ₹${formatMoney(monthlyExpenses)}`);
  console.log(`- Estimated Gross Profit (Net Profit - Expenses): ₹${formatMoney(calculatedGrossProfit)}`);
}

testMonthlyReport()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
