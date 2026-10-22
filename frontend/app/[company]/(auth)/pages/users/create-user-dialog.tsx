"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link2, Mail, MessageSquare, UserPlus, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { companiesApi, branchesApi, usersApi, rolesApi } from "@/lib/api";
import { useAsyncOptions, type AsyncOptionsStatus } from "@/hooks/use-async-options";
import { fieldForCreateUserError, hiddenFieldErrors, shouldClearUnofferedRole } from "@/lib/users/create-user-rules";
import { copyText } from "@/lib/clipboard";

// Form schema for user creation
const userFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  department: z.string().optional(),
  notes: z.string().optional(),
  companyId: z.string().optional(),
  branchId: z.string().optional(),
  country: z.string().optional(),
  status: z.string().optional(),
  plan_name: z.string().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

/**
 * Create First Admin (Companies → View company): this same dialog and its Add New User process,
 * aimed at a newly registered company that has no users yet. The company, its Main Branch and the
 * Admin role are fixed (shown read-only, never sent — the platform endpoint resolves them
 * server-side), the account gets the same generated temporary password, shown once, that must be
 * changed at first sign-in. Only "Add New User" is offered and no quota or role list of the
 * signed-in user's own company applies.
 */
export interface FirstAdminTarget {
  companyId: string;
  companyName: string;
  branchName: string;
  roleName: string;
  create: (body: { name: string; email: string; password: string; phone?: string; department?: string }) => Promise<unknown>;
}

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  firstAdmin?: FirstAdminTarget;
}

type InviteMethod = "link" | "email" | "sms" | "manual";

// 14 characters from an unambiguous alphabet, drawn with the browser's CSPRNG.
function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// User limits per plan
const PLAN_USER_LIMITS: Record<string, number | null> = {
  Free: 5,
  Basic: 10,
  Pro: 25,
  Enterprise: null, // Unlimited
};

export function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
  firstAdmin,
}: CreateUserDialogProps) {
  const [activeMethod, setActiveMethod] = React.useState<InviteMethod>("manual");
  const [inviteLink, setInviteLink] = React.useState("");
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);
  const [companies, setCompanies] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string>("");
  const [userQuota, setUserQuota] = React.useState<{ current: number; max: number | null; plan: string } | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "",
      department: "",
      notes: "",
      companyId: "",
      branchId: "",
      country: "US",
      status: "active",
      plan_name: "Basic",
    },
  });

  // Default the company to the logged-in user's own company when the dialog opens; reset on close.
  React.useEffect(() => {
    if (open && firstAdmin) {
      // Fixed target; the role value only satisfies the form schema — it is never sent.
      form.setValue("companyId", firstAdmin.companyId);
      form.setValue("role", "first-admin");
      setSelectedCompanyId(firstAdmin.companyId);
    } else if (open) {
      try {
        const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
        const companyId = userStr ? JSON.parse(userStr)?.companyId : null;
        if (companyId) {
          form.setValue("companyId", String(companyId));
          setSelectedCompanyId(String(companyId));
        }
      } catch (error) {
        console.error("Failed to read the signed-in user's company:", error);
      }
    } else {
      form.reset();
      setSelectedCompanyId("");
      setInviteLink("");
    }
  }, [open, form, firstAdmin]);

  // Load user quota when dialog opens
  React.useEffect(() => {
    // A first admin is created in another company: the signed-in company's quota does not apply.
    if (!open || firstAdmin) return;
    
    const loadUserQuota = async () => {
      try {
        // Get current user from localStorage
        const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
        if (!userStr) return;
        
        const currentUser = JSON.parse(userStr);
        if (!currentUser.companyId) return;

        // Get company with users
        const company = await companiesApi.getCompany(currentUser.companyId);
        const plan = company.plan || "Free";
        const maxUsers = PLAN_USER_LIMITS[plan] ?? null;
        const currentUsers = company._count?.users ?? company.users?.length ?? 0;

        setUserQuota({
          current: currentUsers,
          max: maxUsers,
          plan: plan,
        });
      } catch (error) {
        console.error("Failed to load user quota:", error);
      }
    };
    
    loadUserQuota();
  }, [open, firstAdmin]);

  // Load companies when dialog opens
  React.useEffect(() => {
    if (open && !firstAdmin) {
      const loadCompanies = async () => {
        try {
          const companiesData = await companiesApi.getCompanies();
          setCompanies(companiesData || []);
        } catch (error) {
          console.error("Failed to load companies:", error);
        }
      };
      loadCompanies();
    }
  }, [open, firstAdmin]);

  // Branches of the selected company (ids are strings — compared as such, never parseInt'd).
  // Changing company reloads them; a slower response for the previous company is discarded.
  const branchOptions = useAsyncOptions<{ id: string; name: string }>(
    open && selectedCompanyId && !firstAdmin ? () => branchesApi.getBranches(selectedCompanyId) : null,
    [open, selectedCompanyId, firstAdmin],
  );

  // Access-control roles. Roles are ERP-wide (not per company/branch), so they load once per opening.
  const roleOptions = useAsyncOptions<{ id: string; name: string }>(
    open && !firstAdmin ? () => rolesApi.getRoles() : null,
    [open, firstAdmin],
  );

  // Changing company: drop the previous company's branch so no stale selection survives.
  const changeCompany = (companyId: string) => {
    form.setValue("companyId", companyId);
    form.setValue("branchId", "");
    setSelectedCompanyId(companyId);
  };

  // A role that is no longer offered (reload returned a different list) must not stay selected —
  // except in Create First Admin mode, where the role is fixed and no role list is loaded.
  React.useEffect(() => {
    const role = form.getValues("role");
    if (shouldClearUnofferedRole({ firstAdminMode: !!firstAdmin, role, status: roleOptions.status, offeredIds: roleOptions.items.map((r) => r.id) })) form.setValue("role", "");
  }, [roleOptions.items, roleOptions.status, form, firstAdmin]);

  const loadingRequiredData = !firstAdmin && activeMethod === "manual" && (roleOptions.isLoading || branchOptions.isLoading);
  const rolesUnavailable = !firstAdmin && (roleOptions.status === "error" || roleOptions.status === "empty");

  // Generate invite link
  const generateInviteLink = () => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const token = `invite_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const link = `${baseUrl}/invite/${token}`;
    setInviteLink(link);
    return link;
  };

  React.useEffect(() => {
    if (activeMethod === "link" && !inviteLink && open) {
      generateInviteLink();
    }
  }, [activeMethod, open]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setLinkCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleInviteViaLink = async () => {
    if (!inviteLink) {
      generateInviteLink();
    }
    toast.success("Invite link generated! Share it with the user.");
  };

  const handleInviteViaEmail = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      const userData = {
        name: data.name,
        email: data.email,
        country: data.country || "US",
        role: "employee" as any, // Default enum role
        roleId: data.role ? parseInt(data.role) : null, // Custom role ID from Role table
        image: "/images/avatars/default.png",
        status: "pending" as any,
        plan_name: (data.plan_name || "Basic") as any,
        companyId: data.companyId ? parseInt(data.companyId) : null,
        branchId: data.branchId ? parseInt(data.branchId) : null,
      };
      
      await usersApi.createUser(userData);
      toast.success(`Invitation email sent to ${data.email}`);
      form.reset();
      setSelectedCompanyId("");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error("Failed to send invitation email", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteViaSMS = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      const userData = {
        name: data.name,
        email: data.email || `${data.phone?.replace(/\D/g, "")}@sms.invite`,
        country: data.country || "US",
        role: "employee" as any, // Default enum role
        roleId: data.role ? parseInt(data.role) : null, // Custom role ID from Role table
        image: "/images/avatars/default.png",
        status: "pending" as any,
        plan_name: (data.plan_name || "Basic") as any,
        companyId: data.companyId ? parseInt(data.companyId) : null,
        branchId: data.branchId ? parseInt(data.branchId) : null,
      };
      
      await usersApi.createUser(userData);
      toast.success(`Invitation SMS sent to ${data.phone}`);
      form.reset();
      setSelectedCompanyId("");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error("Failed to send invitation SMS", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [createdUserPassword, setCreatedUserPassword] = React.useState<string | null>(null);
  const passwordInputRef = React.useRef<HTMLInputElement>(null);
  const [showPasswordDialog, setShowPasswordDialog] = React.useState(false);

  const handleAddNewUser = async (data: UserFormValues) => {
    if (firstAdmin) return createFirstAdmin(data);
    // Check quota before creating user
    if (userQuota && userQuota.max !== null) {
      if (userQuota.current >= userQuota.max) {
        toast.error("User quota reached", {
          description: `You have reached the maximum number of users (${userQuota.max}) for your ${userQuota.plan} plan. Please upgrade your plan to create more users.`,
          duration: 5000,
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Matches the backend's CreateUserDto (unknown fields are rejected). The account gets a
      // generated temporary password; the backend forces a change on first login.
      const status = (data.status || "active") as "active" | "inactive" | "pending";
      const temporaryPassword = generateTemporaryPassword();
      const userData = {
        name: data.name.trim(),
        email: data.email.trim(),
        password: temporaryPassword,
        companyId: data.companyId,
        roleId: data.role,
        userStatus: status,
        isActive: status !== "inactive",
        ...(data.branchId ? { branchId: data.branchId } : {}),
        ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
        ...(data.department?.trim() ? { department: data.department.trim() } : {}),
      };

      await usersApi.createUser(userData);
      const response = { temporaryPassword };

      // Reload quota after successful creation
      const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (userStr) {
        try {
          const currentUser = JSON.parse(userStr);
          if (currentUser.companyId) {
            const company = await companiesApi.getCompany(currentUser.companyId);
            const plan = company.plan || "Free";
            const maxUsers = PLAN_USER_LIMITS[plan] ?? null;
            const currentUsers = company._count?.users ?? company.users?.length ?? 0;
            setUserQuota({
              current: currentUsers,
              max: maxUsers,
              plan: plan,
            });
          }
        } catch (error) {
          console.error("Failed to reload quota:", error);
        }
      }
      
      if (response.temporaryPassword) {
        setCreatedUserPassword(response.temporaryPassword);
        setShowPasswordDialog(true);
        toast.success(`User ${data.name} created successfully!`);
      } else {
        toast.success(`User ${data.name} created successfully`);
        form.reset();
        setSelectedCompanyId("");
        onOpenChange(false);
        if (onSuccess) onSuccess();
      }
    } catch (error: any) {
      toast.error("Failed to create user", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create First Admin: the same generated temporary password and the same one-time password
  // dialog as Add New User; only the request goes to the platform endpoint for the target company.
  const createFirstAdmin = async (data: UserFormValues) => {
    if (!firstAdmin || submittingRef.current) return; // one request at a time, even on a double click
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const temporaryPassword = generateTemporaryPassword();
      await firstAdmin.create({
        name: data.name.trim(),
        email: data.email.trim(),
        password: temporaryPassword,
        ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
        ...(data.department?.trim() ? { department: data.department.trim() } : {}),
      });
      setCreatedUserPassword(temporaryPassword);
      setShowPasswordDialog(true);
      toast.success(`${data.name.trim()} is the first administrator of ${firstAdmin.companyName}`);
    } catch (error: any) {
      const message = String(error?.message || "An error occurred");
      // e.g. "Email already registered" also appears under the Email field
      const field = fieldForCreateUserError(message);
      if (field) form.setError(field, { type: "server", message });
      toast.error("Failed to create the first administrator", { description: message });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Validation failed: visible fields show their own messages; anything on a field the user
  // cannot see in this mode is reported, never dropped silently.
  const onInvalid = (errors: Record<string, { message?: unknown } | undefined>) => {
    const visible = ["name", "email", "phone", "department", ...(firstAdmin ? [] : ["companyId", "branchId", "role", "status"])];
    const hidden = hiddenFieldErrors(errors, visible);
    if (hidden.length) toast.error("The form could not be submitted", { description: hidden.join("; ") });
  };

  // Closing the one-time password dialog (Close, Escape or outside click) finishes the creation:
  // the password is forgotten and the caller refreshes (Users list / company user count + status).
  const finishAfterPassword = () => {
    setShowPasswordDialog(false);
    setCreatedUserPassword(null);
    form.reset();
    onSuccess?.();
    onOpenChange(false);
  };

  const onSubmit = async (data: UserFormValues) => {
    switch (activeMethod) {
      case "link":
        await handleInviteViaLink();
        break;
      case "email":
        await handleInviteViaEmail(data);
        break;
      case "sms":
        await handleInviteViaSMS(data);
        break;
      case "manual":
        await handleAddNewUser(data);
        break;
    }
  };

  const allMenuItems = [
    {
      id: "email" as InviteMethod,
      label: "Invite Via Email",
      icon: Mail,
      description: "Send invitation via email",
    },
    {
      id: "sms" as InviteMethod,
      label: "Invite Via SMS",
      icon: MessageSquare,
      description: "Send invitation via SMS",
    },
    {
      id: "link" as InviteMethod,
      label: "Invite Via Link",
      icon: Link2,
      description: "Generate a shareable invitation link",
    },
    {
      id: "manual" as InviteMethod,
      label: "Add New User",
      icon: UserPlus,
      description: "Manually create a new user account",
    },
  ];
  const menuItems = firstAdmin ? allMenuItems.filter((m) => m.id === "manual") : allMenuItems;

  // Common form fields component
  const renderCommonFields = (showPhone = false) => (
    <>
      {/* Basic Information Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
              <FormItem className="space-y-2">
                            <FormLabel>Full Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
              <FormItem className="space-y-2">
                            <FormLabel>Email Address *</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="john@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                              </div>

        {showPhone && (
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>Phone Number{activeMethod === "sms" ? " *" : ""}</FormLabel>
                            <FormControl>
                              <Input
                                type="tel"
                                placeholder="+1 (555) 123-4567"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                      if (activeMethod === "sms" && !form.getValues("email")) {
                                    form.setValue("email", `${e.target.value.replace(/\D/g, "")}@sms.invite`);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
        )}
      </div>

      {/* Organization Section */}
      {firstAdmin ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Organization</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadOnlyField label="Company" value={firstAdmin.companyName} />
            <ReadOnlyField label="Branch" value={firstAdmin.branchName} />
          </div>
          <p className="text-xs text-muted-foreground">Fixed: the first administrator belongs to this company and its Main Branch only (checked again by the server).</p>
        </div>
      ) : (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Organization</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="companyId"
                          render={({ field }) => (
              <FormItem className="space-y-2">
                              <FormLabel>Company</FormLabel>
                                <Select 
                                  onValueChange={(value) => {
                                    if (value !== field.value) changeCompany(value);
                                  }} 
                  value={field.value || undefined}
                  // Users are created in the signed-in user's own company (enforced by the backend).
                  disabled={companies.length <= 1}>
                                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {companies.map((company) => (
                                      <SelectItem key={company.id} value={String(company.id)}>
                                        {company.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="branchId"
                          render={({ field }) => (
              <FormItem className="space-y-2">
                              <FormLabel>Branch</FormLabel>
                              <div className="flex gap-2">
                                <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                    }} 
                                  value={field.value || undefined}
                    disabled={branchOptions.status !== "ready"}>
                                  <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={optionsPlaceholder(branchOptions.status, "branches", "Select branch (optional)", "Select a company first")} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {branchOptions.items.map((branch) => (
                                      <SelectItem key={branch.id} value={String(branch.id)}>
                                        {branch.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {field.value && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                      onClick={() => field.onChange("")}
                      className="h-10 w-10 shrink-0">
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <OptionsLoadError status={branchOptions.status} what="branches" onRetry={branchOptions.retry} />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
        </div>
                      </div>
      )}

      {/* Role & Department Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Role & Department</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {firstAdmin ? <ReadOnlyField label="Role" value={firstAdmin.roleName} /> : (
                        <FormField
                          control={form.control}
                          name="role"
                          render={({ field }) => (
              <FormItem className="space-y-2">
                              <FormLabel>Role *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={roleOptions.status !== "ready"}>
                                <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={optionsPlaceholder(roleOptions.status, "roles", "Select role")} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                    {roleOptions.items.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                                </SelectContent>
                              </Select>
                              <OptionsLoadError status={roleOptions.status} what="roles" onRetry={roleOptions.retry} />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        )}

                        <FormField
                          control={form.control}
                          name="department"
                          render={({ field }) => (
              <FormItem className="space-y-2">
                              <FormLabel>Department</FormLabel>
                              <FormControl>
                                <Input placeholder="Engineering" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      </div>
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
            <DialogTitle>{firstAdmin ? `Create First Admin — ${firstAdmin.companyName}` : "Create New User"}</DialogTitle>
            <DialogDescription>
              {firstAdmin
                ? `Creates the first user of ${firstAdmin.companyName} in its ${firstAdmin.branchName} with the ${firstAdmin.roleName} role, using a temporary password you share with them securely. No email is sent.`
                : "Choose an invitation method to add a new user to your organization."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden px-6 gap-4 min-h-0">
            {/* Left Sidebar - Navigation */}
            <div className="w-80 border-r pr-4 flex-shrink-0">
              <ScrollArea className="h-full">
                <nav className="space-y-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeMethod === item.id;
                    return (
                                  <Button
                        key={item.id}
                                    variant="ghost"
                        onClick={() => setActiveMethod(item.id)}
                        // Invitations have no backend yet (nothing is emailed/texted, links lead
                        // nowhere) — only manual creation is real.
                        disabled={item.id !== "manual"}
                        title={item.id !== "manual" ? "Not available yet — no invitation service is configured" : undefined}
                        className={cn(
                          "w-full justify-start h-auto py-3 px-3 hover:bg-muted",
                          isActive && "bg-muted hover:bg-muted"
                        )}>
                        <div className="flex items-start gap-3 w-full">
                          <Icon className={cn(
                            "h-5 w-5 shrink-0 mt-0.5",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )} />
                          <div className="flex flex-col items-start text-left flex-1 min-w-0">
                            <span className={cn(
                              "font-medium text-sm",
                              isActive && "text-primary"
                            )}>
                              {item.label}
                            </span>
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {item.description}
                            </span>
                          </div>
                        </div>
                                  </Button>
                    );
                  })}
                </nav>

                {/* User Quota Display - Always visible */}
                {userQuota && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            User Quota
                          </p>
                          {userQuota.max !== null && userQuota.current >= userQuota.max && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 rounded-full">
                              Full
                            </span>
                                )}
                              </div>
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className={cn(
                              "text-2xl font-bold",
                              userQuota.max !== null && userQuota.current >= userQuota.max
                                ? "text-red-500"
                                : "text-primary"
                            )}>
                              {userQuota.current}
                            </span>
                            {userQuota.max !== null ? (
                              <>
                                <span className="text-sm text-muted-foreground">/</span>
                                <span className="text-lg font-semibold text-muted-foreground">
                                  {userQuota.max}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-sm text-muted-foreground">/</span>
                                <span className="text-lg font-semibold text-muted-foreground">
                                  Unlimited
                                </span>
                              </>
                                )}
                              </div>
                          <p className="text-xs text-muted-foreground">
                            {userQuota.plan} Plan
                          </p>
                        </div>
                        {userQuota.max !== null && (
                          <div className="pt-2">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all duration-300 rounded-full",
                                  userQuota.current >= userQuota.max
                                    ? "bg-red-500"
                                    : userQuota.current / userQuota.max >= 0.8
                                    ? "bg-yellow-500"
                                    : "bg-primary"
                                )}
                                style={{
                                  width: `${Math.min((userQuota.current / userQuota.max) * 100, 100)}%`
                                }}
                        />
                      </div>
                          </div>
                        )}
                        {userQuota.max !== null && userQuota.current >= userQuota.max && (
                          <div className="pt-2">
                            <p className="text-xs text-center text-red-600 dark:text-red-400 font-medium">
                              Upgrade plan to create more users
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
                      </div>

            {/* Main Content - Form */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2">
              <div className="pr-4">
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                    className="space-y-6 pb-6"
                    id="create-user-form">
                    {/* Add New User */}
                    {activeMethod === "manual" && (
                      <>
                        {renderCommonFields(true)}

                        {/* Status Section — a first administrator is always created Active */}
                        {!firstAdmin && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold border-b pb-2">Account Settings</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                                <FormItem className="space-y-2">
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || "active"}>
                                <FormControl>
                                      <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                          </div>
                        </div>
                        )}

                      </>
                    )}

                    {/* Invite Via Email */}
                    {activeMethod === "email" && (
                      <>
                        {renderCommonFields(false)}

                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold border-b pb-2">Invitation Message</h3>
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel>Personal Message (Optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                    placeholder="Add a personal message to the invitation..."
                                    className="min-h-24"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                        </div>
                      </>
                    )}

                    {/* Invite Via SMS */}
                    {activeMethod === "sms" && (
                      <>
                        {renderCommonFields(true)}
                      </>
                    )}

                    {/* Invite Via Link */}
                    {activeMethod === "link" && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold border-b pb-2">Invitation Link</h3>
                        <div className="space-y-2">
                          <FormLabel>Shareable Link</FormLabel>
                          <div className="flex gap-2">
                            <Input
                              value={inviteLink}
                              readOnly
                              className="font-mono text-sm"
                              placeholder="Generating link..."
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(inviteLink)}
                              className="shrink-0">
                              {linkCopied ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                        </Button>
                      </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold border-b pb-2">Link Settings</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <FormLabel>Expires in</FormLabel>
                              <Select defaultValue="7">
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">1 day</SelectItem>
                                  <SelectItem value="7">7 days</SelectItem>
                                  <SelectItem value="30">30 days</SelectItem>
                                  <SelectItem value="never">Never</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <FormLabel>Max uses</FormLabel>
                              <Select defaultValue="unlimited">
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">1 use</SelectItem>
                                  <SelectItem value="5">5 uses</SelectItem>
                                  <SelectItem value="10">10 uses</SelectItem>
                                  <SelectItem value="unlimited">Unlimited</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                )}
              </form>
            </Form>
              </div>
          </div>
        </div>

        {/* Footer Actions */}
          <DialogFooter className="px-6 py-4 border-t bg-background flex-shrink-0 sm:items-center">
          {activeMethod === "manual" && (loadingRequiredData || rolesUnavailable) && (
            <p className="mr-auto text-xs text-muted-foreground">
              {loadingRequiredData
                ? "Create User is available once roles and branches have loaded."
                : roleOptions.status === "empty"
                  ? "A role is required, and no roles exist yet. Create one in Roles & Permissions first."
                  : "A role is required, but roles could not be loaded. Use Try again under Role."}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}>
            Cancel
          </Button>
            <Button
              type="submit"
              form="create-user-form"
              disabled={
                isSubmitting ||
                (activeMethod === "manual" && (loadingRequiredData || rolesUnavailable)) ||
                !!(
                  activeMethod === "manual" &&
                  userQuota &&
                  userQuota.max !== null &&
                  userQuota.current >= userQuota.max
                )
              }>
              {isSubmitting ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  {activeMethod === "email" ? "Sending..." : activeMethod === "sms" ? "Sending..." : activeMethod === "link" ? "Generating..." : "Creating..."}
                </>
              ) : activeMethod === "email" ? (
                "Send Invitation Email"
              ) : activeMethod === "sms" ? (
                "Send Invitation SMS"
              ) : activeMethod === "link" ? (
                "Generate Link"
              ) : activeMethod === "manual" && userQuota && userQuota.max !== null && userQuota.current >= userQuota.max ? (
                "Upgrade Plan to Create User"
              ) : (
                firstAdmin ? "Create First Admin" : "Create User"
              )}
            </Button>
          </DialogFooter>
      </DialogContent>
      </Dialog>

      {/* Temporary Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={(o) => { if (!o) finishAfterPassword(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Created Successfully</DialogTitle>
            <DialogDescription>
              {firstAdmin
                ? `The first administrator of ${firstAdmin.companyName} was created. This temporary password is shown only once — copy it now and give it to them securely (in person or by phone, not in the same message as their email address).`
                : "A temporary password has been generated for this user. Please share this password securely with the user."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Temporary Password</label>
              <div className="flex items-center gap-2">
                <Input
                  ref={passwordInputRef}
                  type="text"
                  value={createdUserPassword || ""}
                  readOnly
                  className="font-mono"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copy password"
                  onClick={async () => {
                    if (!createdUserPassword) return;
                    // copyText never throws (also on plain-http LAN pages without navigator.clipboard).
                    if (await copyText(createdUserPassword)) {
                      toast.success("Password copied to clipboard");
                    } else {
                      passwordInputRef.current?.focus();
                      passwordInputRef.current?.select();
                      toast.error("Copy is not available here — the password is selected; press Ctrl+C to copy it.");
                    }
                  }}
                  className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The user will be required to change this password on first login.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={finishAfterPassword}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">{label}</label>
      <Input value={value} readOnly disabled className="w-full" aria-readonly />
    </div>
  );
}

function optionsPlaceholder(status: AsyncOptionsStatus, what: string, ready: string, idle = `No ${what} available`) {
  switch (status) {
    case "loading": return `Loading ${what}...`;
    case "empty": return `No ${what} available`;
    case "error": return `Unable to load ${what}`;
    case "idle": return idle;
    default: return ready;
  }
}

function OptionsLoadError({ status, what, onRetry }: { status: AsyncOptionsStatus; what: string; onRetry: () => void }) {
  if (status !== "error") return null;
  return (
    <p className="text-xs text-destructive">
      Unable to load {what}.{" "}
      <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>Try again.</button>
    </p>
  );
}
