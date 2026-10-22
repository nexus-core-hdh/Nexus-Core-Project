"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo } from "react";

type PipelineStage = {
  id: string;
  name: string;
  count: number;
  value: number;
  color: string;
};

interface SalesPipelineProps {
  deals?: any[];
  loading?: boolean;
}

export function SalesPipeline({ deals = [], loading = false }: SalesPipelineProps) {
  const pipelineData = useMemo(() => {
    const stages: Record<string, { count: number; value: number }> = {
      lead: { count: 0, value: 0 },
      qualified: { count: 0, value: 0 },
      proposal: { count: 0, value: 0 },
      negotiation: { count: 0, value: 0 },
      closed: { count: 0, value: 0 }
    };

    deals.forEach((deal: any) => {
      const dealData = deal.data || {};
      const stage = (dealData.stage || dealData.status || 'lead').toLowerCase();
      const amount = dealData.amount || dealData.value || dealData.revenue || 0;
      const value = typeof amount === 'number' ? amount : parseFloat(amount) || 0;

      if (stage.includes('lead') || stage.includes('new')) {
        stages.lead.count++;
        stages.lead.value += value;
      } else if (stage.includes('qualified') || stage.includes('qualify')) {
        stages.qualified.count++;
        stages.qualified.value += value;
      } else if (stage.includes('proposal') || stage.includes('quote')) {
        stages.proposal.count++;
        stages.proposal.value += value;
      } else if (stage.includes('negotiation') || stage.includes('negotiate')) {
        stages.negotiation.count++;
        stages.negotiation.value += value;
      } else if (stage.includes('closed') || stage.includes('won')) {
        stages.closed.count++;
        stages.closed.value += value;
      } else {
        // Default to lead if stage is unknown
        stages.lead.count++;
        stages.lead.value += value;
      }
    });

    return [
      {
        id: "lead",
        name: "Lead",
        count: stages.lead.count,
        value: stages.lead.value,
        color: "bg-[var(--chart-1)]"
      },
      {
        id: "qualified",
        name: "Qualified",
        count: stages.qualified.count,
        value: stages.qualified.value,
        color: "bg-[var(--chart-2)]"
      },
      {
        id: "proposal",
        name: "Proposal",
        count: stages.proposal.count,
        value: stages.proposal.value,
        color: "bg-[var(--chart-3)]"
      },
      {
        id: "negotiation",
        name: "Negotiation",
        count: stages.negotiation.count,
        value: stages.negotiation.value,
        color: "bg-[var(--chart-4)]"
      },
      {
        id: "closed",
        name: "Closed Won",
        count: stages.closed.count,
        value: stages.closed.value,
        color: "bg-[var(--chart-5)]"
      }
    ];
  }, [deals]);

  const totalValue = useMemo(() => pipelineData.reduce((sum, stage) => sum + stage.value, 0), [pipelineData]);
  const totalCount = useMemo(() => pipelineData.reduce((sum, stage) => sum + stage.count, 0), [pipelineData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Pipeline</CardTitle>
        <CardDescription>Current deals in your sales pipeline.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <>
            <TooltipProvider>
              <div className="mb-6 flex h-4 w-full overflow-hidden rounded-full">
                {pipelineData.map((stage) => (
                  <Tooltip key={stage.id}>
                    <TooltipTrigger asChild>
                      <div
                        className={`${stage.color} h-full`}
                        style={{ width: totalValue > 0 ? `${(stage.value / totalValue) * 100}%` : '0%' }}></div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <p className="font-medium">{stage.name}</p>
                        <p className="text-muted-foreground text-xs">{stage.count} deals</p>
                        <p className="text-muted-foreground text-xs">${stage.value.toLocaleString()}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            <div className="space-y-4">
              {pipelineData.map((stage) => (
                <div key={stage.id} className="flex items-center gap-4">
                  <div className={`h-3 w-3 rounded-full ${stage.color}`}></div>
                  <div className="flex flex-1 items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{stage.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {stage.count} deals · ${stage.value.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex w-24 items-center gap-2">
                      <Progress
                        value={totalCount > 0 ? (stage.count / totalCount) * 100 : 0}
                        className="h-2"
                        indicatorColor={stage.color}
                      />
                      <span className="text-muted-foreground w-10 text-right text-xs">
                        {totalValue > 0 ? Math.round((stage.value / totalValue) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
