"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { MessageSquare, Activity as ActivityIcon, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FormRenderer } from "@/app/[company]/(auth)/crm/leads/form-renderer";
import { formTemplatesApi, entityApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TemplateViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: number;
  entityType?: string;
  entityId?: number; // ID of the entity record (for viewing/editing existing)
  initialData?: Record<string, any>;
  onSubmit?: (data: Record<string, any>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

interface Activity {
  id: number;
  type: string;
  message: string;
  userId?: number;
  userName?: string;
  createdAt: string;
}

interface Comment {
  id: number;
  text: string;
  userId?: number;
  userName?: string;
  createdAt: string;
}

export function TemplateViewerDialog({
  open,
  onOpenChange,
  templateId,
  entityType = "LEAD",
  entityId,
  initialData = {},
  onSubmit,
  onCancel,
  submitLabel = "Save"
}: TemplateViewerDialogProps) {
  const [activeTab, setActiveTab] = React.useState<"activity" | "comments">("activity");
  const [activities, setActivities] = React.useState<Activity[]>([]);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [loadingActivities, setLoadingActivities] = React.useState(false);
  const [loadingComments, setLoadingComments] = React.useState(false);
  const [submittingComment, setSubmittingComment] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const commentForm = useForm({
    defaultValues: {
      text: ""
    }
  });

  // Load activities and comments when dialog opens and entityId is provided
  React.useEffect(() => {
    if (open && entityId && entityType) {
      loadActivities();
      loadComments();
    }
  }, [open, entityId, entityType]);

  const loadActivities = async () => {
    if (!entityId || !entityType) return;
    
    try {
      setLoadingActivities(true);
      const data = await entityApi.getActivities(entityType, entityId);
      setActivities(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading activities:", error);
      toast.error("Failed to load activities");
    } finally {
      setLoadingActivities(false);
    }
  };

  const loadComments = async () => {
    if (!entityId || !entityType) return;
    
    try {
      setLoadingComments(true);
      const data = await entityApi.getComments(entityType, entityId);
      setComments(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading comments:", error);
      toast.error("Failed to load comments");
    } finally {
      setLoadingComments(false);
    }
  };

  const handleCommentSubmit = async (data: { text: string }) => {
    if (!data.text.trim() || !entityId || !entityType) return;

    try {
      setSubmittingComment(true);
      const newComment = await entityApi.createComment(entityType, entityId, data.text.trim());
      setComments([newComment, ...comments]);
      commentForm.reset();
      
      // Create activity for new comment
      try {
        await entityApi.createActivity(entityType, entityId, {
          type: "comment_added",
          message: "Added a comment"
        });
        loadActivities(); // Refresh activities
      } catch (activityError) {
        console.error("Error creating activity:", activityError);
        // Don't fail the comment submission if activity creation fails
      }
      
      toast.success("Comment added successfully");
    } catch (error: any) {
      console.error("Error adding comment:", error);
      toast.error(error.message || "Failed to add comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleFormSubmit = async (data: Record<string, any>) => {
    if (!onSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmit(data);
      
      // Create activity for form submission only if entityId exists (updating existing entity)
      // For new entities, activity should be created by the parent component after entity is saved
      if (entityId && entityType) {
        try {
          await entityApi.createActivity(entityType, entityId, {
            type: "updated",
            message: "Updated the record"
          });
          loadActivities(); // Refresh activities
        } catch (activityError) {
          console.error("Error creating activity:", activityError);
          // Don't fail the form submission if activity creation fails
        }
      }
      
      return result;
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>
            {entityId ? "Edit Record" : "Create Record"}
          </DialogTitle>
          <DialogDescription>
            {entityId ? "View and edit the record details" : "Fill out the form to create a new record"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 flex overflow-hidden px-6 gap-4 min-h-0">
          {/* Left side: Form */}
          <div className="flex-1 overflow-y-auto pr-2">
            <FormRenderer
              templateId={templateId}
              entityType={entityType}
              initialData={initialData}
              onSubmit={handleFormSubmit}
              onCancel={onCancel || (() => onOpenChange(false))}
              submitLabel={submitLabel}
              showButtons={false}
              formId="template-form"
              onSubmittingChange={setIsSubmitting}
            />
          </div>

          {/* Right side: Activity and Comments - Hidden on mobile */}
          <div className="hidden md:flex w-96 border-l pl-4 flex-col">
            <Tabs 
              value={activeTab} 
              onValueChange={(v) => {
                if (entityId) {
                  setActiveTab(v as "activity" | "comments");
                }
              }} 
              className="flex-1 flex flex-col"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger 
                  value="activity"
                  disabled={!entityId}
                  className={cn(!entityId && "opacity-50 cursor-not-allowed")}
                >
                  <ActivityIcon className="h-4 w-4 mr-2" />
                  Activity
                </TabsTrigger>
                <TabsTrigger 
                  value="comments"
                  disabled={!entityId}
                  className={cn(!entityId && "opacity-50 cursor-not-allowed")}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Comments
                </TabsTrigger>
              </TabsList>

                <TabsContent value="activity" className="flex-1 flex flex-col mt-4">
                  <ScrollArea className="flex-1">
                    {!entityId ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ActivityIcon className="h-12 w-12 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Save the record to view activities</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Activities will appear here after the record is created
                        </p>
                      </div>
                    ) : loadingActivities ? (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        Loading activities...
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ActivityIcon className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No activities yet</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {activities.map((activity) => (
                          <div key={activity.id} className="flex gap-3 pb-4 border-b last:border-0">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {activity.userName
                                  ? activity.userName.charAt(0).toUpperCase()
                                  : "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">
                                  {activity.userName || "Unknown User"}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {activity.type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">
                                {activity.message}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(activity.createdAt), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="comments" className="flex-1 flex flex-col mt-4">
                  <ScrollArea className="flex-1 mb-4">
                    {!entityId ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Save the record to view comments</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Comments will appear here after the record is created
                        </p>
                      </div>
                    ) : loadingComments ? (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        Loading comments...
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No comments yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Start the conversation
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3 pb-4 border-b last:border-0">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {comment.userName
                                  ? comment.userName.charAt(0).toUpperCase()
                                  : "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">
                                  {comment.userName || "Unknown User"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(comment.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                </span>
                              </div>
                              <p className="text-sm">{comment.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Comment input - Only enabled when entityId exists */}
                  {entityId ? (
                    <form
                      onSubmit={commentForm.handleSubmit(handleCommentSubmit)}
                      className="border-t pt-4 mt-auto"
                    >
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Add a comment..."
                          {...commentForm.register("text", { required: "Comment cannot be empty" })}
                          rows={3}
                          className="resize-none"
                        />
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            size="sm"
                            disabled={submittingComment || !commentForm.watch("text")?.trim()}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {submittingComment ? "Posting..." : "Post Comment"}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="border-t pt-4 mt-auto">
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Add a comment..."
                          rows={3}
                          className="resize-none"
                          disabled
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled
                            variant="outline"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Post Comment
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          Save the record first to add comments
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
        </div>

        {/* Footer with sticky buttons */}
        <DialogFooter className="px-6 py-4 border-t bg-background flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel || (() => onOpenChange(false))}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="template-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

