"use client";

import { useState, useEffect } from "react";
import { collabsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Users, Mail, MoreVertical, Trash2, Edit2, UserPlus, X, Check, XCircle } from "lucide-react";
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
import { formatDistanceToNow } from "date-fns";

interface CollabMember {
  id: number;
  userId?: number | null;
  email: string;
  name?: string | null;
  role: string;
  isExternal: boolean;
  joinedAt: string;
  user?: {
    id: number;
    name: string;
    email: string;
    image: string;
  } | null;
}

interface CollabInvitation {
  id: number;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  expiresAt: string;
  invitedBy: {
    id: number;
    name: string;
    email: string;
  };
}

interface Collab {
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
  members: CollabMember[];
  invitations?: CollabInvitation[];
  companyId?: number | null;
  branchId?: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
    invitations: number;
  };
}

export default function CollabsPage() {
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedCollab, setSelectedCollab] = useState<Collab | null>(null);
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // Form states
  const [newCollabName, setNewCollabName] = useState("");
  const [newCollabDescription, setNewCollabDescription] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("MEMBER");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.id) {
      setCurrentUserId(user.id);
      loadCollabs(user.id);
    }
  }, []);

  const loadCollabs = async (userId: number) => {
    try {
      setLoading(true);
      const data = await collabsApi.getCollabs(undefined, undefined, userId);
      setCollabs(data || []);
    } catch (error) {
      console.error("Failed to load collabs:", error);
      setCollabs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollab = async () => {
    if (!newCollabName.trim() || !currentUserId) return;

    try {
      const collab = await collabsApi.createCollab({
        name: newCollabName,
        description: newCollabDescription || undefined,
        createdById: currentUserId,
      });
      setCollabs([collab, ...collabs]);
      setNewCollabName("");
      setNewCollabDescription("");
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create collab:", error);
      alert("Failed to create collab. Please try again.");
    }
  };

  const handleDeleteCollab = async (collabId: number) => {
    if (!confirm("Are you sure you want to delete this collab? This action cannot be undone.")) return;

    try {
      await collabsApi.deleteCollab(collabId);
      setCollabs(collabs.filter((c) => c.id !== collabId));
      if (selectedCollab?.id === collabId) {
        setSelectedCollab(null);
      }
    } catch (error) {
      console.error("Failed to delete collab:", error);
      alert("Failed to delete collab. Please try again.");
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim() || !selectedCollab) return;

    try {
      await collabsApi.addCollabMember(selectedCollab.id, {
        email: newMemberEmail,
        name: newMemberName || undefined,
        role: newMemberRole,
        isExternal: true,
      });
      setNewMemberEmail("");
      setNewMemberName("");
      setNewMemberRole("MEMBER");
      setIsMemberDialogOpen(false);
      // Reload collabs to get updated member list
      if (currentUserId) {
        loadCollabs(currentUserId);
      }
    } catch (error: any) {
      console.error("Failed to add member:", error);
      alert(error?.error || "Failed to add member. Please try again.");
    }
  };

  const handleSendInvitation = async () => {
    if (!inviteEmail.trim() || !selectedCollab || !currentUserId) return;

    try {
      await collabsApi.sendInvitation(selectedCollab.id, {
        email: inviteEmail,
        name: inviteName || undefined,
        role: inviteRole,
        invitedById: currentUserId,
      });
      setInviteEmail("");
      setInviteName("");
      setInviteRole("MEMBER");
      setIsInviteDialogOpen(false);
      // Reload collabs to get updated invitation list
      if (currentUserId) {
        loadCollabs(currentUserId);
      }
    } catch (error: any) {
      console.error("Failed to send invitation:", error);
      alert(error?.error || "Failed to send invitation. Please try again.");
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      await collabsApi.removeCollabMember(memberId);
      if (currentUserId) {
        loadCollabs(currentUserId);
      }
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("Failed to remove member. Please try again.");
    }
  };

  const handleUpdateMemberRole = async (memberId: number, newRole: string) => {
    try {
      await collabsApi.updateCollabMember(memberId, { role: newRole });
      if (currentUserId) {
        loadCollabs(currentUserId);
      }
    } catch (error) {
      console.error("Failed to update member role:", error);
      alert("Failed to update member role. Please try again.");
    }
  };

  const handleCancelInvitation = async (invitationId: number) => {
    try {
      await collabsApi.cancelInvitation(invitationId);
      if (currentUserId) {
        loadCollabs(currentUserId);
      }
    } catch (error) {
      console.error("Failed to cancel invitation:", error);
      alert("Failed to cancel invitation. Please try again.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500";
      case "PENDING":
        return "bg-yellow-500";
      case "COMPLETED":
        return "bg-blue-500";
      case "ARCHIVED":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "OWNER":
        return "bg-purple-500";
      case "ADMIN":
        return "bg-blue-500";
      case "MEMBER":
        return "bg-green-500";
      case "GUEST":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading collabs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight">Collabs</h1>
          <p className="text-muted-foreground text-sm">
            Collaborate with outside teams and members
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Collab
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Collab</DialogTitle>
              <DialogDescription>
                Create a new collaboration team to work with external members
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter collab name"
                  value={newCollabName}
                  onChange={(e) => setNewCollabName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter collab description"
                  value={newCollabDescription}
                  onChange={(e) => setNewCollabDescription(e.target.value)}
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
                <Button onClick={handleCreateCollab} disabled={!newCollabName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {collabs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No collabs yet</h3>
            <p className="mb-4 text-center text-muted-foreground">
              Create your first collab to start collaborating with external teams
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Collab
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {collabs.map((collab) => (
            <Card
              key={collab.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                selectedCollab?.id === collab.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelectedCollab(collab)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="mb-1">{collab.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {collab.description || "No description"}
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
                          setSelectedCollab(collab);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCollab(collab.id);
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
                  <Badge className={getStatusColor(collab.status)}>
                    {collab.status}
                  </Badge>
                  <span className="text-muted-foreground text-sm">
                    {collab._count?.members || collab.members.length} members
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={collab.createdBy.image} alt={collab.createdBy.name} />
                    <AvatarFallback>{collab.createdBy.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Created by {collab.createdBy.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(collab.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Collab Details Sidebar/Dialog */}
      {selectedCollab && (
        <Dialog open={!!selectedCollab} onOpenChange={(open) => !open && setSelectedCollab(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedCollab.name}</DialogTitle>
              <DialogDescription>{selectedCollab.description || "No description"}</DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Members Section */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Members</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsMemberDialogOpen(true)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add Member
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsInviteDialogOpen(true)}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Invite
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedCollab.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage
                            src={member.user?.image || `/images/avatars/01.png`}
                            alt={member.name || member.email}
                          />
                          <AvatarFallback>
                            {(member.name || member.email).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.name || member.user?.name || member.email}
                          </p>
                          <p className="text-muted-foreground text-sm">{member.email}</p>
                        </div>
                        {member.isExternal && (
                          <Badge variant="outline" className="text-xs">
                            External
                          </Badge>
                        )}
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
                            <SelectItem value="OWNER">Owner</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="GUEST">Guest</SelectItem>
                          </SelectContent>
                        </Select>
                        {member.userId !== selectedCollab.createdById && (
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

              {/* Invitations Section */}
              {selectedCollab.invitations && selectedCollab.invitations.length > 0 && (
                <div>
                  <h3 className="mb-4 text-lg font-semibold">Pending Invitations</h3>
                  <div className="space-y-2">
                    {selectedCollab.invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">
                            {invitation.name || invitation.email}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            Invited by {invitation.invitedBy.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Expires {formatDistanceToNow(new Date(invitation.expiresAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              invitation.status === "PENDING"
                                ? "bg-yellow-500"
                                : invitation.status === "ACCEPTED"
                                ? "bg-green-500"
                                : "bg-gray-500"
                            }
                          >
                            {invitation.status}
                          </Badge>
                          {invitation.status === "PENDING" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancelInvitation(invitation.id)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              Add an external member directly to this collab
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="member-email">Email *</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="member@example.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                placeholder="Member name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="member-role">Role</Label>
              <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="GUEST">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={!newMemberEmail.trim()}>
                Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Invitation Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invitation</DialogTitle>
            <DialogDescription>
              Send an invitation email to join this collab
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="member@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                placeholder="Member name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="GUEST">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendInvitation} disabled={!inviteEmail.trim()}>
                Send Invitation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

