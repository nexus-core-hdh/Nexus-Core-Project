import { create } from "zustand";
import { orderApi, customerApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

export type Product = {
  id: string;
  name: string;
  image: string;
  price: number;
  category: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  icon: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type TableStatus = "available" | "occupied" | "reserved";

export type Table = {
  id: string;
  name: string;
  status: TableStatus;
  category: string;
};

export type TableCategory = {
  id: string;
  name: string;
};

export type Order = {
  id: string;
  tableId?: string;
  items: CartItem[];
  status: "active" | "completed" | "cancelled";
  total: number;
  createdAt: Date;
};

type Store = {
  orders: Order[];
  cart: CartItem[];
  showPaymentDialog: boolean;
  pendingOrderForPayment: {
    cartItems: CartItem[];
    customerId: number;
    totalAmount: number;
    orderId?: number;
  } | null;
  isCreatingOrder: boolean;
  editingOrderId: number | null;

  addToCart: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  loadOrderIntoCart: (items: CartItem[], orderId: number) => void;

  createOrder: () => Promise<void>;
  assignOrderToTable: (tableId: string, customerId?: number) => Promise<void>;
  createOrderDirectly: () => Promise<void>;
  setShowPaymentDialog: (show: boolean) => void;
  closePaymentDialog: () => void;
  clearCart: () => void;
};

export const useStore = create<Store>((set, get) => ({
  orders: [],
  cart: [],
  isCreatingOrder: false,
  showPaymentDialog: false,
  pendingOrderForPayment: null,
  editingOrderId: null,

  addToCart: (product, quantity = 1) => {
    set((state) => {
      // Check if product already exists in cart
      const existingItem = state.cart.find((item) => item.product.id === product.id);

      if (existingItem) {
        // Increase quantity if product already in cart
        return {
          cart: state.cart.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
          )
        };
      } else {
        // Add new product to cart with specified quantity
        return { cart: [...state.cart, { product, quantity }] };
      }
    });
  },

  updateQuantity: (productId, quantity) => {
    set((state) => {
      if (quantity <= 0) {
        // Remove item if quantity is 0 or negative
        return { cart: state.cart.filter((item) => item.product.id !== productId) };
      } else {
        // Update quantity
        return {
          cart: state.cart.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item
          )
        };
      }
    });
  },

  removeFromCart: (productId) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.product.id !== productId)
    }));
  },

  loadOrderIntoCart: (items, orderId) => {
    set({
      cart: items,
      editingOrderId: orderId,
    });
  },

  createOrder: async () => {
    const { cart } = get();

    if (cart.length === 0) return;

    set({ isCreatingOrder: true });

    try {
      // Calculate total
      const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      // Create a temporary order in local state (will be saved to DB when table is assigned)
      const newOrder: Order = {
        id: `temp-${Date.now()}`,
        items: [...cart],
        status: "active",
        total: total,
        createdAt: new Date()
      };

      set((state) => ({
        orders: [...state.orders, newOrder],
        isCreatingOrder: false
      }));
    } catch (error) {
      console.error("Error creating order:", error);
      set({ isCreatingOrder: false });
    }
  },

  assignOrderToTable: async (tableId, customerId) => {
    const { cart, orders } = get();

    if (cart.length === 0 || orders.length === 0) return;

    set({ isCreatingOrder: true });

    try {
      const user = getCurrentUser();
      if (!user) {
        throw new Error("User not found");
      }

      // Find the latest order (the one we just created)
      const latestOrder = orders[orders.length - 1];

      // Calculate totals
      const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      // Get or create POS Customer (single default customer)
      let finalCustomerId: number | undefined = customerId;
      if (!finalCustomerId) {
        try {
          // Try to find existing POS Customer
          const customers = await customerApi.getCustomers({
            companyId: user.companyId || undefined,
            branchId: user.branchId || undefined,
            search: "POS Customer"
          });
          const posCustomer = customers?.find((c: any) => c.name === "POS Customer");
          
          if (posCustomer) {
            finalCustomerId = posCustomer.id;
          } else {
            // Create POS Customer if not found
            const defaultCustomer = await customerApi.createCustomer({
              name: "POS Customer",
              companyId: user.companyId || undefined,
              branchId: user.branchId || undefined
            });
            finalCustomerId = defaultCustomer.id;
          }
        } catch (error: any) {
          throw new Error("Failed to get or create POS customer");
        }
      }
      if (!finalCustomerId) {
        throw new Error("Failed to resolve customer");
      }

      // Create order items
      const orderItems = cart.map((item) => ({
        productId: parseInt(item.product.id),
        quantity: item.quantity,
        price: item.product.price,
        subtotal: item.product.price * item.quantity
      }));

      // Don't create order yet - wait for payment
      // Store cart data for payment dialog
      set((state) => ({
        // Update orders (keep temp order for display)
        orders: state.orders,
        // Don't clear cart yet - will be cleared after payment
        cart: state.cart,
        isCreatingOrder: false,
        showPaymentDialog: true,
        pendingOrderForPayment: {
          cartItems: cart,
          customerId: finalCustomerId,
          totalAmount: total,
          orderId: state.editingOrderId || undefined,
        },
      }));

      // Show message to process payment
      setTimeout(() => {
        toast.info(
          `Please process payment`,
          {
            description: `Total amount: $${total.toFixed(2)}`,
            duration: 3000,
          }
        );
      }, 100);
    } catch (error: any) {
      console.error("Error assigning order to table:", error);
      set({ isCreatingOrder: false });
      toast.error("Failed to create order", {
        description: error.message || "Please try again."
      });
      throw error;
    }
  },

  createOrderDirectly: async () => {
    const { cart } = get();

    if (cart.length === 0) return;

    set({ isCreatingOrder: true });

    try {
      const user = getCurrentUser();
      if (!user) {
        throw new Error("User not found");
      }

      // Calculate totals
      const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      // Get or create POS Customer (single default customer)
      let finalCustomerId: number;
      try {
        // Try to find existing POS Customer
        const customers = await customerApi.getCustomers({
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined,
          search: "POS Customer"
        });
        const posCustomer = customers?.find((c: any) => c.name === "POS Customer");
        
        if (posCustomer) {
          finalCustomerId = posCustomer.id;
        } else {
          // Create POS Customer if not found
          const defaultCustomer = await customerApi.createCustomer({
            name: "POS Customer",
            companyId: user.companyId || undefined,
            branchId: user.branchId || undefined
          });
          finalCustomerId = defaultCustomer.id;
        }
      } catch (error: any) {
        throw new Error("Failed to get or create POS customer");
      }

      // Create order items
      const orderItems = cart.map((item) => ({
        productId: parseInt(item.product.id),
        quantity: item.quantity,
        price: item.product.price,
        subtotal: item.product.price * item.quantity
      }));

      // Don't create order yet - wait for payment
      // Store cart data for payment dialog
      set((state) => ({
        cart: cart, // Keep cart until payment is processed
        isCreatingOrder: false,
        showPaymentDialog: true,
        pendingOrderForPayment: {
          cartItems: cart,
          customerId: finalCustomerId,
          totalAmount: total,
          orderId: state.editingOrderId || undefined,
        },
      }));

      // Show message to process payment
      setTimeout(() => {
        toast.info(
          `Please process payment`,
          {
            description: `Total amount: $${total.toFixed(2)}`,
            duration: 3000,
          }
        );
      }, 100);
    } catch (error: any) {
      console.error("Error creating order:", error);
      set({ isCreatingOrder: false });
      toast.error("Failed to create order", {
        description: error.message || "Please try again."
      });
      throw error;
    }
  },

  setShowPaymentDialog: (show: boolean) => {
    set({ showPaymentDialog: show });
  },

  closePaymentDialog: () => {
    set({ 
      showPaymentDialog: false,
      pendingOrderForPayment: null,
      // Don't clear cart here - it will be cleared after successful payment
    });
  },

  clearCart: () => {
    set({ 
      cart: [],
      editingOrderId: null, // Clear editing order ID when cart is cleared
    });
  },
}));
