"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import { Edit2, Plus, Trash2, Check, CreditCard, Zap, Crown, Sparkles, Loader2 } from "lucide-react";
import { format, addMonths } from "date-fns";
import { settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type TransactionStatus = "pending" | "failed" | "paid";

interface Transaction {
  id: string;
  product: string;
  status: TransactionStatus;
  date: string;
  amount: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  last4: string;
  expiryDate?: string;
  isPrimary?: boolean;
  type?: string;
}

const billingPlans = [
  {
    id: "Basic",
    name: "Basic",
    price: "$0",
    monthlyPrice: 0,
    description: "Perfect for getting started",
    icon: Sparkles,
    features: ["1 user", "Basic support", "Core features", "5GB storage"]
  },
  {
    id: "Team",
    name: "Team",
    price: "$29.90",
    monthlyPrice: 29.90,
    description: "Ideal for growing businesses",
    icon: Zap,
    popular: true,
    features: ["Up to 20 users", "Priority support", "Advanced features", "50GB storage"]
  },
  {
    id: "Enterprise",
    name: "Enterprise",
    price: "$59.90",
    monthlyPrice: 59.90,
    description: "For large organizations",
    icon: Crown,
    features: ["Unlimited users", "Dedicated support", "Custom integrations", "500GB storage"]
  }
];

const paymentMethodSchema = z.object({
  name: z.string().min(1, "Name on card is required"),
  cardNumber: z.string().min(16, "Card number must be at least 16 digits").max(19),
  expiryMonth: z.string().min(1, "Month is required"),
  expiryYear: z.string().min(1, "Year is required"),
  cvc: z.string().min(3, "CVC is required").max(4)
});

type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>;

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [billingPlan, setBillingPlan] = useState<string>("Basic");
  const [nextPaymentDate, setNextPaymentDate] = useState<Date | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [addPaymentMethodOpen, setAddPaymentMethodOpen] = useState(false);
  const [editPaymentMethodOpen, setEditPaymentMethodOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<PaymentMethodFormValues>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      name: "",
      cardNumber: "",
      expiryMonth: "",
      expiryYear: "",
      cvc: ""
    }
  });

  useEffect(() => {
    loadBilling();
  }, []);

  const loadBilling = async () => {
    try {
      const user = getCurrentUser();
      if (!user) return;

      const settings = await settingsApi.getUserSettings(user.id);
      
      if (settings) {
        setBillingPlan(settings.billingPlan || "Basic");
        if (settings.nextPaymentDate) {
          setNextPaymentDate(new Date(settings.nextPaymentDate));
        } else if (settings.billingPlan && settings.billingPlan !== "Basic") {
          // Set default next payment date if plan is not Basic
          setNextPaymentDate(addMonths(new Date(), 1));
        }
        
        if (settings.paymentMethods && Array.isArray(settings.paymentMethods)) {
          setPaymentMethods(settings.paymentMethods as PaymentMethod[]);
        } else {
          setPaymentMethods([]);
        }
      }

      try {
        const transactionsData = await settingsApi.getBillingTransactions(user.id);
        if (transactionsData && Array.isArray(transactionsData) && transactionsData.length > 0) {
          setTransactions(transactionsData);
        }
      } catch (error) {
        console.log('Using empty transactions list');
      }
    } catch (error: any) {
      console.error('Failed to load billing settings:', error);
      toast.error('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (newPlan: string) => {
    if (newPlan === billingPlan) {
      toast.info('You are already on this plan');
      return;
    }

    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) return;

      // Calculate next payment date (1 month from now for paid plans)
      const newNextPaymentDate = newPlan === "Basic" ? null : addMonths(new Date(), 1);

      await settingsApi.updateBilling(user.id, {
        billingPlan: newPlan,
        nextPaymentDate: newNextPaymentDate ?? undefined
      });

      setBillingPlan(newPlan);
      setNextPaymentDate(newNextPaymentDate);
      
      // Create a transaction record
      const plan = billingPlans.find(p => p.id === newPlan);
      if (plan && plan.monthlyPrice > 0) {
        const newTransaction: Transaction = {
          id: `#${Date.now()}`,
          product: `${newPlan} plan subscription`,
          status: "pending",
          date: format(new Date(), "MM/dd/yyyy"),
          amount: `$${plan.monthlyPrice.toFixed(2)}`
        };
        setTransactions(prev => [newTransaction, ...prev]);
      }

      toast.success(`Successfully changed plan to ${newPlan}`);
    } catch (error: any) {
      console.error('Failed to change plan:', error);
      toast.error('Failed to change plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPaymentMethod = async (values: PaymentMethodFormValues) => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) return;

      const last4 = values.cardNumber.slice(-4);
      const expiryDate = `${values.expiryMonth}/${values.expiryYear.slice(-2)}`;
      
      const newMethod: PaymentMethod = {
        id: `pm_${Date.now()}`,
        name: values.name,
        last4,
        expiryDate,
        isPrimary: paymentMethods.length === 0, // First method is primary
        type: "card"
      };

      const updatedMethods = [...paymentMethods, newMethod];

      await settingsApi.updateBilling(user.id, {
        paymentMethods: updatedMethods
      });

      setPaymentMethods(updatedMethods);
      form.reset();
      setAddPaymentMethodOpen(false);
      toast.success('Payment method added successfully');
    } catch (error: any) {
      console.error('Failed to add payment method:', error);
      toast.error('Failed to add payment method. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPaymentMethod = async (values: PaymentMethodFormValues) => {
    if (!editingMethod) return;

    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) return;

      const last4 = values.cardNumber.slice(-4);
      const expiryDate = `${values.expiryMonth}/${values.expiryYear.slice(-2)}`;

      const updatedMethods = paymentMethods.map(method =>
        method.id === editingMethod.id
          ? { ...method, name: values.name, last4, expiryDate }
          : method
      );

      await settingsApi.updateBilling(user.id, {
        paymentMethods: updatedMethods
      });

      setPaymentMethods(updatedMethods);
      form.reset();
      setEditPaymentMethodOpen(false);
      setEditingMethod(null);
      toast.success('Payment method updated successfully');
    } catch (error: any) {
      console.error('Failed to update payment method:', error);
      toast.error('Failed to update payment method. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) return;

      const updatedMethods = paymentMethods.filter(m => m.id !== methodId);
      
      // If we deleted the primary method, make the first remaining method primary
      if (updatedMethods.length > 0 && !updatedMethods.some(m => m.isPrimary)) {
        updatedMethods[0].isPrimary = true;
      }

      await settingsApi.updateBilling(user.id, {
        paymentMethods: updatedMethods
      });

      setPaymentMethods(updatedMethods);
      toast.success('Payment method deleted successfully');
    } catch (error: any) {
      console.error('Failed to delete payment method:', error);
      toast.error('Failed to delete payment method. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (methodId: string) => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) return;

      const updatedMethods = paymentMethods.map(method => ({
        ...method,
        isPrimary: method.id === methodId
      }));

      await settingsApi.updateBilling(user.id, {
        paymentMethods: updatedMethods
      });

      setPaymentMethods(updatedMethods);
      toast.success('Primary payment method updated');
    } catch (error: any) {
      console.error('Failed to set primary payment method:', error);
      toast.error('Failed to update primary payment method. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatPaymentDate = (date: Date | null) => {
    if (!date) return null;
    return format(date, "MMM dd, yyyy");
  };

  const getPlanPrice = (plan: string) => {
    const planData = billingPlans.find(p => p.id === plan);
    return planData?.price || "$0";
  };

  const openEditDialog = (method: PaymentMethod) => {
    // Extract month and year from expiry date (format: MM/YY)
    const expiryParts = method.expiryDate?.split('/') || [];
    const currentYear = new Date().getFullYear();
    const expiryYear = expiryParts[1] 
      ? (parseInt(expiryParts[1]) < 50 ? `20${expiryParts[1]}` : `19${expiryParts[1]}`)
      : currentYear.toString();

    form.reset({
      name: method.name,
      cardNumber: `**** **** **** ${method.last4}`, // Show last 4, user can edit full number
      expiryMonth: expiryParts[0] || "",
      expiryYear: expiryYear,
      cvc: "***" // Don't show actual CVC for security
    });
    setEditingMethod(method);
    setEditPaymentMethodOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Billing Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>
            Billing monthly{nextPaymentDate ? ` | Next payment on ${formatPaymentDate(nextPaymentDate)}` : ""} for{" "}
            <span className="font-medium">{getPlanPrice(billingPlan)}</span>
          </CardDescription>
          <CardAction>
            <Button onClick={() => router.push("/pages/pricing/column")}>
              Change plan
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      {/* Payment Methods Card */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentMethods.length === 0 ? (
            <div className="text-muted-foreground text-center py-8 text-sm">
              No payment methods added yet
            </div>
          ) : (
            paymentMethods.map((method) => (
              <div key={method.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div className="font-medium">{method.name} •••• {method.last4}</div>
                    {method.isPrimary && (
                      <Badge variant="secondary" className="ml-2">Primary</Badge>
                    )}
                  </div>
                  {method.expiryDate && (
                    <p className="text-muted-foreground text-sm">Expires {method.expiryDate}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!method.isPrimary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetPrimary(method.id)}
                      disabled={saving}>
                      Set Primary
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openEditDialog(method)}
                    disabled={saving}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" disabled={saving}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Payment Method</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this payment method? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeletePaymentMethod(method.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}

          <Dialog open={addPaymentMethodOpen} onOpenChange={setAddPaymentMethodOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add payment method
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Payment Method</DialogTitle>
                <DialogDescription>
                  Add a new payment method to your account.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddPaymentMethod)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name on card</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cardNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="1234 5678 9012 3456"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\s/g, '');
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="expiryMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Month</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString().padStart(2, '0')}>
                                  {new Date(2000, i).toLocaleString('default', { month: 'long' })}
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
                      name="expiryYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Year" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 10 }, (_, i) => {
                                const year = new Date().getFullYear() + i;
                                return (
                                  <SelectItem key={year} value={year.toString()}>
                                    {year}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cvc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CVC</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="123" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddPaymentMethodOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Add Payment Method"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Edit Payment Method Dialog */}
          <Dialog open={editPaymentMethodOpen} onOpenChange={setEditPaymentMethodOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Payment Method</DialogTitle>
                <DialogDescription>
                  Update your payment method information.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleEditPaymentMethod)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name on card</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cardNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="1234 5678 9012 3456"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\s/g, '');
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="expiryMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Month</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString().padStart(2, '0')}>
                                  {new Date(2000, i).toLocaleString('default', { month: 'long' })}
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
                      name="expiryYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Year" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 10 }, (_, i) => {
                                const year = new Date().getFullYear() + i;
                                return (
                                  <SelectItem key={year} value={year.toString()}>
                                    {year}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cvc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CVC</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="123" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => {
                      setEditPaymentMethodOpen(false);
                      setEditingMethod(null);
                      form.reset();
                    }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Update Payment Method"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Transaction History Card */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-muted-foreground text-center py-8 text-sm">
              No transactions found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => {
                  const statusMap = {
                    pending: "warning",
                    failed: "destructive",
                    paid: "success"
                  } as const;

                  const statusClass = statusMap[transaction.status] ?? "secondary";

                  return (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.id}</TableCell>
                      <TableCell>{transaction.product}</TableCell>
                      <TableCell>
                        <Badge variant={statusClass}>{transaction.status}</Badge>
                      </TableCell>
                      <TableCell>{transaction.date}</TableCell>
                      <TableCell className="text-right font-medium">{transaction.amount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}