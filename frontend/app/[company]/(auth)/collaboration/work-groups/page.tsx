"use client";

import { useState, useEffect } from "react";
import { workGroupsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Users, MoreVertical, Trash2, Edit2, UserPlus, X, Search } from "lucide-react";
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

interface WorkGroupMember {
  id: number;
  userId: number;
  role: string;
  joinedAt: string;
  user: {
    id: number;
    name: string;
    email: string;
    image: string;
  };
}

interface WorkGroup {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  createdById: number;
  createdBy: {
    id: number;
    name: string;
    email: string;
    image: string;
  };
  members: WorkGroupMember[];
  companyId?: number | null;
  branchId?: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
  };
}

interface User {
  id: number;
  name: string;
  email: string;
  image: string;
}

export default function WorkGroupsPage() {
  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedWorkGroup, setSelectedWorkGroup] = useState<WorkGroup | null>(null);
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isUserSelectOpen, setIsUserSelectOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // Form states
  const [newWorkGroupName, setNewWorkGroupName] = useState("");
  const [newWorkGroupDescription, setNewWorkGroupDescription] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newMemberRole, setNewMemberRole] = useState("MEMBER");

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.id) {
      setCurrentUserId(user.id);
      loadWorkGroups(user.id);
    }
  }, []);

  const loadWorkGroups = async (userId: number) => {
    try {
      setLoading(true);
      const data = await workGroupsApi.getWorkGroups(undefined, undefined, userId);
      setWorkGroups(data || []);
    } catch (error) {
      console.error("Failed to load work groups:", error);
      setWorkGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableUsers = async (workGroupId: number) => {
    try {
      const data = await workGroupsApi.getAvailableUsers(workGroupId);
      setAvailableUsers(data || []);
    } catch (error) {
      console.error("Failed to load available users:", error);
      setAvailableUsers([]);
    }
  };

  const handleCreateWorkGroup = async () => {
    if (!newWorkGroupName.trim() || !currentUserId) return;

    try {
      const workGroup = await workGroupsApi.createWorkGroup({
        name: newWorkGroupName,
        description: newWorkGroupDescription || undefined,
        createdById: currentUserId,
      });
      setWorkGroups([workGroup, ...workGroups]);
      setNewWorkGroupName("");
      setNewWorkGroupDescription("");
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create work group:", error);
      alert("Failed to create work group. Please try again.");
    }
  };

  const handleDeleteWorkGroup = async (workGroupId: number) => {
    if (!confirm("Are you sure you want to delete this work group? This action cannot be undone.")) return;

    try {
      await workGroupsApi.deleteWorkGroup(workGroupId);
      setWorkGroups(workGroups.filter((wg) => wg.id !== workGroupId));
      if (selectedWorkGroup?.id === workGroupId) {
        setSelectedWorkGroup(null);
      }
    } catch (error) {
      console.error("Failed to delete work group:", error);
      alert("Failed to delete work group. Please try again.");
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId || !selectedWorkGroup) return;

    try {
      await workGroupsApi.addWorkGroupMember(selectedWorkGroup.id, {
        userId: selectedUserId,
        role: newMemberRole,
      });
      setSelectedUserId(null);
      setNewMemberRole("MEMBER");
      setIsMemberDialogOpen(false);
      // Reload work groups to get updated member list
      if (currentUserId) {
        loadWorkGroups(currentUserId);
      }
    } catch (error: any) {
      console.error("Failed to add member:", error);
      alert(error?.error || "Failed to add member. Please try again.");
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      await workGroupsApi.removeWorkGroupMember(memberId);
      if (currentUserId) {
        loadWorkGroups(currentUserId);
      }
    } catch (error: any) {
      console.error("Failed to remove member:", error);
      alert(error?.error || "Failed to remove member. Please try again.");
    }
  };

  const handleUpdateMemberRole = async (memberId: number, newRole: string) => {
    try {
      await workGroupsApi.updateWorkGroupMember(memberId, { role: newRole });
      if (currentUserId) {
        loadWorkGroups(currentUserId);
      }
    } catch (error) {
      console.error("Failed to update member role:", error);
      alert("Failed to update member role. Please try again.");
    }
  };

  const handleWorkGroupSelect = (workGroup: WorkGroup) => {
    setSelectedWorkGroup(workGroup);
    loadAvailableUsers(workGroup.id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500";
      case "ARCHIVED":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "LEADER":
        return "bg-purple-500";
      case "MEMBER":
        return "bg-blue-500";
      case "VIEWER":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading work groups...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight">Work Groups</h1>
          <p className="text-muted-foreground text-sm">
            Organize your internal teams and collaborate effectively
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Work Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Work Group</DialogTitle>
              <DialogDescription>
                Create a new work group to organize your internal team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter work group name"
                  value={newWorkGroupName}
                  onChange={(e) => setNewWorkGroupName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter work group description"
                  value={newWorkGroupDescription}
                  onChange={(e) => setNewWorkGroupDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateWorkGroup} disabled={!newWorkGroupName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {workGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No work groups yet</h3>
            <p className="mb-4 text-center text-muted-foreground">
              Create your first work group to organize your internal teams
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Work Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {workGroups.map((workGroup) => (
            <Card
              key={workGroup.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                selectedWorkGroup?.id === workGroup.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => handleWorkGroupSelect(workGroup)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="mb-1">{workGroup.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {workGroup.description || "No description"}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWorkGroupSelect(workGroup);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkGroup(workGroup.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center gap-2">
                  <Badge className={getStatusColor(workGroup.status)}>
                    {workGroup.status}
                  </Badge>
                  <span className="text-muted-foreground text-sm">
                    {workGroup._count?.members || workGroup.members.length} members
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={workGroup.createdBy.image} alt={workGroup.createdBy.name} />
                    <AvatarFallback>{workGroup.createdBy.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Created by {workGroup.createdBy.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(workGroup.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Work Group Details Dialog */}
      {selectedWorkGroup && (
        <Dialog open={!!selectedWorkGroup} onOpenChange={(open) => !open && setSelectedWorkGroup(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedWorkGroup.name}</DialogTitle>
              <DialogDescription>{selectedWorkGroup.description || "No description"}</DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Members Section */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Members</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsMemberDialogOpen(true);
                      loadAvailableUsers(selectedWorkGroup.id);
                    }}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Member
                  </Button>
                </div>

                <div className="space-y-2">
                  {selectedWorkGroup.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage
                            src={member.user.image || `/images/avatars/01.png`}
                            alt={member.user.name}
                          />
                          <AvatarFallback>
                            {member.user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.user.name}</p>
                          <p className="text-muted-foreground text-sm">{member.user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleUpdateMemberRole(member.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LEADER">Leader</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="VIEWER">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        {member.userId !== selectedWorkGroup.createdById && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Member Dialog */}
      <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Add an internal user to this work group
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-select">User *</Label>
              <Popover open={isUserSelectOpen} onOpenChange={setIsUserSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isUserSelectOpen}
                    className="w-full justify-between"
                  >
                    {selectedUserId
                      ? availableUsers.find((user) => user.id === selectedUserId)?.name || "Select user..."
                      : "Select user..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search users..." />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      <CommandGroup>
                        {availableUsers.map((user) => (
                          <CommandItem
                            key={user.id}
                            value={`${user.name} ${user.email}`}
                            onSelect={() => {
                              setSelectedUserId(user.id);
                              setIsUserSelectOpen(false);
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={user.image} alt={user.name} />
                                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{user.name}</p>
                                <p className="text-muted-foreground text-xs">{user.email}</p>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="member-role">Role</Label>
              <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="LEADER">Leader</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={!selectedUserId}>
                Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

































































