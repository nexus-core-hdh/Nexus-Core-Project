"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Column {
  id: string;
  title: string;
  cards: any[];
}

interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  columns: Column[];
  icon?: string;
}

const boardTemplates: BoardTemplate[] = [
  {
    id: "basic",
    name: "Basic Kanban",
    description: "Simple three-column board for task management",
    columns: [
      { id: "1", title: "To Do", cards: [] },
      { id: "2", title: "In Progress", cards: [] },
      { id: "3", title: "Done", cards: [] },
    ],
  },
  {
    id: "scrum",
    name: "Scrum Board",
    description: "Agile sprint planning with backlog and review",
    columns: [
      { id: "1", title: "Backlog", cards: [] },
      { id: "2", title: "Sprint", cards: [] },
      { id: "3", title: "In Progress", cards: [] },
      { id: "4", title: "Review", cards: [] },
      { id: "5", title: "Done", cards: [] },
    ],
  },
  {
    id: "project",
    name: "Project Management",
    description: "Full project lifecycle from planning to completion",
    columns: [
      { id: "1", title: "Ideas", cards: [] },
      { id: "2", title: "Planning", cards: [] },
      { id: "3", title: "In Progress", cards: [] },
      { id: "4", title: "Testing", cards: [] },
      { id: "5", title: "Done", cards: [] },
    ],
  },
  {
    id: "sales",
    name: "Sales Pipeline",
    description: "Track leads through the sales process",
    columns: [
      { id: "1", title: "Leads", cards: [] },
      { id: "2", title: "Qualified", cards: [] },
      { id: "3", title: "Proposal", cards: [] },
      { id: "4", title: "Negotiation", cards: [] },
      { id: "5", title: "Closed Won", cards: [] },
      { id: "6", title: "Closed Lost", cards: [] },
    ],
  },
  {
    id: "bug-tracking",
    name: "Bug Tracking",
    description: "Track bugs from discovery to resolution",
    columns: [
      { id: "1", title: "Reported", cards: [] },
      { id: "2", title: "In Progress", cards: [] },
      { id: "3", title: "Testing", cards: [] },
      { id: "4", title: "Resolved", cards: [] },
    ],
  },
  {
    id: "content",
    name: "Content Calendar",
    description: "Plan and track content creation workflow",
    columns: [
      { id: "1", title: "Ideas", cards: [] },
      { id: "2", title: "Writing", cards: [] },
      { id: "3", title: "Review", cards: [] },
      { id: "4", title: "Published", cards: [] },
    ],
  },
  {
    id: "hr-recruitment",
    name: "HR Recruitment",
    description: "Manage the hiring process from application to onboarding",
    columns: [
      { id: "1", title: "Application", cards: [] },
      { id: "2", title: "Screening", cards: [] },
      { id: "3", title: "Interview", cards: [] },
      { id: "4", title: "Offer", cards: [] },
      { id: "5", title: "Hired", cards: [] },
      { id: "6", title: "Rejected", cards: [] },
    ],
  },
  {
    id: "product-roadmap",
    name: "Product Roadmap",
    description: "Plan and track product development stages",
    columns: [
      { id: "1", title: "Backlog", cards: [] },
      { id: "2", title: "Research", cards: [] },
      { id: "3", title: "Design", cards: [] },
      { id: "4", title: "Development", cards: [] },
      { id: "5", title: "Testing", cards: [] },
      { id: "6", title: "Launch", cards: [] },
    ],
  },
  {
    id: "customer-support",
    name: "Customer Support",
    description: "Track customer support tickets and resolutions",
    columns: [
      { id: "1", title: "New", cards: [] },
      { id: "2", title: "In Progress", cards: [] },
      { id: "3", title: "Waiting", cards: [] },
      { id: "4", title: "Resolved", cards: [] },
      { id: "5", title: "Closed", cards: [] },
    ],
  },
  {
    id: "event-planning",
    name: "Event Planning",
    description: "Organize events from planning to completion",
    columns: [
      { id: "1", title: "Planning", cards: [] },
      { id: "2", title: "Preparation", cards: [] },
      { id: "3", title: "In Progress", cards: [] },
      { id: "4", title: "Review", cards: [] },
      { id: "5", title: "Completed", cards: [] },
    ],
  },
  {
    id: "marketing-campaign",
    name: "Marketing Campaign",
    description: "Manage marketing campaigns from concept to publication",
    columns: [
      { id: "1", title: "Planning", cards: [] },
      { id: "2", title: "Design", cards: [] },
      { id: "3", title: "Content", cards: [] },
      { id: "4", title: "Review", cards: [] },
      { id: "5", title: "Published", cards: [] },
      { id: "6", title: "Archived", cards: [] },
    ],
  },
  {
    id: "employee-onboarding",
    name: "Employee Onboarding",
    description: "Track new employee onboarding process",
    columns: [
      { id: "1", title: "Pre-boarding", cards: [] },
      { id: "2", title: "First Week", cards: [] },
      { id: "3", title: "First Month", cards: [] },
      { id: "4", title: "Training", cards: [] },
      { id: "5", title: "Complete", cards: [] },
    ],
  },
  {
    id: "inventory",
    name: "Inventory Management",
    description: "Track inventory levels and stock status",
    columns: [
      { id: "1", title: "Ordered", cards: [] },
      { id: "2", title: "Received", cards: [] },
      { id: "3", title: "In Stock", cards: [] },
      { id: "4", title: "Low Stock", cards: [] },
      { id: "5", title: "Out of Stock", cards: [] },
    ],
  },
  {
    id: "quality-assurance",
    name: "Quality Assurance",
    description: "Manage QA testing workflow",
    columns: [
      { id: "1", title: "To Test", cards: [] },
      { id: "2", title: "Testing", cards: [] },
      { id: "3", title: "Passed", cards: [] },
      { id: "4", title: "Failed", cards: [] },
      { id: "5", title: "Fixed", cards: [] },
    ],
  },
  {
    id: "design-workflow",
    name: "Design Workflow",
    description: "Track design projects from brief to delivery",
    columns: [
      { id: "1", title: "Brief", cards: [] },
      { id: "2", title: "Research", cards: [] },
      { id: "3", title: "Design", cards: [] },
      { id: "4", title: "Review", cards: [] },
      { id: "5", title: "Approved", cards: [] },
      { id: "6", title: "Delivered", cards: [] },
    ],
  },
  {
    id: "it-support",
    name: "IT Support",
    description: "Manage IT support tickets and resolutions",
    columns: [
      { id: "1", title: "New Ticket", cards: [] },
      { id: "2", title: "Assigned", cards: [] },
      { id: "3", title: "In Progress", cards: [] },
      { id: "4", title: "Waiting", cards: [] },
      { id: "5", title: "Resolved", cards: [] },
      { id: "6", title: "Closed", cards: [] },
    ],
  },
  {
    id: "hiring-process",
    name: "Hiring Process",
    description: "Complete hiring workflow from sourcing to hire",
    columns: [
      { id: "1", title: "Sourcing", cards: [] },
      { id: "2", title: "Screening", cards: [] },
      { id: "3", title: "Interview", cards: [] },
      { id: "4", title: "Offer", cards: [] },
      { id: "5", title: "Onboarding", cards: [] },
      { id: "6", title: "Hired", cards: [] },
    ],
  },
  {
    id: "product-launch",
    name: "Product Launch",
    description: "Track product launch from planning to post-launch",
    columns: [
      { id: "1", title: "Planning", cards: [] },
      { id: "2", title: "Development", cards: [] },
      { id: "3", title: "Testing", cards: [] },
      { id: "4", title: "Marketing", cards: [] },
      { id: "5", title: "Launch", cards: [] },
      { id: "6", title: "Post-Launch", cards: [] },
    ],
  },
  {
    id: "customer-journey",
    name: "Customer Journey",
    description: "Track customers through the sales funnel",
    columns: [
      { id: "1", title: "Awareness", cards: [] },
      { id: "2", title: "Interest", cards: [] },
      { id: "3", title: "Consideration", cards: [] },
      { id: "4", title: "Purchase", cards: [] },
      { id: "5", title: "Retention", cards: [] },
    ],
  },
  {
    id: "learning-path",
    name: "Learning Path",
    description: "Track learning progress and certifications",
    columns: [
      { id: "1", title: "Not Started", cards: [] },
      { id: "2", title: "In Progress", cards: [] },
      { id: "3", title: "Review", cards: [] },
      { id: "4", title: "Completed", cards: [] },
      { id: "5", title: "Certified", cards: [] },
    ],
  },
  {
    id: "vendor-management",
    name: "Vendor Management",
    description: "Manage vendor relationships and contracts",
    columns: [
      { id: "1", title: "Prospecting", cards: [] },
      { id: "2", title: "Evaluation", cards: [] },
      { id: "3", title: "Negotiation", cards: [] },
      { id: "4", title: "Contract", cards: [] },
      { id: "5", title: "Active", cards: [] },
      { id: "6", title: "Terminated", cards: [] },
    ],
  },
  {
    id: "feature-request",
    name: "Feature Request",
    description: "Track feature requests from idea to release",
    columns: [
      { id: "1", title: "Submitted", cards: [] },
      { id: "2", title: "Under Review", cards: [] },
      { id: "3", title: "Approved", cards: [] },
      { id: "4", title: "In Development", cards: [] },
      { id: "5", title: "Testing", cards: [] },
      { id: "6", title: "Released", cards: [] },
    ],
  },
  {
    id: "expense-approval",
    name: "Expense Approval",
    description: "Manage expense requests and approvals",
    columns: [
      { id: "1", title: "Submitted", cards: [] },
      { id: "2", title: "Under Review", cards: [] },
      { id: "3", title: "Approved", cards: [] },
      { id: "4", title: "Rejected", cards: [] },
      { id: "5", title: "Paid", cards: [] },
    ],
  },
];

interface BoardTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: BoardTemplate) => void;
}

export function BoardTemplateDialog({
  open,
  onOpenChange,
  onSelectTemplate,
}: BoardTemplateDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplate | null>(null);

  const handleSelect = (template: BoardTemplate) => {
    setSelectedTemplate(template);
  };

  const handleCreate = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
      setSelectedTemplate(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>Choose a Board Template</DialogTitle>
          <DialogDescription>
            Select a template to get started with your board. You can customize it later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boardTemplates.map((template) => (
            <Card
              key={template.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                selectedTemplate?.id === template.id && "ring-2 ring-primary"
              )}
              onClick={() => handleSelect(template)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{template.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.description}
                    </p>
                  </div>
                  {selectedTemplate?.id === template.id && (
                    <div className="ml-2 flex-shrink-0">
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {template.columns.map((column, index) => (
                    <div
                      key={column.id}
                      className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground"
                    >
                      {column.title}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6 pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedTemplate}
          >
            Create Board
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

