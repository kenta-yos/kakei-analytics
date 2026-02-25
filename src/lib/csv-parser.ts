/**
 * CSV パーサー
 * 対応フォーマット:
 *  - 収支合算レポート.csv  → parseCombinedReport()
 *  - 資産別レポート.csv    → parseAssetReport()
 *
 * 収支合算レポートを主データソースとして使用する。
 * カテゴリ別レポートは収支合算に包含されているため取り込みは不要。
 */

export type ParsedTransaction = {
  date: string;          // YYYY-MM-DD
  year: number;
  month: number;
  type: string;          // '支出' | '収入' | '振替'
  category: string;
  itemName: string;
  amount: number;
  expenseAmount: number;
  incomeAmount: number;
  assetName: string;
  tag: string;
  memo: string;
  excludeFromPl: boolean;
};

export type ParsedAssetEntry = {
  assetName: string;
  date: string;          // YYYY-MM-DD (取引日) or '' for initial balance
  year: number;
  month: number;
  balance: integer;
  isInitial: boolean;
};

type integer = number;

/**
 * "2026年02月01日(日)" → "2026-02-01"
 */
function parseJapaneseDate(raw: string): string {
  const m = raw.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * 文字列 → 整数（空文字・無効値は 0）
 */
function toInt(v: string): number {
  const n = parseInt(v.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * BOM 除去 + 改行正規化してから行分割
 */
function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

/**
 * CSV 行をフィールド配列に分解（簡易実装・クォート対応）
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * 収支合算レポート.csv をパース
 * ヘッダ行: 日付,種別,カテゴリ,項目名,金額,支出,収入,資産,タグ,メモ,収支の計算から除外
 */
export function parseCombinedReport(csvText: string, fromYear = 2019): ParsedTransaction[] {
  const lines = splitLines(csvText);
  const results: ParsedTransaction[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 11) continue;

    const [rawDate, type, category, itemName, , expenseRaw, incomeRaw, asset, tag, memo, excludeRaw] = cols;

    // ヘッダ行・空日付はスキップ
    if (!rawDate.match(/^\d{4}年/)) continue;

    const dateStr = parseJapaneseDate(rawDate);
    if (!dateStr) continue;

    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(5, 7), 10);

    // 2019年未満のデータはスキップ
    if (year < fromYear) continue;

    const expenseAmount = toInt(expenseRaw);
    const incomeAmount = toInt(incomeRaw);
    const amount = expenseAmount !== 0 ? expenseAmount : incomeAmount;

    // "収支の計算から除外" は '-' が「除外しない（計算に含める）」を意味する
    // '-' 以外の値（空文字や具体的な文字列）が「除外する」
    const excludeFromPl = excludeRaw !== "-";

    results.push({
      date: dateStr,
      year,
      month,
      type: type.trim(),
      category: category.trim(),
      itemName: itemName.trim(),
      amount,
      expenseAmount,
      incomeAmount,
      assetName: asset.trim(),
      tag: tag.trim(),
      memo: memo.trim(),
      excludeFromPl,
    });
  }

  return results;
}

/**
 * 資産別レポート.csv をパース
 * 複数資産が1ファイルに連続して入っている（資産ごとにヘッダ行あり）
 * 月次スナップショット（月初・月末残高）を算出するために使用
 */
export type ParsedAssetTransaction = {
  assetName: string;
  date: string;      // YYYY-MM-DD、初期残高は ''
  year: number;
  month: number;
  type: string;      // '支出' | '収入' | '振替' | '-'（初期残高）
  category: string;
  itemName: string;
  amount: number;
  balance: number;   // その取引後の残高
  isInitial: boolean;
};

export function parseAssetReport(csvText: string, fromYear = 2019): ParsedAssetTransaction[] {
  const lines = splitLines(csvText);
  const results: ParsedAssetTransaction[] = [];
  let currentAsset = "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 6) continue;

    const col0 = cols[0].trim();
    const col1 = cols[1].trim();

    // ヘッダ行（"名前" で始まる行）
    if (col0 === "名前") continue;

    // 資産名は col0 が空でなく、かつ日付形式でない場合に資産名行と判定
    if (col0 && !col0.match(/^\d{4}年/)) {
      currentAsset = col0;
    }

    if (!currentAsset) continue;

    // 初期残高行: col1 が "-" かつ col2 が "-"
    const isInitial = col1 === "-" && cols[2] === "-";

    if (isInitial) {
      // 初期残高は date='' として記録（後で補完が必要）
      const balance = toInt(cols[6]);
      results.push({
        assetName: currentAsset,
        date: "",
        year: 0,
        month: 0,
        type: "initial",
        category: "",
        itemName: "初期残高",
        amount: 0,
        balance,
        isInitial: true,
      });
      continue;
    }

    // 通常行
    if (!col1.match(/^\d{4}年/)) continue;
    const dateStr = parseJapaneseDate(col1);
    if (!dateStr) continue;

    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(5, 7), 10);
    if (year < fromYear) continue;

    const balance = toInt(cols[6]);

    results.push({
      assetName: currentAsset,
      date: dateStr,
      year,
      month,
      type: cols[2].trim(),
      category: cols[3].trim(),
      itemName: cols[4].trim(),
      amount: toInt(cols[5]),
      balance,
      isInitial: false,
    });
  }

  return results;
}

/**
 * 資産取引リストから月次スナップショットを集計する
 * 各月の最終残高を月末残高として記録
 */
export type MonthlyAssetSnapshot = {
  assetName: string;
  year: number;
  month: number;
  closingBalance: number;
  openingBalance: number;
  assetType: string;
};

export function aggregateAssetSnapshots(
  transactions: ParsedAssetTransaction[]
): MonthlyAssetSnapshot[] {
  // 資産ごとにグループ化
  const byAsset = new Map<string, ParsedAssetTransaction[]>();
  for (const tx of transactions) {
    const list = byAsset.get(tx.assetName) ?? [];
    list.push(tx);
    byAsset.set(tx.assetName, list);
  }

  const snapshots: MonthlyAssetSnapshot[] = [];

  for (const [assetName, txList] of byAsset.entries()) {
    // 月ごとの最終残高を収集
    const monthlyLast = new Map<string, { balance: number; year: number; month: number }>();

    for (const tx of txList) {
      if (tx.isInitial || tx.year === 0) continue;
      const key = `${tx.year}-${String(tx.month).padStart(2, "0")}`;
      monthlyLast.set(key, { balance: tx.balance, year: tx.year, month: tx.month });
    }

    // 月順にソートして前月末 = 今月初として月初残高を補完
    const sortedKeys = [...monthlyLast.keys()].sort();
    let prevClosing: number | null = null;

    for (const key of sortedKeys) {
      const { balance, year, month } = monthlyLast.get(key)!;
      snapshots.push({
        assetName,
        year,
        month,
        closingBalance: balance,
        openingBalance: prevClosing ?? balance,
        assetType: inferAssetType(assetName),
      });
      prevClosing = balance;
    }
  }

  return snapshots;
}

/**
 * 資産名から種別を推定
 */
function inferAssetType(name: string): string {
  if (/カード|クレカ|NICOS/.test(name)) return "credit";
  if (/借入|ローン|未払金/.test(name)) return "credit"; // 負債性のもの
  if (/証券|iDeCo|投資信託|MMF|株|ETF/.test(name)) return "investment";
  if (/PASMO|suica|Suica|IC/.test(name)) return "ic_card";
  if (/PayPay|LINE Pay|ハチペイ|メルペイ|ペイ/.test(name)) return "qr_pay";
  if (/現金|お財布|財布|封筒|精算用/.test(name)) return "cash";
  if (/ゆうちょ|三菱|SBI|ろうきん|みずほ|りそな|大阪商工|銀行|金庫/.test(name)) return "bank";
  return "other";
}
