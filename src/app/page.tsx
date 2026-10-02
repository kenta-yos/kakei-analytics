import HomeView from "@/components/pages/HomeView";

export default async function Page({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  return <HomeView year={sp.year ? Number(sp.year) : undefined} month={sp.month ? Number(sp.month) : undefined} />;
}
