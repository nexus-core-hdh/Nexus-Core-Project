"use client";

import { useState, useEffect } from "react";
import { feedApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle, Send, MoreHorizontal, Trash2, Edit2, Image as ImageIcon, X, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";

interface FeedPost {
  id: number;
  content: string;
  image?: string | null;
  userId: number;
  user: {
    id: number;
    name: string;
    email: string;
    image: string;
  };
  likes: Array<{
    id: number;
    userId: number;
    user: {
      id: number;
      name: string;
      image: string;
    };
  }>;
  comments: Array<{
    id: number;
    text: string;
    userId: number;
    user: {
      id: number;
      name: string;
      email: string;
      image: string;
    };
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export default function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [newComments, setNewComments] = useState<Record<number, string>>({});
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  useEffect(() => {
    // Get current user ID from auth
    const user = getCurrentUser();
    if (user?.id) {
      setCurrentUserId(user.id);
    }
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const data = await feedApi.getFeedPosts();
      setPosts(data);
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!newPostContent.trim()) {
      alert("Please enter some content for your post.");
      return;
    }

    if (!currentUserId) {
      alert("User ID not found. Please refresh the page and try again.");
      return;
    }

    if (isCreatingPost) {
      return; // Prevent double submission
    }

    try {
      setIsCreatingPost(true);
      const post = await feedApi.createFeedPost({
        content: newPostContent,
        image: newPostImage || undefined,
        userId: currentUserId,
      });
      setPosts([post, ...posts]);
      setNewPostContent("");
      setNewPostImage(null);
      setIsCreateDialogOpen(false);
    } catch (error: any) {
      console.error("Failed to create post:", error);
      const errorMessage = error?.message || error?.error || "Failed to create post. Please try again.";
      alert(errorMessage);
    } finally {
      setIsCreatingPost(false);
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      await feedApi.deleteFeedPost(postId);
      setPosts(posts.filter((p) => p.id !== postId));
    } catch (error) {
      console.error("Failed to delete post:", error);
      alert("Failed to delete post. Please try again.");
    }
  };

  const handleLikePost = async (postId: number) => {
    if (!currentUserId) return;

    try {
      await feedApi.likeFeedPost(postId, currentUserId);
      loadPosts(); // Reload to get updated like count
    } catch (error) {
      console.error("Failed to toggle like:", error);
    }
  };

  const handleAddComment = async (postId: number) => {
    const commentText = newComments[postId]?.trim();
    if (!commentText || !currentUserId) return;

    try {
      await feedApi.addFeedComment(postId, {
        text: commentText,
        userId: currentUserId,
      });
      setNewComments({ ...newComments, [postId]: "" });
      setExpandedComments(new Set(expandedComments).add(postId));
      loadPosts(); // Reload to get updated comments
    } catch (error) {
      console.error("Failed to add comment:", error);
      alert("Failed to add comment. Please try again.");
    }
  };

  const handleDeleteComment = async (commentId: number, postId: number) => {
    try {
      await feedApi.deleteFeedComment(commentId);
      loadPosts(); // Reload to get updated comments
    } catch (error) {
      console.error("Failed to delete comment:", error);
      alert("Failed to delete comment. Please try again.");
    }
  };

  const handleEditPost = async (postId: number) => {
    if (!editContent.trim()) return;

    try {
      await feedApi.updateFeedPost(postId, { content: editContent });
      setEditingPostId(null);
      setEditContent("");
      loadPosts();
    } catch (error) {
      console.error("Failed to update post:", error);
      alert("Failed to update post. Please try again.");
    }
  };

  const toggleComments = (postId: number) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
    }
    setExpandedComments(newExpanded);
  };

  const isLiked = (post: FeedPost) => {
    return post.likes?.some((like) => like.userId === currentUserId) ?? false;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPostImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading feed...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Feed</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Post
            </Button>
          </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Post</DialogTitle>
                <DialogDescription>
                  Share your thoughts with your team
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder="What's on your mind?"
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  rows={6}
                />
                {newPostImage && (
                  <div className="relative">
                    <img
                      src={newPostImage}
                      alt="Preview"
                      className="w-full rounded-lg"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2"
                      onClick={() => setNewPostImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label htmlFor="image-upload">
                    <Button variant="outline" type="button" asChild>
                      <span>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Add Image
                      </span>
                    </Button>
                  </label>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button 
                    onClick={handleCreatePost} 
                    disabled={!newPostContent.trim() || !currentUserId || isCreatingPost}
                    type="button"
                  >
                    {isCreatingPost ? "Posting..." : "Post"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
      </div>

      <div className="mx-auto max-w-2xl space-y-4">
          {posts.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p className="text-lg">No posts yet</p>
                <p className="text-sm">Be the first to share something!</p>
              </div>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="rounded-lg border bg-card p-4">
                {/* Post Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={post.user.image} alt={post.user.name} />
                      <AvatarFallback>{post.user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{post.user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {post.userId === currentUserId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingPostId(post.id);
                            setEditContent(post.content);
                          }}
                        >
                          <Edit2 className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeletePost(post.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Post Content */}
                {editingPostId === post.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleEditPost(post.id)}
                        disabled={!editContent.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingPostId(null);
                          setEditContent("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mb-3 whitespace-pre-wrap">{post.content}</p>
                    {post.image && (
                      <img
                        src={post.image}
                        alt="Post"
                        className="mb-3 w-full rounded-lg"
                      />
                    )}
                  </>
                )}

                {/* Post Actions */}
                <div className="mt-3 flex items-center gap-4 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLikePost(post.id)}
                    className={isLiked(post) ? "text-destructive" : ""}
                  >
                    <Heart
                      className={`mr-2 h-4 w-4 ${isLiked(post) ? "fill-current" : ""}`}
                    />
                    {post.likes?.length ?? 0}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleComments(post.id)}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {post.comments?.length ?? 0}
                  </Button>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    {(post.comments ?? []).map((comment) => (
                      <div key={comment.id} className="flex items-start gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={comment.user.image}
                            alt={comment.user.name}
                          />
                          <AvatarFallback>
                            {comment.user.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 rounded-lg bg-muted p-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">
                              {comment.user.name}
                            </p>
                            {comment.userId === currentUserId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleDeleteComment(comment.id, post.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <p className="text-sm">{comment.text}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Add Comment */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Write a comment..."
                        value={newComments[post.id] || ""}
                        onChange={(e) =>
                          setNewComments({
                            ...newComments,
                            [post.id]: e.target.value,
                          })
                        }
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleAddComment(post.id);
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        onClick={() => handleAddComment(post.id)}
                        disabled={!newComments[post.id]?.trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
      </div>
    </div>
  );
}

