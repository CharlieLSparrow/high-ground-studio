"use client";

import { useCart } from "@/components/cart/CartContext";
import type Product from "@/types/Product";

export default function Cart() {
  const cart = useCart();

  if (cart.length === 0) return null;

  return (
    <div className="fixed bottom-0 right-0 bg-white/95 backdrop-blur-sm p-4 rounded-tl-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4">Your Cart</h2>
      {cart.map((item, index) => (
        <div key={index} className="flex items-center gap-3 mb-2">
          <img
            src={item.product.image}
            alt={item.product.title}
            className="w-16 h-16 rounded-lg object-cover"
          />
          <div>
            <h3 className="font-medium">{item.product.title}</h3>
            <p>Quantity: {item.quantity}</p>
          </div>
        </div>
      ))}
      <button
        onClick={() => {
          // Add your checkout logic here
          console.log("Proceeding to checkout with:", cart);
        }}
        className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Checkout ({cart.length} items)
      </button>
    </div>
  );
}
