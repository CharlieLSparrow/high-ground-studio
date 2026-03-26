"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { Product } from "@/types/Product"; // Ensure you have a Product type defined

type CartItem = {
  product: Product;
  quantity: number;
};

type CartActions = {
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartItem[] | null>(null);

export const useCart = () => {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used within a CartProvider");
  return cart;
};

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    // Load from localStorage
    if (typeof window !== "undefined") {
      const savedCart = localStorage.getItem("shopping_cart");
      return savedCart ? JSON.parse(savedCart) : [];
    }
    return [];
  });

  const addToCart = (product: Product, quantity = 1) => {
    setCart(prev => {
      const existingItemIndex = prev.findIndex(
        item => item.product.id === product.id
      );
      
      if (existingItemIndex !== -1) {
        // Update quantity
        const newCart = [...prev];
        newCart[existingItemIndex] = {
          ...newCart[existingItemIndex],
          quantity: newCart[existingItemIndex].quantity + quantity
        };
        return newCart;
      }
      
      // Add new item
      return [...prev, { product, quantity }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  useEffect(() => {
    // Save to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("shopping_cart", JSON.stringify(cart));
    }
  }, [cart]);

  return (
    <CartContext.Provider value={cart}>
      {children}
    </CartContext.Provider>
  );
};
