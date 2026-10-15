"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOnboardingStore } from "../store";

const availableInterests = [
  "Technology",
  "Design",
  "Marketing",
  "Sales",
  "Finance",
  "Healthcare",
  "Education",
  "Engineering",
  "Art",
  "Sports",
  "Music",
  "Travel",
  "Food",
  "Fashion",
  "Science",
  "Business",
];

export function InterestsStep() {
  const { data, updateInterests, nextStep } = useOnboardingStore();
  const [selectedInterests, setSelectedInterests] = useState<string[]>(data.interests);

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const onSubmit = () => {
    updateInterests(selectedInterests);
    nextStep();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Select Your Interests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Choose the areas that interest you most. You can select multiple.
          </p>
          <div className="flex flex-wrap gap-2">
            {availableInterests.map(interest => (
              <Badge
                key={interest}
                variant={selectedInterests.includes(interest) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleInterest(interest)}
              >
                {interest}
              </Badge>
            ))}
          </div>
          <Button onClick={onSubmit} disabled={selectedInterests.length === 0}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}