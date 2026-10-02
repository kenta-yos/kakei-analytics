import BudgetEditor from "@/components/pages/BudgetEditor";

export default async function Page({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year ?? now.getFullYear());
  const month = Number(sp.month ?? now.getMonth() + 1);
  return <BudgetEditor key={`${year}-${month}`} year={year} month={month} />;
}
