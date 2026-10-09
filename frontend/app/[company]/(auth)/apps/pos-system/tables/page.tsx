import { generateMeta } from "@/lib/utils";
import PosSystemTableRender from "@/app/[company]/(auth)/apps/pos-system/tables/tables-render";

export async function generateMetadata() {
  return generateMeta({
    title: "POS System App",
    description:
      "Product and order management application template for restaurants or online businesses. Built with shadcn/ui, Next.js and Tailwind CSS.",
    canonical: "/apps/ai-chat"
  });
}

async function getTableCategories() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  
  try {
    const response = await fetch(`${API_BASE_URL}/tables/categories`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch table categories:', response.statusText);
      return [];
    }

    const categories = await response.json();
    
    // Transform to match expected format
    return categories.map((cat: any) => ({
      id: cat.id.toString(),
      name: cat.name
    }));
  } catch (error) {
    console.error('Error fetching table categories:', error);
    return [];
  }
}

async function getTables() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  
  try {
    const response = await fetch(`${API_BASE_URL}/tables`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch tables:', response.statusText);
      return [];
    }

    const tables = await response.json();
    
    // Transform to match expected format
    return tables.map((table: any) => ({
      id: table.id.toString(),
      name: table.name,
      category: table.categoryId.toString(),
      status: table.status
    }));
  } catch (error) {
    console.error('Error fetching tables:', error);
    return [];
  }
}

export default async function Page() {
  const tableCategories = await getTableCategories();
  const tables = await getTables();

  return <PosSystemTableRender tableCategories={tableCategories} tables={tables} />;
}
