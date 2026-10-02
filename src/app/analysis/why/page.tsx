import WhyView from "@/components/pages/WhyView";

export default async function Page({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  return <WhyView year={sp.year ? Number(sp.year) : undefined} month={sp.month ? Number(sp.month) : undefined} />;
}
