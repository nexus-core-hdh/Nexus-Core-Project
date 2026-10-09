"use client";

import { HeroCard } from "./components/hero-card";
import { DailyActivityCard } from "./components/daily-activity-card";
import { BodyWeightCard } from "./components/body-weight-card";
import { HeartRateCard } from "./components/heart-rate-card";
import { DistanceCard } from "./components/distance-card";
import { SleepCard } from "./components/sleep-card";
import { ActiveCard } from "./components/active-card";
import { TrackingCard } from "./components/tracking-card";
import { WorkoutsCard } from "./components/workouts-card";
import { NutritionCard } from "./components/nutrition-card";
import { FriendsCard } from "./components/friends-card";

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-4">
        <HeroCard />
        <HeartRateCard />
        <div className="grid gap-4 2xl:grid-cols-2">
          <SleepCard />
          <ActiveCard />
        </div>
        <TrackingCard />
      </div>

      <div className="space-y-4">
        <DailyActivityCard />
        <WorkoutsCard />
      </div>

      <div className="space-y-4">
        <BodyWeightCard />
        <DistanceCard />
        <NutritionCard />
        <FriendsCard />
      </div>
    </div>
  );
}
