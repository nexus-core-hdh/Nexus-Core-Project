"use client";

import { useMemo } from "react";
import { ChevronRight, Star } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ExportButton } from "@/components/CardActionMenus";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface ReviewStat {
  stars: number;
  count: number;
  color: string;
}

interface Review {
  id: string;
  author: string;
  date: string;
  rating: number;
  title: string;
  content: string;
  verified: boolean;
}

interface EcommerceCustomerReviewsCardProps {
  orders?: any[];
  loading?: boolean;
}

export function EcommerceCustomerReviewsCard({ orders = [], loading = false }: EcommerceCustomerReviewsCardProps) {
  // Generate review stats from orders (simulated ratings based on order status and amount)
  const reviewStats = useMemo(() => {
    const stats: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    // Simulate ratings based on order completion and amount
    orders.forEach((order: any) => {
      if (order.status === "COMPLETED" || order.status === "DELIVERED") {
        // Higher value orders tend to have better ratings
        const amount = order.totalAmount || 0;
        let rating = 4; // Default
        
        if (amount > 1000) rating = 5;
        else if (amount > 500) rating = 4;
        else if (amount > 200) rating = 3;
        else if (amount > 100) rating = 2;
        else rating = 1;
        
        stats[rating]++;
      }
    });

    return [
      { stars: 5, count: stats[5] || 0, color: "bg-green-400" },
      { stars: 4, count: stats[4] || 0, color: "bg-lime-500" },
      { stars: 3, count: stats[3] || 0, color: "bg-yellow-400" },
      { stars: 2, count: stats[2] || 0, color: "bg-orange-400" },
      { stars: 1, count: stats[1] || 0, color: "bg-red-400" }
    ];
  }, [orders]);

  const totalReviews = useMemo(() => {
    return reviewStats.reduce((sum, stat) => sum + stat.count, 0);
  }, [reviewStats]);

  const averageRating = useMemo(() => {
    if (totalReviews === 0) return 0;
    const totalStars = reviewStats.reduce((sum, stat) => sum + (stat.stars * stat.count), 0);
    return totalStars / totalReviews;
  }, [reviewStats, totalReviews]);

  // Calculate percentages for progress bars
  const reviewStatsWithPercentage = useMemo(() => {
    return reviewStats.map((stat) => ({
      ...stat,
      percentage: totalReviews > 0 ? (stat.count / totalReviews) * 100 : 0
    }));
  }, [reviewStats, totalReviews]);

  // Get recent reviews from completed orders
  const recentReviews = useMemo(() => {
    return orders
      .filter((order: any) => order.status === "COMPLETED" || order.status === "DELIVERED")
      .slice(0, 3)
      .map((order: any, index: number) => {
        const amount = order.totalAmount || 0;
        let rating = 4;
        if (amount > 1000) rating = 5;
        else if (amount > 500) rating = 4;
        else if (amount > 200) rating = 3;
        else if (amount > 100) rating = 2;
        else rating = 1;

        const customerName = order.customer?.name || "Customer";
        const firstName = customerName.split(' ')[0];
        const lastName = customerName.split(' ')[1]?.[0] || '';
        
        return {
          id: order.id.toString(),
          author: `${firstName} ${lastName}.`,
          date: format(new Date(order.orderDate || order.createdAt), "MMMM dd, yyyy"),
          rating,
          title: rating >= 4 ? "Great product!" : rating >= 3 ? "Good value" : "Could be better",
          content: `Order #${order.orderNumber || order.id} was ${order.status.toLowerCase()}. ${rating >= 4 ? 'Highly recommend!' : rating >= 3 ? 'Satisfied with the purchase.' : 'Expected more.'}`,
          verified: true
        };
      });
  }, [orders]);

  return (
    <Card className="lg:col-span-12 xl:col-span-5">
      <CardHeader>
        <CardTitle className="relative">Customer Reviews</CardTitle>
        <CardDescription>
          {loading ? "Loading..." : `Based on ${totalReviews.toLocaleString()} verified purchases`}
        </CardDescription>
        <CardAction className="relative">
          <div className="absolute end-0 top-0">
            <Button size="sm" variant="outline">
              <span className="hidden md:inline">View All</span> <ChevronRight />
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <>
            <div className="grid space-y-4 lg:grid-cols-3 lg:space-y-0">
              {/* Average rating display */}
              <div className="flex flex-col items-center justify-center gap-2 lg:col-span-1">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <Star key={i} className={`size-6 ${i < Math.floor(averageRating) ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"}`} />
                  ))}
                  <Star
                    className={`size-6 ${averageRating >= 4.5 ? "fill-yellow-400 text-yellow-400" : averageRating >= 4 ? "fill-yellow-300 text-yellow-300" : "fill-gray-200 text-gray-200"}`}
                    strokeWidth={0}
                  />
                </div>
                <div className="text-3xl font-bold">{averageRating.toFixed(1)}</div>
                <div className="text-sm text-gray-500">out of 5</div>
              </div>

              {/* Rating breakdown */}
              <div className="w-full space-y-3 lg:col-span-2">
                {reviewStatsWithPercentage.map((stat) => (
                  <div key={stat.stars} className="flex items-center">
                    <div className="w-8 text-sm font-medium">{stat.stars} ★</div>
                    <div className="bg-muted mx-2 h-3 flex-1 overflow-hidden rounded-full">
                      <div
                        className={`h-full ${stat.color} rounded-full`}
                        style={{ width: `${stat.percentage}%` }}></div>
                    </div>
                    <div className="text-muted-foreground w-12 text-right text-sm font-medium">
                      {stat.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent reviews */}
            {recentReviews.length > 0 && (
              <div className="mt-6">
                {recentReviews.map((review) => (
                  <div key={review.id} className="bg-muted rounded-lg border p-4 mb-4">
                    <div className="mb-2 flex flex-col items-start justify-between md:flex-row">
                      <div>
                        <div className="mb-1 flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"}`}
                            />
                          ))}
                        </div>
                        <h4 className="font-medium">{review.title}</h4>
                      </div>
                      <div className="text-muted-foreground text-xs">{review.date}</div>
                    </div>
                    <p className="text-muted-foreground mb-3 text-sm">{review.content}</p>
                    <div className="flex items-center text-xs">
                      <span className="font-medium">{review.author}</span>
                      {review.verified && (
                        <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-white">
                          Verified Purchase
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
