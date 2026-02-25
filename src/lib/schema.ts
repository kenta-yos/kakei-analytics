import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  date,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";


// ─────────────────────────────────────────────────────────────────────────────
// 取引テーブル（収支合算CSVから取り込む全取引）
// ─────────────────────────────────────────────────────────────────────────────
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    type: varchar("type", { length: 10 }).notNull(), // '支出' | '収入' | '振替'
    category: varchar("category", { length: 100 }).notNull(),
    itemName: varchar("item_name", { length: 200 }),
    amount: integer("amount").notNull().default(0),
    expenseAmount: integer("expense_amount").notNull().default(0),
    incomeAmount: integer("income_amount").notNull().default(0),
    assetName: varchar("asset_name", { length: 100 }),
    tag: varchar("tag", { length: 100 }),
    memo: text("memo"),
    excludeFromPl: boolean("exclude_from_pl").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    yearMonthIdx: index("tx_year_month_idx").on(t.year, t.month),
    categoryIdx: index("tx_category_idx").on(t.category),
    typeIdx: index("tx_type_idx").on(t.type),
    dateIdx: index("tx_date_idx").on(t.date),
    assetIdx: index("tx_asset_idx").on(t.assetName),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 資産月次スナップショット（資産別レポートCSVから取り込む月末残高）
// ─────────────────────────────────────────────────────────────────────────────
export const assetSnapshots = pgTable(
  "asset_snapshots",
  {
    id: serial("id").primaryKey(),
    assetName: varchar("asset_name", { length: 100 }).notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    openingBalance: integer("opening_balance").notNull().default(0), // 月初残高
    closingBalance: integer("closing_balance").notNull().default(0), // 月末残高
    // 資産種別（柔軟に追加できるよう文字列で管理）
    assetType: varchar("asset_type", { length: 30 }).notNull().default("other"),
    // bank | credit | investment | ic_card | qr_pay | cash | other
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique("asset_snapshots_uniq").on(t.assetName, t.year, t.month),
    yearMonthIdx: index("as_year_month_idx").on(t.year, t.month),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 予算設定テーブル（月ごと × カテゴリごとの予算）
// ─────────────────────────────────────────────────────────────────────────────
export const budgets = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    categoryName: varchar("category_name", { length: 100 }).notNull(),
    allocation: integer("allocation").notNull().default(0), // 今月の新規割り当て
    carryover: integer("carryover").notNull().default(0),   // 前月繰越（±）
    totalBudget: integer("total_budget").notNull().default(0), // allocation + carryover
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique("budgets_uniq").on(t.year, t.month, t.categoryName),
    yearMonthIdx: index("budgets_year_month_idx").on(t.year, t.month),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 月次収入割り当てテーブル（前月収入を今月予算に割り振るときの管理）
// ─────────────────────────────────────────────────────────────────────────────
export const monthlyIncomeAllocations = pgTable(
  "monthly_income_allocations",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    totalIncome: integer("total_income").notNull().default(0), // その月の実収入合計
    totalAllocated: integer("total_allocated").notNull().default(0), // 予算に割り当てた合計
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique("mia_uniq").on(t.year, t.month),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Gemini API 日次利用カウンター
// ─────────────────────────────────────────────────────────────────────────────
export const geminiUsage = pgTable(
  "gemini_usage",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(), // YYYY-MM-DD
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique("gemini_usage_date_uniq").on(t.date),
  })
);

export type GeminiUsage = typeof geminiUsage.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// 標準予算テーブル（カテゴリ別デフォルト予算）
// ─────────────────────────────────────────────────────────────────────────────
export const standardBudgets = pgTable("standard_budgets", {
  id: serial("id").primaryKey(),
  categoryName: text("category_name").notNull().unique(),
  allocation: integer("allocation").notNull().default(0),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 標準予算設定テーブル（基準収入を保存）
// ─────────────────────────────────────────────────────────────────────────────
export const standardBudgetSettings = pgTable("standard_budget_settings", {
  id: integer("id").primaryKey().default(1),
  referenceIncome: integer("reference_income").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 特別経費B予測テーブル（月別の予測アイテム）
// ─────────────────────────────────────────────────────────────────────────────
export const specialExpensesB = pgTable("special_expenses_b", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  itemName: text("item_name").notNull(),
  plannedAmount: integer("planned_amount").notNull().default(0),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [index("special_expenses_b_year_month_idx").on(t.year, t.month)]);

// ─────────────────────────────────────────────────────────────────────────────
// 投資評価額テーブル（月次・商品別）
// ─────────────────────────────────────────────────────────────────────────────
export const investmentValuations = pgTable("investment_valuations", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  productName: text("product_name").notNull(), // 'iDeCo' | 'SBI投資信託'
  marketValue: integer("market_value").notNull().default(0), // 評価額
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  unique("inv_val_uniq").on(t.year, t.month, t.productName),
  index("inv_val_year_month_idx").on(t.year, t.month),
]);

// ─────────────────────────────────────────────────────────────────────────────
// FIRE計算設定テーブル（シミュレーション変数）
// ─────────────────────────────────────────────────────────────────────────────
export const fireSettings = pgTable("fire_settings", {
  id: integer("id").primaryKey().default(1),
  currentAge: integer("current_age").notNull().default(30),
  // リターン率・インフレ率は basis points × 10 で保存 (500 = 5.00%)
  expectedReturnRate: integer("expected_return_rate").notNull().default(500),
  inflationRate: integer("inflation_rate").notNull().default(200),
  fireMultiplier: integer("fire_multiplier").notNull().default(25),
  monthlyExpenseOverride: integer("monthly_expense_override"), // null = 自動
  monthlySavingsOverride: integer("monthly_savings_override"), // null = 自動
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InvestmentValuation = typeof investmentValuations.$inferSelect;
export type NewInvestmentValuation = typeof investmentValuations.$inferInsert;
export type FireSettings = typeof fireSettings.$inferSelect;

export type StandardBudget = typeof standardBudgets.$inferSelect;
export type NewStandardBudget = typeof standardBudgets.$inferInsert;
export type StandardBudgetSettings = typeof standardBudgetSettings.$inferSelect;
export type SpecialExpenseB = typeof specialExpensesB.$inferSelect;
export type NewSpecialExpenseB = typeof specialExpensesB.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// 型エクスポート
// ─────────────────────────────────────────────────────────────────────────────
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type AssetSnapshot = typeof assetSnapshots.$inferSelect;
export type NewAssetSnapshot = typeof assetSnapshots.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type MonthlyIncomeAllocation = typeof monthlyIncomeAllocations.$inferSelect;
