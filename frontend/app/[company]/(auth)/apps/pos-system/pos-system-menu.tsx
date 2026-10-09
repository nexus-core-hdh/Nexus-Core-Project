"use client";

import React, { useEffect, useState } from "react";
import Link from "@/components/app-link";
import { Search, FileEdit, SearchIcon, Maximize2, Minimize2 } from "lucide-react";

import {
  Product,
  ProductCategory,
  Table,
  TableCategory
} from "@/app/[company]/(auth)/apps/pos-system/store";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import ProductListItem from "@/app/[company]/(auth)/apps/pos-system/components/product-list-item";
import AddProductDialog from "@/app/[company]/(auth)/apps/pos-system/components/add-product-dialog";
import ProductCategoryListItem from "@/app/[company]/(auth)/apps/pos-system/components/product-category-list-item";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import POStSystemCart from "@/app/[company]/(auth)/apps/pos-system/components/cart";
import AssignOrderToTable from "@/app/[company]/(auth)/apps/pos-system/components/assign-order-to-table";
import POStSystemCartSheet from "@/app/[company]/(auth)/apps/pos-system/components/cart-sheet";
import PaymentDialog from "@/app/[company]/(auth)/apps/pos-system/components/payment-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/app/[company]/(auth)/apps/pos-system/store";

type PosSystemMenu = {
  productCategories: ProductCategory[];
  products: Product[];
  tableCategories: TableCategory[];
  tables: Table[];
  showTableSelection?: boolean;
  onRefresh?: () => void;
};

export default function PosSystemMenu({
  productCategories,
  products,
  tableCategories,
  tables,
  showTableSelection = false,
  onRefresh
}: PosSystemMenu) {
  const { showPaymentDialog, pendingOrderForPayment, closePaymentDialog, clearCart } = useStore();
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [showAssignOrderDialog, setShowAssignOrderDialog] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Check if fullscreen is active
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          await (containerRef.current as any).mozRequestFullScreen();
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (error) {
      console.error("Error toggling fullscreen:", error);
    }
  };

  const filteredBySearchTerm = React.useMemo(() => {
    if (!searchTerm) return null;
    return products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm]);

  const filteredByCategory = React.useMemo(() => {
    if (!selectedCategory) return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const filteredProducts = filteredBySearchTerm || filteredByCategory;

  return (
    <>
      <div 
        ref={containerRef} 
        className={`grid-cols-8 gap-4 lg:grid ${isFullscreen ? 'h-screen w-screen p-4' : ''}`}
      >
        <div className={`flex flex-col gap-4 ${isFullscreen ? 'h-[calc(100vh-2rem)]' : 'group-data-[theme-content-layout=centered]/layout:h-[calc(100vh-8rem)] group-data-[theme-content-layout=full]/layout:h-[calc(100vh-6rem)]'} lg:col-span-6`}>
          {/* Header */}
          <div className="flex justify-between lg:mb-4">
            <h1 className="text-lg font-bold tracking-tight">Pos System</h1>
            <div className="flex gap-2">
              <AddProductDialog categories={productCategories} onSuccess={onRefresh} />
              <Button variant="outline" asChild>
                <Link href="/apps/pos-system/tables">
                  <FileEdit />
                  <span className="hidden sm:inline">Tables</span>
                </Link>
              </Button>
              <Button variant="outline" size="icon" onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="flex lg:hidden">
                    <SearchIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <div className="relative flex-1">
                    <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                    <Input
                      placeholder="Search menu..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </PopoverContent>
              </Popover>
              <div className="hidden gap-2 lg:flex">
                <div className="relative flex-1">
                  <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                  <Input
                    placeholder="Search menu..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Header */}

          {/* Categories */}
          <ScrollArea className="w-full whitespace-nowrap">
            <RadioGroup
              className="flex gap-4"
              defaultValue="all"
              onValueChange={(value) => {
                setSelectedCategory(value === "all" ? null : value);
                setSearchTerm("");
              }}>
              <ProductCategoryListItem
                category={{
                  id: "all",
                  name: "All",
                  icon: "🍱"
                }}
              />
              {productCategories.map((category) => (
                <ProductCategoryListItem key={category.id} category={category} />
              ))}
            </RadioGroup>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          {/* Categories */}

          {/* Products */}
          <div className="flex-1 space-y-20 overflow-auto">
            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredProducts.map((product) => (
                  <ProductListItem product={product} key={product.id} />
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <div className="text-muted-foreground">There are no products here.</div>
                <AddProductDialog categories={productCategories} onSuccess={onRefresh} />
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <POStSystemCart 
          setShowAssignOrderDialogAction={setShowAssignOrderDialog}
          showTableSelection={showTableSelection}
        />
        <POStSystemCartSheet 
          setShowAssignOrderDialogAction={setShowAssignOrderDialog}
          showTableSelection={showTableSelection}
        />
      </div>

      <AssignOrderToTable
        open={showAssignOrderDialog}
        setOpen={setShowAssignOrderDialog}
        tableCategories={tableCategories}
        tables={tables}
      />

      {pendingOrderForPayment && (
        <PaymentDialog
          open={showPaymentDialog}
          onOpenChange={(open) => {
            if (!open) {
              closePaymentDialog();
            }
          }}
          cartItems={pendingOrderForPayment.cartItems}
          customerId={pendingOrderForPayment.customerId}
          totalAmount={pendingOrderForPayment.totalAmount}
          orderId={pendingOrderForPayment.orderId}
          onPaymentComplete={() => {
            clearCart(); // Clear cart after successful payment
            closePaymentDialog();
            if (onRefresh) {
              onRefresh();
            }
          }}
        />
      )}
    </>
  );
}
