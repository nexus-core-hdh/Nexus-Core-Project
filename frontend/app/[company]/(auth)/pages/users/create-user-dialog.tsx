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
import { companiesApi, branchesApi, usersApi, userRolesApi } from "@/lib/api";

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

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type InviteMethod = "link" | "email" | "sms" | "manual";

// User limits per plan
const PLAN_USER_LIMITS: Record<string, number | null> = {
  Free: 3,
  Basic: 10,
  Pro: 25,
  Enterprise: null, // Unlimited
};

export function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateUserDialogProps) {
  const [activeMethod, setActiveMethod] = React.useState<InviteMethod>("manual");
  const [inviteLink, setInviteLink] = React.useState("");
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [companies, setCompanies] = React.useState<Array<{ id: number; name: string }>>([]);
  const [branches, setBranches] = React.useState<Array<{ id: number; name: string; companyId: number }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>("");
  const [roles, setRoles] = React.useState<Array<{ id: number; name: string; isActive: boolean }>>([]);
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

  // Load logged-in user's company and set defaults when dialog opens
  React.useEffect(() => {
    if (open) {
      const loadUserCompany = async () => {
        try {
          // Get current user from localStorage
          const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
          if (userStr) {
            const currentUser = JSON.parse(userStr);
            if (currentUser.companyId) {
              // Set company as default
              const companyIdStr = currentUser.companyId.toString();
              form.setValue("companyId", companyIdStr);
              setSelectedCompanyId(companyIdStr);
              
              // Load branches for the company
              try {
                const branchesData = await branchesApi.getBranches();
                const companyBranches = branchesData.filter((b: any) => b.companyId === currentUser.companyId);
                setBranches(companyBranches);
              } catch (error) {
                console.error("Failed to load branches:", error);
              }

              // Load roles for the company
              try {
                const rolesData = await userRolesApi.getUserRoles(currentUser.companyId, currentUser.branchId || undefined);
                const activeRoles = rolesData.filter((r: any) => r.isActive !== false);
                setRoles(activeRoles);
              } catch (error) {
                console.error("Failed to load roles:", error);
              }
            }
          }
        } catch (error) {
          console.error("Failed to load user company:", error);
        }
      };
      loadUserCompany();
    } else {
      form.reset();
      setSelectedCompanyId("");
      setSelectedBranchId("");
      setInviteLink("");
      setRoles([]);
    }
  }, [open, form]);

  // Load user quota when dialog opens
  React.useEffect(() => {
    if (!open) return;
    
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
        const currentUsers = company.users?.length || 0;

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
  }, [open]);

  // Load companies when dialog opens
  React.useEffect(() => {
    if (open) {
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
  }, [open]);

  // Load branches and roles when company/branch is selected
  React.useEffect(() => {
    if (selectedCompanyId) {
      const loadBranches = async () => {
        try {
          const branchesData = await branchesApi.getBranches();
          const companyBranches = branchesData.filter((b: any) => b.companyId === parseInt(selectedCompanyId));
          setBranches(companyBranches);
        } catch (error) {
          console.error("Failed to load branches:", error);
        }
      };
      loadBranches();
    } else {
      setBranches([]);
    }
  }, [selectedCompanyId]);

  // Load roles when company or branch changes
  React.useEffect(() => {
    if (selectedCompanyId) {
      const loadRoles = async () => {
        try {
          const companyId = parseInt(selectedCompanyId);
          const branchId = selectedBranchId ? parseInt(selectedBranchId) : undefined;
          const rolesData = await userRolesApi.getUserRoles(companyId, branchId);
          const activeRoles = rolesData.filter((r: any) => r.isActive !== false);
          setRoles(activeRoles);
        } catch (error) {
          console.error("Failed to load roles:", error);
        }
      };
      loadRoles();
    } else {
      setRoles([]);
    }
  }, [selectedCompanyId, selectedBranchId]);

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
  const [showPasswordDialog, setShowPasswordDialog] = React.useState(false);

  const handleAddNewUser = async (data: UserFormValues) => {
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
      const userData = {
        name: data.name,
        email: data.email,
        country: data.country || "US",
        role: "employee" as any, // Default enum role
        roleId: data.role ? parseInt(data.role) : null, // Custom role ID from Role table
        image: "/images/avatars/default.png",
        status: (data.status || "active") as any,
        plan_name: (data.plan_name || "Basic") as any,
        companyId: data.companyId ? parseInt(data.companyId) : null,
        branchId: data.branchId ? parseInt(data.branchId) : null,
      };
      
      const response = await usersApi.createUser(userData);
      
      // Reload quota after successful creation
      const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (userStr) {
        try {
          const currentUser = JSON.parse(userStr);
          if (currentUser.companyId) {
            const company = await companiesApi.getCompany(currentUser.companyId);
            const plan = company.plan || "Free";
            const maxUsers = PLAN_USER_LIMITS[plan] ?? null;
            const currentUsers = company.users?.length || 0;
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

  const menuItems = [
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
                                    field.onChange(value);
                                    setSelectedCompanyId(value);
                                  }} 
                  value={field.value || undefined}
                  disabled={true}>
                                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {companies.map((company) => (
                                      <SelectItem key={company.id} value={company.id.toString()}>
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
                      setSelectedBranchId(value);
                    }} 
                                  value={field.value || undefined}
                    disabled={branches.length === 0}>
                                  <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={branches.length === 0 ? "No branches available" : "Select branch (optional)"} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {branches.map((branch) => (
                                      <SelectItem key={branch.id} value={branch.id.toString()}>
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
                      onClick={() => {
                        field.onChange("");
                        setSelectedBranchId("");
                      }}
                      className="h-10 w-10 shrink-0">
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
        </div>
                      </div>

      {/* Role & Department Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Role & Department</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="role"
                          render={({ field }) => (
              <FormItem className="space-y-2">
                              <FormLabel>Role *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={roles.length === 0}>
                                <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={roles.length === 0 ? "Loading roles..." : "Select role"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                    {roles.length > 0 ? (
                      roles.map((role) => (
                        <SelectItem key={role.id} value={role.id.toString()}>
                          {role.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__no_roles__" disabled>No roles available</SelectItem>
                    )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

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
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Choose an invitation method to add a new user to your organization.
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
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6 pb-6"
                    id="create-user-form">
                    {/* Add New User */}
                    {activeMethod === "manual" && (
                      <>
                        {renderCommonFields(true)}

                        {/* Status Section */}
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

                        {/* Notes Section */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold border-b pb-2">Additional Information</h3>
                        <FormField
                          control={form.control}
                            name="notes"
                          render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Additional notes about this user..."
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
          <DialogFooter className="px-6 py-4 border-t bg-background flex-shrink-0">
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
                "Create User"
              )}
            </Button>
          </DialogFooter>
      </DialogContent>
      </Dialog>

      {/* Temporary Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Created Successfully</DialogTitle>
            <DialogDescription>
              A temporary password has been generated for this user. Please share this password securely with the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Temporary Password</label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={createdUserPassword || ""}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (createdUserPassword) {
                      navigator.clipboard.writeText(createdUserPassword);
                      toast.success("Password copied to clipboard");
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
              onClick={() => {
                setShowPasswordDialog(false);
                setCreatedUserPassword(null);
                form.reset();
                onSuccess?.();
                onOpenChange(false);
              }}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
